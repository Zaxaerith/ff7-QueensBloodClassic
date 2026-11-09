"""Read-only Battle model assembly, separate from Field/World conventions.

Format facts: KimeraCS f33fd07 (GPL-3.0), FF7 LGP Explorer 6c6338a
(README MIT), and L. Spiro's PC Battle animation documentation. See notices.
No downloaded implementation is executed. Bounds failures are explicit.
SPDX-License-Identifier: GPL-3.0-only
"""
import math
import re
import struct
from .battle import parse_battle_skeleton
from .formats import parse_p
from .tex import decode_tex
from .render import identity, multiply, rotation, translation, transform


class Bits:
    def __init__(self, data):
        self.data = data
        self.offset = 0

    def read(self, count, signed=False):
        if not 0 <= count <= 16 or self.offset + count > len(self.data)*8:
            raise ValueError('Battle animation bitstream exhausted')
        value = 0
        for bit in range(self.offset, self.offset + count):
            value = (value << 1) | ((self.data[bit//8] >> (7-bit%8)) & 1)
        self.offset += count
        return value - (1 << count) if signed and count and value & (1 << (count-1)) else value


def decode_clip(data, bone_count):
    """Decode an isolated 12-byte-header DA chunk, preserving short-count caveats."""
    if len(data) < 12:
        raise ValueError('Truncated Battle animation chunk')
    stored_bones, declared, size = struct.unpack_from('<3I', data)
    if size != len(data)-12 or declared > 10000:
        raise ValueError('Battle animation chunk bounds/count')
    result = dict(storedBones=stored_bones, declaredFrames=declared, blockBytes=size, frames=[])
    if size <= 11:
        return result | dict(status='non-motion-chunk')
    short_count, short_size, key = struct.unpack_from('<HHB', data, 12)
    if key not in (0, 2, 4) or not short_count or short_count > 10000 or short_size > size-5:
        raise ValueError('Unsupported Battle animation mini-header')
    # This trial handles the ordinary RT/EB headers, not RSAA's missing-count variant.
    expected = bone_count + 1 if bone_count > 1 else 1
    if bone_count != 1 and stored_bones != expected:
        raise ValueError(f'Animation bone count {stored_bones}, expected {expected}')
    bits = Bits(data[17:17+short_size])
    position = [bits.read(16, True) for _ in range(3)]
    raw = [[bits.read(12-key, True) << key for _ in range(3)] for _ in range(expected)]

    def frame():
        return dict(position=list(position), rotations=[[(v & 4095)*360/4096 for v in r] for r in raw])

    frames = [frame()]
    for fi in range(1, short_count):
        start = bits.offset
        try:
            offsets = [bits.read(16 if bits.read(1) else 7, True) for _ in range(3)]
            deltas = []
            for _ in range(expected):
                angles = []
                for axis in range(3):
                    if not bits.read(1):
                        delta = 0
                    else:
                        length = bits.read(3)
                        if length == 0:
                            delta = -1
                        elif length == 7:
                            delta = bits.read(12-key, True)
                        else:
                            value = bits.read(length, True)
                            delta = value + ((1 << (length-1)) * (-1 if value < 0 else 1))
                        delta <<= key
                    angles.append(delta)
                deltas.append(angles)
        except ValueError:
            # Some original short frame counts overrun their stored bitstream.
            # Report the discrepancy; never synthesize the missing frame.
            result['incompleteAtFrame'] = fi
            result['warning'] = 'Short frame count exceeds stored bits; selected frame must exist'
            bits.offset = start
            break
        position = [a+b for a,b in zip(position, offsets)]
        raw = [[a+b for a,b in zip(r,d)] for r,d in zip(raw,deltas)]
        frames.append(frame())
    return result | dict(status='decoded', shortFrames=short_count, key=key,
                         payloadBytes=short_size, consumedBits=bits.offset, frames=frames)


def parse_pack(data, skeleton):
    if len(data) < 4:
        raise ValueError('Truncated DA pack')
    count = struct.unpack_from('<I', data)[0]
    body_count = skeleton['skeletonAnimations']
    weapon_count = skeleton['weaponAnimations']
    if count != body_count + weapon_count or count > 512:
        raise ValueError('DA/AA motion counts disagree')
    offset, body, weapons = 4, [], []
    for i in range(count):
        if offset+12 > len(data):
            raise ValueError(f'Truncated DA chunk {i}')
        size = struct.unpack_from('<I', data, offset+8)[0]
        end = offset+12+size
        if end > len(data):
            raise ValueError(f'DA chunk {i} extends outside archive entry')
        clip = decode_clip(data[offset:end], skeleton['boneCount'] if i < body_count else 1)
        clip['packIndex'] = i
        clip['byteOffset'] = offset
        (body if i < body_count else weapons).append(clip)
        offset = end
    if offset != len(data):
        raise ValueError('Unclassified DA trailing bytes')
    return dict(body=body, weapons=weapons, chunkCount=count)


def decode_battle_tex(data):
    """RT/SB textures store one full palette despite reporting two/three at 0x30.

    Entries, colors, exact byte length and every pixel index must agree. Only
    stored palette 0 is supported. Preserve the anomaly instead of inventing
    a second bank or nibble-unpacking the byte-per-pixel data.
    """
    h = list(struct.unpack_from('<59I', data)) if len(data) >= 236 else []
    single_bank = (h and h[0] == 1 and h[12] in (2,3) and h[13] == h[22] == 16
                   and h[19] == h[26] == 1 and h[47] == 0
                   and len(data) == 236+64+h[15]*h[16])
    if not single_bank:
        return decode_tex(data)
    patched = bytearray(data)
    struct.pack_into('<I', patched, 48, 1)
    image = decode_tex(bytes(patched))
    image.metadata.update(reported_palettes=h[12], stored_palettes=1,
                          header_anomaly='Single stored bank despite palette capacity; palette 0 only')
    return image


def body_resource(prefix, bone):
    index = 12+bone  # AM, AN ... AZ, BA ...; advance even for no-model joints.
    return prefix+chr(97+index//26)+chr(97+index%26)


def load_battle(archive, skeleton_id, weapon_id=None):
    # Card/production scope belongs to recipe validation, not this format reader.
    if not re.fullmatch(r'[a-z]{2}aa',skeleton_id):
        raise ValueError('Expected a Battle AA resource (Magic is not supported)')
    prefix = skeleton_id[:2]
    skeleton = parse_battle_skeleton(archive.read(skeleton_id))
    textures, parts, meshes = {}, [], []
    for i in range(skeleton['textures']):
        name = prefix+'a'+chr(99+i)
        textures[i] = decode_battle_tex(archive.read(name))
    for i, bone in enumerate(skeleton['bones']):
        if not bone['hasModel']:
            continue
        name = body_resource(prefix, i)
        mesh = parse_p(archive.read(name))
        meshes.append(dict(resourceId=name, bone=i, vertices=mesh['vertex_count'], triangles=mesh['triangle_count']))
        for group in mesh['groups']:
            if group['texture'] is not None and group['texture'] not in textures:
                raise ValueError(f'{name}: missing referenced texture {group["texture"]}')
            parts.append(dict(resourceId=name, bone=i, geometry=group))
    weapon = None
    if weapon_id:
        choices = [prefix+'c'+chr(107+i) for i in range(skeleton['weapons'])]
        if weapon_id not in choices:
            raise ValueError('Weapon not declared by AA header')
        weapon = parse_p(archive.read(weapon_id))
        for group in weapon['groups']:
            if group['texture'] is not None and group['texture'] not in textures:
                raise ValueError('Missing weapon texture')
    if skeleton_id == 'rtaa' and weapon_id != 'rtck':
        raise ValueError('Cloud trial requires the original RTCK Buster Sword')
    pack = parse_pack(archive.read(prefix+'da'), skeleton)
    return dict(skeletonId=skeleton_id, skeleton=skeleton, parts=parts, meshes=meshes,
                textures=textures, weapon=weapon, weaponId=weapon_id, pack=pack)


def frame_at(model, clip, frame):
    motions = model['pack']['body']
    if not 0 <= clip < len(motions) or not 0 <= frame < len(motions[clip]['frames']):
        raise ValueError(f'{model["skeletonId"]}: body animation {clip} frame {frame} unavailable')
    return motions[clip]['frames'][frame]


def battle_pose(model, clip, frame, edits=None, aims=None):
    """Battle +Z hierarchy, YXZ Euler, one Rx(180) source-to-view basis.

    Weapon is a separate root in DA. A configured static edit can attach its
    authentic source grip to the edited hand, preserving that binding's local
    transform; never pretend the AA header contains a named hand socket.
    """
    edits = edits or {}
    skeleton = model['skeleton']; motion = frame_at(model, clip, frame)
    allowed={str(i) for i in range(skeleton['boneCount'])}
    if set(edits)-allowed-{'root'} or set(aims or {})-allowed:
        raise ValueError('Pose references an absent Battle bone')
    basis = rotation([180, 0, 0], [0, 1, 2])
    root = multiply(basis, multiply(translation(*motion['position']), rotation(edits.get('root',motion['rotations'][0]), [1,0,2])))
    matrices = []
    for i, bone in enumerate(skeleton['bones']):
        r = motion['rotations'][i+1 if skeleton['boneCount'] > 1 else 0]
        parent = bone['parent']
        base = root if parent < 0 else multiply(matrices[parent], translation(0,0,skeleton['bones'][parent]['length']))
        if str(i) in (aims or {}):
            direction = aims[str(i)]
            length = math.sqrt(sum(v*v for v in direction))
            if length < 1e-9:raise ValueError('Zero joint aim direction')
            d = [sum(base[c][r]*direction[c]/length for c in range(3)) for r in range(3)]
            if bone['length'] >= 0:d = [-v for v in d]
            r = [math.degrees(math.asin(max(-1,min(1,d[1])))),math.degrees(math.atan2(-d[0],-d[2])),0]
        local = rotation(edits.get(str(i), r), [1,0,2])
        matrices.append(multiply(base, local))
    weapon = None
    if model['weapon']:
        clips = model['pack']['weapons']
        if not 0 <= clip < len(clips) or not 0 <= frame < len(clips[clip]['frames']):
            raise ValueError(f'Weapon animation {clip} frame {frame} unavailable; no implicit looping')
        w = clips[clip]['frames'][frame]
        weapon = multiply(basis, multiply(translation(*w['position']), rotation(w['rotations'][0], [1,0,2])))
    return matrices, weapon


def inverse_rigid(matrix):
    result = identity()
    for r in range(3):
        for c in range(3):
            result[r][c] = matrix[c][r]
        result[r][3] = -sum(matrix[c][r]*matrix[c][3] for c in range(3))
    return result


def assemble(model, spec):
    clip, frame = spec['animation'], spec['frame']
    original, original_weapon = battle_pose(model, clip, frame)
    posed, weapon = battle_pose(model, clip, frame, spec.get('absoluteBoneRotations'),spec.get('jointAims'))
    binding = spec.get('weaponBinding')
    if binding:
        hand = binding['handBone']
        local = multiply(inverse_rigid(original[hand]), original_weapon)
        if 'bladeDirection' in binding:
            # The source sword's blade extends along local -Z, thin axis is X.
            # Align the hand and real weapon together; keep the source grip transform.
            d = binding['bladeDirection']; length = math.sqrt(sum(v*v for v in d))
            z = [-v/length for v in d]
            normal = binding['thicknessNormal']
            dot = sum(a*b for a,b in zip(normal,z)); x = [a-dot*b for a,b in zip(normal,z)]
            length = math.sqrt(sum(v*v for v in x)); x = [v/length for v in x]
            y = [z[1]*x[2]-z[2]*x[1],z[2]*x[0]-z[0]*x[2],z[0]*x[1]-z[1]*x[0]]
            desired = identity()
            for r in range(3):
                for c,axis in enumerate((x,y,z)):desired[r][c] = axis[r]
            hand_rotation = multiply(desired,inverse_rigid(local))
            for r in range(3):
                for c in range(3):posed[hand][r][c] = hand_rotation[r][c]
        weapon = multiply(posed[hand], local)
        if 'localRotation' in binding:
            grip = binding.get('sourceGrip', [0,0,0])
            weapon = multiply(weapon, multiply(translation(*grip), multiply(rotation(binding['localRotation'],[1,0,2]),translation(*[-v for v in grip]))))
    scene = []
    for part in model['parts']:
        scene.append(part | dict(matrix=posed[part['bone']]))
    if model['weapon']:
        scene += [dict(resourceId=model['weaponId'],bone='weapon',geometry=g,matrix=weapon) for g in model['weapon']['groups']]
    return scene, dict(bodyMatrices=posed, originalBodyMatrices=original,
                       originalWeaponMatrix=original_weapon, weaponMatrix=weapon)
