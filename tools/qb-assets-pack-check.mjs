// Optional Game-side read-only verification. Not a Python generator dependency.
// SPDX-License-Identifier: GPL-3.0-only
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {inspectPrivatePack} from './private-pack.mjs';
import {withRuntime} from './runtime.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
try {
  if(process.argv.length!==3)throw Error('Usage: node tools/qb-assets-pack-check.mjs <explicit-pack-path>');
  const path=resolve(process.argv[2]);
  const before=readFileSync(resolve(path,'build-report.json'));
  const report=JSON.parse(before);
  const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
  const verify=()=>{
    for(const row of report.generatedFiles)assert.equal(hash(readFileSync(resolve(path,row.path))),row.sha256,row.path);
    assert.deepEqual(readFileSync(resolve(path,'build-report.json')),before);
  };
  verify();
  const pack=inspectPrivatePack(root,path,{allowExternal:true});
  const runtime=JSON.parse(pack.files.get('classic/visual-manifest.json').toString());
  let fallbackCount=0;
  await withRuntime(async load=>{
    const {loadVisualPack}=await load('visual-pack');
    const {getCardVisual}=await load('visuals');
    const visual=await loadVisualPack(async()=>runtime);
    const listed=new Set(runtime.cards.map(c=>c.cardId));
    for(const card of runtime.cards){
      assert.equal(visual(card.cardId).portraitPath,card.portraitPath);
      assert(pack.files.has(card.portraitPath));
      assert.equal(pack.files.get(card.portraitPath).subarray(0,8).toString('hex'),'89504e470d0a1a0a');
    }
    for(let id=1;id<=145;id++)if(!listed.has(id)){
      assert.deepEqual(visual(id),getCardVisual(id));fallbackCount++;
    }
    const absent=await loadVisualPack(async()=>{throw Error('No Art Pack selected');});
    assert.deepEqual(absent(86),getCardVisual(86));
  });
  verify();
  console.log(JSON.stringify({ok:true,cards:runtime.cards.map(c=>c.cardId),runtimeFiles:pack.files.size,
    fallbackCards:fallbackCount,noPackFallback:true,allOutputHashesUnchanged:true,gameRulesTouched:false}));
}catch(error){console.error(JSON.stringify({ok:false,error:error.message}));process.exitCode=1;}
