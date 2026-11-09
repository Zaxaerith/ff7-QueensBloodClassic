import {createVisualResolver,getCardVisual,type CardVisual,type VisualManifest} from './visuals.js';
/** Missing/malformed packs are presentation failures and never touch a game. */
export async function loadVisualPack(load:()=>Promise<unknown>):Promise<(cardId:number)=>CardVisual>{
  try {return createVisualResolver(await load() as VisualManifest);}catch{return getCardVisual;}
}
