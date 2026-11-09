"""M4-O: explicitly fan-original scenery, props and Rebirth-only characters.
No original game mesh or texture is read or altered by this module.
SPDX-License-Identifier: GPL-3.0-only
"""
import math
from batch10_models import Recipe

GOLD=[181,143,65];IVORY=[204,202,178];DARK=[27,30,42];STEEL=[141,149,161]

def ring(r,name,c,radius,color,n=24,th=.08):
    for i in range(n):
        a=i*math.tau/n;b=(i+1)*math.tau/n
        r.tube(name+str(i),[c[0]+radius*math.sin(a),c[1]+radius*math.cos(a),c[2]],[c[0]+radius*math.sin(b),c[1]+radius*math.cos(b),c[2]],th,color,sides=4)

def star(r,name,c,size,color):
    outline=[]
    for i in range(10):
        a=math.pi/2+i*math.pi/5;v=size*(1 if i%2==0 else .42);outline.append([v*math.cos(a),v*math.sin(a)])
    r.poly(name,c,outline,color,depth=.07)

def roof(r,name,c,w,h,d,color):r.poly(name,c,[[-w/2,0],[w/2,0],[0,h]],color,depth=d)

def stage(r,width=12):
    r.box('stage-plinth',[0,.0,0],[width,.5,5],DARK)
    r.box('gold-stage-lip',[0,.26,2.4],[width,.16,.18],GOLD)

def props(cid,name):
    r=Recipe(cid,name,'authored scenic props; original source characters use native motion independently')
    if cid==110:
        for i,(x,y,z) in enumerate([(-3,4.7,-.4),(2.7,5.2,-1.2),(-2.9,2.2,1.3)]):
            r.tube('prop-staff-'+str(i),[x,y-2,z],[x,y,z],.055,GOLD,sides=5)
            ring(r,'prop-orbit-'+str(i),[x,y,z],.43,GOLD,10,.035)
            r.orb('prop-orb-'+str(i),[x,y,z],[.4,.4,.4],[152,188,127],sides=6,bands=2)
        stage(r,10)
    elif cid==134:
        r.box('seaside-deck',[0,-.12,0],[13,.2,6],[83,64,44])
        r.box('rear-raised-deck',[0,2.25,-2.4],[6.3,.3,1.7],[103,77,48])
        for x in (-2.7,2.7):r.box('rear-deck-leg'+str(x),[x,1.1,-2.4],[.25,2.2,.4],[83,64,44])
        for x in range(-6,7):r.box('deck-board-'+str(x),[x,-.005,0],[.025,.03,6],[137,110,71])
        for x in [-5.8,5.8]:
            r.tube('palm-trunk'+str(x),[x,0,-2],[x+.3,7,-2],.15,[99,72,40],end=.1)
            for j in range(5):
                a=j*math.tau/5;r.add('palm-leaf'+str((x,j)),'fan',[44,94,67],root=[x+.3,7,-2],edge=[[x+.3+2*math.cos(a),7.4,-2+2*math.sin(a)],[x+.3+3*math.cos(a+.4),6.4,-2+3*math.sin(a+.4)]])
    elif cid==135:
        r.box('race-start-deck',[0,-.12,0],[13,.25,5],[65,66,70])
        for x in (-5.7,5.7):
            r.box('gate-post'+str(x),[x,4,-2],[.3,8,.3],GOLD)
            r.orb('gate-finial'+str(x),[x,8.2,-2],[.7,.7,.7],IVORY,sides=6,bands=2)
        r.box('start-beam',[0,8,-2],[11.4,.35,.4],GOLD)
    return r.data

