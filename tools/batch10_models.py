"""Seven fan-original PS1 interpretations. No OG asset reader is imported.
Every part is authored here as a geometric recipe, not a recolored source mesh.
SPDX-License-Identifier: GPL-3.0-only
"""
import json,math

STEEL=[151,157,156];DARK=[43,49,55];BLACK=[23,28,33];SILVER=[192,195,184]
RED=[156,43,37];GOLD=[171,135,62];SKIN=[185,143,112];NAVY=[40,47,67]


class Recipe:
    def __init__(self,cid,name,pose):
        self.data=dict(schema='qb-fan-original-recipe',version=1,cardId=cid,name=name,
            provenance='fan-original-not-ff7-original-asset',poseDescription=pose,
            coordinateSystem='+Y up, +Z forward; authored world positions converted to named-node local geometry',nodes=[],parts=[])
        self.node('root',[0,0,0],None)
    def node(self,name,origin,parent='root'):
        self.data['nodes'].append(dict(name=name,parent=parent,origin=list(origin)));return name
    def add(self,name,shape,color,node='root',texture=None,**params):
        p=dict(name=name,node=node,shape=shape,color=color,params=params)
        if texture:p['texture']=texture
        self.data['parts'].append(p)
    def box(self,name,c,size,color,node='root'):self.add(name,'box',color,node,center=c,size=size)
    def orb(self,name,c,size,color,node='root',sides=8,bands=3):self.add(name,'ellipsoid',color,node,center=c,size=size,sides=sides,bands=bands)
    def tube(self,name,a,b,r,color,node='root',end=None,sides=6):self.add(name,'tube',color,node,a=a,b=b,r0=r,r1=r if end is None else end,sides=sides)
    def panel(self,name,c,size,texture,node='root'):self.add(name,'panel',[255,255,255],node,texture=texture,center=c,size=size)
    def poly(self,name,c,outline,color,node='root',depth=.1):self.add(name,'poly',color,node,center=c,outline=outline,depth=depth)
    def limb(self,name,a,b,c,parent='root',color=STEEL,r=.35,hand=True,fore=None):
        upper=self.node(name+'-shoulder',a,parent);elbow=self.node(name+'-elbow',b,upper);wrist=self.node(name+'-wrist',c,elbow)
        self.tube(name+'-upper',a,b,r,color,upper,end=r*.82)
        self.orb(name+'-elbow-cap',b,[r*1.8]*3,DARK,elbow,sides=6,bands=2)
        self.tube(name+'-forearm',b,c,r*.9,fore or color,elbow,end=r*.72)
        if hand:self.orb(name+'-hand',c,[r*1.65,r*1.8,r*1.65],DARK,wrist,sides=6,bands=2)
        return upper,elbow,wrist
    def face(self,name,c,size,kind,node):self.panel(name,c,size,kind,node)


