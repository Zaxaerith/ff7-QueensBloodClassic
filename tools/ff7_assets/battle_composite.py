"""Authored effect/background layers and private reference comparison sheets.

Pillow is an offline tooling dependency only. No AI repaint or modern texture
is applied to the original model. References never enter the model renderer.
SPDX-License-Identifier: GPL-3.0-only
"""
import hashlib
import shutil
from PIL import Image, ImageDraw, ImageFont


def layers(spec, folder, size):
    if spec['layers'].get('kind')=='atmosphere':
        atmosphere_layers(spec,folder,size)
        return
    # Work directly at the illustration resolution: no global pixelation filter.
    background=Image.new('RGBA',(size,size)); px=background.load()
    bomb=spec['cardId']==41
    revised=spec['layers'].get('style')=='classic-card-v2'
    for y in range(size):
        for x in range(size):
            glow=max(0,1-(((x/size-.5)/.65)**2+((y/size-.35)/.8)**2))
            if bomb and revised:color=(int(5+10*glow),int(13+23*glow),int(34+29*glow))
            elif bomb:color=(int(18+57*glow),int(8+15*glow),int(19+6*glow))
            else:color=(int(7+10*glow),int(18+27*glow),int(36+35*glow))
            px[x,y]=(*color,255)
    draw=ImageDraw.Draw(background)
    if not bomb:
        # Abstract authored industrial shapes, not an extracted Midgar background.
        for x,y,w,h in [(0,.43,.16,.57),(.08,.55,.18,.45),(.78,.44,.12,.56),(.89,.3,.11,.7)]:
            box=[round(x*size),round(y*size),round((x+w)*size),round((y+h)*size)]
            draw.rectangle(box,fill=(8,19,35,255));draw.line((box[0],box[1],box[2],box[1]),fill=(43,72,86,255),width=2)
    effects=Image.new('RGBA',(size,size));draw=ImageDraw.Draw(effects)
    if bomb:
        if revised:
            # Soft radiance is a separate authored layer, never a filter on the model.
            from PIL import ImageFilter
            glow_layer=Image.new('RGBA',(size,size));g=ImageDraw.Draw(glow_layer)
            g.ellipse((size*.26,size*.2,size*.75,size*.69),fill=(255,110,28,70))
            effects=Image.alpha_composite(effects,glow_layer.filter(ImageFilter.GaussianBlur(size*.055)))
            draw=ImageDraw.Draw(effects)
        for x,y,w,h in spec['layers']['flames']:
            outer=[(x-w*.5,y+h*.6),(x-w*.7,y+h*.15),(x-w*.25,y-h*.12),
                   (x-w*.12,y-h*.48),(x+w*.22,y-h*.8),(x+w*.08,y-h*.15),
                   (x+w*.55,y+h*.15),(x+w*.5,y+h*.5)]
            draw.polygon([(round(a*size),round(b*size)) for a,b in outer],fill=(220,59,18,220))
            inner=[(x-w*.3,y+h*.4),(x-w*.26,y),(x+w*.02,y-h*.35),(x+w*.13,y+h*.05),(x+w*.33,y+h*.38)]
            draw.polygon([(round(a*size),round(b*size)) for a,b in inner],fill=(255,163,32,240))
            if revised:
                core=[(x-w*.14,y+h*.35),(x-w*.08,y),(x+w*.04,y-h*.16),(x+w*.15,y+h*.32)]
                draw.polygon([(round(a*size),round(b*size)) for a,b in core],fill=(255,231,136,245))
        for x,y in [(.24,.31),(.32,.15),(.57,.06),(.75,.25),(.72,.58),(.29,.62),(.62,.71),(.4,.78)]:
            a,b=round(x*size),round(y*size);draw.polygon([(a,b-3),(a+2,b),(a,b+3),(a-2,b)],fill=(255,164,67,220))
    else:
        for x,y in [(.13,.68),(.86,.17),(.76,.76),(.32,.07),(.94,.61)]:
            a,b=round(x*size),round(y*size);draw.rectangle((a,b,a+2,b+3),fill=(106,215,205,150))
    subject=Image.open(folder/'subject.png').convert('RGBA')
    background.save(folder/'background.png');effects.save(folder/'effects.png')
    # Fire belongs behind the original body. Original crown polygons stay intact.
    illustration=Image.alpha_composite(Image.alpha_composite(background,effects),subject)
    illustration.save(folder/'illustration.png')