def ranger():
    r=Recipe(136,'Space Ranger','raised left arm, weapon extended low right; chest-star and silver helmet in three-quarter hero composition')
    torso=r.node('armored-torso',[0,5.7,0]);head=r.node('helmet',[0,7.9,.1],torso)
    r.add('black-body-suit','loft',DARK,torso,center=[0,5.5,0],profile=[[-1.5,.65,.46],[-.8,.85,.6],[.6,1.25,.58],[1.2,.85,.45]])
    r.orb('silver-chest',[0,5.8,.22],[2.25,2.2,1.28],STEEL,torso,sides=6,bands=3)
    r.poly('black-star-plaque',[0,6.03,.91],[[-.57,.1],[0,.65],[.57,.1],[.36,-.56],[-.36,-.56]],DARK,torso,depth=.1)
    star(r,'silver-identity-star',[0,6.12,1.02],.43,IVORY)
    r.orb('helmet-shell',[0,7.9,.08],[1.42,1.8,1.35],STEEL,head,sides=8,bands=4)
    r.poly('dark-horizontal-visor',[0,7.96,.8],[[-.62,.1],[-.48,.36],[.48,.36],[.62,.1],[.43,-.22],[-.43,-.22]],DARK,head,depth=.1)
    r.tube('visor-glint',[-.48,8.15,.88],[.43,8.15,.88],.025,[151,199,220],head,sides=4)
    for s in (-1,1):
        r.orb('shoulder-'+str(s),[s*1.05,6.45,0],[1.1,.9,1.2],STEEL,torso,sides=6,bands=2)
        a=[s*.55,4.3,0];b=[s*.8,2.3,.35 if s==1 else -.2];c=[s*.95,.5,.8 if s==1 else .1]
        _,k,_=r.limb('leg'+str(s),a,b,c,torso,DARK,.42,False,STEEL);r.box('boot'+str(s),[c[0],.4,c[2]+.35],[.85,.65,1.5],DARK,k)
    r.limb('weapon-arm',[-1.1,6.4,0],[-1.9,5.2,.4],[-2.5,4.5,1.2],torso,STEEL,.36,True,DARK)
    r.limb('raised-arm',[1.1,6.4,0],[1.7,7.5,.1],[1.8,9.4,.45],torso,STEEL,.34,True,DARK)
    r.box('raygun-body',[-2.6,4.35,1.4],[1.3,.6,.65],STEEL)
    r.tube('raygun-barrel',[-2.9,4.35,1.5],[-4.1,3.7,1.6],.24,STEEL,sides=6)
    r.tube('raygun-muzzle',[-3.94,3.79,1.6],[-4.2,3.65,1.62],.32,DARK,sides=6)
    r.orb('raised-silver-glove',[1.8,9.4,.45],[.5,.8,.5],STEEL,sides=6,bands=3)
    r.add('red-cape','fan',[141,29,42],root=[.6,6.6,-.45],edge=[[2.3,4.8,-1.1],[2.9,1.4,-1],[.4,.7,-.7],[-.7,2,-.6]])
    return r.data

def hotel():
    r=Recipe(137,'Haunted Hotel','crooked gothic hotel entrance, tower silhouettes and authentic OG bats in the foreground')
    plum=[59,42,66];stone=[88,83,102];roofc=[55,69,85]
    stage(r,15)
    r.box('main-haunted-building',[0,3.6,-.8],[8,7,3.5],stone)
    roof(r,'steep-central-gable',[0,7,-.8],9,4.3,4,roofc)
    for i,x in enumerate([-5,5]):
        r.box('tower'+str(i),[x,4.8,-1.1],[2.5,9.5,2.6],plum)
        roof(r,'tower-spire'+str(i),[x,9.5,-1.1],3.5,3.8 if i==0 else 2.8,3.3,roofc)
        for y in (3.4,6.4,8):
            r.box('tower-window-frame'+str((i,y)),[x,y,.24],[1.25,1.4,.15],DARK)
            r.box('tower-window-glow'+str((i,y)),[x,y,.34],[.8,1.05,.05],[185,156,69])
            r.box('tower-crossbar'+str((i,y)),[x,y,.39],[1.0,.1,.06],DARK)
    r.box('deep-entrance',[0,1.9,1.04],[3.25,3.8,.2],[13,18,30])
    roof(r,'entrance-arch',[0,3.7,1.2],3.3,1.6,.3,DARK)
    for s in (-1,1):
        r.box('door-jamb'+str(s),[s*1.8,2.1,1.4],[.4,4.2,.5],GOLD)
        r.tube('door-tooth'+str(s),[s*.9,4.2,1.5],[s*.65,3.2,1.5],.25,IVORY,end=0,sides=4)
        r.orb('glowing-eye'+str(s),[s*1,5.7,1.15],[.8,.45,.15],[220,173,61],sides=6,bands=2)
        for j in range(3):r.box('cracked-board'+str((s,j)),[s*2.8,2+j*1.5,1],[1.0,.15,.12],plum)
    r.orb('skull-sign',[0,5.0,1.8],[1.2,1.0,.6],IVORY,sides=6,bands=3)
    for s in (-1,1):r.orb('skull-eye'+str(s),[s*.23,5.1,2.1],[.24,.25,.1],DARK,sides=5,bands=2)
    for j in range(4):r.box('entrance-steps'+str(j),[0,.12+j*.16,2.7-j*.25],[4.5-j*.3,.25,1.5],stone)
    return r.data

