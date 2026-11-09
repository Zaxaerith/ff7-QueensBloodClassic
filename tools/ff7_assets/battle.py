"""Separate Battle AA skeleton probe, not a Field HRC or animation adapter.
Layout facts cross-checked against KimeraCS FF7BattleSkeleton.cs (GPL-3.0).
No compressed DA animation decoding or complete posed Battle conversion yet.
SPDX-License-Identifier: GPL-3.0-only
"""
import math,struct
def parse_battle_skeleton(data):
    if len(data)<52:raise ValueError('Truncated Battle AA header')
    header=struct.unpack_from('<13I',data);count=header[3]
    if not 0<count<=1024 or len(data)!=52+count*12:raise ValueError('Unsupported Battle skeleton count/length (locations use a separate layout)')
    bones=[]
    for i in range(count):
        parent,length,model=struct.unpack_from('<ifi',data,52+i*12)
        # Unlike HRC, signed Battle lengths are valid (Cloud root is -39).
        if parent < -1 or parent>=i or not math.isfinite(length) or abs(length)>100000 or model not in (0,1):raise ValueError(f'Unsupported Battle bone {i}: parent/length/model flag')
        bones.append(dict(parent=parent,length=length,hasModel=bool(model)))
    return dict(type=header[0],boneCount=count,joints=header[5],textures=header[6],skeletonAnimations=header[7],weapons=header[9],weaponAnimations=header[10],bones=bones)

def probe(archive):
    # Explicit documented resource identity; no filename guessed from a card name.
    result=dict(identity='Cloud',resourceId='rtaa',identityEvidence='FF7 Battle Animation PC identifies Cloud rtda (94 chunks); KimeraCS documents shared two-letter model families',status='unsupported-full-conversion',reason='DA packed rotations, weapon tracks and original blend states require separate verification')
    try:
        result['skeleton']=parse_battle_skeleton(archive.read('rtaa'))
        from .formats import parse_p
        geometry=parse_p(archive.read('rtam'))
        result['part']=dict(resourceId='rtam',triangles=geometry['triangle_count'],groups=len(geometry['groups']),conversion='P geometry structure only; not an assembled/posed Battle model')
        result['partGeometry']=geometry
        animation=archive.read('rtda')
        result['animationPack']=dict(resourceId='rtda',bytes=len(animation),declaredChunks=struct.unpack_from('<I',animation)[0])
    except (ValueError,struct.error) as error:result['probeFailure']=str(error)
    return result
