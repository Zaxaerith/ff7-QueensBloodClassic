// Browser File adapter for the unchanged Art Pack v1. No network or storage.
// SPDX-License-Identifier: GPL-3.0-only
import {assetPath,validateVisualManifest,type VisualManifest} from '../shared/visual-manifest.mjs';

export const ART_LIMITS=Object.freeze({files:4096,selectionBytes:2*1024**3,manifestBytes:2*1024**2,reportBytes:8*1024**2,fileBytes:16*1024**2,readBytes:256*1024**2,cards:1024,imageSide:4096});
export interface SelectedArtFile {relativePath:string;file:Blob;}
export interface ArtProgress {checked:number;total:number;path:string;}
export interface VerifiedBrowserArt {name:string;manifest:VisualManifest;portraits:[string,Blob][];numberedPortraits:number;readBytes:number;}
type Decode=(blob:Blob,width:number,height:number)=>Promise<void>;
const object=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
function fail(message:string):never {throw Error(message);}
const crcTable=Uint32Array.from({length:256},(_,i)=>{let v=i;for(let b=0;b<8;b++)v=v&1?0xedb88320^(v>>>1):v>>>1;return v>>>0;});

/** PNG signature/chunk bounds/CRC and a complete IEND, then browser decoding. */
export function checkPng(bytes:Uint8Array):{width:number;height:number}{
  const signature=[137,80,78,71,13,10,26,10];
  if(bytes.length<45||signature.some((v,i)=>bytes[i]!==v))fail('图片不是完整PNG');
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  let at=8,chunks=0,width=0,height=0,data=false,ended=false;
  while(at<bytes.length){
    if(++chunks>10000||at+12>bytes.length)fail('PNG区块损坏或过多');
    const length=view.getUint32(at),end=at+12+length;
    if(end>bytes.length)fail('PNG被截断');
    const type=String.fromCharCode(...bytes.subarray(at+4,at+8));
    if(!/^[A-Za-z]{4}$/.test(type))fail('PNG区块类型无效');
    let crc=0xffffffff;for(let p=at+4;p<end-4;p++)crc=crcTable[(crc^bytes[p]!)&255]!^(crc>>>8);
    if(((crc^0xffffffff)>>>0)!==view.getUint32(end-4))fail('PNG区块CRC不匹配');
    if(chunks===1){
      if(type!=='IHDR'||length!==13)fail('PNG缺少IHDR');
      width=view.getUint32(at+8);height=view.getUint32(at+12);
      if(!width||!height||width>ART_LIMITS.imageSide||height>ART_LIMITS.imageSide)fail('PNG尺寸超过4096或无效');
    }else if(type==='IHDR')fail('PNG重复IHDR');
    if(type==='acTL')fail('当前卡图仅接受静态PNG，不接受动画PNG');
    if(type==='IDAT')data=true;
    if(type==='IEND'){if(length||end!==bytes.length||!data)fail('PNG结束区块无效');ended=true;}
    at=end;
  }
  if(!ended)fail('PNG缺少完整IEND');
  return {width,height};
}

async function decodePng(blob:Blob,width:number,height:number){
  if(typeof createImageBitmap!=='function')fail('浏览器不支持后台PNG解码；请使用新版Edge或Chrome');
  const image=await createImageBitmap(blob);
  try{if(image.width!==width||image.height!==height)fail('PNG解码尺寸不一致');}finally{image.close();}
}