def skywheel():
    r=Recipe(138,'Skywheel','large oblique observation wheel with twelve suspended cabins, rim, hub and raised Saucer platform')
    stage(r,17);cy=7.1;radius=5.1
    for z in (-.35,.35):
        ring(r,'wheel-rim'+str(z),[0,cy,z],radius,GOLD,32,.10)
        ring(r,'inner-ring'+str(z),[0,cy,z],radius*.86,[105,119,136],32,.055)
    for i in range(12):
        a=i*math.tau/12;x=radius*math.sin(a);y=cy+radius*math.cos(a)
        r.tube('spoke-'+str(i),[0,cy,.4],[x,y,.4],.055,GOLD,sides=4)
        r.tube('cabin-hanger-'+str(i),[x,y,.1],[x,y-.4,.1],.045,STEEL,sides=4)
        r.box('cabin-glass-'+str(i),[x,y-.8,.1],[.64,.75,.75],[41,75,92])
        r.box('cabin-canopy-'+str(i),[x,y-.36,.1],[.85,.16,.85],GOLD)
        r.box('cabin-base-'+str(i),[x,y-1.2,.1],[.75,.15,.8],GOLD)
        r.orb('rim-bulb-'+str(i),[x,y,.6],[.17,.17,.17],[246,217,133],sides=4,bands=2)
    r.orb('wheel-hub',[0,cy,.8],[1.3,1.3,.65],GOLD,sides=10,bands=3)
    for s in (-1,1):r.tube('support-leg'+str(s),[s*3.1,0,2],[0,cy,1.0],.28,STEEL,sides=6)
    # Separate foreground observation saucer.
    r.add('front-observation-deck','loft',STEEL,center=[3.8,.8,3.2],sides=16,profile=[[-.6,3.5,2.7],[0,4.4,3.2],[.3,4.3,3.1],[.4,3.9,2.9]])
    return r.data

def loveless():
    r=Recipe(139,'Loveless','symmetrical theatrical proscenium, clockwork sun and stepped stage; OG guest actors remain in source costumes')
    stage(r,16)
    for s in (-1,1):
        for j in range(3):
            x=s*(5.4+j*.65);r.box('proscenium-column'+str((s,j)),[x,4.3,-.5],[.4,8.5,.8],GOLD)
            r.orb('column-cap'+str((s,j)),[x,8.6,-.5],[.8,.5,.9],IVORY,sides=6,bands=2)
        r.poly('drapery'+str(s),[s*5.6,6.7,-1.3],[[-1.1,3],[1.1,3],[1,0],[.8,-3],[-.6,-3.5],[-.9,-.5]],[96,32,40],depth=.1)
    # An open proscenium arch leaves the clock silhouette visible.
    for i in range(16):
        a=i*math.pi/16;b=(i+1)*math.pi/16
        r.tube('proscenium-arch'+str(i),[6.8*math.cos(a),7.9+3.4*math.sin(a),-.8],[6.8*math.cos(b),7.9+3.4*math.sin(b),-.8],.22,GOLD,sides=5)
    r.box('rear-stage',[0,4.4,-2.1],[10,8,.25],[32,37,50])
    for radius in (1.8,2.4,3.1):ring(r,'clock-ring'+str(radius),[0,7,-1.7],radius,GOLD,24,.07)
    for i in range(12):
        a=i*math.tau/12;x=math.sin(a);y=math.cos(a)
        r.tube('clock-ray'+str(i),[x*2.5,7+y*2.5,-1.45],[x*3.7,7+y*3.7,-1.45],.13,GOLD,end=.02,sides=4)
        r.orb('clock-hour-jewel'+str(i),[x*2.15,7+y*2.15,-1.35],[.17,.17,.1],IVORY,sides=4,bands=2)
    r.tube('clock-hand1',[0,7,-1.3],[.5,8.4,-1.3],.07,IVORY,sides=4);r.tube('clock-hand2',[0,7,-1.25],[-1,6.5,-1.25],.055,IVORY,sides=4)
    for j in range(3):r.box('stage-step'+str(j),[0,.3+j*.25,.8-j*.6],[12-j*1.3,.3,2],STEEL)
    return r.data

