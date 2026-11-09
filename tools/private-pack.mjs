// Public builds never call this module's reader. Explicit private builds only.
import {readFileSync,realpathSync} from 'node:fs';
import {resolve,relative,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {validateVisualManifest} from '../shared/visual-manifest.mjs';
const inside=(parent,child)=>{const path=relative(parent,child);return path!==''&&path!=='..'&&!path.startsWith('../')&&!path.startsWith('..\\')&&!isAbsolute(path);};
export function inspectPrivatePack(root,pack,{allowExternal=false}={}){
  const directory=realpathSync(resolve(root,pack));
  // Existing callers retain the local-only boundary. External packs require an
  // explicit absolute selection and opt-in, and are only ever opened for reading.
  if(!(allowExternal&&isAbsolute(pack))){
    const boundary=realpathSync(resolve(root,'private-assets'));
    if(!inside(realpathSync(root),boundary))throw new Error('Private asset root escapes project');
    if(!inside(boundary,directory))throw new Error('Private pack must be inside project/private-assets/');
  }
  const read=path=>{
    const absolute=realpathSync(resolve(directory,path));
    if(!inside(directory,absolute))throw new Error('Private asset escapes pack');
    return readFileSync(absolute);
  };
  const report=JSON.parse(read('build-report.json').toString('utf8'));
  if(report.schema!=='qb-local-asset-report'||report.version!==1||report.ok!==true)throw new Error('Private pack has no successful build report');
  if(!Array.isArray(report.generatedFiles))throw new Error('Private report requires generatedFiles');
  const listed=new Map();
  for(const row of report.generatedFiles){
    if(!row||typeof row.path!=='string'||listed.has(row.path)||typeof row.sha256!=='string'||!/^[a-f0-9]{64}$/.test(row.sha256))throw Error('Invalid/duplicate generated file hash');
    listed.set(row.path,row);
  }
  const manifest=JSON.parse(read('visual-manifest.json').toString('utf8'));
  validateVisualManifest(manifest);
  const files=new Map();
  const add=path=>{
    if(typeof path!=='string'||!/^(?:portraits\/[a-z0-9-]+\.png|models\/[a-z0-9-]+\.json)$/.test(path))throw new Error('Unexpected private asset path');
    const bytes=read(path),entry=listed.get(path);
    if(!entry||entry.sha256!==createHash('sha256').update(bytes).digest('hex'))throw new Error('Private asset hash mismatch: '+path);
    if(entry.size!==undefined&&entry.size!==bytes.length)throw Error('Private asset size mismatch: '+path);
    files.set('classic/'+path,bytes);return 'classic/'+path;
  };
  const cards=manifest.cards.map(card=>{
    if(card.preview3dPath!=null)throw Error('Art Pack v1 preview3dPath is reserved; no 3D delivery format is enabled');
    const modelSources={};
    for(const [kind,source] of Object.entries(card.modelSources??{})){
      if(source===null){modelSources[kind]=null;continue;}
      modelSources[kind]={resourceId:source.resourceId,path:source.path?add(source.path):null};
    }
    return {...card,modelSources,portraitPath:card.portraitPath?add(card.portraitPath):null,preview3dPath:null};
  });
  files.set('classic/visual-manifest.json',Buffer.from(JSON.stringify({version:1,cards})));
  return {directory,manifest,files};
}
export function readPrivatePack(root,pack,options){return inspectPrivatePack(root,pack,options).files;}
