"""Audit a final ZIP without running it. GPL-3.0-only."""
import argparse
import hashlib
import io
import json
from pathlib import PurePosixPath, Path
import struct
import zipfile


def audit(path):
    with zipfile.ZipFile(path) as z:
        names=z.namelist()
        if len(names)!=len(set(n.casefold() for n in names)): raise ValueError('Duplicate ZIP paths')
        prefix='QueensBloodClassic-Windows-x64/'
        files={}
        for n in names:
            if not n.startswith(prefix) or '\\' in n or '..' in PurePosixPath(n).parts: raise ValueError('Unsafe ZIP path: '+n)
            if n.endswith('/'): continue
            rel=n[len(prefix):]
            if any(p.lower() in ('private-assets','.research-cache','.parallel-check','node_modules','.git','profile','webview2','qb.local.json') for p in PurePosixPath(rel).parts): raise ValueError('Private/development content: '+rel)
            if PurePosixPath(rel).suffix.lower() in ('.lgp','.png','.tex','.hrc','.rsd','.obj','.blend','.pdb'): raise ValueError('Unexpected asset: '+rel)
            files[rel]=z.read(n)
        rows=json.loads(files['SHA256SUMS.json'])
        if set(r['path'] for r in rows)!=set(files)-{'SHA256SUMS.json'}: raise ValueError('Hash inventory mismatch')
        for row in rows:
            data=files[row['path']]
            if row['size']!=len(data) or row['sha256']!=hashlib.sha256(data).hexdigest(): raise ValueError('Hash mismatch: '+row['path'])
        for name, subsystem in [('QueensBloodClassic.exe',2),('qb-assets-worker.exe',3)]:
            data=files[name]; pe=struct.unpack_from('<I',data,60)[0]
            if struct.unpack_from('<H',data,pe+4)[0]!=0x8664 or struct.unpack_from('<H',data,pe+24+68)[0]!=subsystem: raise ValueError('Wrong PE architecture/subsystem: '+name)
        for required in ('_internal/data/release/public-distribution-policy.json','_internal/producer/tools/qb-assets.py','_internal/desktop/game/index.html','licenses/CPython-LICENSE.txt','source.zip'):
            if required not in files: raise ValueError('Missing payload: '+required)
        for arch in ('win-x64','win-arm64','win-x86'):
            if not any(arch in p and p.endswith('WebView2Loader.dll') for p in files): raise ValueError('Missing SDK loader directory: '+arch)
        game=[p for p in files if p.startswith('_internal/desktop/game/')]
        if not any('bot.worker-' in p for p in game) or not any('art-import.worker-' in p for p in game): raise ValueError('Game worker missing')
        if any(any(b in p.lower() for b in ('pyqt','pyside','cefpython','webbrowserinterop')) for p in files): raise ValueError('Unused browser backend included')
        with zipfile.ZipFile(io.BytesIO(files['source.zip'])) as source:
            for n in source.namelist():
                if '..' in PurePosixPath(n).parts or PurePosixPath(n).suffix.lower() in ('.png','.lgp','.obj','.blend','.tex'): raise ValueError('Unexpected corresponding-source asset: '+n)
        # Private-machine identifiers in runnable configuration/code payloads.
        for p,data in files.items():
            if p.startswith('_internal/') and p.endswith(('.json','.py','.html','.css','.js')):
                if b'C:\\Users\\ExampleUser' in data or b'D:\\SteamLibrary' in data: raise ValueError('Private path: '+p)
        return dict(ok=True,files=len(files),uncompressedBytes=sum(map(len,files.values())),size=path.stat().st_size,sha256=hashlib.sha256(path.read_bytes()).hexdigest(),runtimeGameFiles=len(game),pe='x64 GUI + x64 console worker',cleanWindowsCertification=False)


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('zip',type=Path);a=p.parse_args()
    print(json.dumps(audit(a.zip),indent=2))
