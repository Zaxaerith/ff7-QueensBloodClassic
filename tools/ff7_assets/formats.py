# Adapted from Zaxaerith/ff7-GaiaGIS, GPL-3.0-only.
# Source revision dac37e4f1bed256629488fecec2537ee381d3ebe; see THIRD_PARTY_NOTICES.md.
"""Independent read-only world HRC/RSD/P/A decoding. Never executes game data."""
# SPDX-License-Identifier: GPL-3.0-only
import math
from pathlib import PurePosixPath
import re
import struct
from .lzss import FormatError

MAX_ITEMS = 1_000_000

def resource_name(value, suffix=None):
    value=value.strip().replace('\\','/')
    if '/' in value or not re.fullmatch(r'[A-Za-z0-9_.]+',value):
        raise FormatError('Unsafe model resource name')
    return (PurePosixPath(value).stem+suffix if suffix else value).lower()

def text_lines(data):
    try:return [s.strip() for s in data.decode('ascii').splitlines() if s.strip() and not s.lstrip().startswith('#')]
    except UnicodeDecodeError as exc:raise FormatError('Non-ASCII model text') from exc

def parse_hrc(data):
    lines=text_lines(data)
    if len(lines)<3 or lines[0]!=':HEADER_BLOCK 2' or not lines[1].startswith(':SKELETON ') or not lines[2].startswith(':BONES '):
        raise FormatError('Unsupported HRC header')
    try:count=int(lines[2].split()[1])
    except ValueError as exc:raise FormatError('Invalid HRC bone count') from exc
    # Zero-bone rigid models carry one null/root attachment, not an animated bone.
    records=count or 1
    if not 0<=count<=1024 or len(lines)!=3+records*4:raise FormatError('HRC bone table length')
    bones=[];names={'root':-1}
    for i in range(records):
        name,parent,length,parts=lines[3+i*4:7+i*4]
        try:length=float(length);parts=parts.split();n=int(parts[0])
        except ValueError as exc:raise FormatError('Invalid HRC bone record') from exc
        if name in names or parent not in names or not math.isfinite(length) or length<0 or len(parts)!=n+1 or n>128:raise FormatError('Invalid HRC hierarchy/parts')
        bones.append(dict(name=name,parent=names[parent],length=length,resources=[resource_name(s,'.rsd') for s in parts[1:]]));names[name]=i
    return dict(name=lines[1].split(maxsplit=1)[1],bone_count=count,bones=bones)

def parse_rsd(data):
    lines=text_lines(data)
    if not lines or lines[0]!='@RSD940102':raise FormatError('Unsupported RSD header')
    pairs={}
    for line in lines[1:]:
        if '=' not in line:raise FormatError('Malformed RSD property')
        key,value=line.split('=',1)
        if key in pairs:raise FormatError('Duplicate RSD property')
        pairs[key]=value.strip()
    try:n=int(pairs['NTEX']);mesh=resource_name(pairs['PLY'],'.p')
    except (KeyError,ValueError) as exc:raise FormatError('Missing RSD mesh/texture count') from exc
    if not 0<=n<=256:raise FormatError('RSD texture limit')
    try:textures=[resource_name(pairs[f'TEX[{i}]'],'.tex') for i in range(n)]
    except KeyError as exc:raise FormatError('Missing RSD texture reference') from exc
    return dict(mesh=mesh,textures=textures)

def finite(values):
    if any(not math.isfinite(v) for v in values):raise FormatError('Non-finite model value')
    return values

def parse_animation(data, bones=None):
    if len(data)<36:raise FormatError('Truncated A header')
    version,frames,count=struct.unpack_from('<3I',data);order=list(data[12:15])
    if version!=1 or not 0<frames<=10000 or not 0<=count<=1024 or sorted(order)!=[0,1,2] or (bones is not None and count!=bones):raise FormatError('Unsupported A counts/order')
    stride=24+count*12
    if len(data)!=36+frames*stride:raise FormatError('A frame length mismatch')
    values=finite(list(struct.unpack_from('<'+'f'*(frames*stride//4),data,36)))
    return dict(frame_count=frames,bone_count=count,rotation_order=order,values=values,timing='preview_30fps',runtime_timing_verified=False)

def parse_p(data):
    if len(data)<128:raise FormatError('Truncated P header')
    h=struct.unpack_from('<32I',data)
    if h[:3]!=(1,1,1) or any(n>MAX_ITEMS for n in h[3:16]) or not h[3] or not h[9] or not h[13]:raise FormatError('Unsupported P header/counts')
    if h[7]!=h[3] or h[15] not in (0,1):raise FormatError('Unsupported P color/normal index layout')
    offset=128
    def take(count,size):
        nonlocal offset
        end=offset+count*size
        if end>len(data):raise FormatError('Truncated P section')
        result=data[offset:end];offset=end;return result
    def floats(count,size):return finite(list(struct.unpack('<'+'f'*(count*size//4),take(count,size))))
    vertices=floats(h[3],12);normals=floats(h[4],12);take(h[5],12);uv=floats(h[6],8)
    colors=list(take(h[7],4));take(h[9],4);take(h[8],4)
    polys=[struct.unpack('<12H',take(1,24)) for _ in range(h[9])]
    take(h[10],24);take(h[11],3)
    hundreds=[list(struct.unpack('<25I',take(1,100))) for _ in range(h[12])]
    groups=[struct.unpack('<14I',take(1,56)) for _ in range(h[13])]
    # Each stored box begins with a four-byte marker then six float bounds.
    take(h[14],28);take(h[3] if h[15] else 0,4)
    if offset!=len(data):raise FormatError('Unexpected P trailing bytes')
    parts=[];covered=set()
    for gi,g in enumerate(groups):
        _,start,n,vstart,nv,estart,ne,*_=g;u=g[11];textured=g[12];texture=g[13]
        if start+n>len(polys) or vstart+nv>h[3] or estart+ne>h[8] or textured not in (0,1) or (textured and u+nv>h[6]):raise FormatError('P group bounds')
        positions=[];normal_values=[];color_values=[];uv_values=[]
        for pi in range(start,start+n):
            if pi in covered:raise FormatError('Overlapping P polygon groups')
            covered.add(pi);p=polys[pi]
            for j in range(3):
                vi=p[1+j];ni=p[4+j]
                if vi>=nv or (h[4] and ni>=h[4]):raise FormatError('P vertex/normal reference')
                positions.extend(vertices[(vstart+vi)*3:(vstart+vi)*3+3]);normal_values.extend(normals[ni*3:ni*3+3] if h[4] else [0,0,0])
                b,green,r,a=colors[(vstart+vi)*4:(vstart+vi)*4+4];color_values.extend([r/255,green/255,b/255,a/255])
                uv_values.extend(uv[(u+vi)*2:(u+vi)*2+2] if textured else [0,0])
        parts.append(dict(group=gi,positions=positions,normals=normal_values,colors=color_values,uv=uv_values,texture=texture if textured else None,material=hundreds[min(gi,len(hundreds)-1)] if hundreds else None))
    if len(covered)!=len(polys):raise FormatError('P polygons not covered by groups')
    return dict(vertex_count=h[3],triangle_count=h[9],groups=parts)
