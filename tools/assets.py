"""Local-only FF7 model pipeline. All input opens are rb; output is confined.
SPDX-License-Identifier: GPL-3.0-only
"""
import argparse,hashlib,json,math,re,struct,sys
from collections import Counter
from pathlib import Path
from ff7_assets.lgp import inventory,read_entry
from ff7_assets.formats import parse_hrc,parse_rsd,parse_p,parse_animation
from ff7_assets.tex import decode_tex
from ff7_assets.field_models import field_model_section,parse_field_models
from ff7_assets.render import render
from ff7_assets.battle import probe as battle_probe
from ff7_assets.local_paths import read_local_paths

ROOT=Path(__file__).resolve().parents[1]
PRIVATE=ROOT/'private-assets'
def digest(path):
    h=hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda:stream.read(1<<20),b''):h.update(block)
    return h.hexdigest()

def output_path(value):
    path=Path(value).resolve()
    boundary=PRIVATE.resolve()
    if not boundary.is_relative_to(ROOT) or path==boundary or not path.is_relative_to(boundary):raise ValueError('Outputs must be strictly inside project/private-assets/')
    return path

def write_json(path,value):
    path=output_path(path);path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

def child(path,name):
    if not path.is_dir():return None
    found=[p for p in path.iterdir() if p.name.casefold()==name.casefold()]
    if len(found)>1:raise ValueError(f'Ambiguous case-insensitive path: {path}/{name}')
    return found[0] if found else None

def descend(path,parts):
    for part in parts:
        path=child(path,part)
        if path is None:return None
    return path

def discover(source,overrides):
    selected=Path(source).resolve(strict=True);found={}
    roles={'field':('field','char.lgp'),'world':('wm',None),'battle':('battle','battle.lgp'),'menu':('menu','window.bin'),'bindings':('field',None)}
    if selected.is_file():
        name=selected.name.lower();role='world' if re.fullmatch(r'world_[a-z]{2}\.lgp',name) else {'char.lgp':'field','battle.lgp':'battle','window.bin':'menu'}.get(name)
        if role is None:raise ValueError('Unknown source file role; select a directory or use --field/--world/--battle/--menu')
        found[role]=selected
    else:
        # Bounded known layouts only; never recursive disk discovery.
        roots=[(),('data',),('workingdir','data'),('ff7','workingdir','data')]
        for role,(folder,name) in roles.items():
            candidates=set()
            for parts in roots:
                for suffix in ((folder,),()):
                    directory=descend(selected,parts+suffix)
                    if directory is None:continue
                    if name:
                        path=child(directory,name)
                        if path and path.is_file():candidates.add(path.resolve())
                    else:
                        pattern=r'world_[a-z]{2}\.lgp' if role=='world' else r'(?:[a-z]?flevel)\.lgp'
                        candidates.update(p.resolve() for p in directory.iterdir() if p.is_file() and re.fullmatch(pattern,p.name,re.I))
            if len(candidates)>1 and not overrides.get(role):raise ValueError(f'Ambiguous {role} archive; specify --{role} explicitly')
            if candidates:found[role]=sorted(candidates)[0]
    for role,value in overrides.items():
        if value:found[role]=Path(value).resolve(strict=True)
    if not found:raise ValueError('No supported files found in bounded layouts; use explicit archive paths')
    for path in found.values():
        if not path.is_file():raise ValueError(f'Input is not a regular file: {path}')
        if path.is_relative_to(PRIVATE.resolve()):raise ValueError('Generated output cannot be used as a game source')
    return selected,found

