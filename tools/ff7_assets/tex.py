# Adapted from Zaxaerith/ff7-GaiaGIS, GPL-3.0-only.
# Source revision dac37e4f1bed256629488fecec2537ee381d3ebe; see THIRD_PARTY_NOTICES.md.
"""Independent read-only FF7 PC TEX decoder; no game-file mutation API."""
# SPDX-License-Identifier: GPL-3.0-only
from dataclasses import dataclass
import struct
from .lzss import FormatError

HEADER_BYTES = 0xEC
MAX_PIXELS = 16_777_216

@dataclass(frozen=True)
class TexImage:
    width: int
    height: int
    rgba: bytes
    metadata: dict

def decode_tex(data: bytes, palette_index: int = 0) -> TexImage:
    """Decode stored index bytes or masked little-endian direct colors.

    Runtime pitch is not storage stride. Palette 0 is the deterministic default.
    Alpha 254 uses header reference alpha; enabled keying makes index/value 0
    transparent. No implicit black-RGB key and no nibble-depth inference.
    """
    if len(data) < HEADER_BYTES:
        raise FormatError("TEX header truncated")
    h = struct.unpack_from('<59I', data)
    w, height, bpp = h[15], h[16], h[26]
    if h[0] != 1 or not w or not height or w * height > MAX_PIXELS:
        raise FormatError("Unsupported TEX version or dimensions")
    paletted = h[19] != 0
    if bpp not in (1, 2, 3, 4) or (paletted and bpp != 1):
        raise FormatError("Unsupported TEX storage format")
    palettes, colors, entries = h[12], h[13], h[22]
    palette_bytes = entries * 4 if paletted else 0
    if paletted and (not colors or not palettes or entries != colors * palettes or
                     colors > 256 or not 0 <= palette_index < palettes):
        raise FormatError("Invalid TEX palette layout/index")
    start = HEADER_BYTES + palette_bytes
    end = start + w * height * bpp
    trailer = palettes if h[47] else 0
    if end + trailer != len(data):
        raise FormatError("TEX palette/pixels/key array truncated or unexpected trailing bytes")
    key = bool(h[2]) and (not h[47] or bool(data[end + palette_index]))
    bits, masks, shifts = h[27:31], h[31:35], h[35:39]
    if not paletted:
        occupied = 0
        for n, mask, shift in zip(bits, masks, shifts):
            if n > 8 or shift + n > bpp * 8 or mask != ((1 << n) - 1) << shift or occupied & mask:
                raise FormatError("Invalid/unsupported TEX channel masks")
            occupied |= mask
        if any(n == 0 for n in bits[:3]):
            raise FormatError("Direct TEX lacks RGB channels")
    if h[49] > 255:
        raise FormatError("Invalid TEX reference alpha")
    out = bytearray(w * height * 4)
    for i in range(w * height):
        value = int.from_bytes(data[start + i*bpp:start + (i+1)*bpp], 'little')
        if paletted:
            if value >= colors:
                raise FormatError("TEX index outside palette")
            p = HEADER_BYTES + (palette_index * colors + value) * 4
            blue, green, red, alpha = data[p:p+4]
            if alpha == 254:
                alpha = h[49]
            channels = [red, green, blue, alpha]
        else:
            # Expand integer channel range to full 8-bit, avoiding 5-bit -> 248.
            channels = [round(((value & m) >> s) * 255 / ((1 << n)-1)) if n else 255
                        for n, m, s in zip(bits, masks, shifts)]
        if key and value == 0:
            channels[3] = 0
        out[i*4:i*4+4] = bytes(channels)
    return TexImage(w, height, bytes(out), dict(paletted=paletted, bit_depth=h[14],
        bytes_per_pixel=bpp, palettes=palettes, palette_index=palette_index,
        colors_per_palette=colors, color_key=key, reference_alpha=h[49],
        channel_bits=list(bits), channel_masks=list(masks), channel_shifts=list(shifts)))
