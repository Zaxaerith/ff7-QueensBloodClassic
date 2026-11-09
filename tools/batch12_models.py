"""Four independently authored PS1 interpretations for M4-P.
No original game mesh, palette or texture is imported by these builders.
SPDX-License-Identifier: GPL-3.0-only
"""
import math
from batch10_models import Recipe

def chain(r,name,points,radii,color,node='root',sides=6):
    for j,(a,b) in enumerate(zip(points,points[1:])):r.tube(f'{name}-{j}',a,b,radii[j],color,node,end=radii[j+1],sides=sides)

def toxirat():
    r=Recipe(6,'Toxirat','asymmetric forward spring; hunched rat, large ears, open incisors, extended front claws and curling naked tail')
    fur=[88,60,81];skin=[159,106,119];dark=[51,35,48];ivory=[207,195,154]
    hip=r.node('pelvis',[0,1.7,-.55]);chest=r.node('hunched-chest',[0,3.5,.05],hip);head=r.node('rat-head',[0,4.8,1.1],chest)
    r.add('haunched-body','ellipsoid',fur,hip,texture='rat-fur',center=[0,2.5,-.3],size=[2.9,4,3],sides=9,bands=5,uvProjection='xy',uvTiles=2)
    r.add('arched-upper-back','loft',fur,chest,texture='rat-fur',center=[0,3.5,.15],sides=8,profile=[[-1,1.25,1.1],[0,1.2,1.0],[1,.85,.85],[1.6,.6,.55]],uvProjection='xy')
    r.orb('skull',[0,4.8,1.0],[2.3,1.9,2.3],fur,head,sides=9,bands=4)
    r.orb('muzzle',[0,4.48,2.1],[1.65,.85,1.8],skin,head,sides=8,bands=3)
    r.orb('nose',[0,4.61,2.97],[.56,.38,.38],dark,head,sides=6,bands=2)
    r.orb('open-mouth',[0,4.14,2.18],[1.35,.65,1.35],[32,18,29],head,sides=7,bands=3)
    r.orb('lower-jaw',[0,3.85,2.01],[1.2,.5,1.25],skin,head,sides=7,bands=3)
    for s in (-1,1):
        ear=r.node('ear'+str(s),[s*.85,5.35,.8],head)
        outline=[[-.65,-.7],[-.7,.35],[-.4,1.8],[.15,1.48],[.67,.1],[.5,-.6]]
        r.poly('outer-ear'+str(s),[s*1.02,5.7,.8],outline,fur,ear,depth=.23)
        r.poly('inner-ear'+str(s),[s*1.02,5.75,.94],[[-.43,-.4],[-.42,.3],[-.3,1.35],[.05,1.08],[.42,.05],[.3,-.4]],skin,ear,depth=.04)
        r.orb('eye-socket'+str(s),[s*.82,4.98,1.84],[.64,.57,.35],dark,head,sides=7,bands=3)
        r.orb('amber-eye'+str(s),[s*.82,5.0,2.02],[.31,.27,.12],[198,148,54],head,sides=6,bands=2)
        r.tube('incisor'+str(s),[s*.24,4.42,2.78],[s*.21,4.0,2.85],.15,ivory,head,end=.09,sides=4)
        # Connect hips, knees and paws without ball-and-stick gaps.
        knee=[s*1.3,1.2,-.35 if s==1 else .35];foot=[s*1.3,.28,1.1 if s==-1 else .15]
        thigh=r.node('thigh'+str(s),[s*.8,1.9,-.3],hip)
        r.orb('haunch'+str(s),[s*1.0,1.6,-.3],[1.65,2.1,1.8],fur,thigh,sides=8,bands=4)
        chain(r,'shin'+str(s),[knee,foot],[.4,.23],skin,thigh)
        r.orb('hind-paw'+str(s),[foot[0],.23,foot[2]+.38],[.7,.4,1.1],skin,thigh,sides=6,bands=2)
        a=[s*.88,3.6,.55];b=[s*1.38,2.8,1.1];c=[s*1.65,2.9,2.15] if s==-1 else [s*1.48,2.1,2.0]
        shoulder=r.node('forearm'+str(s),a,chest)
        chain(r,'front-arm'+str(s),[a,b,c],[.34,.27,.21],fur,shoulder)
        r.orb('front-palm'+str(s),c,[.56,.43,.65],skin,shoulder,sides=6,bands=3)
        for j in range(3):
            p=[c[0]+(j-1)*.22,c[1]-.1,c[2]+.2];q=[p[0]+(j-1)*.15,c[1]-.45,c[2]+.72]
            r.tube('front-finger'+str((s,j)),p,q,.08,skin,shoulder,end=.06,sides=4)
            r.tube('front-claw'+str((s,j)),q,[q[0],q[1]-.2,q[2]+.14],.065,ivory,shoulder,end=0,sides=4)
        r.orb('cheek-fur'+str(s),[s*.99,4.43,1.42],[.85,.85,.8],fur,head,sides=5,bands=2)
    chain(r,'naked-tail',[[.1,1.6,-1.4],[.8,1.1,-2.25],[1.8,1.1,-2.8],[2.5,1.8,-3.1],[2.4,2.7,-3.2],[1.95,3.3,-3.1]],[.25,.22,.18,.14,.09,.02],skin,hip)
    for s in (-1,1):
        for j in range(3):r.tube('whisker'+str((s,j)),[s*.5,4.45,2.7],[s*(1.5+j*.1),4.45+(j-1)*.2,2.9],.018,ivory,head,end=.009,sides=3)
    return r.data

