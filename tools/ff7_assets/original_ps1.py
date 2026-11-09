"""Small authored-mesh vocabulary for explicitly authorized fan-original art.

No archive, OG mesh, OG texture, decimation or retargeting inputs. Geometry is
constructed from the saved recipe; rigid named nodes follow PS1-era assembly.
SPDX-License-Identifier: GPL-3.0-only
"""
import math
from .render import identity,translation,multiply,transform,rotation
from .tex import TexImage


def sub(a,b):return [x-y for x,y in zip(a,b)]
def cross(a,b):return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]
def unit(v):
    n=math.sqrt(sum(x*x for x in v))
    if n<1e-9:raise ValueError('Zero authored segment')
    return [x/n for x in v]


def shape_mesh(shape,p,color):
    vertices=[];faces=[];uvs=[]
    def face(*ids):
        for j in range(1,len(ids)-1):
            tri=[ids[0],ids[j],ids[j+1]]
            if sum(x*x for x in cross(sub(vertices[tri[1]],vertices[tri[0]]),sub(vertices[tri[2]],vertices[tri[0]])))>1e-14:faces.append(tri)
    def join(a,b):
        for i in range(len(a)):
            j=(i+1)%len(a);face(a[i],a[j],b[j],b[i])
    def cap(ring):face(*ring)
    center=p.get('center',[0,0,0])
    if shape=='box':
        w,h,d=[v/2 for v in p['size']]
        vertices=[[x,y,z] for z in (-d,d) for y in (-h,h) for x in (-w,w)]
        for ids in [(0,1,3,2),(4,6,7,5),(0,4,5,1),(2,3,7,6),(0,2,6,4),(1,5,7,3)]:face(*ids)
    elif shape in ('loft','ellipsoid'):
        n=p.get('sides',8)
        if shape=='ellipsoid':
            w,h,d=[v/2 for v in p['size']];bands=p.get('bands',4)
            profile=[[-h*math.cos(j*math.pi/bands),w*math.sin(j*math.pi/bands),d*math.sin(j*math.pi/bands)] for j in range(bands+1)]
        else:profile=p['profile']
        rings=[]
        for row in profile:
            y,rx,rz=row[:3];dx,dz=row[3:] if len(row)==5 else (0,y*p.get('lean',0))
            ring=[]
            for i in range(n):
                angle=(i+.5)*math.tau/n;ring.append(len(vertices));vertices.append([rx*math.cos(angle)+dx,y,rz*math.sin(angle)+dz])
            rings.append(ring)
        for a,b in zip(rings,rings[1:]):join(a,b)
        cap(rings[0]);cap(rings[-1])
    elif shape=='tube':
        a,b=p['a'],p['b'];axis=unit(sub(b,a));side=unit(cross(axis,[0,0,1] if abs(axis[2])<.9 else [0,1,0]));other=cross(axis,side);n=p.get('sides',6)
        rings=[]
        for c,r in [(a,p['r0']),(b,p.get('r1',p['r0']))]:
            ring=[]
            for i in range(n):
                angle=i*math.tau/n;ring.append(len(vertices));vertices.append([c[k]+r*(math.cos(angle)*side[k]+math.sin(angle)*other[k]) for k in range(3)])
            rings.append(ring)
        join(*rings);cap(rings[0]);cap(rings[1]);center=[0,0,0]
    elif shape=='poly':
        depth=p.get('depth',.05);outline=p['outline'];n=len(outline)
        vertices=[[x,y,z] for z in (-depth/2,depth/2) for x,y in outline];join(list(range(n)),list(range(n,n*2)));cap(list(range(n)));cap(list(range(n,n*2)))
    elif shape=='fan':
        vertices=[p['root']]+p['edge'];center=[0,0,0]
        for i in range(1,len(vertices)-1):face(0,i,i+1)
    elif shape=='wheel':
        n=p.get('sides',12);m=6;r=p['radius'];width=p.get('width',.45);th=p.get('tread',.2)
        for i in range(n):
            angle=i*math.tau/n
            for j in range(m):
                c=j*math.tau/m;rr=r+th*math.cos(c);vertices.append([width*math.sin(c),rr*math.cos(angle),rr*math.sin(angle)])
        for i in range(n):
            for j in range(m):face(i*m+j,((i+1)%n)*m+j,((i+1)%n)*m+(j+1)%m,i*m+(j+1)%m)
    elif shape=='panel':
        w,h=p['size'];vertices=[[-w/2,-h/2,0],[w/2,-h/2,0],[w/2,h/2,0],[-w/2,h/2,0]];uvs=[[0,1],[1,1],[1,0],[0,0]];face(0,1,2,3)
    else:raise ValueError('Unknown original mesh primitive '+shape)
    vertices=[[v[k]+center[k] for k in range(3)] for v in vertices]
    if p.get('uvProjection')=='xy':
        lo=[min(v[k] for v in vertices) for k in (0,1)];hi=[max(v[k] for v in vertices) for k in (0,1)]
        tiles=p.get('uvTiles',1)
        uvs=[[(v[0]-lo[0])/max(hi[0]-lo[0],1e-6)*tiles,(hi[1]-v[1])/max(hi[1]-lo[1],1e-6)*tiles] for v in vertices]
    positions=[];normals=[];colors=[];uv=[]
    for ids in faces:
        normal=unit(cross(sub(vertices[ids[1]],vertices[ids[0]]),sub(vertices[ids[2]],vertices[ids[0]])))
        # Four flat authored shade levels, not PBR or a modern surface shader.
        level=[.68,.80,.91,1.][min(3,max(0,int((normal[1]*.3+abs(normal[2])*.7)*4)))]
        if shape=='panel':level=1
        for vi in ids:
            positions.extend(vertices[vi]);normals.extend(normal);colors.extend([c/255*level for c in color]+[1]);uv.extend(uvs[vi] if uvs else [0,0])
    return dict(group=0,positions=positions,normals=normals,colors=colors,uv=uv,texture=None,material=None)


