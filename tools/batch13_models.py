"""M4-Q: two authored organic creatures, never imported OG geometry.
SPDX-License-Identifier: GPL-3.0-only
"""
from batch10_models import Recipe
from batch12_models import chain

def sea_devil():
    r=Recipe(32,'Sea Devil','low four-legged coastal predator, elevated open crocodilian jaw, splayed foreclaws, side fins and a tapering ridged tail')
    scale=[115,101,70];belly=[162,143,96];dark=[27,32,30];bone=[184,180,153];fin=[92,101,91]
    hip=r.node('rear-trunk',[0,2.4,-1]);chest=r.node('shoulder-girdle',[0,2.9,1],hip);neck=r.node('neck',[0,3.5,1.85],chest);head=r.node('upper-skull',[0,4.35,2.9],neck);jaw=r.node('lower-jaw',[0,2.9,3],neck)
    r.add('continuous-scaled-trunk','ellipsoid',[255,255,255],hip,texture='sea-devil-scales',center=[0,2.45,-.3],size=[3.65,3.05,5.2],sides=10,bands=5,uvProjection='xy',uvTiles=2)
    r.add('shoulder-muscle','ellipsoid',[255,255,255],chest,texture='sea-devil-scales',center=[0,2.9,1.0],size=[3.7,3.0,3.2],sides=9,bands=4,uvProjection='xy',uvTiles=2)
    r.orb('pale-gular-belly',[0,2.7,1.6],[2.8,2.6,2.2],belly,chest,sides=9,bands=4)
    r.add('rising-neck','loft',[255,255,255],neck,texture='sea-devil-scales',center=[0,2.8,1.8],profile=[[0,1.3,1.0],[1.2,1.4,1.05],[2,.95,.7]],sides=9,lean=.15,uvProjection='xy')
    r.add('cranial-roof','ellipsoid',[255,255,255],head,texture='sea-devil-scales',center=[0,4.8,2.8],size=[3.45,1.85,3.25],sides=10,bands=4,uvProjection='xy')
    r.orb('forward-upper-muzzle',[0,4.6,3.85],[3.05,1.1,2.35],scale,head,sides=10,bands=4)
    r.orb('open-oral-cavity',[0,3.65,3.7],[2.7,1.65,1.8],dark,neck,sides=9,bands=4)
    r.orb('tongue',[0,3.05,4.12],[1.65,.25,1.15],[103,70,70],jaw,sides=8,bands=3)
    r.orb('broad-lower-jaw',[0,2.8,3.62],[2.9,.68,2.5],belly,jaw,sides=10,bands=3)
    # Readable jaw perimeter, source-free teeth rather than a painted black box.
    for s in (-1,1):
        chain(r,'lower-jaw-rim'+str(s),[[s*.9,3.0,2.65],[s*1.28,3.0,3.35],[s*1.15,3.0,4.3],[s*.55,3,4.75]],[.14,.15,.13,.1],scale,jaw)
        r.orb('temporal-plate'+str(s),[s*1.4,4.55,2.6],[.65,1.25,1.3],fin,head,sides=7,bands=3)
        r.orb('eye-socket'+str(s),[s*1.24,4.87,3.34],[.57,.53,.48],dark,head,sides=7,bands=3)
        r.orb('amber-eye'+str(s),[s*1.29,4.95,3.56],[.3,.25,.17],[193,158,63],head,sides=6,bands=3)
        r.tube('brow-ridge'+str(s),[s*.95,5.27,3.67],[s*1.58,5.1,2.82],.2,fin,head,end=.12)
        r.orb('nostril'+str(s),[s*.74,4.81,4.82],[.35,.2,.12],dark,head,sides=5,bands=2)
        for i,z in enumerate([2.9,3.45,4.0,4.5]):
            x=s*(1.12 if i<3 else .8)
            r.tube('upper-fang'+str((s,i)),[x,4.31,z],[x*.97,3.45+(i%2)*.18,z+.15],.15,bone,head,end=.015,sides=5)
            r.tube('lower-fang'+str((s,i)),[x,3.05,z+.1],[x*.97,3.6-(i%2)*.1,z+.2],.11,bone,jaw,end=.01,sides=5)
        for i,x in enumerate([.24,.65]):r.tube('front-incisor'+str((s,i)),[s*x,4.28,4.81],[s*x,3.7,4.98],.12,bone,head,end=.01,sides=5)
        # Four legs are built from continuous muscles and shared joint positions.
        for name,a,b,c,parent in [('fore',[s*1.2,2.65,1.55],[s*2.05,1.45,2.25],[s*2.4,.35,2.75],chest),('hind',[s*1.15,2.3,-1.7],[s*2.1,1.4,-1.25],[s*2.15,.35,-.25],hip)]:
            node=r.node(name+'-leg'+str(s),a,parent)
            chain(r,name+'-leg-muscle'+str(s),[a,b,c],[.55,.43,.28],scale,node)
            r.orb(name+'-joint'+str(s),b,[.95,.95,1.0],scale,node,sides=7,bands=3)
            r.orb(name+'-paw'+str(s),[c[0],.26,c[2]+.32],[.94,.5,1.15],fin,node,sides=7,bands=3)
            for j in range(3):
                p=[c[0]+(j-1)*.32,.25,c[2]+.55];q=[p[0]+(j-1)*.12,.15,c[2]+1.14]
                r.tube(name+'-toe'+str((s,j)),p,q,.13,fin,node,end=.09,sides=5)
                r.tube(name+'-claw'+str((s,j)),q,[q[0],.1,q[2]+.35],.1,bone,node,end=0,sides=4)
        r.add('side-swimming-fin'+str(s),'fan',fin,chest,root=[s*1.55,2.8,.45],edge=[[s*2.6,3.8,-.3],[s*3.15,3.0,-.65],[s*2.8,1.5,-.1],[s*1.8,1.65,.65]])
        for j in range(3):r.tube('fin-ray'+str((s,j)),[s*1.6,2.7,.4],[s*(2.65+j*.15),3.4-j*.7,-.25],.045,bone,chest,end=.015,sides=4)
    chain(r,'long-scaled-tail',[[0,2.2,-2.2],[0,2.0,-3.2],[.35,1.9,-4.2],[1.1,2.3,-5.1],[1.9,2.7,-5.5]],[.8,.64,.44,.23,.02],scale,hip,sides=8)
    for i,z in enumerate([-3.5,-2.5,-1.5,-.5,.5,1.3]):
        y=3.2 if z<-2 else 3.8
        r.poly('dorsal-spine'+str(i),[0,y,z],[[-.3,-.2],[.32,-.2],[.18,.65+(i%2)*.3],[-.1,1.0]],fin,hip,depth=.55)
    return r.data