/** Sequential bounded reads; only referenced runtime assets and two JSON files. */
export async function verifyBrowserArt(selected:readonly SelectedArtFile[],progress:(p:ArtProgress)=>void=()=>{},signal?:AbortSignal,decode:Decode=decodePng):Promise<VerifiedBrowserArt>{
  const check=()=>{if(signal?.aborted)throw new DOMException('已取消卡图验证','AbortError');};
  check();
  if(!selected.length||selected.length>ART_LIMITS.files)fail('文件数量无效或超过4096；请选择生成后的Art Pack文件夹');
  if(!globalThis.crypto?.subtle)fail('无法使用SHA-256；请在HTTPS或localhost中打开游戏');
  const files=new Map<string,Blob>(),folded=new Set<string>();let root='',selectionBytes=0,readBytes=0;
  for(const {relativePath,file} of selected){
    check();
    if(typeof relativePath!=='string'||relativePath.includes('\\')||/^[\\/]|^[a-z][a-z\d+.-]*:|[\x00-\x1f]/i.test(relativePath))fail('选择文件包含非法路径');
    const parts=relativePath.split('/'),prefix=parts.shift();
    if(!prefix||prefix==='.'||prefix==='..'||!parts.length)fail('缺少文件夹相对路径；请使用目录选择入口');
    if(root&&root!==prefix)fail('一次只能选择一个Art Pack根文件夹');root=prefix;
    const path=assetPath(parts.join('/'))!;
    const key=path.toLowerCase();if(folded.has(key))fail('重复逻辑文件路径：'+path);folded.add(key);
    if(!file||!Number.isSafeInteger(file.size)||file.size<0)fail('无效的本地文件');
    selectionBytes+=file.size;if(selectionBytes>ART_LIMITS.selectionBytes)fail('所选目录超过2GiB；请选择卡包而非游戏安装');
    files.set(path,file);
  }
  const read=async(path:string,limit:number)=>{
    check();const file=files.get(path);if(!file)fail('缺少文件：'+path);
    if(file!.size>limit||readBytes+file!.size>ART_LIMITS.readBytes)fail('文件或累计读取量超过限制：'+path);
    readBytes+=file!.size;
    const data=await file!.arrayBuffer();check();
    if(data.byteLength!==file!.size)fail('文件读取长度发生变化：'+path);
    return data;
  };
  const parse=(bytes:ArrayBuffer,name:string):Record<string,unknown>=>{
    try{const value:unknown=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));if(!object(value))fail('需要JSON对象');return value as Record<string,unknown>;}catch{ return fail('无法读取JSON：'+name);}
  };
  if(!files.has('visual-manifest.json')||!files.has('build-report.json'))fail('缺少visual-manifest.json或build-report.json；请选择已生成Art Pack，不是FF7安装目录');
  const report=parse(await read('build-report.json',ART_LIMITS.reportBytes),'build-report.json');
  if(report.schema!=='qb-local-asset-report'||report.version!==1||report.ok!==true||report.status!==undefined&&report.status!=='complete')fail('卡包未成功完成、已取消或Report版本不兼容');
  if(!Array.isArray(report.generatedFiles)||report.generatedFiles.length>20000)fail('Report缺少有效文件哈希清单');
  const listed=new Map<string,{sha256:string;size?:number}>(),listFolded=new Set<string>();
  for(const row of report.generatedFiles){
    if(!object(row)||typeof row.path!=='string'||typeof row.sha256!=='string'||!/^[a-f0-9]{64}$/.test(row.sha256))fail('Report含无效文件哈希');
    const path=assetPath(row.path)!;
    if(listFolded.has(path.toLowerCase()))fail('Report含重复逻辑路径：'+path);listFolded.add(path.toLowerCase());
    if(row.size!==undefined&&(!Number.isSafeInteger(row.size)||Number(row.size)<0))fail('Report含无效文件大小');
    listed.set(path,{sha256:row.sha256,...(row.size===undefined?{}:{size:row.size as number})});
  }
  const hash=async(bytes:ArrayBuffer)=>{const value=await crypto.subtle.digest('SHA-256',bytes);check();return Array.from(new Uint8Array(value),n=>n.toString(16).padStart(2,'0')).join('');};
  const match=async(path:string,bytes:ArrayBuffer)=>{const row=listed.get(path);if(!row||row.size!==undefined&&row.size!==bytes.byteLength||await hash(bytes)!==row.sha256)fail('文件SHA-256或大小不匹配：'+path);};
  const manifestBytes=await read('visual-manifest.json',ART_LIMITS.manifestBytes);
  // v1 legacy reports need not list the manifest; when listed its hash is binding.
  if(listed.has('visual-manifest.json'))await match('visual-manifest.json',manifestBytes);
  const raw=parse(manifestBytes,'visual-manifest.json');validateVisualManifest(raw);
  const manifest=raw as unknown as VisualManifest;
  if(manifest.cards.length>ART_LIMITS.cards)fail('Manifest条目超过1024');
  const needed=new Map<string,'png'|'model'>();
  for(const card of manifest.cards){
    if(card.preview3dPath!=null)fail('Art Pack v1尚不支持3D交付');
    if(card.portraitPath){if(!/^portraits\/[a-z0-9-]+\.png$/.test(card.portraitPath))fail('卡图路径不符合v1交付约定');needed.set(card.portraitPath,'png');}
    for(const source of Object.values(card.modelSources??{}))if(source?.path){if(!/^models\/[a-z0-9-]+\.json$/.test(source.path))fail('模型路径不符合v1交付约定');needed.set(source.path,'model');}
  }
  const portraits:[string,Blob][]=[];let checked=0;
  progress({checked,total:needed.size,path:'验证清单'});
  for(const [path,kind] of needed){
    const bytes=await read(path,ART_LIMITS.fileBytes);await match(path,bytes);
    if(kind==='png'){
      try{const size=checkPng(new Uint8Array(bytes)),blob=new Blob([bytes],{type:'image/png'});await decode(blob,size.width,size.height);check();portraits.push([path,blob]);}
      catch(error){check();fail(`PNG无法验证：${path} · ${error instanceof Error?error.message:String(error)}`);}
    }
    progress({checked:++checked,total:needed.size,path});
  }
  check();
  return {name:root,manifest,portraits,readBytes,numberedPortraits:manifest.cards.filter(c=>c.cardId<=145&&c.portraitPath).length};
}