def flan():
    r=Recipe(18,'Flan','lopsided blue jelly lunge with large gaping mouth, sagging lip, raised yellow eyes and two gelatinous arms')
    blue=[30,126,157];edge=[58,179,183];deep=[14,49,81];eye=[216,170,48]
    body=r.node('jelly-body',[0,2.1,0]);head=r.node('face-dome',[.15,4.4,.1],body)
    r.add('pooled-base','loft',blue,body,center=[0,0,0],sides=11,profile=[[0,2.9,1.65],[.25,3.0,1.9],[.8,2.6,1.7],[1.8,2.3,1.4],[2.8,1.9,1.3],[3.4,1.9,1.2]])
    r.orb('upper-jelly-dome',[.15,4.3,-.1],[4.1,2.65,2.9],blue,head,sides=11,bands=5)
    r.orb('lower-jaw',[0,1.5,1.05],[4.1,1.5,1.65],edge,body,sides=10,bands=4)
    r.orb('dark-open-mouth',[0,3.05,1.46],[3.55,2.05,.7],deep,head,sides=10,bands=4)
    # Separate upper/lower mouth rims and hanging jelly strands.
    points=[[-1.9,3.3,1.55],[-1.45,3.92,1.65],[-.6,4.08,1.71],[.4,4.03,1.73],[1.35,3.84,1.67],[1.85,3.25,1.55]]
    chain(r,'upper-lip',points,[.18,.18,.2,.22,.2,.17],edge,head)
    chain(r,'bottom-lip',[[-1.85,2.8,1.6],[-1.35,2.25,1.75],[-.4,2.03,1.82],[.6,2.08,1.8],[1.5,2.35,1.7],[1.86,2.9,1.6]],[.16,.22,.22,.24,.2,.16],edge,body)
    for i,x in enumerate([-1.35,-.85,-.25,.4,1.1]):
        r.tube('jelly-upper-fang'+str(i),[x,3.9,1.9],[x+.05,3.2-(i%2)*.35,1.95],.105,edge,head,end=.025,sides=4)
    for s in (-1,1):
        x=s*1.25;r.orb('eye-ridge'+str(s),[x,4.66,1.05],[1.18,.7,.8],deep,head,sides=7,bands=3)
        r.orb('yellow-eye'+str(s),[x,4.78,1.44],[.76,.43,.27],eye,head,sides=8,bands=3)
        r.orb('eye-pupil'+str(s),[x,4.78,1.59],[.12,.28,.06],[41,69,65],head,sides=5,bands=2)
        r.add('gelatin-arm'+str(s),'loft',edge,body,center=[s*2.02,1.9,.3],sides=7,profile=[[0,.8,.65],[.45,1.0,.85],[1.1,.7,.65],[1.6,.45,.35]])
        r.tube('arm-drooping-tip'+str(s),[s*2.25,2.8,1],[s*2.8,1.55,1.7],.5,edge,body,end=.16,sides=6)
    for i,(x,y,z,size) in enumerate([(-.6,5.35,.1,.55),(.7,5.18,.85,.38),(1.5,1,.8,.34),(-1.4,1.15,1.4,.45),(.7,.7,1.7,.27)]):r.orb('jelly-surface-lobe'+str(i),[x,y,z],[size,size,size],edge,body,sides=6,bands=2)
    return r.data

