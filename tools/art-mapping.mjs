// Merge small, independently owned research fragments. Never rewrites the base.
import {readFileSync,readdirSync,writeFileSync,mkdirSync,lstatSync} from 'node:fs';
import {resolve,dirname,relative,isAbsolute,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const editable=['category','identityStatus','locatedResources','candidateResources','reason','evidence','visualReference','productionStatus'];
export function compileArtMapping(base,fragments){
  if(base?.schema!=='qb-classic-art-research'||base.version!==1||!Array.isArray(base.cards)||base.cards.length!==145||new Set(base.cards.map(c=>c.cardId)).size!==145||base.cards.some(c=>!Number.isInteger(c.cardId)||c.cardId<1||c.cardId>145))throw Error('Expected complete 145-card mapping baseline');
  const result=structuredClone(base),cards=new Map(result.cards.map(c=>[c.cardId,c])),claimed=new Map(),batches=new Set();
  const ordered=[...fragments].sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0);
  for(const {name,value} of ordered){
    if(value?.schema!=='qb-classic-art-fragment'||value.version!==1||typeof value.batch!=='string'||!value.batch.trim()||batches.has(value.batch)||!Array.isArray(value.cards))throw Error('Invalid/duplicate art fragment: '+name);
    batches.add(value.batch);
    if(value.sources!==undefined){
      if(!object(value.sources))throw Error('Invalid fragment sources: '+name);
      for(const [id,source] of Object.entries(value.sources)){
        if(!/^[a-zA-Z][a-zA-Z0-9-]*$/.test(id)||!object(source)||typeof source.url!=='string'||typeof source.scope!=='string')throw Error('Invalid evidence source: '+id);
        if(Object.hasOwn(result.sources,id))throw Error('Evidence source already exists; use a batch-specific ID: '+id);
        result.sources[id]=structuredClone(source);
      }
    }
    for(const row of value.cards){
      if(!object(row)||!cards.has(row.cardId)||!object(row.changes)||!Object.keys(row.changes).length)throw Error('Invalid mapping patch: '+name);
      if(claimed.has(row.cardId))throw Error(`Card #${row.cardId} is claimed by both ${claimed.get(row.cardId)} and ${name}`);
      claimed.set(row.cardId,name);
      if(Object.keys(row.changes).some(key=>!editable.includes(key)))throw Error('Mapping patch cannot change Card ID/name or unknown fields');
      Object.assign(cards.get(row.cardId),structuredClone(row.changes));
    }
  }
  for(const row of result.cards){
    if(!['A','B','C','D',null].includes(row.category)||!Array.isArray(row.evidence)||!Array.isArray(row.locatedResources)||!Array.isArray(row.candidateResources)||!object(row.visualReference))throw Error('Invalid mapping evidence for Card #'+row.cardId);
    const refs=[...row.evidence,...row.locatedResources.flatMap(r=>r.sources??[]),...row.candidateResources.flatMap(r=>r.sources??[])];
    if(refs.some(id=>!Object.hasOwn(result.sources,id)))throw Error('Unknown evidence source for Card #'+row.cardId);
    for(const resource of [...row.locatedResources,...row.candidateResources]){
      if(!['field','battle','world','magic'].includes(resource.kind)||typeof resource.resourceId!=='string'||!resource.resourceId.trim()||typeof resource.archive!=='string'||!Array.isArray(resource.sources))throw Error('Invalid resource identity for Card #'+row.cardId);
    }
    for(const key of ['identityStatus','reason','productionStatus'])if(typeof row[key]!=='string')throw Error('Invalid mapping text: '+key);
  }
  result.cards.sort((a,b)=>a.cardId-b.cardId);
  result.summary.categories=Object.fromEntries(['A','B','C','D','unresolved'].map(key=>[key,result.cards.filter(c=>(c.category??'unresolved')===key).length]));
  result.summary.reviewedNumberedImages=result.cards.filter(c=>c.visualReference.inspection==='sample-image-reviewed').length;
  return result;
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
  try{
    const root=fileURLToPath(new URL('../',import.meta.url)),args=process.argv.slice(2),options={};
    for(let i=0;i<args.length;i++){
      if(args[i]==='--check'){options.check=true;continue;}
      if(!['--base','--fragments','--out'].includes(args[i])||!args[i+1]||args[i+1].startsWith('--')||options[args[i]])throw Error('Usage: npm run art:mapping -- [--fragments DIR] [--out private-assets/mapping/classic-art-mapping.json] [--check]');
      options[args[i]]=args[++i];
    }
    const base=JSON.parse(readFileSync(resolve(root,options['--base']??'data/classic-art-mapping.json'),'utf8'));
    const folder=resolve(root,options['--fragments']??'data/art-mapping');
    const fragments=readdirSync(folder).filter(p=>p.endsWith('.json')).map(name=>({name,value:JSON.parse(readFileSync(resolve(folder,name),'utf8'))}));
    const result=compileArtMapping(base,fragments);
    let output=null;
    if(!options.check){
      output=resolve(root,options['--out']??'private-assets/mapping/classic-art-mapping.json');
      const part=relative(resolve(root,'private-assets'),output);
      if(!part||part==='..'||part.startsWith('../')||part.startsWith('..\\')||isAbsolute(part))throw Error('Compiled mappings must stay inside this worktree/private-assets');
      // Never follow a junction/symlink while writing the derived ledger.
      let cursor=root;
      for(const segment of relative(root,output).split(sep)){
        cursor=resolve(cursor,segment);
        try{if(lstatSync(cursor).isSymbolicLink())throw Error('Mapping output must not follow symlinks');}catch(error){if(error.code!=='ENOENT')throw error;}
      }
      mkdirSync(dirname(output),{recursive:true});
      writeFileSync(output,JSON.stringify(result,null,2)+'\n');
    }
    console.log(JSON.stringify({ok:true,cards:result.cards.length,fragments:fragments.length,categories:result.summary.categories,out:output}));
  }catch(error){console.error(JSON.stringify({ok:false,error:error.message}));process.exitCode=1;}
}
