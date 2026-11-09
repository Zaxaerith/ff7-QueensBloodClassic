"""Versioned plans and atomic, non-overwriting private Art Pack builds.
SPDX-License-Identifier: GPL-3.0-only
"""
import json
import os
import re
import signal
import struct
import sys
import threading
import time
from pathlib import Path
from assets import ROOT, digest
from . import VERSION
from .sources import requirements

CONFIG = ROOT/'data/generator/r1a-recipes.json'
EXTENSION = ROOT/'data/generator/r1b-recipes.json'
INDEX = ROOT/'data/card-index.json'


class Cancelled(Exception):
    pass


def json_write(path, value):
    """Replace one small metadata file atomically, never an archive or old pack."""
    temporary = path.with_name(path.name+'.tmp')
    with temporary.open('w', encoding='utf-8', newline='\n') as f:
        json.dump(value, f, ensure_ascii=False, indent=2, allow_nan=False)
        f.write('\n'); f.flush(); os.fsync(f.fileno())
    temporary.replace(path)


def load_recipes():
    config = json.loads(CONFIG.read_text(encoding='utf-8'))
    if config.get('version') != 1 or config.get('schema') != 'qb-production-recipes':
        raise ValueError('UNSUPPORTED_RECIPE_VERSION')
    recipes = {c['cardId']: c for c in config['cards']}
    if set(recipes) != {41, 86, 95, 106, 135, 141} or len(config['cards']) != 6:
        raise ValueError('R1A_RECIPE_SCOPE: six approved Card IDs only')
    extension = json.loads(EXTENSION.read_text(encoding='utf-8'))
    if extension.get('schema') != config['schema'] or extension.get('version') != 1 or extension.get('resolution') != config['resolution']:
        raise ValueError('UNSUPPORTED_RECIPE_EXTENSION')
    for card in extension['cards']:
        if card['cardId'] in recipes:
            raise ValueError('DUPLICATE_RECIPE_CARD_ID')
        recipes[card['cardId']] = card
    if set(recipes) != set(range(1, 146)):
        raise ValueError('INCOMPLETE_NUMBERED_RECIPE_COVERAGE')
    return config, recipes


def parse_cards(value):
    if value == 'all':
        return list(range(1, 146))
    tokens = value.split(',')
    if not tokens or any(not re.fullmatch(r'\d{1,3}', t) or not 1 <= int(t) <= 145 for t in tokens):
        raise ValueError('INVALID_CARD_IDS: use 041,086 or all (001..145)')
    ids = [int(t) for t in tokens]
    if len(ids) != len(set(ids)):
        raise ValueError('DUPLICATE_CARD_ID')
    return sorted(ids)


def plan(sources, cards):
    _, recipes = load_recipes()
    index = {c['cardId']: c for c in json.loads(INDEX.read_text(encoding='utf-8'))['cards']}
    needed = {}
    for cid in cards:
        if cid in recipes:
            for role, names in requirements(recipes[cid]).items():
                needed.setdefault(role, set()).update(names)
    inspection = sources.inspect(needed, {r: sorted(n) for r, n in needed.items()})
    archives = {r['role']: r for r in inspection['archives']}
    rows = []
    for cid in cards:
        reference = index[cid]
        row = dict(cardId=cid, name=reference['name'], sourceClass=reference['className'],
                   declaredArchiveRoles=reference['archiveRoles'])
        if cid not in recipes:
            row.update(status='not-supported', reason='No integrated production recipe')
        else:
            spec = recipes[cid]; entries = requirements(spec); problems = []
            for role, names in entries.items():
                a = archives[role]
                if a['status'] != 'validated' and not (a['status'] == 'missing-entries' and not set(names).intersection(a['missingEntries'])):
                    problems.append(dict(role=role, status=a['status'], path=a.get('path'),
                                         reason=a.get('reason'), missingEntries=sorted(set(names).intersection(a.get('missingEntries', [])))))
            row.update(kind=spec['kind'], requiredEntries=entries, recipeOrigin=spec['origin'],
                       identity=spec.get('identityRecord', dict(acceptance=reference['acceptance'], route=reference['route'])),
                       status='blocked-source' if problems else 'ready', problems=problems,
                       validation='LGP structure and minimum entry identities; full mesh/animation validation occurs during build')
        rows.append(row)
    return dict(schema='qb-generation-plan', version=1, generator=VERSION, source=str(sources.root),
                dependencies=dict(python='>=3.11', pillow='13.0.0', network=False, chrome=False, blender=False,
                                  researchReferences=False, exportedModels=False),
                cards=rows, inspection=inspection, ok=all(r['status'] == 'ready' for r in rows))