def mascots():
    r=Recipe(140,'Saucer Squad','three Rebirth-specific mascots: front Chocobo host, tall Cactuar left, hooded Tonberry right')
    # Cactuar costume, fan mesh (not a recolored original Cactuar).
    green=[70,149,88];x=-2.2;z=-.6
    r.orb('cactuar-mascot-body',[x,4.2,z],[1.7,5.7,1.35],green,sides=7,bands=4)
    for s in (-1,1):
        r.tube('cactuar-arm'+str(s),[x+s*.7,4.6,z],[x+s*1.25,3.7,z+.3],.29,green)
        r.tube('cactuar-leg'+str(s),[x+s*.4,1.7,z],[x+s*.55,.35,z+.25],.3,green)
    for dx,y in [(-.32,5.6),(.3,5.6),(0,4.9)]:r.orb('cactuar-hole'+str((dx,y)),[x+dx,y,z+.67],[.23,.45,.08],DARK,sides=6,bands=2)
    r.add('cactuar-hat','loft',green,center=[x,7.05,z],profile=[[0,1.25,.85],[.15,1.25,.85],[.2,.85,.65],[1,.85,.65]])
    r.tube('cactuar-hat-band',[x,7.48,z],[x,7.7,z],.88,IVORY,sides=7)
    # Hooded Tonberry mascot is a new theme costume and a new authored head.
    purple=[106,80,139];x=2.1
    r.add('tonberry-purple-robe','loft',purple,center=[x,.2,-.6],sides=7,profile=[[0,1.5,1],[2,1.2,.8],[4.2,.85,.7],[4.7,.6,.5]])
    r.orb('tonberry-hood',[x,5.7,-.65],[2.6,2.8,2.1],purple,sides=7,bands=3)
    r.orb('tonberry-hood-shadow',[x,5.65,.35],[1.9,2,.25],DARK,sides=7,bands=3)
    r.orb('tonberry-green-face',[x,5.65,.56],[1.45,1.6,.35],[105,136,75],sides=7,bands=3)
    for s in (-1,1):r.orb('tonberry-eye'+str(s),[x+s*.35,5.8,.77],[.26,.3,.08],[234,211,90],sides=5,bands=2)
    for j in range(5):star(r,'robe-star'+str(j),[x+(-.7 if j%2 else .65),1+j*.57,.38],.25,IVORY)
    # Chocobo mascot leads, arms spread, pink vest and trousers.
    yel=[225,185,65];x=0;z=1
    r.orb('chocobo-mascot-head',[0,5.25,z],[2.1,2,1.65],yel,sides=8,bands=4)
    r.orb('chocobo-beak',[0,5.0,2.02],[1.05,.68,1.2],[201,137,40],sides=6,bands=2)
    for s in (-1,1):
        r.orb('chocobo-eye'+str(s),[s*.53,5.55,1.77],[.2,.28,.12],DARK,sides=5,bands=2)
        r.orb('chocobo-wing'+str(s),[s*1.25,3.8,z+.25],[1.45,.65,.9],yel,sides=6,bands=3)
        for k in range(3):r.tube('chocobo-finger'+str((s,k)),[s*1.4,3.8,z+.4],[s*(2.2-k*.15),3.6-k*.15,z+.6],.14,yel,end=.03,sides=4)
        r.tube('chocobo-foot'+str(s),[s*.48,1,z],[s*.55,.3,z+.6],.22,[135,104,52],sides=5)
    r.orb('chocobo-trousers',[0,1.9,z],[2.3,2.5,1.8],IVORY,sides=8,bands=3)
    r.add('chocobo-pink-waistcoat','loft',[188,119,134],center=[0,2.9,z],profile=[[0,1.2,.85],[1.2,1,.7],[1.7,.65,.5]])
    for s in (-1,1):r.box('chocobo-lapel'+str(s),[s*.45,3.9,z+.75],[.3,1,.13],GOLD)
    r.poly('chocobo-bowtie',[0,4.55,z+.88],[[-.55,.2],[0,0],[.55,.2],[.55,-.2],[0,0],[-.55,-.2]],[141,49,51],depth=.08)
    return r.data

