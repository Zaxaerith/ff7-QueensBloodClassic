"""Deterministic orthographic card portrait renderer; no GPU/runtime dependency.

Source hierarchy/basis follows GaiaGIS model.ts (GPL-3.0-only). Rasterizer,
camera fit, nearest-repeat sampling and PNG writer independently authored here.
This is an unlit preview, not an emulation of FF7 lighting/blend arithmetic.
"""
# SPDX-License-Identifier: GPL-3.0-only
import math,struct,zlib

def multiply(a,b):
    return [[sum(a[r][k]*b[k][c] for k in range(4)) for c in range(4)] for r in range(4)]

def identity():return [[int(r==c) for c in range(4)] for r in range(4)]

def translation(x,y,z):
    matrix=identity();matrix[0][3]=x;matrix[1][3]=y;matrix[2][3]=z;return matrix

def rotation(values,order):
    matrix=identity()
    for axis in order:
        a=values[axis]*math.pi/180;c=math.cos(a);s=math.sin(a);r=identity()
        i,j=((1,2),(2,0),(0,1))[axis]
        r[i][i]=r[j][j]=c;r[i][j]=-s;r[j][i]=s
        matrix=multiply(matrix,r)
    return matrix

def transform(matrix,p):return [sum(matrix[r][c]*p[c] for c in range(3))+matrix[r][3] for r in range(3)]

def pose(model,frame=0,adjustments=None):
    skeleton=model['skeleton'];clip=model['animation'];values=clip['values'];start=frame*(6+clip['bone_count']*3)
    if not 0<=frame<clip['frame_count']:raise ValueError('Pose frame outside animation')
    # Same source-local convention as GaiaGIS: root stored Y reverses sign,
    # children attach at negative parent Z; convert basis once at the root.
    root=multiply(rotation([180,180,0],[0,1,2]),multiply(translation(values[start+3],-values[start+4],values[start+5]),rotation(values[start:start+3],clip['rotation_order'])))
    adjustments=adjustments or {};names={b['name'] for b in skeleton['bones']}
    if set(adjustments)-names:raise ValueError('Art pose references a missing bone')
    matrices=[]
    for i,bone in enumerate(skeleton['bones']):
        local=rotation(values[start+6+i*3:start+9+i*3],clip['rotation_order']) if clip['bone_count'] else identity()
        if bone['name'] in adjustments:local=multiply(local,rotation(adjustments[bone['name']],[1,0,2]))
        parent=bone['parent']
        matrices.append(multiply(root,local) if parent<0 else multiply(matrices[parent],multiply(translation(0,0,-skeleton['bones'][parent]['length']),local)))
    return matrices

def linear(v):return v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4
def srgb(v):return 12.92*v if v<=.0031308 else 1.055*max(v,0)**(1/2.4)-.055

def texel(texture,u,v):
    # NearestFilter equivalent; retain original tiled UVs, do not clamp faces.
    w,h=texture.width,texture.height;x=int((u%1)*w)%w;y=int((v%1)*h)%h
    return texture.rgba[(y*w+x)*4:(y*w+x+1)*4]