def gilgamesh():
    r=Recipe(106,'Gilgamesh','wide asymmetric braced stance; six arms; two hands across the foreground katana')
    hip=r.node('hips',[0,4.7,0]);chest=r.node('chest',[0,6.9,0],hip);head=r.node('masked-head',[0,8.65,.45],chest)
    r.add('lamellar-torso','loft',DARK,chest,center=[0,6.6,0],sides=8,profile=[[-1.4,1.0,.6],[-.4,1.4,.8],[.9,1.5,.7],[1.4,.8,.5]])
    for j in range(4):r.box(f'silver-lamellar-{j}',[0,6.0+j*.37,.79],[2.15,.16,.12],STEEL,chest)
    r.tube('neck',[0,7.75,.2],[0,8.2,.4],.42,STEEL,chest)
    r.orb('mask-skull',[0,8.65,.45],[1.12,1.45,1.1],STEEL,head,sides=8,bands=3)
    r.face('painted-war-mask',[0,8.58,1.02],[.87,1.1],'gilgamesh-mask',head)
    r.add('red-kabuto','loft',RED,head,center=[0,9.05,.25],sides=8,profile=[[0,.72,.65],[.4,.72,.64],[.6,.46,.43]])
    for s in (-1,1):
        r.tube(f'helmet-gold-horn-{s}',[s*.5,9.3,.35],[s*1.2,10.2,.9],.16,GOLD,head,end=0,sides=5)
        r.orb(f'helmet-ear-guard-{s}',[s*.64,8.55,.32],[.35,.9,.5],RED,head,sides=6,bands=2)
    for i in range(4):r.tube(f'white-crest-{i}',[.22+i*.13,9.5,-.05],[1.1+i*.25,10.4-i*.12,-.4],.24,[204,204,187],head,end=.03,sides=5)
    legs=[('left',[-.75,4.6,0],[-1.6,2.8,.1],[-1.8,.65,.9]),('right',[.75,4.6,0],[1.7,2.5,1.3],[1.1,.6,2.0])]
    for name,a,b,c in legs:
        _,knee,ankle=r.limb(name+'-leg',a,b,c,hip,NAVY,.52,False,RED)
        r.orb(name+'-greave',[(b[i]+c[i])/2 for i in range(3)],[1.15,1.45,1.1],RED,knee,sides=6,bands=2)
        r.box(name+'-sandal',[c[0],.38,c[2]+.25],[1.1,.5,1.45],BLACK,ankle)
        r.poly(name+'-coat-tail',[a[0]*1.4,4.25,.55],[(-.75,.5),(.75,.5),(.85,-1.9),(-.7,-1.5)],RED,hip,.16)
        r.panel(name+'-gold-coat-weave',[a[0]*1.4,3.6,.66],[.95,1.4],'cloth',hip)
    arms=[('front-left',[-1.3,7.15,.2],[-1.8,6.05,1.75],[1.1,5.75,3.4]),('front-right',[1.3,7.15,.2],[2.65,6.3,1.7],[2.0,5.45,3.4]),
        ('high-left',[-1.25,7.6,-.45],[-2.8,7.65,-.3],[-3.65,8.55,.55]),('high-right',[1.25,7.6,-.45],[2.8,8.2,-.25],[3.6,8.6,.5]),
        ('low-left',[-1.2,6.2,-.55],[-2.8,5.35,-.15],[-3.2,4.65,.75]),('low-right',[1.2,6.2,-.55],[2.8,5.4,-.55],[3.25,4.7,.2])]
    for name,a,b,c in arms:
        shoulder,elbow,wrist=r.limb(name,a,b,c,chest,STEEL,.37,True,STEEL)
        r.orb(name+'-red-pauldron',a,[1.25,1.0,1.2],RED,shoulder,sides=6,bands=3)
        r.tube(name+'-gold-bracer',b,[(b[i]+c[i])/2 for i in range(3)],.42,GOLD,elbow,end=.4,sides=6)
    kat='front-right-wrist'
    r.tube('katana-grip',[.8,5.85,3.4],[2.5,5.25,3.4],.14,BLACK,kat,sides=6)
    r.poly('katana-blade',[-1.65,6.65,3.4],[(-3.05,1.05),(-2.7,1.25),(2.5,-.65),(2.45,-.88)],SILVER,kat,.11)
    r.tube('katana-guard',[.55,5.5,3.4],[.95,6.3,3.4],.15,GOLD,kat,sides=6)
    r.tube('axe-shaft',[-3.7,7.3,.55],[-4.25,10.3,.55],.13,[93,66,47],'high-left-wrist')
    r.poly('axe-blade',[-4.15,9.6,.55],[(-.8,.7),(.45,.3),(.35,-.55),(-.7,-.8),(-1.15,0)],STEEL,'high-left-wrist',.16)
    r.tube('hammer-shaft',[3.6,7.3,.5],[3.8,10.15,.5],.15,[95,69,47],'high-right-wrist')
    r.box('hammer-head',[3.8,10.25,.5],[1.7,.85,1.0],DARK,'high-right-wrist')
    r.poly('low-short-sword',[-4,5.05,.8],[(-1,.25),(-.8,.45),(.9,-.2),(.8,-.4)],STEEL,'low-left-wrist',.12)
    r.tube('rear-lance-shaft',[3.25,4.7,.2],[4.6,6.65,-.15],.11,[98,69,45],'low-right-wrist')
    r.tube('rear-lance-tip',[4.6,6.65,-.15],[4.95,7.2,-.25],.24,STEEL,'low-right-wrist',end=0,sides=4)
    return r.data