def mindflayer():
    r=Recipe(27,'Mindflayer','long squid crown, four curling face tentacles, asymmetric raised claw and spotted shoulder mantle framing an exposed central organ')
    bone=[176,172,153];skin=[103,101,113];dark=[43,40,55];gold=[147,125,72];organ=[142,102,83]
    hip=r.node('hips',[0,3,0]);chest=r.node('thorax',[0,6.1,0],hip);head=r.node('squid-head',[0,8.4,.25],chest)
    r.add('split-robe','loft',dark,hip,center=[0,.2,0],sides=8,profile=[[0,1.7,1.0],[1.8,1.35,.8],[3.5,.75,.55],[4.2,.9,.55]])
    r.add('armored-torso','loft',skin,chest,center=[0,4.8,0],sides=8,profile=[[-1,.7,.5],[0,.8,.5],[1.3,1.4,.65],[2.1,1.0,.6]])
    r.orb('central-organ',[0,4.35,.65],[1.25,2.2,.85],organ,chest,sides=8,bands=4)
    for i in range(5):r.tube('organ-rib'+str(i),[-.5,3.7+i*.3,1.06],[.42,3.8+i*.3,1.06],.05,bone,chest,sides=4)
    r.tube('long-neck',[0,6.7,.05],[0,7.5,.15],.4,skin,chest,end=.46)
    r.add('squid-crown','loft',bone,head,center=[0,7.2,.1],sides=9,profile=[[0,.5,.45],[.55,.86,.75],[1.3,.9,.65],[2.0,.55,.48],[2.8,.16,.26],[3.15,.04,.06]])
    r.orb('dark-face',[0,7.75,.72],[1.2,1.1,.4],dark,head,sides=7,bands=3)
    for s in (-1,1):
        r.orb('glowing-eye'+str(s),[s*.36,8.1,.94],[.25,.15,.11],[211,191,89],head,sides=5,bands=2)
        r.tube('brow'+str(s),[s*.15,8.4,.8],[s*.69,8.3,.56],.12,gold,head,end=.08,sides=4)
        r.poly('crown-side-fin'+str(s),[s*.78,8.2,-.2],[[-.3,-.5],[.2,-.4],[s*.6,1.2],[s*.85,1.55],[.2,.4]],bone,head,depth=.1)
        r.add('spotted-mantle'+str(s),'poly',[255,255,255],chest,texture='mindflayer-mantle',center=[s*1.8,6.2,-.45],outline=[[-1.1,.6],[-.5,1.3],[.7,.9],[1.5,-.1],[1.8,-2.1],[.6,-1.1],[-.3,-.8]],depth=.2,uvProjection='xy',uvTiles=2)
        r.tube('mantle-bone-ridge'+str(s),[s*.75,7.1,-.1],[s*3.15,6.45,-.7],.11,bone,chest,end=.04,sides=4)
    # Four source-free tentacles, connected to the squid face.
    paths=[([[-.48,7.8,.83],[-.8,7.1,1.3],[-1.1,6.6,1.65],[-1.75,6.6,1.7],[-1.95,6.95,1.7]],.19),([[-.17,7.7,1],[-.22,6.9,1.5],[-.05,6.3,1.8],[.35,6.3,1.9],[.6,6.6,1.8]],.21),([[.2,7.7,1],[.45,7.0,1.6],[.8,6.6,1.9],[1.4,6.85,1.9],[1.55,7.2,1.7]],.18),([[.53,7.8,.8],[.85,7.3,1.3],[1.25,7.15,1.5],[1.7,7.5,1.4]],.16)]
    for j,(points,rad) in enumerate(paths):
        chain(r,'face-tentacle'+str(j),points,[rad*(1-k/(len(points)-1)*.83) for k in range(len(points))],bone,head)
        for k,p in enumerate(points[1:-1]):r.orb('sucker'+str((j,k)),[p[0],p[1]-.1,p[2]+.09],[.11,.13,.08],skin,head,sides=5,bands=2)
    arms=[('raised',[-1.1,6.4,.05],[-2.3,5.9,.65],[-3.1,6.8,1.65]),('low',[1.1,6.4,.05],[2.4,5.6,.4],[2.9,4.7,1.5])]
    for name,a,b,c in arms:
        _,el,wr=r.limb(name,a,b,c,chest,skin,.28,False,bone);r.orb(name+'-palm',c,[.67,.5,.58],skin,wr,sides=7,bands=3)
        for j in range(4):
            v=[c[0]+(j-1.5)*.16,c[1]+.15,c[2]+.1];w=[v[0]+(j-1.5)*.17,c[1]+.55,c[2]+.55];end=[w[0]+.1,c[1]+.45,c[2]+.85]
            chain(r,name+'-finger'+str(j),[v,w,end],[.085,.06,.01],bone,wr,sides=4)
    return r.data