class Archive:
    def __init__(self,path):
        self.path=path;self.sha256=digest(path);self.inventory=inventory(path);self.entries={};self.used={}
        if not self.inventory['standard_creator_signature'] or not self.inventory['standard_footer']:raise ValueError(f'Unsupported LGP signature/footer: {path.name}')
        for entry in self.inventory['entries']:
            name=entry['filename'].lower()
            if not re.fullmatch(r'[a-z0-9_. -]+',name):raise ValueError(f'Unsafe/nonstandard LGP resource name: {name}')
            self.entries.setdefault(name,[]).append(entry)
    def read(self,name):
        matches=self.entries.get(name.lower(),[])
        if len(matches)!=1:raise ValueError(f'{self.path.name}:{name}: expected one resource, found {len(matches)}')
        data=read_entry(self.path,matches[0]);self.used[name]=dict(size=len(data),sha256=hashlib.sha256(data).hexdigest());return data
    def report(self):
        def classify(name):
            if self.path.name.lower()=='battle.lgp':
                if re.fullmatch(r'[a-z]{2}aa',name):return 'battle-skeleton-candidate'
                if re.fullmatch(r'[a-z]{2}da',name):return 'battle-animation-pack-candidate'
                return 'battle-part/texture/other-unclassified'
            suffix=Path(name).suffix.lower()
            return {'.hrc':'HRC','.rsd':'RSD','.p':'P','.a':'A','.tex':'TEX'}.get(suffix,'other')
        return dict(path=str(self.path),sha256=self.sha256,size=self.path.stat().st_size,entry_count=self.inventory['entry_count'],conflict_count=self.inventory['conflict_count'],caseVariantRecords=self.inventory['case_variant_records'],counts=dict(Counter(classify(n) for n in self.entries)),entries=[dict(name=e['filename'],offset=e['data_offset'],size=e['size'],classification=classify(e['filename'].lower())) for e in self.inventory['entries']])

def load_model(spec,archive,bindings=None):
    resource=spec['resourceId'];skeleton=parse_hrc(archive.read(resource));animation_name=spec['animation']
    binding_evidence=None
    if spec.get('bindingField'):
        if bindings is None:raise ValueError('Field identity/pose requires paired --bindings flevel archive')
        rows=parse_field_models(field_model_section(bindings.read(spec['bindingField'])))
        row=next((r for r in rows if r['hrc']==resource),None)
        if row is None or animation_name not in [a['resource'] for a in row['animations']]:raise ValueError(f'{resource}: named field-loader binding/animation not found')
        binding_evidence=row|dict(field=spec['bindingField'])
    animation=parse_animation(archive.read(animation_name),skeleton['bone_count']);parts=[];textures={}
    for bone,b in enumerate(skeleton['bones']):
        for reference in b['resources']:
            rsd=parse_rsd(archive.read(reference));mesh=parse_p(archive.read(rsd['mesh']))
            for group in mesh['groups']:
                slot=group['texture'];texture=None
                if slot is not None:
                    if slot>=len(rsd['textures']):raise ValueError(f'{rsd["mesh"]}: texture index {slot} outside RSD')
                    texture=rsd['textures'][slot]
                    if texture not in textures:textures[texture]=decode_tex(archive.read(texture))
                parts.append(dict(bone=bone,rsd=reference,resource=rsd['mesh'],texture=texture,geometry=group))
    return dict(skeleton=skeleton,animation=animation,parts=parts,textures=textures,binding=binding_evidence)