def guardian():
    r=Recipe(112,'Materia Guardian','horned head thrust forward, four asymmetrical forelimbs braced around a heavy furred body')
    hip=r.node('haunches',[0,3.5,-.7]);chest=r.node('shoulder-mass',[0,6.1,-.25],hip);head=r.node('horned-skull',[0,7.35,1.6],chest)
    fur=[91,77,51];teal=[50,115,119];edge=[83,145,145];bone=[165,163,120]
    r.orb('heavy-furred-trunk',[0,4.9,-.65],[4.5,5.1,3.4],fur,chest,sides=8,bands=4)
    r.add('teal-throat','loft',teal,chest,center=[0,5.65,1.0],sides=8,profile=[[-1.65,.8,.4],[-.4,1.45,.6],[1.3,1.2,.5]])
    for i in range(5):r.poly(f'throat-chevron-{i}',[0,4.5+i*.45,1.62],[(-1+i*.07,.18),(0,-.2),(1-i*.07,.18),(0,.02)],edge,chest,.08)
    r.orb('long-teal-cranium',[0,7.45,1.55],[2.25,2.3,2.55],teal,head,sides=8,bands=4)
    r.orb('projecting-snout',[0,6.9,2.45],[1.8,1.2,1.6],edge,head,sides=6,bands=3)
    r.orb('lower-jaw',[0,6.1,2.45],[1.55,.55,1.4],teal,head,sides=6,bands=2)
    r.box('open-mouth',[0,6.43,3.03],[1.32,.43,.18],[52,33,51],head)
    for s in (-1,1):
        r.poly(f'orange-eye-{s}',[s*.76,7.62,2.52],[(-.22,0),(0,.13),(.22,0),(0,-.12)],[206,132,47],head,.05)
        r.tube(f'brow-ridge-{s}',[s*.2,7.88,2.52],[s*1.05,7.8,2.25],.18,edge,head,end=.11)
        for j in range(3):r.tube(f'tooth-{s}-{j}',[s*(.28+j*.22),6.67,3.1],[s*(.28+j*.22),6.32,3.12],.09,bone,head,end=0,sides=4)
    r.add('curved-pink-tongue','fan',[151,82,120],head,root=[0,6.4,3.1],edge=[[-.18,6.3,3.8],[-.14,5.75,4.1],[.1,5.55,3.9],[.2,6.2,3.65]])
    path=[[0,8.15,1.5],[0,9.05,1.9],[.18,10.15,2.1],[.38,11.25,2.25]]
    for i in range(3):r.tube(f'curved-forehead-horn-{i}',path[i],path[i+1],.34-i*.09,edge,head,end=.25-i*.11,sides=6)
    for s in (-1,1):
        r.tube(f'swept-brow-horn-{s}',[s*.65,8.0,1.4],[s*2.15,8.4,.9],.22,teal,head,end=0,sides=5)
        leg=f'hind-{s}';_,knee,foot=r.limb(leg,[s*1.35,3.45,-.7],[s*1.8,1.65,-.4],[s*2.0,.5,1.25],hip,fur,.65,False,teal)
        for k in range(3):r.tube(f'{leg}-claw-{k}',[s*2+(k-1)*.25,.5,1.2],[s*2+(k-1)*.3,.2,2.1],.16,bone,foot,end=0,sides=4)
        a=[s*1.65,6.7,.0];b=[s*3.3,5.5,1.4];c=[s*4.15,4.65,2.4]
        upper,elbow,wrist=r.limb(f'wing-arm-{s}',a,b,c,chest,teal,.7,False,teal)
        r.add(f'teal-wing-membrane-{s}','fan',teal,upper,root=a,edge=[[s*3.15,8.1,.5],[s*4.8,7.45,1.5],c,[s*2.8,4.2,1.2]])
        for k in range(3):
            tip=[s*(3.2+k*.7),7.8-k*.9,.8+k*.7];r.tube(f'wing-ray-{s}-{k}',a,tip,.16,edge,upper,end=.08)
            r.tube(f'foreclaw-{s}-{k}',[c[0]+(k-1)*.2,c[1],c[2]],[c[0]+(k-1)*.25,c[1]-.45,c[2]+.65],.13,bone,wrist,end=0,sides=4)
        r.limb(f'lower-arm-{s}',[s*1.7,4.8,.8],[s*2.4,3.6,1.4],[s*3.3,3.1,2.3],chest,fur,.47,True,teal)
        for k in range(4):r.tube(f'coarse-fur-tuft-{s}-{k}',[s*(1.2+.3*k),6.7-k*.35,-.5],[s*(2.05+.35*k),7.65-k*.45,-.8],.38,fur,chest,end=0,sides=4)
    r.tube('rear-tail',[0,3,-1.6],[0,1.6,-4.4],.6,fur,hip,end=.13,sides=6)
    return r.data