def flametrooper():
    r=Recipe(30,'Flametrooper','braced asymmetric firing stance, two hands on flamethrower, white armor, yellow suit, respirator and twin fuel tanks')
    white=[188,190,180];cloth=[137,114,60];black=[37,41,44];steel=[121,132,136];red=[168,56,38]
    hip=r.node('hips',[0,3.8,0]);body=r.node('chest',[0,5.5,.1],hip);head=r.node('helmet',[0,7.4,.35],body)
    r.add('yellow-tunic','loft',cloth,body,center=[0,4.1,0],profile=[[0,.8,.55],[1,.93,.62],[2,1.15,.65],[2.4,.75,.5]])
    r.orb('white-chest-armor',[0,5.7,.25],[2.25,1.9,1.1],white,body,sides=8,bands=4)
    r.box('chest-vent',[0,5.4,.86],[1,.5,.12],steel,body)
    r.panel('chest-vent-map',[0,5.4,.94],[.85,.42],'vent',body)
    r.tube('neck',[0,6.4,.2],[0,6.8,.32],.32,black,body)
    r.orb('helmet-shell',[0,7.4,.35],[1.5,1.7,1.4],white,head,sides=9,bands=4)
    r.panel('painted-respirator',[0,7.32,1.08],[1.12,1.18],'flametrooper-mask',head)
    for s in (-1,1):
        r.orb('helmet-filter'+str(s),[s*.66,7.05,.7],[.42,.56,.5],steel,head,sides=6,bands=3)
        r.orb('white-pauldron'+str(s),[s*1.05,6.1,.1],[1.15,.95,1.25],white,body,sides=8,bands=3)
        r.box('orange-shoulder-stripe'+str(s),[s*1.13,6.22,.71],[.22,.72,.07],[203,110,44],body)
        a=[s*.56,3.9,0];b=[s*.88,2.2,.65 if s==-1 else -.2];c=[s*1.25,.45,1.4 if s==-1 else .15]
        thigh,knee,ankle=r.limb('leg'+str(s),a,b,c,hip,cloth,.39,False,cloth)
        r.orb('knee-pad'+str(s),[b[0],b[1],b[2]+.25],[.91,1,.58],white,knee,sides=7,bands=3)
        r.orb('white-greave'+str(s),[(b[i]+c[i])/2 for i in range(3)],[.83,1.4,.8],white,knee,sides=7,bands=3)
        r.box('black-boot'+str(s),[c[0],.25,c[2]+.25],[.86,.5,1.4],black,ankle)
        tx=.65 if s==-1 else 1.55
        r.tube('fuel-bottle'+str(s),[tx,5.4,-.95],[tx,7.5,-.95],.44,steel,body,sides=8)
        r.orb('tank-rounded-cap'+str(s),[tx,7.5,-.95],[.86,.55,.86],steel,body,sides=8,bands=3)
        for j in (0,1):r.tube('red-tank-band'+str((s,j)),[tx,5.7+j*.95,-.95],[tx,6.1+j*.95,-.95],.45,red,body,sides=8)
    hands=[('left',[-1,6,.1],[-1.75,5.2,.85],[-1.2,4.8,2.4]),('right',[1,6,.1],[1.6,4.9,.9],[.45,4.75,1.8])]
    for name,a,b,c in hands:
        _,el,wr=r.limb(name+'-arm',a,b,c,body,cloth,.32,False,white);r.orb(name+'-white-glove',c,[.62,.55,.65],white,wr,sides=7,bands=3)
    r.box('flamethrower-receiver',[-.35,4.75,2.05],[1.8,.7,.8],steel)
    r.tube('long-weapon-barrel',[-1.15,4.75,2.25],[-2.8,4.5,3.35],.24,steel,sides=8)
    r.tube('barrel-black-muzzle',[-2.65,4.52,3.25],[-2.95,4.48,3.45],.34,black,sides=8)
    r.tube('pilot-nozzle',[-2.65,4.26,3.1],[-2.98,4.2,3.45],.08,[166,125,55],sides=5)
    chain(r,'fuel-hose',[[.5,4.5,1.9],[1.45,4.2,1.4],[1.9,3.6,.2],[1.65,3.5,-.9],[.7,4.8,-1.1]],[.12,.12,.12,.12,.12],black,body)
    return r.data

BUILDERS={6:toxirat,18:flan,27:mindflayer,30:flametrooper}