def main():
    parser=argparse.ArgumentParser(description='Read-only FF7 PC asset inspection and private portrait build')
    parser.add_argument('command',choices=['inspect','build']);parser.add_argument('--source')
    parser.add_argument('--paths',help='Private local paths JSON; defaults to QB_LOCAL_PATHS or qb.local.json')
    for role in ['field','world','battle','menu','bindings']:parser.add_argument('--'+role)
    parser.add_argument('--manifest',default=str(ROOT/'data/classic-models.json'));parser.add_argument('--out')
    args=parser.parse_args();local=read_local_paths(ROOT,args.paths)['sources']
    source=args.source or local.get('game')
    if not source:parser.error('--source or sources.game in local paths is required')
    overrides={r:getattr(args,r) or (local.get(r) if not args.source else None) for r in ['field','world','battle','menu','bindings']}
    selected,paths=discover(source,overrides)
    output=output_path(args.out or str(PRIVATE/('card-art' if args.command=='build' else 'inspection.json')))
    if output==selected or output.is_relative_to(selected) or any(output==p or output.is_relative_to(p) for p in paths.values()):raise ValueError('Output overlaps source')
    archives={};files={};failures=[]
    for role,path in paths.items():
        try:
            if role=='menu':files[role]=dict(path=str(path),size=path.stat().st_size,sha256=digest(path),status='opaque-not-decoded',reason='window.bin varies; no menu/font extraction in M4')
            else:archives[role]=Archive(path);files[role]=archives[role].report()
        except (ValueError,OSError,struct.error) as error:failures.append(dict(role=role,resource=str(path),reason=str(error)))
    report=dict(schema='qb-local-asset-report',version=1,source=str(selected),readOnly=True,files=files,models=[],failures=failures,unavailableRoles=[dict(role=r,reason='Not present in bounded layouts; supply an explicit path if available') for r in ['field','world','battle','menu','bindings'] if r not in paths])
    if 'battle' in archives:report['battleProbe']=battle_probe(archives['battle'])
    if args.command=='build':
        recipe=json.loads(Path(args.manifest).read_text(encoding='utf-8-sig'))
        if recipe.get('version')!=1 or not isinstance(recipe.get('models'),list) or not 1<=len(recipe['models'])<=32:raise ValueError('Invalid model recipe version/count')
        output.mkdir(parents=True,exist_ok=True);visuals=[];seen=set();cards=set()
        for spec in recipe['models']:
            identity=spec.get('id','');role=spec.get('kind');resource=spec.get('resourceId','')
            try:
                if not re.fullmatch(r'[a-z0-9-]{1,64}',identity) or identity in seen:raise ValueError('Invalid/duplicate model id')
                seen.add(identity)
                if role not in ('field','world'):raise ValueError('Battle does not use the Field parser; conversion unsupported in M4')
                if role not in archives:raise ValueError(f'Required {role} archive unavailable')
                if not resource.endswith('.hrc'):raise ValueError('Expected explicit HRC resourceId')
                model=load_model(spec,archives[role],archives.get('bindings'));frame=spec.get('frame',0)
                if not isinstance(frame,int) or isinstance(frame,bool):raise ValueError('frame must be integer')
                portrait,metadata=render(model,frame,art=spec.get('art'))
                portrait_name=f'portraits/{identity}.png';model_name=f'models/{identity}.json'
                for name in [portrait_name,model_name]:output_path(output/name).parent.mkdir(parents=True,exist_ok=True)
                (output/portrait_name).write_bytes(portrait)
                converted=dict(schema='qb-posed-model',version=1,identity=identity,sourceKind=role,resourceId=resource,skeleton=model['skeleton'],animation=model['animation'],parts=model['parts'],textures={name:dict(width=t.width,height=t.height,rgba=list(t.rgba),metadata=t.metadata) for name,t in model['textures'].items()},binding=model['binding'],artPose=metadata['resolvedPoseAdjustments'],artCamera=metadata['camera'])
                write_json(output/model_name,converted)
                mapped=spec.get('cardIds',[])
                for card in mapped:
                    if not isinstance(card,int) or card not in range(1,146) or card in cards:raise ValueError('Duplicate/invalid numbered Card ID mapping')
                    cards.add(card)
                    if not spec.get('evidence'):raise ValueError('Card mapping requires explicit identity evidence')
                    visuals.append(dict(cardId=card,ff7OriginalEntityId=spec['entityId'],modelSources={role:dict(resourceId=resource,path=model_name)},portraitPath=portrait_name,preview3dPath=None))
                report['models'].append(dict(id=identity,status='built',kind=role,resourceId=resource,skeletonName=model['skeleton']['name'],bones=model['skeleton']['bone_count'],parts=len(model['parts']),textures=len(model['textures']),animation=spec['animation'],frame=frame,portrait=portrait_name,portraitSha256=hashlib.sha256(portrait).hexdigest(),model=model_name,cardIds=mapped,evidence=spec.get('evidence'),render=metadata))
            except (ValueError,KeyError,OSError,struct.error) as error:failures.append(dict(model=identity,resource=resource,reason=str(error)))
        # Only successful mappings are published; failure is explicit and nonzero.
        write_json(output/'visual-manifest.json',dict(version=1,cards=visuals))
        report['generatedFiles']=[dict(path=str(p.relative_to(output)).replace('\\','/'),sha256=digest(p),size=p.stat().st_size) for p in sorted(output.rglob('*')) if p.is_file() and p.name!='build-report.json']
    for role,archive in archives.items():
        report['files'][role]['resourcesRead']=archive.used
        if digest(archive.path)!=archive.sha256:raise ValueError(f'Source changed during read: {archive.path.name}')
    report['ok']=not failures
    write_json(output/'build-report.json' if args.command=='build' else output,report)
    print(json.dumps(dict(ok=report['ok'],report=str(output/'build-report.json' if args.command=='build' else output),archives=len(archives),built=len(report['models']),failures=failures),ensure_ascii=False))
    return 0 if report['ok'] else 1

if __name__=='__main__':
    try:sys.exit(main())
    except (ValueError,OSError,KeyError,struct.error) as error:
        print(json.dumps(dict(ok=False,error=str(error)),ensure_ascii=False));sys.exit(1)
