"""Local contact sheet / HTML from an explicitly selected completed Art Pack.
No original reference images or game UI dependency. Not a production input.
SPDX-License-Identifier: GPL-3.0-only
"""
import argparse
import html
import json
import os
from pathlib import Path
from PIL import Image, ImageDraw
from assets import ROOT, digest
from qb_assets.core import new_output


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--pack', required=True)
    p.add_argument('--out', required=True)
    args = p.parse_args()
    pack = Path(args.pack).resolve(strict=True)
    report = json.loads((pack/'build-report.json').read_text(encoding='utf-8'))
    manifest = json.loads((pack/'visual-manifest.json').read_text(encoding='utf-8'))
    if report.get('ok') is not True or manifest.get('version') != 1:
        raise ValueError('Select a completed v1 pack')
    hashes = {r['path']: r['sha256'] for r in report['generatedFiles']}
    names = {r['cardId']: r['name'] for r in json.loads((ROOT/'data/card-index.json').read_text(encoding='utf-8'))['cards']}
    out = new_output(args.out, pack)
    cards = sorted(manifest['cards'], key=lambda c:c['cardId'])
    sheet = Image.new('RGB', (1600, 55+190*((len(cards)+9)//10)), (8, 18, 36))
    draw = ImageDraw.Draw(sheet)
    draw.text((12, 12), f'Local reconstruction / {len(cards)} cards / existing art acceptance unchanged', fill='#e6d699')
    tiles = []
    for i, c in enumerate(cards):
        path = (pack/c['portraitPath']).resolve(strict=True)
        if not path.is_relative_to(pack) or digest(path) != hashes.get(c['portraitPath']):
            raise ValueError(f'Invalid generated portrait: {c["cardId"]}')
        with Image.open(path) as original:
            image = original.convert('RGBA'); image.thumbnail((148,148), Image.Resampling.NEAREST)
        x=8+i%10*160; y=50+i//10*190
        sheet.paste(image,(x,y),image)
        label=f'#{c["cardId"]:03d} {names[c["cardId"]]}'
        draw.text((x,y+151),label[:24],fill='#dde6ef')
        relative=Path(os.path.relpath(path,out)).as_posix()
        subject=Path(os.path.relpath(pack/f'{c["cardId"]:03d}/subject-full.png',out)).as_posix()
        tiles.append(f'<article data-search="{html.escape(label.lower(),quote=True)}"><h2>{html.escape(label)}</h2><a href="{html.escape(relative,quote=True)}"><img loading="lazy" src="{html.escape(relative,quote=True)}" alt="{html.escape(label,quote=True)}"></a><p><a href="{html.escape(subject,quote=True)}">Transparent full subject</a></p></article>')
    out.mkdir(parents=True,exist_ok=False)
    sheet.save(out/'contact-sheet.png')
    page='''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Local Classic Art reconstruction</title>
<style>body{margin:20px;background:#09152a;color:#e5ebf2;font:16px sans-serif}header{max-width:1000px;margin:0 auto 22px}input{font:inherit;padding:8px;width:min(90%,460px)}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px}article{border:1px solid #8190a7;background:#11203b;padding:10px}h2{font-size:15px;min-height:2em}img{display:block;width:100%;image-rendering:pixelated}a{color:#e5d292}article[hidden]{display:none}</style>
<header><h1>Private Classic Art reconstruction</h1><p>Generated locally from committed recipes. Model identity and aesthetic acceptance remain unchanged; no official reference images.</p><input id="search" type="search" placeholder="Card ID or name" aria-label="Search generated cards"> <a href="contact-sheet.png">Full contact sheet</a></header><main>'''+''.join(tiles)+'''</main><script>document.querySelector('#search').addEventListener('input',e=>{const q=e.target.value.toLowerCase().trim();document.querySelectorAll('article').forEach(a=>a.hidden=!a.dataset.search.includes(q));});</script></html>'''
    (out/'index.html').write_text(page,encoding='utf-8')
    print(json.dumps(dict(ok=True,cards=len(cards),preview=str(out/'index.html'),sheet=str(out/'contact-sheet.png'))))


if __name__ == '__main__':
    main()
