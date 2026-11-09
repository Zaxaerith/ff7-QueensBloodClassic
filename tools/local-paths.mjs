// Machine-private paths only. This file never writes to an Art Pack or source.
import {existsSync,readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
export function readLocalPaths(root,explicit,env=process.env){
  const selected=explicit??env.QB_LOCAL_PATHS;
  const file=resolve(root,selected??'qb.local.json');
  if(!existsSync(file)){
    if(selected)throw Error('Local paths file not found: '+file);
    return {version:1,sources:{},artPacks:{}};
  }
  const value=JSON.parse(readFileSync(file,'utf8'));
  if(value?.version!==1)throw Error('Unsupported local paths version');
  const paths=(rows,allowed)=>{
    if(rows===undefined)return {};
    if(rows===null||typeof rows!=='object'||Array.isArray(rows))throw Error('Local path entries must be an object');
    return Object.fromEntries(Object.entries(rows).map(([key,path])=>{
      if(!/^[a-z][a-z0-9-]*$/.test(key)||allowed&&!allowed.includes(key)||typeof path!=='string'||!path.trim())throw Error('Invalid local path entry: '+key);
      return [key,resolve(dirname(file),path)];
    }));
  };
  return {version:1,sources:paths(value.sources,['game','field','world','battle','menu','bindings']),artPacks:paths(value.artPacks)};
}
export function selectArtPack(root,pack,paths){
  if(typeof pack!=='string'||!pack.trim())throw Error('Select an Art Pack with --pack PATH_OR_ALIAS');
  return Object.hasOwn(paths.artPacks,pack)?paths.artPacks[pack]:resolve(root,pack);
}