def grasptropod():
    r=Recipe(116,'Grasptropod','tracked machine advances with open graspers and bent auxiliary arms')
    base=r.node('tracked-chassis',[0,1.1,0]);body=r.node('armored-cab',[0,4.4,0],base)
    r.box('chassis-frame',[0,1.6,0],[3.5,1.1,3.5],DARK,base)
    r.tube('cab-support-column',[0,1.9,0],[0,3.15,0],1.0,STEEL,base,sides=8)
    r.tube('cab-support-collar',[0,2.25,0],[0,2.48,0],1.15,DARK,base,sides=8)
    for s in (-1,1):
        track=r.node(f'track-{s}',[s*1.6,1,0],base)
        r.add(f'track-belt-{s}','loft',BLACK,track,center=[s*1.6,.95,0],sides=8,profile=[[-.75,.75,1.85],[.75,.75,1.85]])
        for k in range(7):r.box(f'tread-{s}-{k}',[s*1.6,.3,-1.55+k*.5],[1.3,.24,.3],STEEL,track)
        for z in (-1.1,0,1.1):r.tube(f'track-hub-{s}-{z}',[s*1.6-.78,1,z],[s*1.6+.78,1,z],.45,STEEL,track,sides=8)
    r.add('tall-clamshell-cab','loft',DARK,body,center=[0,4.8,-.25],sides=8,profile=[[-2.25,1.5,1.2],[-.8,2.1,1.3],[2.4,1.8,1.15],[2.8,1.45,.95]])
    for x in (-1.2,0,1.2):
        r.box(f'vertical-cab-armor-{x}',[x,5.3,1.02],[.85,3.75,.3],STEEL,body)
        for j in range(4):r.box(f'red-cab-band-{x}-{j}',[x,4.0+j*.9,1.21],[.68,.1,.06],[122,49,47],body)
    r.poly('red-central-nose',[0,3.4,1.5],[(-.5,1),(.5,1),(.25,-.6),(0,-1),(-.25,-.6)],RED,body,.5)
    r.orb('optics',[0,3.4,1.95],[.75,.55,.55],DARK,body,sides=6,bands=2)
    for x in (-.2,.2):r.orb(f'optic-{x}',[x,3.45,2.22],[.15,.15,.1],[80,166,155],body,sides=4,bands=2)
    for s in (-1,1):
        _,elbow,wrist=r.limb(f'grabber-arm-{s}',[s*1.6,3.8,1.0],[s*3.2,2.9,1.9],[s*2.2,2.65,3.8],body,STEEL,.36,False,DARK)
        r.orb(f'grabber-palm-{s}',[s*2.2,2.65,3.8],[.9,.8,.9],STEEL,wrist,sides=6,bands=2)
        for k in range(3):
            a=[s*2.2+(k-1)*.4,2.65,4];b=[s*2.2+(k-1)*.65,2.8,4.9];c=[s*2.2+(k-1)*.3,2.3,5.2]
            r.tube(f'grasp-finger-{s}-{k}',a,b,.15,STEEL,wrist,end=.11);r.tube(f'grasp-tip-{s}-{k}',b,c,.11,STEEL,wrist,end=0,sides=4)
        for j in range(2):
            a=[s*1.7,5.9-j*1.3,-.1];b=[s*(3.0+j*.4),6.2-j*.7,.5];c=[s*(3.4+j*.5),7.2-j*.7,1.4]
            upper,elbow,wrist=r.limb(f'utility-{s}-{j}',a,b,c,body,STEEL,.18,False,DARK)
            r.tube(f'utility-prong-{s}-{j}',c,[c[0]+s*.5,c[1]+.1,c[2]+.55],.12,STEEL,wrist,end=.03,sides=4)
    return r.data


