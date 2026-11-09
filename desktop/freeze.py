"""Build from an explicit committed export; one-folder, two entry points. GPL-3.0-only."""
import ast
import argparse
import hashlib
import importlib.metadata as metadata
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import zipfile

def main():
    p=argparse.ArgumentParser();p.add_argument('--source',required=True,type=Path);p.add_argument('--out',required=True,type=Path);p.add_argument('--commit',required=True);a=p.parse_args()
    root=a.source.resolve();out=a.out.resolve()
    if out.exists():raise ValueError('Output exists; never overwrite a previous candidate')
    if sys.version_info[:3]!=(3,11,9):raise ValueError('Build requires CPython 3.11.9 x64')
    out.mkdir(parents=True)
    deps=json.loads((root/'data/generator/r1b-dependencies.json').read_text())
    producer=[r['path'] for r in deps['code']]+deps['data']+['tools/qb-assets.py']
    # Keep source on disk so assets.ROOT remains producer/, without changing any
    # parser algorithm or collecting modules that would shadow these sources.
    for folder in ('tools/qb_assets/__init__.py','tools/ff7_assets/__init__.py'):
        if (root/folder).exists() and folder not in producer:producer.append(folder)
    data=[]
    for path in producer:data.append((str(root/path),'producer/'+str(Path(path).parent).replace('\\','/')))
    for path in ['desktop/ui/index.html','desktop/ui/setup.js','desktop/ui/setup.css','data/card-index.json','data/release/public-distribution-policy.json']:
        data.append((str(root/path),str(Path(path).parent).replace('\\','/')))
    for path in (root/'desktop/game').rglob('*'):
        if path.is_file():data.append((str(path),path.parent.relative_to(root).as_posix()))
    std=set()
    for path in producer:
        if not path.endswith('.py'):continue
        for n in ast.walk(ast.parse((root/path).read_text('utf-8-sig'))):
            names=[x.name.split('.')[0] for x in n.names] if isinstance(n,ast.Import) else [n.module.split('.')[0]] if isinstance(n,ast.ImportFrom) and n.module and not n.level else []
            std.update(name for name in names if name in sys.stdlib_module_names)
    # GUI dependency metadata is consulted at startup; preserve dist-info.
    spec=f'''from PyInstaller.utils.hooks import copy_metadata, collect_submodules
data={data!r}+copy_metadata('pywebview')+copy_metadata('Pillow')
excludes=['PyQt5','PyQt6','PySide2','PySide6','cefpython3','webview.platforms.qt','webview.platforms.gtk','webview.platforms.cocoa','webview.platforms.mshtml','webview.platforms.cef','tkinter','numpy','matplotlib']
host=Analysis([{str(root/'desktop/run.py')!r}],pathex=[{str(root/'desktop')!r}],datas=data,hiddenimports=['webview.platforms.winforms','webview.platforms.edgechromium','clr','PIL.PngImagePlugin','PIL.IcoImagePlugin'],excludes=excludes)
# pywebview 6.2.1 resolves all three native SDK directories at import, even
# on x64. Keep the SDK's small loader directories; only x64 is executed.
host.datas=[r for r in host.datas if not any(x in r[0] for x in ('WebBrowserInterop','pywebview-android'))]
host.binaries=[r for r in host.binaries if 'WebBrowserInterop' not in r[0]]
worker=Analysis([{str(root/'desktop/generator_worker.py')!r}],pathex=[],hiddenimports={sorted(std)!r}+['PIL.Image','PIL.ImageDraw','PIL.PngImagePlugin'],excludes=excludes)
hp=PYZ(host.pure);wp=PYZ(worker.pure)
he=EXE(hp,host.scripts,[],exclude_binaries=True,name='QueensBloodClassic',console=False,icon={str(out/'classic.ico')!r})
we=EXE(wp,worker.scripts,[],exclude_binaries=True,name='qb-assets-worker',console=True,icon={str(out/'classic.ico')!r})
COLLECT(he,we,host.binaries,host.datas,worker.binaries,worker.datas,name='QueensBloodClassic-Windows-x64')
'''
    from PIL import Image,ImageDraw
    image=Image.new('RGBA',(64,64),'#07143b');d=ImageDraw.Draw(image);d.rectangle((3,3,60,60),outline='#d7e3ff',width=3);d.polygon([(32,10),(49,32),(32,54),(15,32)],outline='#e3c77e',width=3);image.save(out/'classic.ico')
    (out/'portable.spec').write_text(spec,'utf-8')
    subprocess.run([sys.executable,'-m','PyInstaller','--noconfirm','--distpath',str(out/'dist'),'--workpath',str(out/'work'),str(out/'portable.spec')],check=True)
    bundle=out/'dist/QueensBloodClassic-Windows-x64'
    licenses=bundle/'licenses';licenses.mkdir()
    shutil.copy2(root/'LICENSE',licenses/'PROJECT-GPL-3.0.txt');shutil.copy2(root/'THIRD_PARTY_NOTICES.md',licenses/'THIRD_PARTY_NOTICES.md')
    shutil.copytree(root/'desktop/licenses',licenses/'Microsoft-WebView2-SDK')
    versions={}
    for name in ['pywebview','pythonnet','clr_loader','cffi','pycparser','bottle','proxy_tools','typing_extensions','Pillow','PyInstaller','pyinstaller-hooks-contrib','altgraph','pefile','pywin32-ctypes','setuptools','packaging']:
        dist=metadata.distribution(name);versions[name]=dist.version
        for f in dist.files or []:
            if any(word in str(f).lower() for word in ['license','copying','notice']) and dist.locate_file(f).is_file():
                dest=licenses/name/str(f);dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(dist.locate_file(f),dest)
    shutil.copy2(Path(sys.executable).parent/'LICENSE.txt',licenses/'CPython-LICENSE.txt')
    shutil.copy2(root/'desktop/PORTABLE_README.txt',bundle/'README.txt')
    version=(root/'VERSION.txt').read_text(encoding='utf-8').strip()
    (bundle/'VERSION.txt').write_text(version+' / Windows x64 local RC\nSource: '+a.commit+'\nPython: '+sys.version.split()[0]+'\n'+json.dumps(versions,indent=2)+'\n','utf-8')
    # Corresponding project source, no .git or working-tree inputs.
    with zipfile.ZipFile(bundle/'source.zip','w',zipfile.ZIP_DEFLATED) as z:
        for f in root.rglob('*'):
            rel=f.relative_to(root)
            if f.is_file() and not any(x in rel.parts for x in ['node_modules','game','dist','__pycache__','.git','.parallel-check']):z.write(f,rel.as_posix())
    rows=[]
    for f in sorted(bundle.rglob('*')):
        if not f.is_file():continue
        rel=f.relative_to(bundle).as_posix()
        if any(x.lower() in ['private-assets','.research-cache','profile','qb.local.json','first-pass-145'] for x in Path(rel).parts):raise ValueError('Private payload: '+rel)
        if f.suffix.lower() in ('.lgp','.png','.tex','.hrc','.rsd','.obj','.blend'):raise ValueError('Unapproved art: '+rel)
        rows.append(dict(path=rel,size=f.stat().st_size,sha256=hashlib.sha256(f.read_bytes()).hexdigest()))
    (bundle/'SHA256SUMS.json').write_text(json.dumps(rows,indent=2)+'\n','utf-8')
    archive=out/'QueensBloodClassic-Windows-x64.zip'
    with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
        for f in bundle.rglob('*'):
            if f.is_file():z.write(f,'QueensBloodClassic-Windows-x64/'+f.relative_to(bundle).as_posix())
    summary=dict(commit=a.commit,zip=str(archive),size=archive.stat().st_size,sha256=hashlib.sha256(archive.read_bytes()).hexdigest(),files=len(rows)+1,uncompressedBytes=sum(f.stat().st_size for f in bundle.rglob('*') if f.is_file()),versions=versions)
    (out/'package-report.json').write_text(json.dumps(summary,indent=2)+'\n','utf-8');print(json.dumps(summary))

if __name__=='__main__':main()