def new_output(value, source):
    path = Path(value).resolve()
    if path.exists():
        raise ValueError(f'OUTPUT_EXISTS: {path}; use a new output directory, never overwrite accepted art')
    if path.is_relative_to(source) or source.is_relative_to(path):
        raise ValueError(f'OUTPUT_OVERLAPS_SOURCE: {path}')
    if path.is_relative_to(ROOT) and not any(path.is_relative_to(ROOT/p) and path != ROOT/p for p in ('private-assets', '.parallel-check')):
        raise ValueError('OUTPUT_NOT_PRIVATE: inside this checkout choose private-assets/<new-pack> or .parallel-check/<task>')
    return path


def build(sources, cards, output, emit, cancel_file=None, producer=None, cancellation=None):
    from .production import produce
    producer = producer or produce
    config, recipes = load_recipes()
    unsupported = [cid for cid in cards if cid not in recipes]
    if unsupported:
        raise ValueError(f'NOT_SUPPORTED: {unsupported}')
    out = new_output(output, sources.root)
    # Fail before claiming an output if Python tooling is absent.
    import PIL
    if PIL.__version__ != '13.0.0':
        raise ValueError('PILLOW_VERSION: install tools/requirements-art.txt (Pillow 13.0.0)')
    token = Path(cancel_file).resolve() if cancel_file else None

    def check_cancel():
        if (token and token.exists()) or (cancellation and cancellation()):
            raise Cancelled('Cancellation requested; completed card files preserved, request remains incomplete')

    out.mkdir(parents=True, exist_ok=False)
    (out/'portraits').mkdir()
    started = time.monotonic()
    report = dict(schema='qb-local-asset-report', version=1, generator=VERSION, ok=False,
                  status='in-progress', requestedCards=cards, completedCards=[], models=[], failures=[],
                  recipeConfigSha256=digest(CONFIG), recipeExtensionSha256=digest(EXTENSION),
                  generatorDependenciesSha256=digest(ROOT/'data/generator/r1b-dependencies.json'),
                  readOnlySources=True, referencesRead=False,
                  privateUseOnly=True, approval='Technical reconstruction only; existing art acceptance is unchanged',
                  runtime=dict(python=sys.version.split()[0], pillow=PIL.__version__))
    manifest = dict(version=1, cards=[])
    file_index = {}
    dirty = []

    def checkpoint():
        json_write(out/'visual-manifest.json', manifest)
        report['elapsedSeconds'] = round(time.monotonic()-started, 3)
        # One writer owns this new output. Hash only newly produced card files;
        # old card files never change. The v1 reader independently verifies them.
        for target in [out/'visual-manifest.json', *dirty]:
            for p in target.rglob('*') if target.is_dir() else [target]:
                if p.is_file() and not p.name.endswith('.tmp'):
                    key = p.relative_to(out).as_posix()
                    file_index[key] = dict(path=key, size=p.stat().st_size, sha256=digest(p))
        dirty.clear()
        report['generatedFiles'] = [file_index[k] for k in sorted(file_index)]
        json_write(out/'build-report.json', report)

    previous_handlers = {}

    def interrupt(signum, frame):
        raise Cancelled(f'Signal {signum}; request incomplete')

    checkpoint()
    try:
        # CLI runs on the main thread; test/library callers may use cancellation().
        if threading.current_thread() is threading.main_thread():
            for sig in (signal.SIGINT, signal.SIGTERM):
                previous_handlers[sig] = signal.signal(sig, interrupt)
        emit(dict(event='build-start', cards=cards, out=str(out)))
        for cid in cards:
            check_cancel()
            stamp = time.monotonic(); spec = recipes[cid]
            emit(dict(event='card-start', cardId=cid, kind=spec['kind'], inputs=requirements(spec),
                      authored=spec['kind']=='original' or spec.get('fanProvenance')=='FAN_ORIGINAL'))
            try:
                entries = requirements(spec)
                status = sources.inspect(entries, entries)
                bad = [r for r in status['archives'] if r['required'] and r['status'] != 'validated']
                if bad:
                    raise ValueError('SOURCE_PRECHECK_FAILED: '+json.dumps(bad, ensure_ascii=False))
                staging = out/f'.card-{cid:03d}-incomplete'
                staging.mkdir()
                dirty[:] = [staging]
                for archive in sources.archives.values():
                    archive.used = {}
                    archive.last_resource = None
                record = producer(spec, sources, staging, config['resolution'], check_cancel)
                check_cancel()
                for name in ('subject.png', 'illustration.png'):
                    if not (staging/name).is_file():
                        raise ValueError(f'MISSING_GENERATED_FILE: {cid:03d}/{name}')
                json_write(staging/'source-report.json', record)
                staging.rename(out/f'{cid:03d}')
                portrait = f'portraits/card-{cid:03d}.png'
                dirty[:] = [out/f'{cid:03d}', out/portrait]
                (out/portrait).write_bytes((out/f'{cid:03d}/illustration.png').read_bytes())
                entity = (f'ff7-original:{spec["kind"]}:{spec["skeleton"]}'
                          if spec.get('skeleton') and spec['kind'] in ('battle', 'field', 'world', 'magic')
                          and not spec.get('originalSubstitute') else None)
                manifest['cards'].append(dict(cardId=cid, ff7OriginalEntityId=entity, portraitPath=portrait,
                                              modelSources={}, preview3dPath=None))
                report['completedCards'].append(cid)
                elapsed = round(time.monotonic()-stamp, 3)
                report['models'].append(dict(cardId=cid, kind=spec['kind'], status='built', seconds=elapsed,
                                             sourceReport=f'{cid:03d}/source-report.json', origin=spec['origin']))
                checkpoint()
                emit(dict(event='card-success', cardId=cid, seconds=elapsed, portrait=portrait))
            except Cancelled:
                raise
            except (ValueError, OSError, KeyError, TypeError, ArithmeticError, struct.error) as error:
                failure = dict(cardId=cid, code='CARD_BUILD_FAILED', message=str(error),
                               requiredEntries=requirements(spec), lastRead=sources.context())
                report['failures'].append(failure)
                checkpoint(); emit(dict(event='card-failed', **failure))
        check_cancel()
        # Check sources again: neither mutation nor concurrent mod changes may be certified.
        for role, archive in sources.archives.items():
            if digest(archive.path) != archive.sha256:
                report['failures'].append(dict(role=role, code='SOURCE_CHANGED', message=str(archive.path)))
        report['ok'] = not report['failures'] and report['completedCards'] == cards
        report['status'] = 'complete' if report['ok'] else 'failed'
    except (Cancelled, KeyboardInterrupt) as error:
        report['ok'] = False
        report['status'] = 'cancelled'
        report['failures'].append(dict(code='CANCELLED', message=str(error)))
    except Exception as error:
        report['ok'] = False
        report['status'] = 'failed'
        report['failures'].append(dict(code='BUILD_FAILED', message=str(error)))
    finally:
        for sig, handler in previous_handlers.items():
            signal.signal(sig, handler)
        checkpoint()
    emit(dict(event='build-result', ok=report['ok'], status=report['status'], out=str(out),
              completed=report['completedCards'], failures=report['failures'], seconds=report['elapsedSeconds']))
    return report
