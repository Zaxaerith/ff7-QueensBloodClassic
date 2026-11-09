"""Validate the public-source boundary, local-input closure and source archive."""
import argparse, hashlib, json, re, subprocess, zipfile
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parents[1]
EXACT = {
    '.gitattributes','.gitignore','LICENSE','THIRD_PARTY_NOTICES.md','README.md','README.zh-CN.md','VERSION.txt',
    'package.json','package-lock.json','tsconfig.json','vite.config.ts',
    'data/card-catalog.json','data/card-names.txt','data/card-index.json','data/classic-models.json','data/classic-technical.json','data/classic-art-mapping.json',
    'data/generator/r1a-recipes.json','data/generator/r1b-recipes.json','data/generator/r1b-dependencies.json','data/release/public-distribution-policy.json',
    'docs/ART_PACK_CONTRACT.md','docs/ASSETS.md','docs/CLI.md','docs/ENGINE.md','docs/LOCAL_ART_GENERATOR.md','docs/LOCAL_OUTPUTS.md',
    'desktop/.gitignore','desktop/build-game.mjs','desktop/PORTABLE_README.txt','desktop/README.md','desktop/audit-portable.py','desktop/build-windows.ps1','desktop/controller.py','desktop/freeze-game.mjs','desktop/freeze.py','desktop/generator_worker.py','desktop/jobs.py','desktop/pack.py','desktop/requirements-build.txt','desktop/requirements.txt','desktop/run.py','desktop/runtime_paths.py','desktop/server.py','desktop/start.cmd','desktop/windows.py','desktop/ui/index.html','desktop/ui/setup.css','desktop/ui/setup.js','desktop/licenses/Microsoft-WebView2-SDK-LICENSE.txt','desktop/licenses/Microsoft-WebView2-SDK-NOTICE.txt','desktop/tests/make-fixture.mjs','desktop/tests/test_host.py','desktop/tests/test_portable.py',
    'tools/assets.py','tools/asset-tests.py','tools/path-config-tests.py','tools/qb-assets.py','tools/qb-assets-tests.py','tools/qb-assets-preview.py','tools/qb-assets-pack-check.mjs','tools/art-pack.mjs','tools/art-mapping.d.mts','tools/art-mapping.mjs','tools/local-paths.d.mts','tools/local-paths.mjs','tools/private-pack.d.mts','tools/private-pack.mjs','tools/private-web.mjs','tools/qb-cli.mjs','tools/replay.mjs','tools/runtime.mjs','tools/requirements-art.txt','tools/assets-cli.mjs','tools/batch10_models.py','tools/batch11_models.py','tools/batch12_models.py','tools/batch13_models.py','tools/batch14_models.py','tools/public-source-check.py',
}
EXACT.update({'tools/coverage.mjs','tools/sync-catalog.mjs'})
PREFIXES=('src/','site/','shared/','tests/','examples/','tools/qb_assets/','tools/ff7_assets/')
DOCS={'docs/ART_PACK_CONTRACT.md','docs/ASSETS.md','docs/CLI.md','docs/ENGINE.md','docs/LOCAL_ART_GENERATOR.md','docs/LOCAL_OUTPUTS.md'}
PRIVATE_PATH=re.compile(rb'(?i)(?:[A-Z]:\\Users\\[^\\\x00\r\n]+|[A-Z]:\\(?:SteamLibrary|Program Files)\\)')
SECRET_PATTERNS=[re.compile(rb'gh[pousr]_[A-Za-z0-9]{30,}'),re.compile(rb'AKIA[0-9A-Z]{16}'),re.compile(rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----')]

def approved(path):
    return path in EXACT or path in DOCS or path.startswith(PREFIXES)

def git(*args):
    return subprocess.check_output(['git','-C',str(ROOT),*args],text=True).strip()

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--source-zip',type=Path);a=ap.parse_args()
    files=sorted(p.relative_to(ROOT).as_posix() for p in ROOT.rglob('*') if p.is_file() and '.git' not in p.parts and 'node_modules' not in p.parts)
    bad=[p for p in files if not approved(p)]
    if bad: raise SystemExit('Unapproved files: '+', '.join(bad))
    tracked=sorted(git('ls-files').splitlines())
    if files!=tracked or git('status','--porcelain'):
        raise SystemExit('Working tree must exactly match the clean Git source snapshot')
    package=json.loads((ROOT/'package.json').read_text());lock=json.loads((ROOT/'package-lock.json').read_text())
    if package['version']!='0.8.0-rc.2' or lock['version']!=package['version'] or lock['packages']['']['version']!=package['version']:
        raise SystemExit('Version mismatch')
    if package.get('private') is not False: raise SystemExit('package.json must describe a public source project')
    en=(ROOT/'README.md').read_text(encoding='utf-8');zh=(ROOT/'README.zh-CN.md').read_text(encoding='utf-8')
    if not en.startswith('# Queen') or '[简体中文](README.zh-CN.md)' not in en or '[English](README.md)' not in zh: raise SystemExit('README default language or cross-link is incorrect')
    deps=json.loads((ROOT/'data/generator/r1b-dependencies.json').read_text())
    for item in deps['code']:
        data=(ROOT/item['path']).read_bytes().replace(b'\r\n',b'\n')
        if hashlib.sha256(data).hexdigest()!=item['lfNormalizedSha256']:
            raise SystemExit('Generator dependency hash mismatch: '+item['path'])
    for p in [x['path'] for x in deps['code']]+deps['data']+['tools/qb-assets.py']:
        if not (ROOT/p).is_file(): raise SystemExit('Missing generator dependency: '+p)
    recipes=json.loads((ROOT/'data/generator/r1a-recipes.json').read_text(encoding='utf-8'))['cards']+json.loads((ROOT/'data/generator/r1b-recipes.json').read_text(encoding='utf-8'))['cards']
    if {r['cardId'] for r in recipes}!=set(range(1,146)): raise SystemExit('Expected production routes for all 145 cards')
    card_index=json.loads((ROOT/'data/card-index.json').read_text())
    if len(card_index['cards'])!=145: raise SystemExit('Card index must contain 145 rows')
    roots=git('rev-list','--max-parents=0','HEAD').splitlines()
    if len(roots)!=1 or git('rev-list','--count','HEAD')!='1' or git('show','-s','--format=%s','HEAD')!='Initial public source release':
        raise SystemExit('Git must contain only the clean public root commit')
    for p in files:
        file=ROOT/p
        if file.suffix.lower() in {'.png','.lgp','.tex','.hrc','.rsd','.obj','.blend','.pdb'}: raise SystemExit('Unexpected binary/art file: '+p)
        if file.suffix.lower() in {'.py','.ts','.tsx','.js','.mjs','.json','.md','.txt','.css','.html','.ps1','.cmd'}:
            data=file.read_bytes()
            if PRIVATE_PATH.search(data): raise SystemExit('Machine-specific path in '+p)
            if any(r.search(data) for r in SECRET_PATTERNS): raise SystemExit('Credential pattern in '+p)
    if a.source_zip:
        with zipfile.ZipFile(a.source_zip) as z:
            names=sorted(n for n in z.namelist() if not n.endswith('/'))
            expected=sorted(p for p in files if not p.startswith('desktop/game/'))
            if names!=expected: raise SystemExit('source.zip file list differs from clean Git snapshot')
            for name in names:
                committed=subprocess.check_output(['git','-C',str(ROOT),'show',f'HEAD:{name}'])
                if z.read(name)!=committed: raise SystemExit('source.zip content mismatch: '+name)
    print(json.dumps({'ok':True,'files':len(files),'generatorCodeFiles':len(deps['code']),'generatorDataFiles':len(deps['data']),'cards':145,'rootCommit':roots[0],'sourceZipChecked':bool(a.source_zip)},indent=2))

if __name__=='__main__':main()
