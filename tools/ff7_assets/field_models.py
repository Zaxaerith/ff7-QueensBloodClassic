# Adapted from Zaxaerith/ff7-GaiaGIS, GPL-3.0-only.
# Source revision dac37e4f1bed256629488fecec2537ee381d3ebe; see THIRD_PARTY_NOTICES.md.
"""Bounded field section-3 bindings for original Explorer assets, not a renderer."""
# SPDX-License-Identifier: GPL-3.0-only
import struct
from .lzss import decompress, FormatError
from .formats import resource_name

def field_model_section(payload):
    if len(payload)<4 or struct.unpack_from('<I',payload)[0]!=len(payload)-4:
        raise FormatError('Field compressed length')
    data=decompress(payload[4:],max_output=8_000_000)
    if len(data)<42 or struct.unpack_from('<HI',data)!=(0,9):raise FormatError('Field section header')
    offsets=struct.unpack_from('<9I',data,6)
    if offsets[0]<42 or any(a>=b for a,b in zip(offsets,offsets[1:])) or offsets[-1]+4>len(data):raise FormatError('Field section bounds')
    start=offsets[2];size=struct.unpack_from('<I',data,start)[0]
    if start+4+size!=offsets[3]:raise FormatError('Field model section length')
    return data[start+4:start+4+size]

def parse_field_models(data):
    if len(data)<6 or struct.unpack_from('<H',data)[0]!=0:raise FormatError('Field model header')
    count=struct.unpack_from('<H',data,2)[0]
    if count>128:raise FormatError('Field model count')
    pos=6;rows=[]
    def take(n):
        nonlocal pos
        if pos+n>len(data):raise FormatError('Truncated field model binding')
        b=data[pos:pos+n];pos+=n;return b
    def text(b):
        try:return b.rstrip(b'\0').decode('ascii')
        except UnicodeDecodeError as exc:raise FormatError('Field model text') from exc
    def short():return struct.unpack('<H',take(2))[0]
    for index in range(count):
        record=pos;length=short()
        if length>256:raise FormatError('Field model name length')
        name=text(take(length));flags=short();hrc=resource_name(text(take(8)),'.hrc');scale=text(take(4));clips=short()
        if not scale.isdigit() or not 0<int(scale)<=65535 or clips>256:raise FormatError('Field model scale/clip count')
        lighting=take(30).hex();animations=[]
        for _ in range(clips):
            length=short()
            if not 0<length<=128:raise FormatError('Field animation name length')
            animations.append(dict(resource=resource_name(text(take(length)),'.a'),flags=short()))
        rows.append(dict(name=name,hrc=hrc,scale=int(scale),flags=flags,animations=animations,lighting_hex=lighting,record=index,byte_offset=record))
    if pos!=len(data):raise FormatError('Unexpected field model trailing bytes')
    return rows
