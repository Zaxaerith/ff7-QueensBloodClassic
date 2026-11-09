import {expect,test,afterEach} from 'vitest';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {inspectPrivatePack,readPrivatePack} from '../tools/private-pack.mjs';
import {readLocalPaths,selectArtPack} from '../tools/local-paths.mjs';
import {createVisualResolver,getCardVisual} from '../src/visuals.js';
import {loadVisualPack} from '../src/visual-pack.js';
const root=fileURLToPath(new URL('../',import.meta.url));
const scratch=resolve(root,'.parallel-check');
const folders:string[]=[];
function temp(){mkdirSync(scratch,{recursive:true});const path=mkdtempSync(resolve(scratch,'contract-'));folders.push(path);return path;}
function fixture(){
  const owner=temp(),pack=resolve(owner,'private-assets/sample');mkdirSync(resolve(pack,'portraits'),{recursive:true});mkdirSync(resolve(pack,'models'));
  // Self-authored fixture payloads; the loader treats model JSON as opaque data.
  const payloads={'portraits/synthetic.png':Buffer.from('synthetic-art'),'models/synthetic.json':Buffer.from('{"schema":"synthetic-model","version":1}')};
  const manifest={version:1 as const,cards:[{cardId:86,ff7OriginalEntityId:'fixture:cloud',modelSources:{battle:{resourceId:'fixture-aa',path:'models/synthetic.json'},field:null},portraitPath:'portraits/synthetic.png'}]};
  for(const [path,data] of Object.entries(payloads))writeFileSync(resolve(pack,path),data);
  const generatedFiles=Object.entries(payloads).map(([path,data])=>({path,size:data.length,sha256:createHash('sha256').update(data).digest('hex')}));
  writeFileSync(resolve(pack,'visual-manifest.json'),JSON.stringify(manifest));
  writeFileSync(resolve(pack,'build-report.json'),JSON.stringify({schema:'qb-local-asset-report',version:1,ok:true,generatedFiles}));
  return {owner,pack,manifest};
}
afterEach(()=>{for(const path of folders.splice(0))rmSync(path,{recursive:true,force:true});});

test('one v1 pack serves both worktrees read-only and emits the same runtime bindings',()=>{
  const {owner,pack}=fixture(),game=temp();
  const before=readFileSync(resolve(pack,'visual-manifest.json'));
  expect(()=>readPrivatePack(game,pack)).toThrow();
  const local=readPrivatePack(owner,pack),external=readPrivatePack(game,pack,{allowExternal:true});
  expect([...external]).toEqual([...local]);expect(existsSync(resolve(game,'private-assets'))).toBe(false);
  const runtime=JSON.parse(external.get('classic/visual-manifest.json')!.toString());
  expect(createVisualResolver(runtime)(86)).toMatchObject({portraitPath:'classic/portraits/synthetic.png',modelSources:{battle:{resourceId:'fixture-aa'}}});
  expect(createVisualResolver(runtime)(87)).toEqual(getCardVisual(87));
  expect(readFileSync(resolve(pack,'visual-manifest.json'))).toEqual(before);
});

test('Art Pack rejects duplicate IDs, model kinds, invalid identities and altered files before serving',()=>{
  const {owner,pack,manifest}=fixture(),path=resolve(pack,'visual-manifest.json');
  const invalid=[{...manifest,cards:[...manifest.cards,...manifest.cards]},
    {...manifest,cards:[{cardId:86,modelSources:{magic:{resourceId:'not-enabled'}}}]},
    {...manifest,cards:[{cardId:86,ff7OriginalEntityId:27}]},
    {...manifest,cards:[{cardId:86,portraitPath:'portraits/%2e%2e/secret.png'}]}];
  for(const value of invalid){writeFileSync(path,JSON.stringify(value));expect(()=>inspectPrivatePack(owner,pack)).toThrow();expect(()=>createVisualResolver(value as never)).toThrow();}
  writeFileSync(path,JSON.stringify(manifest));writeFileSync(resolve(pack,'models/synthetic.json'),'changed');
  expect(()=>readPrivatePack(owner,pack)).toThrow(/hash mismatch/);
});

test('independent illustration packs need neither models nor card-frame files',()=>{
  const {owner,pack,manifest}=fixture();
  writeFileSync(resolve(pack,'visual-manifest.json'),JSON.stringify({version:1,cards:[{cardId:86,portraitPath:manifest.cards[0].portraitPath}]}));
  const result=inspectPrivatePack(owner,pack);
  expect([...result.files.keys()]).toEqual(['classic/portraits/synthetic.png','classic/visual-manifest.json']);
});

test('explicit private path config resolves relative to its file, not the consumer worktree',()=>{
  const owner=temp(),game=temp(),config=resolve(owner,'qb.local.json');
  writeFileSync(config,JSON.stringify({version:1,sources:{battle:'input/battle.lgp'},artPacks:{'batch-01':'private-assets/batch-01'}}));
  const paths=readLocalPaths(game,config);
  expect(paths.sources.battle).toBe(resolve(owner,'input/battle.lgp'));
  expect(selectArtPack(game,'batch-01',paths)).toBe(resolve(owner,'private-assets/batch-01'));
  expect(selectArtPack(game,'toString',paths)).toBe(resolve(game,'toString'));
  expect(readLocalPaths(game)).toEqual({version:1,sources:{},artPacks:{}});
  expect(()=>readLocalPaths(game,'missing.json')).toThrow(/not found/);
});

test('malformed optional manifests fail to placeholders without changing defaults',async()=>{
  for(const cards of [[null],[{cardId:86,modelSources:[]}],[{cardId:86,modelSources:{battle:{resourceId:''}}}]]){
    const visual=await loadVisualPack(async()=>({version:1,cards}));expect(visual(86)).toEqual(getCardVisual(86));
  }
});