def atmosphere_layers(spec,folder,size):
    """Shared data-driven batch background; authored, not extracted scenery."""
    data=spec['layers'];background=Image.new('RGBA',(size,size));pixels=background.load()
    top,bottom,halo=data['top'],data['bottom'],data['halo'];focus=data.get('focus',[.5,.4])
    for y in range(size):
        for x in range(size):
            t=y/max(1,size-1);glow=max(0,1-((x/size-focus[0])/.7)**2-((y/size-focus[1])/.7)**2)*data.get('haloStrength',.35)
            color=[round((top[i]*(1-t)+bottom[i]*t)*(1-glow)+halo[i]*glow) for i in range(3)]
            pixels[x,y]=(*color,255)
    effects=Image.new('RGBA',(size,size));draw=ImageDraw.Draw(effects)
    for x,y,length in data.get('motes',[]):
        a,b=round(x*size),round(y*size);draw.line((a,b,a+round(length*size),b-1),fill=tuple(data.get('moteColor',[180,180,140]))+(80,),width=1)
    if 'ground' in data:
        from PIL import ImageFilter
        x,y,w,h=data['ground'];shadow=Image.new('RGBA',(size,size));d=ImageDraw.Draw(shadow)
        d.ellipse(((x-w/2)*size,(y-h/2)*size,(x+w/2)*size,(y+h/2)*size),fill=(1,4,12,100))
        effects=Image.alpha_composite(effects,shadow.filter(ImageFilter.GaussianBlur(size*.02)))
    subject=Image.open(folder/'subject.png').convert('RGBA')
    background.save(folder/'background.png');effects.save(folder/'effects.png')
    Image.alpha_composite(Image.alpha_composite(background,effects),subject).save(folder/'illustration.png')


def review_board(root, out, mapping, card_id):
    row=next(c for c in mapping['cards'] if c['cardId']==card_id)
    reference=root/f'.research-cache/card-art/{card_id:03d}-reference.png'
    if not reference.is_file():raise ValueError(f'Missing authorized local reference: {reference}')
    if hashlib.sha256(reference.read_bytes()).hexdigest()!=row['visualReference']['sample']['sha256']:
        raise ValueError('Local reference hash differs from the reviewed research sample')
    ref_dir=out/'references';ref_dir.mkdir(exist_ok=True)
    shutil.copyfile(reference,ref_dir/f'{card_id:03d}.png')
    folder=out/f'{card_id:03d}'
    width,height=1248,800
    board=Image.new('RGB',(width,height),(7,14,36));draw=ImageDraw.Draw(board)
    font_path='C:/Windows/Fonts/consola.ttf'
    try:
        title=ImageFont.truetype(font_path,24);small=ImageFont.truetype(font_path,15)
    except OSError:
        title=ImageFont.load_default(size=24);small=ImageFont.load_default(size=15)
    draw.text((24,18),f'M4-B / #{card_id:03d} {row["name"]} / ART CANDIDATE - HUMAN REVIEW PENDING',font=title,fill='#f4d780')
    captions=['REBIRTH / LOCAL REFERENCE','FF7 ORIGINAL / BATTLE TRIAL','EXISTING BLUE FRAME / ACTUAL CSS']
    for col,caption in enumerate(captions):draw.text((24+col*408,66),caption,font=small,fill='#b9d3e7')
    # Checkerboard only behind the reference, to reveal its real alpha mask.
    for y in range(384):
        for x in range(384):
            color=(26,38,62) if ((x//24)+(y//24))%2 else (34,47,72)
            board.putpixel((24+x,100+y),color)
    ref=Image.open(reference).convert('RGBA').resize((384,384),Image.Resampling.NEAREST)
    board.paste(ref,(24,100),ref)
    art=Image.open(folder/'illustration.png').convert('RGB')
    board.paste(art.resize((384,384),Image.Resampling.NEAREST),(432,100))
    frame=Image.open(folder/'card-preview.png').convert('RGB');frame.thumbnail((384,490),Image.Resampling.LANCZOS)
    board.paste(frame,(840,100))
    notes=(['RTAA / 17 body meshes + 2 original eye textures + RTCK Buster Sword.',
            'Raised right fist / source grip retained / blade behind shoulder / waist crop.',
            'Authored static pose; original DA frame 0:0 is the binding source.',
            'Difference: 1997 anatomy, hair, costume, hand and sword geometry are retained.'] if card_id==86 else
           ['EBAA / all 8 meshes + 26 joints / original DA frame 0:17.',
            'Open mouth / eyes / spherical silhouette / arms reposed behind body.',
            'Original polygon crown retained; orange flame layer is explicitly authored.',
            'Difference: original smooth red body, teeth and facial design; no lava repaint.'])
    for i,line in enumerate(notes):draw.text((24,632+i*27),line,font=small,fill='#c0cee5')
    draw.text((24,764),'PRIVATE RESEARCH ONLY / reference and all game-derived images excluded from Git and public dist',font=small,fill='#e7bf7c')
    board.save(folder/'comparison-board.png')
