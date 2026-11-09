// Session-only visual projection. Blob URLs never enter a VisualManifest.
// SPDX-License-Identifier: GPL-3.0-only
import {createVisualResolver,getCardVisual,type CardVisual} from './visuals.js';
import {ART_LIMITS,type SelectedArtFile,type VerifiedBrowserArt,type ArtProgress} from './art-import.js';
export type VisualResolver=(id:number)=>CardVisual;
export interface BrowserArtView {resolve:VisualResolver;dispose:()=>void;count:number;}
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
