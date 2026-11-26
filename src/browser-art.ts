// Session and optional local IndexedDB visual projection. Blob URLs never enter a VisualManifest.
// SPDX-License-Identifier: GPL-3.0-only
import {validateVisualManifest,type VisualManifest} from '../shared/visual-manifest.mjs';
import {createVisualResolver,type CardVisual} from './visuals.js';
import {ART_LIMITS,type SelectedArtFile,type VerifiedBrowserArt,type ArtProgress} from './art-import.js';
export type VisualResolver=(id:number)=>CardVisual;
export interface BrowserArtView {resolve:VisualResolver;dispose:()=>void;count:number;}
export const ART_CACHE_DB='qbclassic.artpack.v1';
const ART_CACHE_STORE='packs',ART_CACHE_KEY='active';

interface CachedArtRecord {
  version:1;
  name:string;
  manifest:VisualManifest;
  portraits:[string,Blob][];
  numberedPortraits:number;
  readBytes:number;
  savedAt:number;
}

function resolveIdb(factory?:IDBFactory|null):IDBFactory|null {
  if(factory!==undefined)return factory;
  try{return (globalThis as {indexedDB?:IDBFactory}).indexedDB??null;}
  catch{return null;}
}

function openArtCacheDb(factory?:IDBFactory|null):Promise<IDBDatabase|null> {
  const idb=resolveIdb(factory);
  if(!idb||typeof idb.open!=='function')return Promise.resolve(null);
  return new Promise(resolve=>{
    try{
      const request=idb.open(ART_CACHE_DB,1);
      request.onupgradeneeded=()=>{
        const db=request.result;
        if(!db.objectStoreNames.contains(ART_CACHE_STORE))db.createObjectStore(ART_CACHE_STORE);
      };
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>resolve(null);
      request.onblocked=()=>resolve(null);
    }catch{resolve(null);}
  });
}

function isBlobLike(value:unknown):value is Blob {
  if(typeof Blob!=='undefined'&&value instanceof Blob)return true;
  return Boolean(value&&typeof value==='object'&&typeof (value as Blob).size==='number'&&typeof (value as Blob).type==='string');
}

function parseCachedArt(value:unknown):VerifiedBrowserArt|null {
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const record=value as Partial<CachedArtRecord>;
  if(record.version!==1||typeof record.name!=='string'||!record.name||typeof record.numberedPortraits!=='number'||!Array.isArray(record.portraits))return null;
  try{validateVisualManifest(record.manifest);}catch{return null;}
  const portraits:[string,Blob][]=[];
  for(const entry of record.portraits){
    if(!Array.isArray(entry)||entry.length!==2||typeof entry[0]!=='string'||!isBlobLike(entry[1]))return null;
    portraits.push([entry[0],entry[1]]);
  }
  return {
    name:record.name,
    manifest:record.manifest as VisualManifest,
    portraits,
    numberedPortraits:record.numberedPortraits,
    readBytes:typeof record.readBytes==='number'?record.readBytes:0,
  };
}

export async function saveCachedArtPack(pack:VerifiedBrowserArt,factory?:IDBFactory|null):Promise<boolean> {
  const db=await openArtCacheDb(factory);
  if(!db)return false;
  return new Promise(resolve=>{
    let settled=false;
    const finish=(ok:boolean)=>{
      if(settled)return;
      settled=true;
      try{db.close();}catch{}
      resolve(ok);
    };
    try{
      const tx=db.transaction(ART_CACHE_STORE,'readwrite');
      const record:CachedArtRecord={
        version:1,
        name:pack.name,
        manifest:pack.manifest,
        portraits:pack.portraits,
        numberedPortraits:pack.numberedPortraits,
        readBytes:pack.readBytes,
        savedAt:Date.now(),
      };
      tx.objectStore(ART_CACHE_STORE).put(record,ART_CACHE_KEY);
      tx.oncomplete=()=>finish(true);
      tx.onerror=()=>finish(false);
      tx.onabort=()=>finish(false);
    }catch{finish(false);}
  });
}

export async function loadCachedArtPack(factory?:IDBFactory|null):Promise<VerifiedBrowserArt|null> {
  const db=await openArtCacheDb(factory);
  if(!db)return null;
  return new Promise(resolve=>{
    let settled=false;
    const finish=(value:VerifiedBrowserArt|null)=>{
      if(settled)return;
      settled=true;
      try{db.close();}catch{}
      resolve(value);
    };
    try{
      const tx=db.transaction(ART_CACHE_STORE,'readonly');
      const request=tx.objectStore(ART_CACHE_STORE).get(ART_CACHE_KEY);
      request.onsuccess=()=>finish(parseCachedArt(request.result));
      request.onerror=()=>finish(null);
      tx.onerror=()=>finish(null);
      tx.onabort=()=>finish(null);
    }catch{finish(null);}
  });
}