def art_pose(model,frame,camera,art):
    """Deterministic two-joint reach for authored stills, never retargeted motion.
    Rotations alone change; source bone lengths and geometry stay intact.
    """
    adjusted={k:list(v) for k,v in art.get('poseAdjustments',{}).items()}
    names={b['name']:i for i,b in enumerate(model['skeleton']['bones'])}
    def camera_vertices(matrices,bone=None):
        return [transform(multiply(camera,matrices[p['bone']]),p['geometry']['positions'][i:i+3]) for p in model['parts'] if bone is None or p['bone']==bone for i in range(0,len(p['geometry']['positions']),3)]
    def center(points):return [(min(p[i] for p in points)+max(p[i] for p in points))/2 for i in range(3)]
    base=pose(model,frame,adjusted);points=camera_vertices(base);height=max(p[1] for p in points)-min(p[1] for p in points)
    for reach in art.get('reach',[]):
        if not isinstance(reach,dict) or len(reach.get('chain',[]))!=2 or len(reach.get('offset',[]))!=3 or any(not isinstance(n,(int,float)) or not math.isfinite(n) or abs(n)>2 for n in reach['offset']):raise ValueError('Invalid authored card-art reach')
        chain=reach['chain'];hand=names[reach['hand']];anchor=center(camera_vertices(base,names[reach.get('anchor','head')]))
        target=[anchor[i]+reach['offset'][i]*height for i in range(3)]
        for bone in chain:
            if bone not in names:raise ValueError('Art reach references missing joint')
            adjusted.setdefault(bone,[0.,0.,0.])
        def error():
            current=center(camera_vertices(pose(model,frame,adjusted),hand))
            return sum((current[i]-target[i])**2 for i in range(3))
        for step in [30,15,7,3,1]:
            for _ in range(2):
                for bone in chain:
                    for axis in range(3):
                        original=adjusted[bone][axis];best=error();angle=original
                        for delta in [-step,step]:
                            adjusted[bone][axis]=original+delta;score=error()
                            if score<best:best=score;angle=original+delta
                        adjusted[bone][axis]=angle
    return pose(model,frame,adjusted),adjusted

def png(width,height,rgba):
    def chunk(tag,payload):return struct.pack('>I',len(payload))+tag+payload+struct.pack('>I',zlib.crc32(tag+payload)&0xffffffff)
    scan=b''.join(b'\0'+rgba[y*width*4:(y+1)*width*4] for y in range(height))
    return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>2I5B',width,height,8,6,0,0,0))+chunk(b'sRGB',b'\0')+chunk(b'IDAT',zlib.compress(scan,9))+chunk(b'IEND',b'')

