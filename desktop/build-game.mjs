// Build the SAME committed Game with its existing opt-in visual loader enabled.
// No private pack, source checkout mutation or second game implementation.
// SPDX-License-Identifier: GPL-3.0-only
import {spawnSync} from 'node:child_process';
import {mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {build} from 'vite';
const root=fileURLToPath(new URL('../',import.meta.url));
const git=(...args)=>{const r=spawnSync('git',args,{cwd:root,windowsHide:true,maxBuffer:16*1024*1024});if(r.status!==0)throw Error('Git source read failed: '+args[0]);return r.stdout;};
const head=git('rev-parse','HEAD').toString().trim();
const source=resolve(root,'.parallel-check/r2a/build-source-'+head.slice(0,12));
const output=resolve(root,'desktop/game');
if(existsSync(output))throw Error('desktop/game already exists; preserve it or explicitly choose a new build task. No automatic overwrite.');
const files=git('ls-tree','-r','--name-only','HEAD','--','src','site','shared','data/card-catalog.json').toString().trim().split('\n');
const inputs=[];
for(const path of files){
  if(!/^(?:src|site|shared|data)\/[A-Za-z0-9_./-]+$/.test(path)||path.split('/').includes('..'))throw Error('Unexpected Git source path');
  const bytes=git('show',`HEAD:${path}`),target=resolve(source,path);mkdirSync(dirname(target),{recursive:true});writeFileSync(target,bytes);
  inputs.push({path,sha256:createHash('sha256').update(bytes).digest('hex')});
}
await build({configFile:false,root:resolve(source,'site'),base:'./',publicDir:false,mode:'desktop',
  // The existing Game gates its loader on MODE==='private'. Enable that branch
  // only in this explicit desktop artifact; do not run Vite's private pack plugin.
  define:{'import.meta.env.MODE':JSON.stringify('private')},
  resolve:{alias:{'/src':resolve(source,'src')}},
  build:{outDir:output,emptyOutDir:false},
  plugins:[{name:'desktop-public-catalog',generateBundle(){this.emitFile({type:'asset',fileName:'catalog.json',source:git('show','HEAD:data/card-catalog.json')});}}]});
writeFileSync(resolve(root,'.parallel-check/r2a/game-build.json'),JSON.stringify({head,source:'Committed Git HEAD only',inputs,output:'desktop/game',privateFilesRead:false,gameSourceModified:false},null,2)+'\n');
console.log('Desktop Game built from '+head+'; no Art Pack was read or included.');