def valkyrie():
    r=Recipe(117,'Custom Valkyrie','hovering gunship, twin cannons pushed forward beneath a broad rotor')
    body=r.node('fuselage',[0,4.6,0]);head=r.node('sensor-head',[0,7.2,.2],body);rotor=r.node('main-rotor',[0,9.05,0],body)
    ochre=[133,111,61];rust=[119,75,46]
    r.add('barrel-fuselage','loft',ochre,body,center=[0,4.5,0],sides=10,profile=[[-2.6,.85,.75],[-1.9,1.35,1.1],[-.7,.85,.8],[1.5,1.25,1],[2.3,1,.85]])
    r.panel('lower-vent',[0,2.55,.97],[1.1,.65],'vent',body)
    for j in range(8):
        angle=j*math.tau/8;x=math.cos(angle);z=math.sin(angle)
        r.tube(f'fuselage-rib-{j}',[x*1.07,4.4,z*.97],[x*1.2,6.1,z*1.06],.08,STEEL,body,sides=4)
    r.panel('upper-intake',[0,6.3,1.05],[1.0,.5],'vent',body)
    r.orb('head-shroud',[0,7.3,.15],[2.25,1.85,1.85],STEEL,head,sides=8,bands=3)
    r.face('four-red-sensor-mask',[0,7.25,1.05],[1.35,1.35],'valkyrie-face',head)
    r.tube('rotor-mast',[0,7.85,0],[0,9.05,0],.23,DARK,rotor,sides=8)
    r.orb('rotor-hub',[0,9.05,0],[1.3,.4,1.3],STEEL,rotor,sides=8,bands=2)
    for k in range(4):
        angle=.35+k*math.pi/2;end=[math.cos(angle)*5.5,9.12,math.sin(angle)*5.5];r.tube(f'rotor-spar-{k}',[0,9.05,0],end,.08,STEEL,rotor,sides=4)
        side=[-.35*math.sin(angle),0,.35*math.cos(angle)]
        r.add(f'rotor-blade-{k}','fan',DARK,rotor,root=[math.cos(angle)*.6,9.05,math.sin(angle)*.6],edge=[[end[i]+side[i] for i in range(3)],[end[i]-side[i] for i in range(3)],[math.cos(angle)*1.2,9.05,math.sin(angle)*1.2]])
    for s in (-1,1):
        arm=r.node(f'gun-pylon-{s}',[s*1.3,6,0],body)
        r.tube(f'gun-pylon-link-{s}',[s*1.1,5.9,0],[s*2.25,5.3,.4],.36,DARK,arm)
        r.orb(f'gun-armor-{s}',[s*2.35,5.2,.85],[1.65,2.1,2.0],ochre,arm,sides=6,bands=3)
        r.tube(f'long-cannon-{s}',[s*2.35,4.9,.85],[s*2.55,4.05,3.85],.51,DARK,arm,sides=8)
        r.tube(f'cannon-muzzle-ring-{s}',[s*2.54,4.08,3.74],[s*2.57,4.0,4.0],.59,STEEL,arm,sides=8)
        r.tube(f'black-cannon-bore-{s}',[s*2.57,4.0,4.01],[s*2.58,3.99,4.04],.42,BLACK,arm,sides=8)
        r.tube(f'upper-exhaust-{s}',[s*.95,7.3,-.5],[s*1.75,8.25,-.8],.42,rust,body,sides=6)
        r.panel(f'hazard-side-{s}',[s*2.3,5.7,1.9],[.9,.65],'hazard',arm)
    return r.data