export async function clearCachedArtPack(factory?:IDBFactory|null):Promise<boolean> {
  const db=await openArtCacheDb(factory);
  if(!db)return false;
  return new Promise(resolve=>{
    let settled=false;
    const finish=(ok:boolean)=>{
      if(settled)return;
      settled=true;
      try{db.close();}catch{}
      resolve(ok);
    };
    try{
      const tx=db.transaction(ART_CACHE_STORE,'readwrite');
      tx.objectStore(ART_CACHE_STORE).delete(ART_CACHE_KEY);
      tx.oncomplete=()=>finish(true);
      tx.onerror=()=>finish(false);
      tx.onabort=()=>finish(false);
    }catch{finish(false);}
  });
}
export function projectBrowserArt(pack:VerifiedBrowserArt,urls:Pick<typeof URL,'createObjectURL'|'revokeObjectURL'>=URL):BrowserArtView{
  const base=createVisualResolver(pack.manifest),blobs=new Map(pack.portraits),values=new Map<number,CardVisual>(),owned:string[]=[];
  try{for(const card of pack.manifest.cards){const visual=base(card.cardId);if(visual.portraitPath){const blob=blobs.get(visual.portraitPath);if(!blob)throw Error('缺少已验证的PNG');const path=urls.createObjectURL(blob);owned.push(path);values.set(card.cardId,Object.freeze({...visual,portraitPath:path}));}}}
  catch(error){for(const url of owned)urls.revokeObjectURL(url);throw error;}
  let disposed=false;
  return {count:pack.numberedPortraits,resolve:id=>values.get(id)??base(id),dispose:()=>{if(disposed)return;disposed=true;for(const url of owned)urls.revokeObjectURL(url);values.clear();}};
}
export interface ImportWorker {onmessage:((e:MessageEvent)=>void)|null;onerror:((e:ErrorEvent)=>void)|null;postMessage:(v:unknown)=>void;terminate:()=>void;}
export class ArtImportClient {
  private stop:(()=>void)|undefined;
  constructor(private factory:()=>ImportWorker=()=>new Worker(new URL('./art-import.worker.ts',import.meta.url),{type:'module'})){}
  cancel(){this.stop?.();}
  verify(files:SelectedArtFile[],progress:(p:ArtProgress)=>void):Promise<VerifiedBrowserArt|null>{
    this.cancel();
    if(files.length>ART_LIMITS.files)return Promise.reject(Error('文件数量超过4096；请选择生成后的Art Pack'));
    return new Promise((resolve,reject)=>{
      let done=false,worker:ImportWorker|undefined;
      const finish=(result:VerifiedBrowserArt|null,error?:unknown)=>{if(done)return;done=true;worker?.terminate();this.stop=undefined;error?reject(error):resolve(result);};
      this.stop=()=>finish(null);
      try{worker=this.factory();worker.onmessage=e=>{if(done)return;const data=e.data;if(data.type==='progress')progress(data.progress);else if(data.type==='verified')finish(data.pack);else finish(null,Error(data.message??'卡包验证失败'));};worker.onerror=()=>finish(null,Error('卡图校验Worker不可用'));worker.postMessage({files});}
      catch(error){finish(null,error);}
    });
  }
}

/** Change only image elements, keeping board controls, focus and Workers intact. */
export function refreshRenderedArtwork(root:ParentNode,resolve:VisualResolver){
  const update=(hero:HTMLElement,visual:CardVisual,unknown=false)=>{
    const old=hero.querySelector<HTMLImageElement>('img.qb-image, img');
    if(old?.getAttribute('src')===visual.portraitPath)return;
    const fallback=()=>{hero.classList.add('qb-art--missing');if(unknown)hero.replaceChildren(document.createTextNode(visual.placeholder.glyph));};
    old?.remove();
    if(!visual.portraitPath){fallback();return;}
    hero.classList.remove('qb-art--missing');
    if(unknown)hero.replaceChildren();
    const image=document.createElement('img');image.className='qb-image';
    image.alt=old?.alt??hero.parentElement?.querySelector('.qb-name')?.textContent??`卡牌 #${visual.cardId} 插画`;
    if(hero.hasAttribute('data-art-lazy')){image.loading='lazy';image.decoding='async';}
    image.addEventListener('error',()=>{if(image.parentElement===hero){image.hidden=true;fallback();}},{once:true});
    const placeholder=hero.querySelector('.qb-placeholder');if(placeholder)placeholder.after(image);else hero.prepend(image);
    image.src=visual.portraitPath;
  };
  for(const card of Array.from(root.querySelectorAll<HTMLElement>('.qb-card[data-card-id]'))){
    const id=Number(card.dataset.cardId),hero=card.querySelector<HTMLElement>('.qb-hero');if(hero)update(hero,resolve(id));
  }
  // The existing unavailable-card view prints a stable #ID, including #134.
  // Read only that identifier; never infer it from a name or asset filename.
  for(const card of Array.from(root.querySelectorAll<HTMLElement>('.unavailable-card'))){
    const id=/^#(\d+)\s/.exec(card.querySelector('h3')?.textContent??''),hero=card.querySelector<HTMLElement>('.unknown-hero');
    if(id&&hero)update(hero,resolve(Number(id[1])),true);
  }
}
