import {test,expect,vi} from 'vitest';
import {createHash} from 'node:crypto';
import {deflateSync} from 'node:zlib';
import {ART_LIMITS,checkPng,verifyBrowserArt,type SelectedArtFile} from '../src/art-import.js';
import {ArtImportClient,projectBrowserArt,type ImportWorker} from '../src/browser-art.js';
import {createVisualResolver,getCardVisual} from '../src/visuals.js';

const hash=(b:Uint8Array|string)=>createHash('sha256').update(b).digest('hex');
function chunk(name:string,bytes:Buffer){
  const body=Buffer.concat([Buffer.from(name),bytes]);let crc=0xffffffff;
  for(const value of body){crc^=value;for(let i=0;i<8;i++)crc=(crc&1)?0xedb88320^(crc>>>1):crc>>>1;}
  const out=Buffer.alloc(bytes.length+12);out.writeUInt32BE(bytes.length);body.copy(out,4);out.writeUInt32BE((crc^0xffffffff)>>>0,out.length-4);return out;
}
// Self-authored one-pixel RGBA PNG; no game artwork is a test input.
const header=Buffer.from([0,0,0,1,0,0,0,1,8,6,0,0,0]);
const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(Buffer.from([0,10,20,30,255]))),chunk('IEND',Buffer.alloc(0))]);
function fixture(){
  const manifest={version:1,cards:[{cardId:86,ff7OriginalEntityId:'synthetic:entity',portraitPath:'portraits/test.png',modelSources:{battle:{resourceId:'synthetic-aa',path:'models/test.json'}}}]};
  const payloads:Record<string,string|Uint8Array>={'portraits/test.png':png,'models/test.json':'{"schema":"synthetic"}'};
  const report={schema:'qb-local-asset-report',version:1,ok:true,generatedFiles:Object.entries(payloads).map(([path,b])=>({path,sha256:hash(b),size:typeof b==='string'?Buffer.byteLength(b):b.byteLength}))};
  const files=()=>Object.entries({'visual-manifest.json':JSON.stringify(manifest),'build-report.json':JSON.stringify(report),...payloads}).map(([path,b])=>({relativePath:'Pack #1%/'+path,file:new Blob([b as BlobPart])}));
  return {manifest,report,payloads,files};
}
const decode=vi.fn(async()=>{});
const verify=(files:SelectedArtFile[],signal?:AbortSignal)=>verifyBrowserArt(files,()=>{},signal,decode);