def anuran():
    r=Recipe(120,'Anuran Suppressor','yellow frog-shaped machine in a crouched reach, both open manipulators directed forward')
    body=r.node('frog-pod',[0,4.2,0]);head=r.node('twin-eye-cowling',[0,5.6,.7],body);yellow=[190,145,33]
    r.orb('round-yellow-shell',[0,4.7,0],[4.7,4.5,3.7],yellow,body,sides=8,bands=4)
    r.box('belly-block',[0,3.25,.8],[2.6,1.4,1.6],DARK,body)
    for s in (-1,1):
        r.orb(f'eye-pod-{s}',[s*1.25,5.95,1.35],[1.55,1.55,1.3],yellow,head,sides=8,bands=3)
        r.tube(f'eye-metal-ring-{s}',[s*1.25,5.95,1.75],[s*1.25,5.95,2.12],.58,STEEL,head,sides=8)
        r.tube(f'eye-black-lens-{s}',[s*1.25,5.95,2.14],[s*1.25,5.95,2.17],.43,BLACK,head,sides=8)
        r.orb(f'eye-inner-optic-{s}',[s*1.25,5.95,2.2],[.27,.27,.12],[113,92,46],head,sides=6,bands=2)
        r.tube(f'dorsal-gun-{s}',[s*.65,6.25,-.75],[s*.75,9.7,-1.5],.18,DARK,body,sides=6)
        r.tube(f'dorsal-gun-tip-{s}',[s*.75,9.5,-1.45],[s*.76,9.85,-1.55],.25,STEEL,body,sides=6)
        c=[s*3.0,2.6,4.2] if s<0 else [s*3.8,4.7,3.55]
        _,elbow,wrist=r.limb(f'yellow-arm-{s}',[s*2.0,4.7,.6],[s*3.15,3.2 if s<0 else 4.1,1.9],c,body,yellow,.39,False,yellow)
        r.orb(f'open-tool-palm-{s}',c,[1.1,.85,.9],DARK,wrist,sides=6,bands=2)
        for k in range(3):
            a=[c[0]+(k-1)*.4,c[1],c[2]+.2];b=[c[0]+(k-1)*.6,c[1]+(k%2)*.55,c[2]+1.15];end=[c[0]+(k-1)*.4,c[1]-.15,c[2]+1.55]
            r.tube(f'claw-link-{s}-{k}',a,b,.18,yellow,wrist,end=.15);r.tube(f'claw-tip-{s}-{k}',b,end,.15,DARK,wrist,end=.03,sides=4)
        _,knee,foot=r.limb(f'frog-leg-{s}',[s*1.45,3.25,-.3],[s*2.85,1.5,-.8],[s*1.7,.5,1.6],body,yellow,.55,False,DARK)
        r.box(f'industrial-foot-{s}',[s*1.7,.35,1.95],[1.35,.55,1.5],yellow,foot)
        r.panel(f'arm-hazard-{s}',[s*2.6,4.2,1.8],[.6,.8],'hazard',elbow)
    r.tube('mouth-cannon',[0,4.65,1.45],[0,4.4,2.65],.56,STEEL,head,sides=8)
    r.tube('mouth-dark-bore',[0,4.4,2.66],[0,4.39,2.7],.38,BLACK,head,sides=8)
    r.orb('top-hatch',[-.45,6.65,-.25],[1.7,.35,1.4],yellow,body,sides=8,bands=2)
    r.panel('belly-vent',[0,3.55,1.67],[1.6,.75],'vent',body)
    return r.data


def crimson():
    r=Recipe(122,'Crimson Mare Mk. II','red piloted assault mech lunging forward, shoulder blades raised behind the cockpit')
    hip=r.node('mech-hips',[0,3.6,0]);chest=r.node('crimson-torso',[0,6.3,.5],hip);cockpit=r.node('open-cockpit',[0,7.4,1],chest)
    r.orb('red-hip',[0,3.8,0],[2.8,2,2.2],RED,hip,sides=8,bands=3)
    r.add('red-chest-shell','loft',RED,chest,center=[0,5.9,.35],sides=8,profile=[[-1.6,.9,.7],[-.6,1.8,1],[1.3,1.6,.8],[1.8,1,.7]])
    r.poly('silver-prow',[0,5.55,1.65],[(-1.1,1),(.9,1.1),(.7,-.7),(0,-1.3),(-.8,-.6)],STEEL,chest,.45)
    for s in (-1,1):
        for k in range(3):r.box(f'blue-chest-slit-{s}-{k}',[s*(.22+k*.19),5.35-k*.13,1.92],[.12,.65,.06],[65,125,170],chest)
        r.tube(f'cockpit-silver-brace-{s}',[s*.65,6.6,1.9],[s*1.1,8.4,1.3],.16,STEEL,cockpit)
        r.tube(f'cockpit-horn-{s}',[s*1.1,8.3,1.3],[s*1.3,9.75,1.0],.25,SILVER,cockpit,end=0,sides=5)
        shoulder=r.node(f'heavy-shoulder-{s}',[s*2.1,7,.1],chest)
        r.orb(f'crimson-pauldron-{s}',[s*2.35,7.1,.2],[2.3,1.9,2.2],RED,shoulder,sides=6,bands=3)
        for j in range(3):r.orb(f'shoulder-rivet-{s}-{j}',[s*(1.85+j*.45),7.35,1.1],[.13,.13,.1],STEEL,shoulder,sides=4,bands=2)
        _,elbow,wrist=r.limb(f'attack-arm-{s}',[s*2.3,6.7,.5],[s*3.25,5.4,1.6],[s*3.6,4.5,3.0],shoulder,DARK,.55,False,RED)
        r.box(f'arm-gun-cowling-{s}',[s*3.6,4.75,3.0],[1.4,1.5,2.1],RED,wrist)
        r.tube(f'arm-hydraulic-{s}',[s*3.1,5.6,1.8],[s*3.3,4.9,3.2],.13,STEEL,elbow,sides=6)
        r.tube(f'arm-gun-{s}',[s*3.6,4.8,3.35],[s*3.6,4.65,4.45],.47,DARK,wrist,sides=8)
        r.tube(f'arm-bore-{s}',[s*3.6,4.64,4.46],[s*3.6,4.63,4.5],.31,BLACK,wrist,sides=8)
        r.poly(f'raised-red-rear-blade-{s}',[s*2.0,8.1,-1.1],[(-.55,-1),(.55,-1),(.8,2.2),(.15,3),(-.45,2.7)],RED,chest,.45)
        r.box(f'rear-blade-rail-{s}',[s*2.0,8.7,-1.39],[.22,3.7,.16],DARK,chest)
    for name,a,b,c in [('left',[-.8,3.5,0],[-1.2,2.0,1.3],[-1.2,.6,1.8]),('right',[.8,3.5,0],[1.5,2.45,-.8],[2,.8,-1.5])]:
        _,knee,foot=r.limb(name+'-mech-leg',a,b,c,hip,RED,.6,False,DARK);r.orb(name+'-knee-armor',b,[1.5,1.4,1.4],RED,knee,sides=6,bands=2);r.box(name+'-heel',c,[1.2,.6,1.5],DARK,foot)
    pilot=r.node('fan-original-pilot',[0,7.5,1.5],cockpit)
    r.orb('pilot-red-bust',[0,7.15,1.6],[.8,.9,.6],RED,pilot,sides=6,bands=2)
    r.orb('pilot-head',[0,7.8,1.58],[.65,.9,.65],SKIN,pilot,sides=6,bands=3)
    r.face('pilot-face',[0,7.78,1.93],[.48,.65],'scarlet-face',pilot)
    r.orb('pilot-blonde-hair',[0,8.05,1.43],[.8,.7,.8],[178,143,66],pilot,sides=6,bands=2)
    for s in (-1,1):r.tube(f'pilot-hair-lock-{s}',[s*.29,7.9,1.55],[s*.5,7.05,1.55],.16,[178,143,66],pilot,end=.12,sides=5)
    return r.data


