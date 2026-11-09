# Adapted from Zaxaerith/ff7-GaiaGIS, GPL-3.0-only.
# Source revision dac37e4f1bed256629488fecec2537ee381d3ebe; see THIRD_PARTY_NOTICES.md.
"""FF7 LZSS, independently implemented as a zero-filled 4096-byte ring buffer.

LSB-first flags; 12-bit dictionary address; 4-bit length + 3; initial write
cursor 4096-18. Input excludes the MAP uint32 compressed-length prefix.
"""
class FormatError(ValueError):
    pass

def decompress(data: bytes, max_output: int = 1 << 20) -> bytes:
    ring = bytearray(4096)
    cursor = 4096 - 18
    result = bytearray()
    pos = 0
    while pos < len(data):
        flags = data[pos]
        pos += 1
        if pos == len(data):
            raise FormatError("LZSS control byte has no token")
        for bit in range(8):
            if pos == len(data):
                break  # final partially populated control group is valid
            if flags & (1 << bit):
                token = (data[pos],)
                pos += 1
                if len(result) + 1 > max_output:
                    raise FormatError("LZSS output limit exceeded")
                value = token[0]
                result.append(value)
                ring[cursor] = value
                cursor = (cursor + 1) & 4095
            else:
                if pos + 2 > len(data):
                    raise FormatError("Truncated LZSS back-reference")
                address = data[pos] | ((data[pos + 1] & 0xF0) << 4)
                length = (data[pos + 1] & 15) + 3
                pos += 2
                if len(result) + length > max_output:
                    raise FormatError("LZSS output limit exceeded")
                for i in range(length):
                    value = ring[(address + i) & 4095]
                    result.append(value)
                    ring[cursor] = value
                    cursor = (cursor + 1) & 4095
    return bytes(result)
