"""M4-R: independently authored Diabolic Variant, not an OG mesh conversion.
SPDX-License-Identifier: GPL-3.0-only
"""
from batch10_models import Recipe
from batch12_models import chain

def diabolic_variant():
    r=Recipe(77,'Diabolic Variant','twisted sinewy torso, horn-framed face, raised right blade-arm, large forward left crescent and asymmetrical braced legs')
    flesh=[133,64,58];deep=[73,36,40];bone=[193,188,162];ivory=[215,208,181];cyan=[151,202,195]
    hip=r.node('pelvis',[0,4.8,0]);chest=r.node('twisted-ribcage',[0,7.6,.2],hip);head=r.node('horned-head',[-.15,9.55,.45],chest)
    r.add('sinewy-abdomen','loft',[255,255,255],hip,texture='diabolic-sinew',center=[0,4.4,0],sides=9,profile=[[-.3,.85,.55],[.6,.8,.6],[1.7,1.05,.65],[2.7,1.3,.7]],uvProjection='xy',uvTiles=2)
    r.add('muscular-thorax','loft',[255,255,255],chest,texture='diabolic-sinew',center=[0,7.2,.1],sides=9,profile=[[-.6,1.1,.65],[.2,1.45,.8],[1.0,1.35,.65],[1.5,.65,.5]],uvProjection='xy',uvTiles=2)
    r.tube('throat',[-.05,8.3,.35],[-.15,9.1,.5],.36,flesh,chest,end=.4)
    r.orb('red-skull',[-.15,9.55,.45],[1.3,1.75,1.15],flesh,head,sides=9,bands=4)
    r.panel('painted-face',[-.15,9.53,1.08],[1.02,1.35],'diabolic-face',head)
    for s in (-1,1):
        chain(r,'great-head-horn'+str(s),[[s*.45,10.1,.1],[s*.95,10.7,-.1],[s*1.6,11.15,.05],[s*2.0,11.25,.5]],[.33,.28,.17,.01],bone,head,sides=7)
        r.tube('small-brow-horn'+str(s),[s*.4-.15,10.03,.9],[s*1.0-.15,10.5,1.1],.16,ivory,head,end=.01,sides=5)
        r.poly('bone-cheek'+str(s),[s*.53-.15,9.3,.9],[[-.2,-.6],[.2,-.45],[.35,.35],[-.13,.6]],bone,head,depth=.16)
        for j in range(4):
            y=6.2+j*.48
            chain(r,'exposed-rib'+str((s,j)),[[s*.05,y,.86],[s*.75,y+.1,.9],[s*1.2,y+.42,.6]],[.07,.12,.04],bone,chest,sides=5)
        # Separate skeletal growths at the back, not extra humanoid arms.
        r.add('back-bone-fin'+str(s),'fan',bone,chest,root=[s*.8,7.9,-.55],edge=[[s*2.3,8.7,-.8],[s*2.7,9.6,-1],[s*1.45,9.3,-.7]])
        for j in range(3):
            chain(r,'back-tendril'+str((s,j)),[[s*1,7.8-j*.45,-.7],[s*1.6,7.65-j*.5,-1.0],[s*(2.5+j*.18),7.8-j*.45,-.7]],[.12,.09,.015],cyan,chest,sides=5)
    # Main arms share continuous muscle endpoints and carry distinct bone blades.
    arm_data=[('forward-left',[-1.2,8.0,.3],[-2.3,7.1,1.3],[-3,6.5,2.5]),('raised-right',[1.2,8.25,.0],[2.5,10.2,-.35],[2.35,12.0,.1])]
    for name,a,b,c in arm_data:
        upper,elbow,wrist=r.limb(name,a,b,c,chest,flesh,.43,False,flesh)
        r.orb(name+'-muscular-shoulder',a,[1.35,1.3,1.25],flesh,upper,sides=8,bands=4)
        r.orb(name+'-hand',c,[.8,1,.7],deep,wrist,sides=7,bands=3)
        r.tube(name+'-forearm-bone',b,c,.16,bone,elbow,end=.1,sides=5)
    left='forward-left-wrist';right='raised-right-wrist'
    crescent=[[-2.5,8.0,2.8],[-3.5,8.2,3],[-4.4,7.6,3.2],[-4.7,6.4,3.4],[-4.3,5.3,3.6],[-3.25,4.9,3.5],[-2.35,5.35,3.3],[-1.9,6.3,3]]
    chain(r,'great-left-crescent',crescent,[.06,.45,.62,.65,.58,.45,.26,.01],bone,left,sides=8)
    r.tube('crescent-inner-connection',[-3,6.5,2.5],[-4.45,6.4,3.25],.24,bone,left,end=.36,sides=6)
    r.tube('crescent-upper-point',[-4.15,7.8,3.2],[-5.15,8.5,3.2],.23,ivory,left,end=.01,sides=5)
    r.tube('crescent-lower-point',[-4.1,5.2,3.6],[-5.0,4.8,3.6],.21,ivory,left,end=.01,sides=5)
    r.add('raised-bone-blade','poly',bone,right,center=[2.4,12,.15],outline=[[-.4,-.2],[.4,-.3],[1.6,.6],[1.8,1.9],[.7,2.5],[-.25,1.3]],depth=.34)
    r.add('raised-cyan-blade-inset','poly',cyan,right,center=[2.4,12,.35],outline=[[.15,.35],[.8,.5],[1.42,1.2],[1.25,1.8],[.55,1.9]],depth=.04)
    for j in range(3):
        p=[2.4+j*.25,11.1-j*.1,.45]
        chain(r,'right-arm-tentacle'+str(j),[p,[3+j*.2,10.3,.7],[3.3+j*.22,9.4,.6],[3.8+j*.2,9.1,.15]],[.13,.12,.09,.015],deep,right,sides=5)
    for s in (-1,1):
        a=[s*.6,4.8,0];b=[s*1.1,2.5,.5 if s==-1 else -.6];c=[s*1.45,.45,1.3 if s==-1 else -.5]
        thigh,knee,ankle=r.limb('leg'+str(s),a,b,c,hip,flesh,.48,False,deep)
        r.orb('organic-kneecap'+str(s),b,[1.0,1.15,.85],bone,knee,sides=7,bands=3)
        r.orb('foot'+str(s),[c[0],.35,c[2]+.3],[.95,.6,1.2],flesh,ankle,sides=7,bands=3)
        for j in range(3):r.tube('toe-claw'+str((s,j)),[c[0]+(j-1)*.28,.35,c[2]+.55],[c[0]+(j-1)*.33,.1,c[2]+1.1],.14,bone,ankle,end=.01,sides=5)
        r.poly('hip-bone-growth'+str(s),[s*.95,4.0,.3],[[-.45,.75],[.45,.7],[.72,-.65],[.2,-1.3],[-.1,-.15]],bone,hip,depth=.2)
    return r.data

BUILDERS={77:diabolic_variant}
