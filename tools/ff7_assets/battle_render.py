"""Offline Battle illustration rasterizer; shares math/PNG helpers only.
SPDX-License-Identifier: GPL-3.0-only
"""
import math
from .render import multiply, rotation, transform, linear, srgb, texel, png


def render_scene(scene, textures, camera, width=384, height=384):
    view = rotation([camera.get('elevation', 0),camera.get('yaw',0),camera.get('roll',0)],[2,0,1])
    triangles, points = [], []
    for part in scene:
        g = part['geometry']; matrix = multiply(view,part['matrix'])
        for tri in range(0,len(g['positions'])//3,3):
            vertices = []
            for i in range(tri,tri+3):
                point = transform(matrix,g['positions'][i*3:i*3+3]); points.append(point)
                vertices.append(point+[linear(c) for c in g['colors'][i*4:i*4+3]]+[g['colors'][i*4+3]]+g['uv'][i*2:i*2+2])
            triangles.append((vertices,textures.get(g['texture'])))
    if not points:
        raise ValueError('No assembled Battle geometry')
    bounds = [[min(v[i] for v in points) for i in range(3)],[max(v[i] for v in points) for i in range(3)]]
    span = [b-a for a,b in zip(*bounds)]
    if 'unitsPerFrame' in camera:
        scale = height/camera['unitsPerFrame']
        center = transform(view,camera['center'])[:2]
    else:
        scale = .86*min(width/max(span[0],1e-6),height/max(span[1],1e-6))
        center = [(bounds[0][i]+bounds[1][i])/2 for i in range(2)]
    if not math.isfinite(scale) or scale <= 0:
        raise ValueError('Invalid Battle camera scale')
    pixels = bytearray(width*height*4); depth = [-math.inf]*(width*height)
    triangles.sort(key=lambda t:sum(v[2] for v in t[0])/3)
    for raw, texture in triangles:
        u = [raw[1][i]-raw[0][i] for i in range(3)]
        v = [raw[2][i]-raw[0][i] for i in range(3)]
        normal = [u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]]
        length = math.sqrt(sum(n*n for n in normal)) or 1
        normal = [n/length*(1 if normal[2] >= 0 else -1) for n in normal]
        direction = camera.get('keyDirection',[-.45,.65,1.])
        length = math.sqrt(sum(n*n for n in direction))
        key = max(0,sum(normal[i]*direction[i]/length for i in range(3)))
        neutral = camera.get('lighting') == 'neutral'
        light = ([camera.get('ambient',1.)+camera.get('keyStrength',0.)*key]*3 if neutral else
                 [camera.get('ambient',.64)*c+camera.get('keyStrength',.48)*key*w
                  for c,w in zip([.87,.94,1.],[1.,.96,.87])])
        vs = [[(v[0]-center[0])*scale+width/2,height/2-(v[1]-center[1])*scale]+v[2:] for v in raw]
        a,b,c = vs
        den = (b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1])
        if abs(den) < 1e-9:
            continue
        x0 = max(0,math.floor(min(v[0] for v in vs))); x1 = min(width-1,math.ceil(max(v[0] for v in vs)))
        y0 = max(0,math.floor(min(v[1] for v in vs))); y1 = min(height-1,math.ceil(max(v[1] for v in vs)))
        for y in range(y0,y1+1):
            for x in range(x0,x1+1):
                xx,yy=x+.5,y+.5
                w0=((b[1]-c[1])*(xx-c[0])+(c[0]-b[0])*(yy-c[1]))/den
                w1=((c[1]-a[1])*(xx-c[0])+(a[0]-c[0])*(yy-c[1]))/den; w2=1-w0-w1
                if min(w0,w1,w2) < -1e-9:
                    continue
                vals=[w0*a[i]+w1*b[i]+w2*c[i] for i in range(2,9)]
                z,alpha=vals[0],vals[4];slot=y*width+x
                if z < depth[slot]-1e-7:
                    continue
                color=vals[1:4]
                if texture:
                    t=texel(texture,vals[5],vals[6]);color=[color[i]*linear(t[i]/255) for i in range(3)];alpha*=t[3]/255
                if alpha < .01:
                    continue
                dst=slot*4;old=pixels[dst+3]/255;out=alpha+old*(1-alpha)
                for i in range(3):
                    value=(color[i]*light[i]*alpha+linear(pixels[dst+i]/255)*old*(1-alpha))/out
                    pixels[dst+i]=round(max(0,min(1,srgb(value)))*255)
                pixels[dst+3]=round(out*255);depth[slot]=z
    visible=sum(pixels[i]>0 for i in range(3,len(pixels),4))
    if not visible:
        raise ValueError('Battle illustration is empty')
    return png(width,height,pixels),dict(width=width,height=height,triangles=len(triangles),
        visiblePixels=visible,bounds=bounds,center=center,scale=scale,sampling='nearest-repeat',
        lighting=('neutral equal RGB; source colors; linear-light multiplication' if camera.get('lighting')=='neutral' else 'cool-fill-warm-key; source colors; linear-light multiplication'),
        alpha='source-over with depth; not FF7 framebuffer blend emulation',culling='double-sided')
