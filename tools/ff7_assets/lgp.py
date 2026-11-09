# Adapted from Zaxaerith/ff7-GaiaGIS, GPL-3.0-only.
# Source revision dac37e4f1bed256629488fecec2537ee381d3ebe; see THIRD_PARTY_NOTICES.md.
"""Read-only LGP TOC/header inventory. No extraction or archive mutation API."""
from pathlib import Path
import struct
from .lzss import FormatError

def name20(data: bytes) -> str:
    try:
        return data.split(b"\0", 1)[0].decode("ascii")
    except UnicodeDecodeError as exc:
        raise FormatError("Non-ASCII LGP filename") from exc

def inventory(path: Path) -> dict:
    data = path.read_bytes()
    if len(data) < 16:
        raise FormatError("LGP header truncated")
    count = struct.unpack_from("<I", data, 12)[0]
    toc_end = 16 + count * 27
    lookup_end = toc_end + 900 * 4
    if lookup_end + 2 > len(data):
        raise FormatError("LGP TOC/lookup exceeds archive")
    conflicts = struct.unpack_from("<H", data, lookup_end)[0]
    metadata_end = lookup_end + 2
    for _ in range(conflicts):
        if metadata_end + 2 > len(data):
            raise FormatError("LGP conflict table truncated")
        folders = struct.unpack_from("<H", data, metadata_end)[0]
        metadata_end += 2 + folders * 130
    if metadata_end > len(data):
        raise FormatError("LGP conflict locations truncated")
    entries, intervals = [], []
    case_variants = 0
    for i in range(count):
        name, off, check, conflict = struct.unpack_from("<20sIBH", data, 16 + i * 27)
        filename = name20(name)
        if off < metadata_end or off + 24 > len(data):
            raise FormatError(f"LGP entry {filename}: invalid record offset")
        stored_name = name20(data[off:off + 20])
        if stored_name.casefold() != filename.casefold():
            raise FormatError(f"LGP TOC/data filename mismatch: {filename}")
        case_variants += stored_name != filename
        size = struct.unpack_from("<I", data, off + 20)[0]
        if off + 24 + size > len(data):
            raise FormatError(f"LGP entry {filename}: payload outside archive")
        entries.append(dict(filename=filename, offset=off, data_offset=off + 24, size=size,
                            toc_index=i, check=check, conflict_index=conflict))
        intervals.append((off, off + 24 + size))
    intervals.sort()
    if any(a[1] > b[0] for a, b in zip(intervals, intervals[1:])):
        raise FormatError("Overlapping LGP file records")
    return dict(source_file=str(path), creator_header_hex=data[:12].hex(),
                creator=data[2:12].split(b"\0",1)[0].decode('ascii',errors='replace'),
                standard_creator_signature=data[:12]==b'\0\0SQUARESOFT',
                standard_footer=data.endswith(b'FINAL FANTASY7'), entry_count=count,
                conflict_count=conflicts, metadata_end=metadata_end, case_variant_records=case_variants,
                tex_count=sum(e["filename"].casefold().endswith(".tex") for e in entries),
                entries=entries)

def read_entry(path: Path, entry: dict) -> bytes:
    with path.open("rb") as stream:
        stream.seek(entry["data_offset"])
        data = stream.read(entry["size"])
    if len(data) != entry["size"]:
        raise FormatError("LGP entry became truncated")
    return data
