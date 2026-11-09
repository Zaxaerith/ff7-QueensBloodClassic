// Presentation metadata only. The rules engine and card definitions do not
// import this module; cardId is the join key even after a display-name change.
import {assetPath,checkVisualId,modelKinds,validateVisualManifest,type ModelKind,type ModelReference,type VisualOverride,type VisualManifest} from '../shared/visual-manifest.mjs';
export type {ModelKind,ModelReference,VisualOverride,VisualManifest} from '../shared/visual-manifest.mjs';
export interface CardVisual {
  readonly cardId: number;
  readonly ff7OriginalEntityId: string | null;
  readonly modelSources: Readonly<Record<ModelKind, ModelReference | null>>;
  readonly portraitPath: string | null;
  readonly preview3dPath: string | null;
  readonly placeholder: Readonly<{kind:'glyph'; glyph:string; label:string}>;
}
const glyphs:Readonly<Record<number,string>>={8:'♞',9:'♟',12:'♧',13:'✦',21:'♜',144:'✧'};
function binding(id:number,override?:VisualOverride):CardVisual {
  checkVisualId(id);
  const modelSources:Record<ModelKind,ModelReference|null>={field:null,battle:null,world:null};
  for(const kind of modelKinds){
    const source=override?.modelSources?.[kind];
    if(source){
      if(typeof source.resourceId!=='string'||!source.resourceId.trim())throw new Error('Model resourceId is required');
      modelSources[kind]=Object.freeze({resourceId:source.resourceId,path:assetPath(source.path)});
    }
  }
  const entity=override?.ff7OriginalEntityId??null;
  if(entity!==null&&(typeof entity!=='string'||!entity.trim()))throw new Error('Invalid FF7 Original entity identifier');
  return Object.freeze({cardId:id,ff7OriginalEntityId:entity,modelSources:Object.freeze(modelSources),
    portraitPath:assetPath(override?.portraitPath),preview3dPath:assetPath(override?.preview3dPath),
    placeholder:Object.freeze({kind:'glyph' as const,glyph:glyphs[id]??'◆',label:`卡牌 #${String(id).padStart(3,'0')} · 资源待导入`})});
}
/** Validate and snapshot an optional importer manifest. No asset is loaded here. */
export function createVisualResolver(manifest?:VisualManifest):(cardId:number)=>CardVisual {
  const resolved=new Map<number,CardVisual>();
  if(manifest){
    validateVisualManifest(manifest);
    for(const override of manifest.cards){
      if(resolved.has(override.cardId))throw new Error('Duplicate visual Card ID');
      resolved.set(override.cardId,binding(override.cardId,override));
    }
  }
  return (cardId:number)=>{
    const existing=resolved.get(cardId);
    if(existing)return existing;
    const fallback=binding(cardId);resolved.set(cardId,fallback);return fallback;
  };
}
export const getCardVisual=createVisualResolver();
/** Includes cards whose rules are still unavailable; assets never imply rules coverage. */
export const numberedCardVisuals:readonly CardVisual[]=Object.freeze(Array.from({length:145},(_,i)=>getCardVisual(i+1)));
