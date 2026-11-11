"""Validate the public-source boundary, complete Git history and source ZIP."""
import argparse
import hashlib
import json
import re
import subprocess
import zipfile
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parents[1]
PUBLIC_ROOT = '695c76f034d7278d97a0ef28db07d8b39d3831fd'
EXACT = {
    '.gitattributes', '.gitignore', 'LICENSE', 'THIRD_PARTY_NOTICES.md',
    'README.md', 'README.zh-CN.md', 'VERSION.txt', 'package.json',
    'package-lock.json', 'tsconfig.json', 'vite.config.ts',
    '.github/workflows/windows-build.yml',
    '.github/workflows/publish-release.yml',
    'data/card-catalog.json', 'data/card-names.txt', 'data/card-index.json',
    'data/classic-models.json', 'data/classic-technical.json', 'data/classic-art-mapping.json',
    'data/generator/r1a-recipes.json', 'data/generator/r1b-recipes.json',
    'data/generator/r1b-dependencies.json', 'data/release/public-distribution-policy.json',
    'docs/ART_PACK_CONTRACT.md', 'docs/ASSETS.md', 'docs/CLI.md',
    'docs/ENGINE.md', 'docs/LOCAL_ART_GENERATOR.md', 'docs/LOCAL_OUTPUTS.md',
    'docs/CLOUD_RELEASE.md',
    'desktop/.gitignore', 'desktop/build-game.mjs', 'desktop/PORTABLE_README.txt',
    'desktop/README.md', 'desktop/audit-portable.py', 'desktop/build-windows.ps1',
    'desktop/controller.py', 'desktop/freeze-game.mjs', 'desktop/freeze.py',
    'desktop/generator_worker.py', 'desktop/jobs.py', 'desktop/pack.py',
    'desktop/requirements-build.txt', 'desktop/requirements.txt', 'desktop/run.py',
    'desktop/runtime_paths.py', 'desktop/server.py', 'desktop/start.cmd',
    'desktop/windows.py', 'desktop/ui/index.html', 'desktop/ui/setup.css',
    'desktop/ui/setup.js', 'desktop/licenses/Microsoft-WebView2-SDK-LICENSE.txt',
    'desktop/licenses/Microsoft-WebView2-SDK-NOTICE.txt',
    'desktop/tests/make-fixture.mjs', 'desktop/tests/test_host.py',
    'desktop/tests/test_portable.py',
    'tools/assets.py', 'tools/asset-tests.py', 'tools/path-config-tests.py',
    'tools/qb-assets.py', 'tools/qb-assets-tests.py', 'tools/qb-assets-preview.py',
    'tools/qb-assets-pack-check.mjs', 'tools/art-pack.mjs',
    'tools/art-mapping.d.mts', 'tools/art-mapping.mjs',
    'tools/local-paths.d.mts', 'tools/local-paths.mjs',
    'tools/private-pack.d.mts', 'tools/private-pack.mjs', 'tools/private-web.mjs',
    'tools/qb-cli.mjs', 'tools/replay.mjs', 'tools/runtime.mjs',
    'tools/requirements-art.txt', 'tools/assets-cli.mjs',
    'tools/batch10_models.py', 'tools/batch11_models.py', 'tools/batch12_models.py',
    'tools/batch13_models.py', 'tools/batch14_models.py',
    'tools/public-source-check.py', 'tools/coverage.mjs', 'tools/sync-catalog.mjs',
}
PREFIXES = ('src/', 'site/', 'shared/', 'tests/', 'examples/', 'tools/qb_assets/', 'tools/ff7_assets/')
RELEASE_NOTE = re.compile(r'^docs/releases/v\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?\.md$')
PRIVATE_PATH = re.compile(rb'(?i)(?:[A-Z]:\\Users\\[^\\\x00\r\n]+|[A-Z]:\\(?:SteamLibrary|Program Files)\\)')
SECRET_PATTERNS = [
    re.compile(rb'gh[pousr]_[A-Za-z0-9]{30,}'),
    re.compile(rb'AKIA[0-9A-Z]{16}'),
    re.compile(rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----'),
]
PRIVATE_PARTS = {
    '.parallel-check', '.research-cache', 'private-assets', 'browser-profile',
    'browser-runtime-cache', 'browser-temp', 'node_modules', '__pycache__',
}
PRIVATE_SUFFIXES = {
    '.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.lgp', '.tex', '.hrc',
    '.rsd', '.obj', '.blend', '.pdb', '.zip', '.7z', '.rar',
}
SCAN_SUFFIXES = {
    '.py', '.ts', '.tsx', '.js', '.mjs', '.json', '.md', '.txt', '.css',
    '.html', '.ps1', '.cmd', '.yml', '.yaml',
}


def approved(path):
    return path in EXACT or path.startswith(PREFIXES) or RELEASE_NOTE.fullmatch(path) is not None


def git_bytes(*args):
    return subprocess.check_output(['git', '-C', str(ROOT), *args])


def git(*args):
    return git_bytes(*args).decode('utf-8').strip()


def validate_history():
    commits = git('rev-list', '--all').splitlines()
    roots = git('rev-list', '--max-parents=0', '--all').splitlines()
    if not commits or roots != [PUBLIC_ROOT]:
        raise SystemExit(f'Git history must descend only from the audited public root {PUBLIC_ROOT}; roots={roots}')

    blobs = {}
    for commit in commits:
        tree = git_bytes('ls-tree', '-r', '-z', commit)
        for row in tree.split(b'\0'):
            if not row:
                continue
            header, raw_path = row.split(b'\t', 1)
            mode, kind, oid = header.split(b' ', 2)
            path = raw_path.decode('utf-8', 'surrogateescape').replace('\\', '/')
            parts = {part.casefold() for part in PurePosixPath(path).parts}
            if not approved(path):
                raise SystemExit(f'Unapproved historical path at {commit}: {path}')
            if parts & PRIVATE_PARTS or PurePosixPath(path).suffix.lower() in PRIVATE_SUFFIXES:
                raise SystemExit(f'Private or generated asset in Git history at {commit}: {path}')
            if kind == b'blob':
                blobs.setdefault(oid.decode('ascii'), set()).add(path)

    for oid, paths in blobs.items():
        if not any(Path(path).suffix.lower() in SCAN_SUFFIXES for path in paths):
            continue
        data = git_bytes('cat-file', 'blob', oid)
        if PRIVATE_PATH.search(data):
            raise SystemExit(f'Machine-specific path in Git history: {sorted(paths)[0]}')
        if any(pattern.search(data) for pattern in SECRET_PATTERNS):
            raise SystemExit(f'Credential pattern in Git history: {sorted(paths)[0]}')
    return commits, roots[0]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--source-zip', type=Path)
    args = ap.parse_args()

    files = sorted(p.replace('\\', '/') for p in git('ls-files', '-z').split('\0') if p)
    bad = [path for path in files if not approved(path)]
    if bad:
        raise SystemExit('Unapproved files: ' + ', '.join(bad))
    if git('status', '--porcelain', '--untracked-files=all'):
        raise SystemExit('Working tree must have no tracked changes or non-ignored untracked files')
    commits, root = validate_history()

    package = json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))
    lock = json.loads((ROOT / 'package-lock.json').read_text(encoding='utf-8'))
    version = package['version']
    if lock['version'] != version or lock['packages']['']['version'] != version:
        raise SystemExit('package.json and package-lock.json versions differ')
    if (ROOT / 'VERSION.txt').read_text(encoding='utf-8').strip() != version:
        raise SystemExit('VERSION.txt and package.json versions differ')
    if package.get('private') is not False:
        raise SystemExit('package.json must describe a public source project')

    en = (ROOT / 'README.md').read_text(encoding='utf-8')
    zh = (ROOT / 'README.zh-CN.md').read_text(encoding='utf-8')
    if not en.startswith('# Queen') or '[简体中文](README.zh-CN.md)' not in en or '[English](README.md)' not in zh:
        raise SystemExit('README default language or cross-link is incorrect')

    deps = json.loads((ROOT / 'data/generator/r1b-dependencies.json').read_text(encoding='utf-8'))
    for item in deps['code']:
        data = (ROOT / item['path']).read_bytes().replace(b'\r\n', b'\n')
        if hashlib.sha256(data).hexdigest() != item['lfNormalizedSha256']:
            raise SystemExit('Generator dependency hash mismatch: ' + item['path'])
    for path in [item['path'] for item in deps['code']] + deps['data'] + ['tools/qb-assets.py']:
        if not (ROOT / path).is_file():
            raise SystemExit('Missing generator dependency: ' + path)
    recipes = (
        json.loads((ROOT / 'data/generator/r1a-recipes.json').read_text(encoding='utf-8'))['cards']
        + json.loads((ROOT / 'data/generator/r1b-recipes.json').read_text(encoding='utf-8'))['cards']
    )
    if {row['cardId'] for row in recipes} != set(range(1, 146)):
        raise SystemExit('Expected production routes for all 145 cards')
    card_index = json.loads((ROOT / 'data/card-index.json').read_text(encoding='utf-8'))
    if len(card_index['cards']) != 145:
        raise SystemExit('Card index must contain 145 rows')

    for path in files:
        file = ROOT / path
        if file.suffix.lower() in PRIVATE_SUFFIXES:
            raise SystemExit('Unexpected binary/art file: ' + path)
        if file.suffix.lower() in SCAN_SUFFIXES:
            data = file.read_bytes()
            if PRIVATE_PATH.search(data):
                raise SystemExit('Machine-specific path in ' + path)
            if any(pattern.search(data) for pattern in SECRET_PATTERNS):
                raise SystemExit('Credential pattern in ' + path)

    for workflow in ('.github/workflows/windows-build.yml', '.github/workflows/publish-release.yml'):
        content = (ROOT / workflow).read_text(encoding='utf-8')
        for action in re.findall(r'^\s*uses:\s*([^\s#]+)$', content, re.MULTILINE):
            if re.fullmatch(r'[^@]+@[0-9a-f]{40}', action) is None:
                raise SystemExit(f'GitHub Action must be pinned to a full commit SHA: {workflow}: {action}')
    build_workflow = (ROOT / '.github/workflows/windows-build.yml').read_text(encoding='utf-8').lower()
    release_workflow = (ROOT / '.github/workflows/publish-release.yml').read_text(encoding='utf-8').lower()
    if 'runs-on: windows-2022' not in build_workflow or 'contents: write' in build_workflow:
        raise SystemExit('Build workflow must use windows-2022 and read-only repository permissions')
    if 'contents: write' not in release_workflow or 'actions: read' not in release_workflow:
        raise SystemExit('Release workflow must scope write permission to the release job')

    if args.source_zip:
        with zipfile.ZipFile(args.source_zip) as archive:
            names = [name for name in archive.namelist() if not name.endswith('/')]
            if len(names) != len(set(names)):
                raise SystemExit('source.zip contains duplicate paths')
            for name in names:
                safe = PurePosixPath(name)
                if safe.is_absolute() or '..' in safe.parts or '\\' in name:
                    raise SystemExit('Unsafe path in source.zip: ' + name)
            names = sorted(names)
            expected = sorted(path for path in files if not path.startswith('desktop/game/'))
            if names != expected:
                raise SystemExit('source.zip file list differs from clean Git snapshot')
            for name in names:
                committed = git_bytes('show', f'HEAD:{name}')
                if archive.read(name) != committed:
                    raise SystemExit('source.zip content mismatch: ' + name)

    print(json.dumps({
        'ok': True,
        'files': len(files),
        'historyCommits': len(commits),
        'rootCommit': root,
        'generatorCodeFiles': len(deps['code']),
        'generatorDataFiles': len(deps['data']),
        'cards': 145,
        'sourceZipChecked': bool(args.source_zip),
    }, indent=2))


if __name__ == '__main__':
    main()