def paint_texture(kind):
    """Hand-authored 16x16 pixel maps, never sampled from reference images."""
    w=h=16
    base={'roche-face':(184,142,111),'scarlet-face':(218,166,135),'emerald-face':(211,214,192),'shadow-face':(221,184,174),'gilgamesh-mask':(177,177,159),'valkyrie-face':(76,68,49),'vent':(54,60,65),'hazard':(189,143,33),'cloth':(137,37,30),'rat-fur':(86,57,78),'mindflayer-mantle':(50,48,61),'flametrooper-mask':(48,51,54),'sea-devil-scales':(115,101,70),'reapertail-shell':(43,52,63),'diabolic-face':(139,67,60),'diabolic-sinew':(116,53,49)}[kind]
    data=bytearray(bytes([*base,255])*(w*h))
    def px(x,y,c):data[(y*w+x)*4:(y*w+x+1)*4]=bytes([*c,255])
    for y in range(h):
        for x in range(w):
            if kind in ('roche-face','scarlet-face','emerald-face','shadow-face'):
                if (y<2 and (x<3 or x>12)) or (y>13 and (x<4 or x>11)):
                    data[(y*w+x)*4+3]=0;continue
                if (x in range(3,7) or x in range(10,14)) and y==5:px(x,y,(64,45,35))
                if x in (5,11) and y in (6,7):px(x,y,(39,75,80))
                if y==12 and x in range(6,11):px(x,y,(122,57,51))
                if x in (7,8) and y in (8,9):px(x,y,(207,162,124))
            elif kind=='gilgamesh-mask':
                if y>13 and (x<3 or x>12):data[(y*w+x)*4+3]=0;continue
                if y in (5,6) and (2<=x<=6 or 10<=x<=14):px(x,y,(31,27,27))
                if (x,y) in [(4,6),(12,6)]:px(x,y,(233,198,63))
                if 7<=x<=9 or y==11:px(x,y,(118,25,22))
                if 12<=y<=14 and x%3==0:px(x,y,(43,43,42))
            elif kind=='valkyrie-face':
                if x in (3,4,11,12) and 4<=y<=10:px(x,y,(223,80,45))
                if x in (2,5,10,13) and 3<=y<=11:px(x,y,(170,169,151))
                if y==7:px(x,y,(37,38,34))
                if y>=13 and x%2==0:px(x,y,(13,18,22))
            elif kind=='vent':
                if y%4 in (1,2):px(x,y,(15,23,28))
                elif x in (0,15):px(x,y,(138,143,139))
            elif kind=='hazard':
                if (x+y)//4%2==0:px(x,y,(31,35,33))
            elif kind=='cloth':
                if (x+y)%8==0 or (x-y)%8==0:px(x,y,(206,162,62))
            elif kind=='rat-fur':
                if (x*7+y*11)%17<4:px(x,y,(123,91,99))
                if x%5==0 and y%3==0:px(x,y,(55,41,59))
            elif kind=='mindflayer-mantle':
                if (x*13+y*7)%19<5:px(x,y,(159,154,162))
                if (x-y)%11==0:px(x,y,(204,199,188))
            elif kind=='flametrooper-mask':
                if y<3 or x<2 or x>13:px(x,y,(188,190,181))
                if y in (5,6) and (3<=x<=6 or 10<=x<=13):px(x,y,(182,52,37))
                if y>10 and (x in (4,5,10,11)):px(x,y,(156,159,153))
                if y in (11,13) and 6<=x<=9:px(x,y,(22,24,26))
            elif kind=='sea-devil-scales':
                if (x*5+y*9)%19<5:px(x,y,(48,54,48))
                if y%4==0 and (x+y//4)%4<2:px(x,y,(166,151,105))
            elif kind=='reapertail-shell':
                if (x*11+y*7)%23<4:px(x,y,(109,116,123))
                if y%6==0 and x%3<2:px(x,y,(22,28,35))
            elif kind=='diabolic-sinew':
                if (x+y//3)%6==0:px(x,y,(188,134,116))
                if (2*x-y)%9==0:px(x,y,(64,32,37))
            elif kind=='diabolic-face':
                if y<4 or x<2 or x>13:px(x,y,(189,182,159))
                if y in (5,6) and (3<=x<=6 or 10<=x<=13):px(x,y,(41,27,27))
                if (x,y) in [(4,6),(11,6)]:px(x,y,(207,179,71))
                if 10<=y<=13 and 4<=x<=11:px(x,y,(42,24,28))
                if y in (10,12) and x in (5,7,9,11):px(x,y,(203,193,164))
    return TexImage(w,h,bytes(data),dict(provenance='fan-authored pixel paint',width=16,height=16,style=kind))


def compile_recipe(recipe):
    if recipe.get('provenance')!='fan-original-not-ff7-original-asset':raise ValueError('Original creation must be labeled')
    bones=[];world=[];names={}
    for node in recipe['nodes']:
        name=node['name'];parent=node['parent']
        if name in names or parent is not None and parent not in names:raise ValueError('Original node hierarchy')
        parent_id=-1 if parent is None else names[parent];origin=node['origin'];local=translation(*sub(origin,recipe['nodes'][parent_id]['origin'])) if parent_id>=0 else translation(*origin)
        if 'rotation' in node:
            angles=node['rotation']
            if len(angles)!=3 or any(not math.isfinite(v) or abs(v)>360 for v in angles):raise ValueError('Invalid authored node rotation')
            local=multiply(local,rotation(angles,[1,0,2]))
        bones.append(dict(name=name,parent=parent_id,localMatrix=local));world.append(multiply(world[parent_id],local) if parent_id>=0 else local);names[name]=len(bones)-1
    parts=[];textures={}
    for item in recipe['parts']:
        bone=names[item['node']];g=shape_mesh(item['shape'],item['params'],item['color']);origin=recipe['nodes'][bone]['origin']
        for i in range(0,len(g['positions']),3):g['positions'][i:i+3]=sub(g['positions'][i:i+3],origin)
        if item.get('texture'):
            key=item['texture'];textures.setdefault(key,paint_texture(key));g['texture']=key
        parts.append(dict(resourceId='fan-original:'+item['name'],bone=bone,geometry=g))
    return dict(schema='qb-fan-original-model',version=1,cardId=recipe['cardId'],identity=recipe['name'],
        provenance=recipe['provenance'],ogMeshImports=0,ogTextureImports=0,
        skeleton=dict(kind='authored-rigid-part-hierarchy',boneCount=len(bones),bones=bones),parts=parts,textures=textures,
        meshes=[dict(resourceId=p['resourceId'],bone=p['bone'],triangles=len(p['geometry']['positions'])//9) for p in parts])


def assemble_original(model):
    matrices=[]
    for bone in model['skeleton']['bones']:
        p=bone['parent'];matrices.append(multiply(matrices[p],bone['localMatrix']) if p>=0 else bone['localMatrix'])
    scene=[dict(p,matrix=matrices[p['bone']]) for p in model['parts']]
    return scene,dict(kind='authored-static-pose',bodyMatrices=matrices,description='rigid named-node composition; no source animation claim')


def export_obj(model,folder):
    scene,_=assemble_original(model);obj=['# FAN ORIGINAL / NOT AN FF7 ORIGINAL ASSET','mtllib model.mtl','s off'];mtl=[];offset=1
    for i,part in enumerate(scene):
        g=part['geometry'];name=part['resourceId'].split(':',1)[1];obj.extend(['o '+name,'usemtl material-'+str(i)])
        colors=g['colors'];average=[sum(colors[k::4])/(len(colors)//4) for k in range(3)]
        mtl.extend(['newmtl material-'+str(i),'Kd '+' '.join(f'{v:.5f}' for v in average),'Ka 0 0 0','Ks 0 0 0'])
        if g['texture']:mtl.append('map_Kd texture-'+g['texture']+'.png')
        for j in range(0,len(g['positions']),3):
            v=transform(part['matrix'],g['positions'][j:j+3]);c=colors[j//3*4:j//3*4+3];obj.append('v '+' '.join(f'{x:.6f}' for x in v+c))
        for j in range(0,len(g['uv']),2):obj.append(f'vt {g["uv"][j]:.6f} {1-g["uv"][j+1]:.6f}')
        for j in range(0,len(g['positions'])//3,3):obj.append('f '+' '.join(f'{offset+j+k}/{offset+j+k}' for k in range(3)))
        offset+=len(g['positions'])//3
    (folder/'model.obj').write_text('\n'.join(obj)+'\n',encoding='utf-8');(folder/'model.mtl').write_text('\n'.join(mtl)+'\n',encoding='utf-8')