def render(model,frame=0,width=384,height=480,yaw=160,elevation=8,art=None):
    art=art or {};yaw=art.get('yaw',yaw);elevation=art.get('elevation',elevation);roll=art.get('roll',0)
    zoom=art.get('zoom',1);focus=art.get('focus',[.5,.5]);fit=art.get('fit','contain');adjustments=art.get('poseAdjustments',{})
    numbers=[yaw,elevation,roll,zoom,*focus,*[n for angles in adjustments.values() for n in angles]]
    if any(not isinstance(n,(int,float)) or not math.isfinite(n) or abs(n)>360 for n in numbers) or not .5<=zoom<=3 or len(focus)!=2 or any(not 0<=n<=1 for n in focus) or fit not in ('contain','height','width') or any(len(a)!=3 for a in adjustments.values()):raise ValueError('Invalid card-art camera/pose configuration')
    camera=rotation([elevation,yaw,roll],[2,0,1]);matrices,resolved=art_pose(model,frame,camera,art);triangles=[];points=[];focal=[]
    for part in model['parts']:
        group=part['geometry'];m=multiply(camera,matrices[part['bone']]);p=group['positions'];colors=group['colors'];uv=group['uv']
        for start in range(0,len(p)//3,3):
            vertices=[]
            for i in range(start,start+3):
                point=transform(m,p[i*3:i*3+3]);points.append(point)
                if art.get('focusBone')==model['skeleton']['bones'][part['bone']]['name']:focal.append(point)
                vertices.append(point+[linear(c) for c in colors[i*4:i*4+3]]+[colors[i*4+3]]+uv[i*2:i*2+2])
            triangles.append((vertices,model['textures'].get(part['texture'])))
    if not points:raise ValueError('Model has no renderable triangles')
    minimum=[min(p[i] for p in points) for i in range(3)];maximum=[max(p[i] for p in points) for i in range(3)]
    span=[maximum[i]-minimum[i] for i in range(3)]
    if max(span[:2])<=0:raise ValueError('Degenerate projected model')
    scales=[width*.84/max(span[0],1e-9),height*.84/max(span[1],1e-9)]
    scale=(scales[1] if fit=='height' else scales[0] if fit=='width' else min(scales))*zoom;center=[minimum[i]+span[i]*focus[i] for i in range(2)]
    if art.get('focusBone'):
        if not focal:raise ValueError('Card-art focal bone has no geometry')
        anchor=art.get('anchor',[.5,.3]);focal_center=[(min(p[i] for p in focal)+max(p[i] for p in focal))/2 for i in range(2)]
        center=[focal_center[0]-(anchor[0]-.5)*width/scale,focal_center[1]+(anchor[1]-.5)*height/scale]
    pixels=bytearray(width*height*4);depth=[-math.inf]*(width*height)
    # Far-to-near triangles support ordinary source-over translucency. Per-pixel
    # depth still resolves opaque intersections; original FF7 blend modes are
    # retained as material metadata, not silently claimed to be emulated here.
    triangles.sort(key=lambda t:sum(v[2] for v in t[0])/3)
    for raw,texture in triangles:
        lighting=[1.,1.,1.]
        if art:
            u=[raw[1][i]-raw[0][i] for i in range(3)];v=[raw[2][i]-raw[0][i] for i in range(3)];normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]]
            length=math.sqrt(sum(n*n for n in normal)) or 1;normal=[n/length*(1 if normal[2]>=0 else -1) for n in normal]
            light=[-.45,.65,1];length=math.sqrt(sum(n*n for n in light));key=max(0,sum(normal[i]*light[i]/length for i in range(3)))
            lighting=[.58*tint+.52*key*warm for tint,warm in zip([.83,.91,1.],[1.,.96,.89])]
        vs=[[(v[0]-center[0])*scale+width/2,height/2-(v[1]-center[1])*scale]+v[2:] for v in raw]
        (a,b,c)=vs;den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1])
        if abs(den)<1e-9:continue
        x0=max(0,math.floor(min(v[0] for v in vs)));x1=min(width-1,math.ceil(max(v[0] for v in vs)))
        y0=max(0,math.floor(min(v[1] for v in vs)));y1=min(height-1,math.ceil(max(v[1] for v in vs)))
        for y in range(y0,y1+1):
            for x in range(x0,x1+1):
                xx,yy=x+.5,y+.5;w0=((b[1]-c[1])*(xx-c[0])+(c[0]-b[0])*(yy-c[1]))/den;w1=((c[1]-a[1])*(xx-c[0])+(a[0]-c[0])*(yy-c[1]))/den;w2=1-w0-w1
                if min(w0,w1,w2)<-1e-9:continue
                vals=[w0*a[i]+w1*b[i]+w2*c[i] for i in range(2,9)];z=vals[0];slot=y*width+x
                if z<depth[slot]-1e-7:continue
                color=vals[1:4];alpha=vals[4]
                if texture:
                    t=texel(texture,vals[5],vals[6]);color=[color[i]*linear(t[i]/255) for i in range(3)];alpha*=t[3]/255
                color=[color[i]*lighting[i] for i in range(3)]
                if alpha<.005:continue
                dst=slot*4;old=pixels[dst+3]/255;out=alpha+old*(1-alpha)
                for i in range(3):
                    value=(color[i]*alpha+linear(pixels[dst+i]/255)*old*(1-alpha))/out
                    pixels[dst+i]=round(max(0,min(1,srgb(value)))*255)
                pixels[dst+3]=round(out*255);depth[slot]=z
    visible=sum(pixels[i]>0 for i in range(3,len(pixels),4))
    if not visible:raise ValueError('Render is empty (all triangles degenerate/transparent)')
    return png(width,height,pixels),dict(width=width,height=height,visible_pixels=visible,triangles=len(triangles),source_bounds=[minimum,maximum],fit_scale=scale,rgba_sha256=__import__('hashlib').sha256(pixels).hexdigest(),transparent_background=True,sampling='nearest-repeat',lighting='card-key-fill-v1' if art else 'unlit-source-colors-srgb',basis='Rx(180)*Ry(180); root Y negated; child -Z',purpose='card-art-candidate' if art else 'technical-preview-only',artDirection=art,resolvedPoseAdjustments=resolved,camera=dict(yaw=yaw,elevation=elevation,roll=roll,zoom=zoom,focus=focus,fit=fit,projection='orthographic',fit_fraction=.84))
