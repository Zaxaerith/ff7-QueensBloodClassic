import {expect,test} from 'vitest';
import {createVisualResolver,getCardVisual,numberedCardVisuals,type VisualManifest} from '../src/visuals.js';

test('all numbered cards have stable visual joins and playable placeholders without assets',()=>{
  expect(numberedCardVisuals).toHaveLength(145);
  expect(numberedCardVisuals.map(v=>v.cardId)).toEqual(Array.from({length:145},(_,i)=>i+1));
  for(const visual of numberedCardVisuals){
    expect(visual.ff7OriginalEntityId).toBe(null);expect(visual.portraitPath).toBe(null);expect(visual.preview3dPath).toBe(null);
    expect(visual.modelSources).toEqual({field:null,battle:null,world:null});expect(visual.placeholder.glyph).toBeTruthy();
  }
  expect(getCardVisual(134).cardId).toBe(134); // Assets do not enable missing rules.
  expect(getCardVisual(1010).placeholder.glyph).toBeTruthy();
});

test('importer manifest is keyed by Card ID and snapshots metadata independently of rules or names',()=>{
  const manifest:VisualManifest={version:1,cards:[{cardId:86,ff7OriginalEntityId:'user-mapping:cloud',
    modelSources:{field:{resourceId:'user-field-id',path:'assets/local/cloud.glb'},battle:{resourceId:'user-battle-id',path:null}},
    portraitPath:'assets/local/qb-086.png',preview3dPath:'assets/local/qb-086.glb'}]};
  const resolve=createVisualResolver(manifest),visual=resolve(86);
  expect(visual).toMatchObject({cardId:86,portraitPath:'assets/local/qb-086.png',modelSources:{world:null}});
  expect(visual.modelSources.field?.resourceId).toBe('user-field-id');expect(Object.isFrozen(visual.modelSources.field)).toBe(true);
  expect(resolve(87).portraitPath).toBe(null);expect(getCardVisual(86).portraitPath).toBe(null);
});

test('invalid manifests fail before resolution without changing default bindings',()=>{
  for(const portraitPath of ['../outside.png','D:\\assets\\card.png','/absolute.png','https://example.com/card.png','assets/card.png?x'])
    expect(()=>createVisualResolver({version:1,cards:[{cardId:1,portraitPath}]})).toThrow(/relative project path/);
  expect(()=>createVisualResolver({version:1,cards:[{cardId:1},{cardId:1}]})).toThrow(/Duplicate/);
  expect(()=>getCardVisual(146)).toThrow(/Card ID/);expect(getCardVisual(1).portraitPath).toBe(null);
});
