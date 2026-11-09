"""Bounded read-only Magic .D/.Pnn/.Tnn/.A00 adapter.

Layout cross-check: KimeraCS f33fd07, FF7BattleSkeleton.cs Magic constructor
and FF7BattleAnimationsPack.cs. These files share the verified 13-word header,
bone records and packed motion encoding, not Battle's AA/AM/AC/DA filenames.
No summon effect scripts, generated geometry or authored bone edits.
SPDX-License-Identifier: GPL-3.0-only
"""
import re
import struct
from .battle import parse_battle_skeleton
from .battle_model import parse_pack, decode_battle_tex, assemble
from .formats import parse_p
from .tex import decode_tex


def decode_magic_tex(data):
    """RIVADAT/MOG report palette capacity but store one 16-color bank/TEX.

    Exact byte length, index range and no-key-array layout must all agree.
    Normalize only the in-memory palette count, never the source file/colors.
    """
    h = struct.unpack_from('<59I',data) if len(data)>=236 else ()
    if (h and h[0]==1 and h[12] in (2,4,12) and h[13]==h[22]==16
            and h[19]==h[26]==1 and h[47]==0
            and len(data)==236+64+h[15]*h[16] and max(data[300:],default=0)<16):
        normalized = bytearray(data)
        struct.pack_into('<I',normalized,48,1)
        image = decode_tex(bytes(normalized))
        image.metadata.update(reported_palettes=h[12],stored_palettes=1,
            header_anomaly='Magic palette capacity; one actual bank per Tnn; palette 0 only')
        return image
    return decode_battle_tex(data)


def load_magic(archive, skeleton_id):
    if not re.fullmatch(r'[a-z0-9_]+\.d', skeleton_id):
        raise ValueError('Expected a Magic .D resource')
    stem = skeleton_id[:-2]
    skeleton = parse_battle_skeleton(archive.read(skeleton_id))
    if skeleton['weapons'] or skeleton['weaponAnimations']:
        raise ValueError('Separate Magic weapon tracks are outside this adapter')
    parts, meshes, textures = [], [], {}
    expected_meshes = {f'{stem}.p{i:02d}' for i,b in enumerate(skeleton['bones']) if b['hasModel']}
    actual_meshes = {name for name in archive.entries if re.fullmatch(re.escape(stem)+r'\.p\d{2}',name)}
    if actual_meshes != expected_meshes:
        raise ValueError(f'{skeleton_id}: .D model flags and actual .Pnn files disagree')
    for i in range(skeleton['textures']):
        textures[i] = decode_magic_tex(archive.read(f'{stem}.t{i:02d}'))
    for i, bone in enumerate(skeleton['bones']):
        if not bone['hasModel']:
            continue
        name = f'{stem}.p{i:02d}'  # Bone index, including gaps; never compact.
        mesh = parse_p(archive.read(name))
        meshes.append(dict(resourceId=name,bone=i,vertices=mesh['vertex_count'],triangles=mesh['triangle_count']))
        for group in mesh['groups']:
            if group['texture'] is not None and group['texture'] not in textures:
                raise ValueError(f'{name}: missing Magic texture slot {group["texture"]}')
            parts.append(dict(resourceId=name,bone=i,geometry=group))
    animation_id = stem+'.a00'
    pack = parse_pack(archive.read(animation_id),skeleton)
    return dict(kind='magic',skeletonId=skeleton_id,skeleton=skeleton,parts=parts,meshes=meshes,
        textures=textures,weapon=None,weaponId=None,pack=pack,animationId=animation_id,
        format='Magic D/Pnn/Tnn/A00; explicit header/count/part/texture validation',
        materialLimit='source vertex colors and referenced TEX; no scripted summon framebuffer effects')


def assemble_magic(model, pose):
    if model.get('kind') != 'magic' or set(pose) != {'animation','frame'}:
        raise ValueError('Magic production requires an unmodified original source frame')
    scene, transforms = assemble(model,pose)
    return scene,dict(transforms,sourceKind='magic',animationId=model['animationId'])
