// Used only inside the committed export prepared by build-windows.ps1. GPL-3.0-only
import {build} from 'vite';
import {resolve} from 'node:path';
import {readFileSync,existsSync} from 'node:fs';
const root=process.cwd(),out=resolve(root,'desktop/game');
if(existsSync(out))throw Error('Refuse to overwrite Game output');
await build({configFile:false,root:resolve(root,'site'),base:'./',publicDir:false,mode:'desktop',define:{'import.meta.env.MODE':JSON.stringify('private')},resolve:{alias:{'/src':resolve(root,'src')}},build:{outDir:out,emptyOutDir:false},plugins:[{name:'public-catalog',generateBundle(){this.emitFile({type:'asset',fileName:'catalog.json',source:readFileSync(resolve(root,'data/card-catalog.json'))});}}]});
