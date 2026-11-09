import {expect,test} from 'vitest';
import {readFileSync,mkdirSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {readPrivatePack} from '../tools/private-pack.mjs';
import {loadVisualPack} from '../src/visual-pack.js';
import {getCardVisual} from '../src/visuals.js';
const root=fileURLToPath(new URL('../',import.meta.url));
test('the art recipe contains only the five approved sample cards with explicit action and camera direction',()=>{
  const recipe=JSON.parse(readFileSync(resolve(root,'data/classic-models.json'),'utf8'));
  expect(recipe.models).toHaveLength(5);expect(recipe.models.flatMap((m:{cardIds:number[]})=>m.cardIds).sort()).toEqual([86,87,88,89,90]);
  for(const spec of recipe.models){expect(spec.art.focusBone).toBe('head');expect(spec.art.zoom).toBeGreaterThan(1);expect(Math.abs(spec.art.roll)).toBeGreaterThan(0);expect(spec.frame).toBeGreaterThan(0);}
});
test('missing or malformed visual manifests fall back without a game dependency',async()=>{
  for(const load of [async()=>{throw Error('404');},async()=>({version:2,cards:[]}),async()=>({version:1,cards:[{cardId:86,portraitPath:'../outside.png'}]})]){
    const resolve=await loadVisualPack(load);expect(resolve(86)).toEqual(getCardVisual(86));
  }
});
test('a private pack explicitly joins Card ID to verified file hashes, rejects tampering and traversal',async()=>{
  const base=resolve(root,'private-assets');mkdirSync(base,{recursive:true});const folder=mkdtempSync(resolve(base,'web-fixture-'));
  try{
    mkdirSync(resolve(folder,'portraits'));const bytes=Buffer.from('synthetic-test-image');writeFileSync(resolve(folder,'portraits/synthetic.png'),bytes);
    const manifest={version:1,cards:[{cardId:86,ff7OriginalEntityId:'synthetic:fixture',portraitPath:'portraits/synthetic.png',modelSources:{},preview3dPath:null}]};
    writeFileSync(resolve(folder,'visual-manifest.json'),JSON.stringify(manifest));
    writeFileSync(resolve(folder,'build-report.json'),JSON.stringify({schema:'qb-local-asset-report',version:1,ok:true,generatedFiles:[{path:'portraits/synthetic.png',sha256:createHash('sha256').update(bytes).digest('hex')}]}));
    const files=readPrivatePack(root,folder);expect(files.get('classic/portraits/synthetic.png')).toEqual(bytes);
    expect(JSON.parse(files.get('classic/visual-manifest.json')!.toString()).cards[0].portraitPath).toBe('classic/portraits/synthetic.png');
    const previous=process.env.QB_PRIVATE_ASSETS;process.env.QB_PRIVATE_ASSETS=folder;
    try{
      const {default:factory}=await import('../vite.config.js');const config=await (factory as Function)({command:'build',mode:'private'});
      expect(config.build.outDir).toBe('../dist-private');const emitted:string[]=[];
      config.plugins[0].generateBundle.call({emitFile:(asset:{fileName:string})=>emitted.push(asset.fileName)});
      expect(emitted).toEqual(['catalog.json','classic/portraits/synthetic.png','classic/visual-manifest.json']);
    }finally{if(previous===undefined)delete process.env.QB_PRIVATE_ASSETS;else process.env.QB_PRIVATE_ASSETS=previous;}
    writeFileSync(resolve(folder,'portraits/synthetic.png'),'changed');expect(()=>readPrivatePack(root,folder)).toThrow(/hash mismatch/);
    manifest.cards[0].portraitPath='../outside.png';writeFileSync(resolve(folder,'visual-manifest.json'),JSON.stringify(manifest));expect(()=>readPrivatePack(root,folder)).toThrow(/path/);
  }finally{rmSync(folder,{recursive:true,force:true});}
});
test('public Vite mode never loads private manifests even when a private path is configured',async()=>{
  const previous=process.env.QB_PRIVATE_ASSETS;process.env.QB_PRIVATE_ASSETS='private-assets/does-not-exist';
  try{
    const {default:factory}=await import('../vite.config.js');
    const config=await (factory as Function)({command:'build',mode:'production'});expect(config.build.outDir).toBe('../dist');
    const emitted:string[]=[];config.plugins[0].generateBundle.call({emitFile:(asset:{fileName:string})=>emitted.push(asset.fileName)});
    expect(emitted).toEqual(['catalog.json']);
  }finally{if(previous===undefined)delete process.env.QB_PRIVATE_ASSETS;else process.env.QB_PRIVATE_ASSETS=previous;}
  expect(readFileSync(resolve(root,'src/engine.ts'),'utf8')).not.toContain('visuals');
});