def queen(cid):
    emerald=cid==144;name='Emerald Witch' if emerald else 'Shadowblood Queen'
    r=Recipe(cid,name,'frontal three-quarter portrait, one hand raised to emblem, asymmetric hair and layered heraldic frame')
    cloth=[29,91,83] if emerald else [70,25,44];accent=[64,165,145] if emerald else [156,39,62];hair=[155,208,185] if emerald else [128,38,51]
    skin=[211,214,192] if emerald else [221,184,174];jewel=[88,226,187] if emerald else [205,45,59]
    hip=r.node('gown',[0,3.1,0]);body=r.node('bodice',[0,5.7,0],hip);head=r.node('head',[0,7.7,.12],body)
    r.add('long-gown','loft',cloth,hip,center=[0,.3,0],profile=[[0,2.8,1.1],[1.2,2.1,1],[3.4,1.2,.7],[4.4,.8,.55]])
    r.add('corset','loft',cloth,body,center=[0,4.7,0],profile=[[0,1,.6],[1,1.2,.7],[1.5,1.25,.68],[1.9,.75,.5]])
    r.tube('neck',[0,6.3,.1],[0,7,.1],.3,skin,body)
    r.orb('face-base',[0,7.7,.12],[1.25,1.8,1.15],skin,head,sides=8,bands=4)
    r.panel('pixel-face',[0,7.66,.71],[.98,1.35],'emerald-face' if emerald else 'shadow-face',head)
    r.orb('hair-cap',[0,8.22,-.08],[1.5,1.25,1.35],hair,head,sides=8,bands=3)
    for s in (-1,1):
        for j in range(3):
            a=[s*(.6+j*.15),8.0,-.1];b=[s*(1.0+j*.3),6.8-j*.35,.1];c=[s*(1.8+j*.35),5.2-j*.35,.2]
            r.tube('hair-upper'+str((s,j)),a,b,.25,hair,head,end=.3,sides=4);r.tube('hair-tip'+str((s,j)),b,c,.3,hair,head,end=.03,sides=4)
        a=[s*1.0,6.2,.1];b=[s*1.55,5.25,.4];c=([-1.9,6.7,.9] if emerald else [-.2,6.0,1.1]) if s==-1 else [1.05,4.7,1.2]
        sh,el,wr=r.limb('arm'+str(s),a,b,c,body,skin,.24,True,skin)
        r.orb('hand'+str(s),c,[.45,.65,.4],skin,wr,sides=6,bands=2)
        r.orb('pauldron'+str(s),a,[1.25,.7,.85],accent,sh,sides=6,bands=2)
        r.poly('sleeve'+str(s),[s*1.7,4.5,.12],[[-.75,.9],[.75,.9],[.8,-1.5],[-.6,-1]],cloth,el,depth=.25)
        r.tube('necklace'+str(s),[s*.6,6.6,.7],[0,6.15,.85],.06,GOLD,body,sides=4)
    for i in range(4):
        y=4.2-i*.6;r.poly('bodice-diamond'+str(i),[0,y,.76],[[-.28,0],[0,.36],[.28,0],[0,-.36]],GOLD,body,depth=.06)
    r.orb('necklace-gem',[0,6.12,.9],[.4,.55,.22],jewel,body,sides=6,bands=2)
    # Original heraldry, geometry and glyphs, not traced card pixels.
    for radius in [3.1,3.7]:ring(r,'halo-'+str(radius),[0,6.0,-1.4],radius,accent,28,.045)
    for s in (-1,1):
        for j in range(5):
            x=s*(3.2-j*.25);y=2.1+j*1.1
            r.poly('heraldic-leaf'+str((s,j)),[x,y,-1.2],[[0,-.5],[s*.5,0],[s*.15,.6],[-s*.25,.1]],accent,depth=.08)
        r.tube('frame-side'+str(s),[s*3.5,.3,-1],[s*3.5,9,-1],.055,GOLD,sides=4)
        for i in range(3):
            x=s*(.3+i*.37)
            if emerald:r.orb('diadem-petal'+str((s,i)),[x,8.65,.38],[.36,.42,.28],GOLD,head,sides=5,bands=2)
            else:
                h=1.4-i*.26;r.poly('thorn-crown-point'+str((s,i)),[x,8.45,.23],[[-.2,0],[s*.16,h],[.2,0]],DARK,head,depth=.15)
                r.orb('crown-ruby'+str((s,i)),[x,8.76,.42],[.17,.28,.15],jewel,head,sides=4,bands=2)
    r.orb('crown-heart',[0,8.8,.45],[.35,.45,.2],jewel,head,sides=6,bands=2)
    if emerald:
        r.tube('witch-staff',[-2.0,2.5,.5],[-2,7.1,.5],.065,GOLD,sides=5)
        ring(r,'staff-emblem',[-2,7.5,.5],.6,accent,8,.075);star(r,'staff-star',[-2,7.5,.5],.45,jewel)
    else:
        for s in (-1,1):r.poly('high-black-collar'+str(s),[s*.75,6.8,-.17],[[-.6,-.7],[.55,-.7],[s*.7,1.4],[0,.6]],DARK,body,depth=.12)
        r.poly('dark-v-neck',[0,6.0,.75],[[-.7,.45],[.7,.45],[0,-.6]],DARK,body,depth=.08)
        for s in (-1,1):
            for j in range(4):r.tube('red-black-thorn'+str((s,j)),[s*2.5,1.2+j*.7,-.8],[s*(3.1+j*.1),2+j*.7,-.8],.12,[98,26,44],end=0,sides=4)
    return r.data

BUILDERS={136:ranger,137:hotel,138:skywheel,139:loveless,140:mascots,144:lambda:queen(144),145:lambda:queen(145)}
