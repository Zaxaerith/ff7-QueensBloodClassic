"""Read-only Art Pack v1 host adapter (not a new pack protocol).
SPDX-License-Identifier: GPL-3.0-only
"""
from dataclasses import dataclass
from hashlib import sha256
from io import BytesIO
import json
from pathlib import Path
import re


class PackError(ValueError):
    pass


def relative_path(value):
    if value is None:
        return None
    if (not isinstance(value, str) or not value.strip()
            or re.search(r"^[a-z][a-z0-9+.-]*:|^[\\/]|[\\?#%\x00-\x1f]", value, re.I)
            or any(p in ('', '.', '..') for p in value.split('/'))):
        raise PackError('Invalid relative asset path')
    return value


def inside(root, path):
    return path != root and path.is_relative_to(root)


@dataclass(frozen=True)
class VerifiedPack:
    directory: Path
    cards: tuple
    files: dict

    def summary(self):
        return dict(path=str(self.directory), cards=len(self.cards),
                    portraits=sum(c['portraitPath'] is not None for c in self.cards))


def verify_pack(directory):
    """Validate v1 and freeze only runtime PNG bytes, avoiding post-check file swaps.

    Auxiliary production files and models are never served. Optional model paths
    are still checked against the same v1 hash/path rules before being redacted.
    Memory/file limits are host admission limits, not a version change.
    """
    root = Path(directory).resolve(strict=True)
    if not root.is_dir():
        raise PackError('Select an Art Pack directory')

    def read(path, limit):
        relative_path(path)
        target = (root / path).resolve(strict=True)
        if not inside(root, target) or not target.is_file():
            raise PackError('Asset escapes pack or is not a regular file: ' + path)
        with target.open('rb') as stream:
            data = stream.read(limit + 1)
        if len(data) > limit:
            raise PackError('Asset exceeds host size limit: ' + path)
        return data

    def document(path):
        value = json.loads(read(path, 8 * 1024 * 1024))
        if not isinstance(value, dict):
            raise PackError('Expected JSON object: ' + path)
        return value

    report = document('build-report.json')
    if (report.get('schema') != 'qb-local-asset-report' or type(report.get('version')) is not int
            or report['version'] != 1 or report.get('ok') is not True
            or report.get('status', 'complete') != 'complete'):
        raise PackError('Pack has no successful compatible v1 build report')
    rows = report.get('generatedFiles')
    if not isinstance(rows, list) or len(rows) > 20000:
        raise PackError('Invalid generatedFiles list')
    listed = {}
    for row in rows:
        if (not isinstance(row, dict) or not isinstance(row.get('path'), str)
                or row['path'] in listed or not isinstance(row.get('sha256'), str)
                or not re.fullmatch('[a-f0-9]{64}', row['sha256'])):
            raise PackError('Invalid/duplicate generated file hash')
        listed[row['path']] = row
    manifest = document('visual-manifest.json')
    if type(manifest.get('version')) is not int or manifest['version'] != 1 or not isinstance(manifest.get('cards'), list):
        raise PackError('Unsupported visual manifest')
    if len(manifest['cards']) > 1024:
        raise PackError('Too many cards for desktop host')
    seen, files, checked, cards = set(), {}, {}, []
    total = 0

    def asset(path):
        nonlocal total
        relative_path(path)
        if not re.fullmatch(r'(portraits/[a-z0-9-]+\.png|models/[a-z0-9-]+\.json)', path):
            raise PackError('Unexpected runtime asset path: ' + path)
        if path not in checked:
            data = read(path, 16 * 1024 * 1024)
            row = listed.get(path)
            if not row or sha256(data).hexdigest() != row['sha256']:
                raise PackError('Asset hash mismatch: ' + path)
            if 'size' in row and (type(row['size']) is not int or row['size'] != len(data)):
                raise PackError('Asset size mismatch: ' + path)
            total += len(data)
            if total > 256 * 1024 * 1024:
                raise PackError('Pack exceeds desktop memory limit')
            if path.startswith('portraits/'):
                from PIL import Image
                with Image.open(BytesIO(data)) as image:
                    if image.format != 'PNG' or max(image.size) > 4096 or min(image.size) < 1:
                        raise PackError('Unsupported portrait image: ' + path)
                    image.verify()
                files['classic/' + path] = data
            checked[path] = True
        return 'classic/' + path

    for card in manifest['cards']:
        if not isinstance(card, dict):
            raise PackError('Invalid card object')
        card_id = card.get('cardId')
        if (type(card_id) is not int or not 1 <= card_id <= 9007199254740991
                or 145 < card_id < 1000 or card_id in seen):
            raise PackError('Invalid/duplicate visual Card ID')
        seen.add(card_id)
        entity = card.get('ff7OriginalEntityId')
        if entity is not None and (not isinstance(entity, str) or not entity.strip()):
            raise PackError('Invalid entity identifier')
        portrait = relative_path(card.get('portraitPath'))
        if relative_path(card.get('preview3dPath')) is not None:
            raise PackError('Art Pack v1 does not enable 3D delivery')
        sources = card.get('modelSources')
        if sources is not None and not isinstance(sources, dict):
            raise PackError('Invalid model sources')
        models = {}
        for kind, source in (sources or {}).items():
            if kind not in ('field', 'battle', 'world'):
                raise PackError('Unsupported model kind')
            if source is None:
                models[kind] = None
                continue
            if not isinstance(source, dict) or not isinstance(source.get('resourceId'), str) or not source['resourceId'].strip():
                raise PackError('Invalid model resourceId')
            path = relative_path(source.get('path'))
            if path:
                asset(path)
            models[kind] = dict(resourceId=source['resourceId'], path=None)
        cards.append(dict(cardId=card_id, ff7OriginalEntityId=entity, modelSources=models,
                          portraitPath=asset(portrait) if portrait else None, preview3dPath=None))
    files['classic/visual-manifest.json'] = json.dumps(dict(version=1, cards=cards), ensure_ascii=False).encode('utf-8')
    return VerifiedPack(root, tuple(cards), files)
