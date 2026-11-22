import {readFileSync,realpathSync,statSync} from 'node:fs';
import {dirname,isAbsolute,relative,resolve,sep} from 'node:path';
import type {Plugin} from 'vite';

const namespace='/__qb-private-audio/v1/';
const routes={matchLoop:`${namespace}match-loop.wav`,victory:`${namespace}victory.wav`} as const;
const maxWaveBytes=16*1024*1024;
type TrackId=keyof typeof routes;
type Loop={sampleRateHz:number;startFrame:number;endFrameExclusive:number};
type Track={id:TrackId;bytes:Buffer;loop?:Loop};

function object(value:unknown):value is Record<string,unknown>{
  return typeof value==='object'&&value!==null&&!Array.isArray(value);
}

function localFile(lab:string,path:string,maxBytes:number):string{
  const file=realpathSync(path);
  const inside=relative(lab,file);
  if(!inside||inside==='..'||inside.startsWith(`..${sep}`)||isAbsolute(inside)){
    throw new Error('Audio Pack file is outside the audio lab');
  }
  const stat=statSync(file);
  if(!stat.isFile()||stat.size===0||stat.size>maxBytes)throw new Error('Invalid Audio Pack file size');
  return file;
}

function waveInfo(bytes:Buffer):{sampleRate:number;frames:number}{
  if(bytes.length<12||bytes.toString('ascii',0,4)!=='RIFF'||bytes.toString('ascii',8,12)!=='WAVE'
      ||bytes.readUInt32LE(4)+8!==bytes.length)throw new Error('Expected a RIFF WAV file');
  let sampleRate=0,dataSize=0;
  let offset=12;
  while(offset+8<=bytes.length){
    const name=bytes.toString('ascii',offset,offset+4);
    const size=bytes.readUInt32LE(offset+4),start=offset+8;
    offset=start+size+(size%2);
    if(offset>bytes.length)throw new Error('Invalid WAV chunk size');
    if(name==='fmt '){
      if(size<16||bytes.readUInt16LE(start)!==1||bytes.readUInt16LE(start+2)!==2
          ||bytes.readUInt16LE(start+12)!==4||bytes.readUInt16LE(start+14)!==16){
        throw new Error('Expected stereo 16-bit PCM');
      }
      sampleRate=bytes.readUInt32LE(start+4);
    }else if(name==='data')dataSize=size;
  }
  if(offset!==bytes.length||!sampleRate||!dataSize||dataSize%4)throw new Error('Invalid WAV sample data');
  return {sampleRate,frames:dataSize/4};
}

function readLoop(value:unknown,sampleRate:number,frames:number):Loop{
  if(!object(value))throw new Error('Missing loop metadata');
  const {sampleRateHz,startFrame,endFrameExclusive}=value;
  if(sampleRateHz!==sampleRate||typeof startFrame!=='number'||!Number.isSafeInteger(startFrame)
      ||typeof endFrameExclusive!=='number'||!Number.isSafeInteger(endFrameExclusive)
      ||startFrame<0||endFrameExclusive<=startFrame||endFrameExclusive>frames){
    throw new Error('Invalid loop bounds for WAV');
  }
  return {sampleRateHz,startFrame,endFrameExclusive};
}

function readAudioPack(root:string,selection:string,warn:(message:string)=>void):Track[]{
  const lab=resolve(realpathSync(root),'private-audio');
  let config:string,entries:Record<string,unknown>;
  try{
    if(relative(lab,realpathSync(lab)))throw new Error('Audio lab is redirected');
    config=localFile(lab,resolve(root,selection),16*1024);
    const pack:unknown=JSON.parse(readFileSync(config,'utf8').replace(/^\uFEFF/,''));
    if(!object(pack)||pack.version!==1||!object(pack.tracks))throw new Error('Invalid Audio Pack version');
    entries=pack.tracks;
  }catch{
    warn('[QB audio] Audio Pack v1 config is missing or invalid. Private audio is disabled.');
    return [];
  }

  const tracks:Track[]=[];
  for(const id of Object.keys(routes) as TrackId[]){
    const entry=entries[id];
    if(entry===undefined)continue;
    try{
      if(!object(entry)||typeof entry.wav!=='string'||!entry.wav.toLowerCase().endsWith('.wav')
          ||isAbsolute(entry.wav)||/[\\:%?#]/.test(entry.wav)||entry.wav.split('/').some(part=>!part||part==='..')){
        throw new Error('Invalid relative WAV path');
      }
      const bytes=readFileSync(localFile(lab,resolve(dirname(config),entry.wav),maxWaveBytes));
      const {sampleRate,frames}=waveInfo(bytes);
      tracks.push(id==='matchLoop'?{id,bytes,loop:readLoop(entry.loop,sampleRate,frames)}:{id,bytes});
    }catch{
      warn(`[QB audio] ${id} is unavailable. Check its WAV path, PCM format and loop metadata.`);
    }
  }
  return tracks;
}

export function privateAudio(root:string):Plugin{
  let bootstrap:string|undefined;
  return {
    name:'qb-private-audio',
    apply:(_config,{command,mode,isPreview})=>command==='serve'&&mode==='private'&&!isPreview,
    configureServer(server){
      const selection=process.env.QB_PRIVATE_AUDIO_CONFIG;
      if(!selection)return;
      const {host,https,middlewareMode}=server.config.server;
      if(middlewareMode||(host!=='127.0.0.1'&&host!=='::1')){
        server.config.logger.warn('[QB audio] Private audio requires a loopback dev server.');
        return;
      }
      const tracks=readAudioPack(root,selection,message=>server.config.logger.warn(message));
      if(!tracks.length)return;
      const files=new Map<string,Buffer>(tracks.map(({id,bytes})=>[routes[id],bytes]));
      bootstrap=JSON.stringify({version:1,tracks:Object.fromEntries(
        tracks.map(({id,loop})=>[id,{url:routes[id],...(loop?{loop}:{})}]),
      )});
      server.middlewares.use((request,response,next)=>{
        const url=request.url??'';
        if(!url.startsWith(namespace)){next();return;}
        const requestHost=request.headers.host??'';
        const {origin,'sec-fetch-site':site}=request.headers;
        const sameOrigin=`${https?'https':'http'}://${requestHost}`;
        response.setHeader('Cache-Control','no-store');
        if(!/^(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/i.test(requestHost)
            ||(origin&&origin!==sameOrigin)||(site&&site!=='same-origin'&&site!=='none')){
          response.writeHead(403).end();return;
        }
        const bytes=files.get(url);
        if(!bytes){response.writeHead(404).end();return;}
        if(request.method!=='GET'){response.writeHead(405,{Allow:'GET'}).end();return;}
        response.writeHead(200,{
          'Content-Type':'audio/wav',
          'Content-Length':bytes.length,
          'Cross-Origin-Resource-Policy':'same-origin',
        }).end(bytes);
      });
    },
    transformIndexHtml(_html,{server}){
      if(server&&bootstrap)return [{tag:'script',attrs:{id:'qb-private-audio',type:'application/json'},
        children:bootstrap,injectTo:'head'}];
    },
  };
}