def reapertail():
    r=Recipe(61,'Reapertail','organic scorpion braced on eight walking legs, two enlarged open pincers, plated abdomen and arched segmented tail')
    shell=[43,52,63];joint=[66,64,68];edge=[137,139,133];dark=[22,29,37];fang=[163,157,137]
    abdomen=r.node('abdomen',[0,2,-.5]);head=r.node('cephalothorax',[0,2.8,1.1],abdomen)
    r.add('armored-body','ellipsoid',[255,255,255],abdomen,texture='reapertail-shell',center=[0,2.0,-.35],size=[2.75,2.05,4],sides=10,bands=4,uvProjection='xy',uvTiles=2)
    r.orb('head-carapace',[0,2.75,1.15],[2.1,1.5,1.9],shell,head,sides=9,bands=4)
    r.orb('dark-mouth',[0,2.45,2.0],[1.1,.75,.45],dark,head,sides=7,bands=3)
    for i in range(5):
        z=-1.65+i*.6;r.orb('abdominal-plate'+str(i),[0,2.6,z],[2.6,.75,.8],shell,abdomen,sides=8,bands=3)
        r.tube('plate-ridge'+str(i),[-.9,2.85,z],[.9,2.85,z],.055,edge,abdomen,sides=4)
    for s in (-1,1):
        r.orb('red-eye'+str(s),[s*.55,3.04,1.95],[.23,.18,.1],[167,55,40],head,sides=6,bands=2)
        r.tube('head-crest'+str(s),[s*.42,3.3,1.3],[s*.6,4.1,1.0],.22,shell,head,end=.02,sides=5)
        r.tube('mouth-fang'+str(s),[s*.3,2.65,2.17],[s*.15,2.15,2.45],.12,fang,head,end=0,sides=5)
        # Four pairs of articulated walking legs, separate from the pincers.
        for j,z in enumerate([-1.6,-.7,.2,.9]):
            a=[s*.95,2.0,z];b=[s*(2.25+(j%2)*.3),2.1,z-.7+j*.15];c=[s*(3.0+(j%2)*.4),.1,z-.9+j*.3]
            node=r.node('walking-leg'+str((s,j)),a,abdomen)
            chain(r,'walking-leg'+str((s,j)),[a,b,c],[.18,.14,.025],shell,node,sides=5)
            r.orb('leg-knee'+str((s,j)),b,[.42,.42,.42],joint,node,sides=6,bands=2)
        a=[s*.9,2.6,1.05];b=[s*2.25,3.0,1.3];c=[s*3.45,3.6,2.05]
        node=r.node('pincer-arm'+str(s),a,head)
        chain(r,'pincer-arm'+str(s),[a,b,c],[.38,.44,.5],shell,node,sides=7)
        r.orb('pincer-elbow'+str(s),b,[.9,.9,.9],joint,node,sides=8,bands=3)
        r.add('pincer-palm'+str(s),'ellipsoid',[255,255,255],node,texture='reapertail-shell',center=c,size=[1.55,1.9,1.5],sides=9,bands=4,uvProjection='xy',uvTiles=2)
        # Opposed tapered blades form an actual open silhouette.
        outer=[[c[0]+s*.42,3.75,2.35],[c[0]+s*.9,2.8,2.9],[c[0]+s*.72,1.6,3.4],[c[0]+s*.24,.6,3.55]]
        inner=[[c[0]-s*.32,3.15,2.5],[c[0]-s*.58,2.4,3],[c[0]-s*.25,1.5,3.4]]
        chain(r,'outer-pincer-blade'+str(s),outer,[.4,.34,.22,.015],shell,node,sides=7)
        chain(r,'inner-pincer-blade'+str(s),inner,[.26,.2,.015],edge,node,sides=6)
        r.tube('pincer-highlight'+str(s),outer[1],outer[2],.045,edge,node,end=.025,sides=4)
    points=[[0,2.1,-1.8],[.25,3.3,-2.3],[.5,4.8,-2.5],[.65,6.2,-2],[.5,7.4,-.9],[.1,7.9,.35],[-.35,7.4,1.4],[-.55,6.3,1.9]]
    radii=[.5,.48,.43,.38,.34,.29,.25,.18]
    chain(r,'arched-tail',points,radii,shell,abdomen,sides=8)
    for i,p in enumerate(points[1:-1]):r.orb('tail-segment'+str(i),p,[radii[i+1]*2.15]*3,shell,abdomen,sides=8,bands=3)
    r.orb('venom-bulb',points[-1],[.65,.85,.65],joint,abdomen,sides=8,bands=3)
    chain(r,'curved-stinger',[[-.55,6.25,1.9],[-.65,5.6,2.1],[-.4,5.1,2.25]],[.24,.15,0],fang,abdomen,sides=6)
    return r.data

BUILDERS={32:sea_devil,61:reapertail}