test('v1 adapter strips only selected root, checks hashes/models and leaves original manifest paths intact',async()=>{
  const f=fixture(),read=vi.fn(()=>Promise.reject(Error('must not read auxiliary executable')));
  const extra={relativePath:'Pack #1%/review.html',file:{size:3,arrayBuffer:read} as unknown as Blob};
  const p=await verify([...f.files(),extra]);expect(read).not.toHaveBeenCalled();expect(p.name).toBe('Pack #1%');expect(p.numberedPortraits).toBe(1);
  expect(p.manifest.cards[0]!.portraitPath).toBe('portraits/test.png');expect(p.portraits).toHaveLength(1);expect(decode).toHaveBeenCalled();
});
test('legacy successful v1 without status, size or manifest hash stays compatible',async()=>{
  const f=fixture();f.report.generatedFiles=f.report.generatedFiles.map(({path,sha256})=>({path,sha256}) as never);
  expect((await verify(f.files())).numberedPortraits).toBe(1);
});
test('failed, cancelled and incompatible reports are rejected',async()=>{
  for(const patch of [{ok:false},{version:2},{version:true},{status:'cancelled'}]){
    const f=fixture();Object.assign(f.report,patch);await expect(verify(f.files())).rejects.toThrow(/完成|版本/);
  }
});
test('unknown manifest versions, IDs, duplicate IDs and reserved fields are rejected',async()=>{
  const patches=[{version:2},{cards:[{cardId:146}]},{cards:[{cardId:true}]},{cards:[{cardId:86},{cardId:86}]},{cards:[{cardId:86,preview3dPath:'models/test.json'}]},{cards:[{cardId:86,modelSources:{magic:{resourceId:'x'}}}]}];
  for(const patch of patches){const f=fixture();Object.assign(f.manifest,patch);await expect(verify(f.files())).rejects.toThrow();}
});
test('missing images, mismatched hashes and sizes are rejected',async()=>{
  const f=fixture();await expect(verify(f.files().filter(f=>!f.relativePath.endsWith('test.png')))).rejects.toThrow(/缺少文件/);
  f.payloads['portraits/test.png']='tampered';await expect(verify(f.files())).rejects.toThrow(/SHA-256|大小/);
});
test('listed manifest hash is verified, including modifications to otherwise valid metadata',async()=>{
  const f=fixture(),body=JSON.stringify(f.manifest);f.report.generatedFiles.push({path:'visual-manifest.json',sha256:hash(body),size:body.length});
  await verify(f.files());f.manifest.cards[0]!.cardId=87;await expect(verify(f.files())).rejects.toThrow(/SHA-256/);
});
test('duplicate logical paths, case collisions and report paths are rejected',async()=>{
  const f=fixture(),rows=f.files();await expect(verify([...rows,rows[0]!])).rejects.toThrow(/重复/);
  await expect(verify([...rows,{...rows[0]!,relativePath:rows[0]!.relativePath.toUpperCase().replace('PACK #1%','Pack #1%')}])).rejects.toThrow(/重复/);
  f.report.generatedFiles.push(f.report.generatedFiles[0]!);await expect(verify(f.files())).rejects.toThrow(/重复/);
});
test('absolute, parent, encoded, backslash and multiple-root file paths fail',async()=>{
  const f=fixture();for(const path of ['/root/x','C:/x','root/../x','root/%2e/x','root\\x','root//x','root/./x'])await expect(verify([{relativePath:path,file:new Blob()}])).rejects.toThrow();
  await expect(verify([...f.files(),{relativePath:'another/root',file:new Blob()}])).rejects.toThrow(/根文件夹/);
  f.manifest.cards[0]!.portraitPath='portraits/../outside.png';await expect(verify(f.files())).rejects.toThrow();
});
test('install directories and oversized lists/metadata/read budgets fail before reading',async()=>{
  await expect(verify([{relativePath:'install/battle.lgp',file:new Blob()}])).rejects.toThrow(/Art Pack/);
  const file={size:ART_LIMITS.selectionBytes+1,arrayBuffer:vi.fn()} as unknown as Blob;
  await expect(verify([{relativePath:'pack/huge',file}])).rejects.toThrow(/2GiB/);expect(file.arrayBuffer).not.toHaveBeenCalled();
  await expect(verify(Array.from({length:ART_LIMITS.files+1},()=>({relativePath:'pack/x',file:new Blob()})))).rejects.toThrow(/4096/);
  const f=fixture(),rows=f.files();rows[0]={relativePath:'Pack #1%/visual-manifest.json',file:{size:ART_LIMITS.manifestBytes+1,arrayBuffer:vi.fn()} as unknown as Blob};await expect(verify(rows)).rejects.toThrow(/限制/);
});
test('PNG completeness, signature, CRC and bounds are validated before decoding',async()=>{
  expect(checkPng(png)).toEqual({width:1,height:1});
  for(const bytes of [png.subarray(0,png.length-1),Buffer.concat([png,Buffer.from([0])]),Buffer.from('not PNG')])expect(()=>checkPng(bytes)).toThrow();
  const altered=Buffer.from(png);altered[altered.length-1]^=1;expect(()=>checkPng(altered)).toThrow(/CRC/);
  const f=fixture();f.payloads['portraits/test.png']=Buffer.from('bad');f.report.generatedFiles[0]!.sha256=hash('bad');f.report.generatedFiles[0]!.size=3;await expect(verify(f.files())).rejects.toThrow(/PNG/);
});
test('browser decoder errors and cancellation discard the candidate',async()=>{
  const f=fixture();await expect(verifyBrowserArt(f.files(),()=>{},undefined,async()=>{throw Error('cannot decode');})).rejects.toThrow(/cannot decode/);
  const controller=new AbortController();controller.abort();await expect(verify(f.files(),controller.signal)).rejects.toMatchObject({name:'AbortError'});
});
test('blob projection never modifies manifest; URLs remain until replacement/disposal',async()=>{
  const f=fixture(),p=await verify(f.files()),original=JSON.stringify(p.manifest),urls={createObjectURL:vi.fn(()=> 'blob:synthetic-url'),revokeObjectURL:vi.fn()};
  const a=projectBrowserArt(p,urls);expect(a.resolve(86).portraitPath).toBe('blob:synthetic-url');expect(a.resolve(1)).toEqual(getCardVisual(1));
  expect(JSON.stringify(p.manifest)).toBe(original);expect(()=>createVisualResolver({version:1,cards:[{cardId:86,portraitPath:'blob:synthetic-url'}]})).toThrow();
  expect(urls.revokeObjectURL).not.toHaveBeenCalled();a.dispose();a.dispose();expect(urls.revokeObjectURL).toHaveBeenCalledTimes(1);
});
test('failed projection revokes already-created URLs without replacing another pack',async()=>{
  const p=await verify(fixture().files());const bad={...p,manifest:{version:1 as const,cards:[...p.manifest.cards,{cardId:87,portraitPath:'portraits/missing.png'}]}};
  const urls={createObjectURL:vi.fn(()=> 'blob:temp'),revokeObjectURL:vi.fn()};expect(()=>projectBrowserArt(bad,urls)).toThrow();expect(urls.revokeObjectURL).toHaveBeenCalledWith('blob:temp');
});
test('old Worker completion cannot win after cancel or a newer import',async()=>{
  const workers:ImportWorker[]=[],create=()=>{const w:ImportWorker={onmessage:null,onerror:null,postMessage:vi.fn(),terminate:vi.fn()};workers.push(w);return w;};
  const client=new ArtImportClient(create),progress=vi.fn();const first=client.verify([],progress),old=workers[0]!.onmessage!;
  const second=client.verify([],progress);expect(await first).toBeNull();old({data:{type:'verified',pack:{name:'old'}}} as MessageEvent);
  workers[1]!.onmessage!({data:{type:'verified',pack:{name:'new'}}} as MessageEvent);expect(await second).toMatchObject({name:'new'});expect(workers[0]!.terminate).toHaveBeenCalledOnce();
  const third=client.verify([],progress);client.cancel();expect(await third).toBeNull();
});