def roche():
    r=Recipe(133,'Roche','leaning into a red motorcycle, left hand steering, right hand carrying a sword behind the shoulder')
    bike=r.node('motorcycle-chassis',[0,2.4,0]);front=r.node('front-wheel',[0,1.5,3.1],bike);rear=r.node('rear-wheel',[0,1.35,-2.6],bike)
    for name,node,c,rad in [('front',front,[0,1.5,3.1],1.3),('rear',rear,[0,1.35,-2.6],1.15)]:
        r.add(name+'-tire','wheel',BLACK,node,center=c,radius=rad,width=.42,tread=.25,sides=12)
        r.tube(name+'-axle',[c[0]-.5,c[1],c[2]],[c[0]+.5,c[1],c[2]],.3,STEEL,node,sides=8)
        for j in range(6):
            angle=j*math.tau/6;r.tube(name+f'-spoke-{j}',[.45,c[1],c[2]],[.45,c[1]+rad*.8*math.cos(angle),c[2]+rad*.8*math.sin(angle)],.07,STEEL,node,sides=4)
    r.box('engine-block',[0,2.6,-.3],[1.55,1.45,2.1],DARK,bike)
    for s in (-1,1):
        r.tube(f'fork-{s}',[s*.42,4.8,2.25],[s*.42,1.5,3.1],.16,STEEL,front)
        r.tube(f'frame-tube-{s}',[s*.6,2.5,-2.1],[s*.6,4.3,.4],.14,STEEL,bike)
        r.tube(f'exhaust-{s}',[s*.85,2.2,-.4],[s*.85,2.1,-3.5],.22,STEEL,bike,sides=6)
        for k in range(4):r.box(f'engine-fin-{s}-{k}',[s*.82,2.25+k*.24,-.3],[.12,.1,1.7],STEEL,bike)
    r.orb('red-front-fairing',[0,4.9,2.45],[2.3,2.5,2.35],RED,bike,sides=8,bands=4)
    r.orb('red-fuel-tank',[0,4.55,.15],[1.6,1.4,2.3],RED,bike,sides=8,bands=3)
    r.box('black-seat',[0,4.0,-1.4],[1.25,.35,2.0],BLACK,bike)
    r.orb('red-rear-cowl',[0,4.0,-2.7],[1.6,.9,1.7],RED,bike,sides=6,bands=3)
    for y in (4.6,5.05):
        r.orb(f'headlight-{y}',[0,y,3.64],[.32,.32,.16],[91,190,207],bike,sides=8,bands=2)
    r.panel('front-grille',[0,3.9,3.55],[1.25,.5],'vent',bike)
    r.tube('handlebar',[-1,5.4,1.65],[1,5.4,1.65],.12,DARK,bike)
    hip=r.node('rider-hips',[0,5.0,-.55],bike);chest=r.node('rider-chest',[0,6.65,.3],hip);head=r.node('roche-head',[0,8.0,.85],chest)
    r.add('navy-rider-torso','loft',NAVY,chest,center=[0,6.2,.1],sides=8,profile=[[-1.0,.7,.45],[-.3,.95,.55],[.9,1.0,.55],[1.3,.55,.35]])
    r.box('wide-belt',[0,5.25,.15],[1.5,.34,.85],[93,82,62],hip)
    r.box('belt-buckle',[0,5.25,.63],[.35,.27,.08],STEEL,hip)
    r.tube('neck',[0,7.2,.55],[0,7.65,.82],.3,SKIN,chest)
    r.orb('roche-skull',[0,8.0,.85],[.92,1.3,1.0],SKIN,head,sides=8,bands=3)
    r.face('roche-authored-face',[0,7.98,1.37],[.7,.92],'roche-face',head)
    r.orb('blonde-undercut',[0,8.45,.65],[1.05,.65,1.0],[166,135,74],head,sides=8,bands=2)
    for j in range(5):r.tube(f'swept-blonde-quiff-{j}',[-.4+j*.2,8.55,.83],[-.3+j*.19,9.1-j*.04,.15-j*.09],.21,[194,161,85],head,end=.03,sides=5)
    for name,a,b,c in [('left',[-.9,6.85,.3],[-1.2,6.0,1.3],[-.95,5.4,1.65]),('right',[.9,6.9,.35],[1.8,6.8,-.25],[2.0,7.3,-1.35])]:
        shoulder,elbow,wrist=r.limb(name+'-rider-arm',a,b,c,chest,NAVY,.27,True,NAVY)
        r.orb(name+'-silver-pauldron',a,[1.0,.9,1],STEEL,shoulder,sides=6,bands=3)
        r.tube(name+'-wrist-bracer',[(b[i]+c[i])/2 for i in range(3)],c,.3,DARK,elbow,sides=6)
    for name,a,b,c in [('left',[-.6,5,-.55],[-1.0,3.8,.7],[-.95,2.5,.15]),('right',[.6,5,-.55],[1.0,3.8,.65],[1.0,2.5,-.05])]:
        _,knee,foot=r.limb(name+'-rider-leg',a,b,c,hip,NAVY,.42,False,BLACK);r.box(name+'-boot',[c[0],2.3,c[2]+.3],[.62,.6,1.0],BLACK,foot)
    r.tube('sword-hilt',[2.0,7.3,-1.35],[2.5,7.55,-1.9],.12,DARK,'right-rider-arm-wrist')
    r.tube('sword-crossguard',[2.2,7.5,-1.75],[2.8,7.8,-1.7],.1,STEEL,'right-rider-arm-wrist')
    r.tube('long-roche-sword',[2.45,7.6,-1.85],[4.8,8.75,-4.0],.17,SILVER,'right-rider-arm-wrist',end=.02,sides=4)
    # Authored forward lean; save the resulting primitive/node coordinates.
    # No source actor or source pose is deformed or retargeted.
    actor={'rider-hips'}
    for node in r.data['nodes']:
        if node['parent'] in actor:actor.add(node['name'])
    def lean(v):return [v[0],v[1],v[2]+.35*max(0,v[1]-5)]
    for node in r.data['nodes']:
        if node['name'] in actor:node['origin']=lean(node['origin'])
    for part in r.data['parts']:
        if part['node'] not in actor:continue
        p=part['params']
        for key in ('center','a','b','root'):
            if key in p:p[key]=lean(p[key])
        if 'edge' in p:p['edge']=[lean(v) for v in p['edge']]
        if part['shape']=='loft':p['lean']=.35
    return r.data


BUILDERS={106:gilgamesh,112:guardian,116:grasptropod,117:valkyrie,120:anuran,122:crimson,133:roche}


def make_recipe(card_id):
    # Canonical JSON containers are also the exchange/reproduction format.
    return json.loads(json.dumps(BUILDERS[card_id]()))
