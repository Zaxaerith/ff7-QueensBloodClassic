import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {readLocalPaths,selectArtPack} from './local-paths.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const [command,...args]=process.argv.slice(2);
try {
  if(!['build','dev','preview'].includes(command))throw Error('Unknown private Web command');
  const options={},forward=[];
  for(let i=0;i<args.length;i++){
    const key=args[i];
    if(key==='--pack'||key==='--paths'){
      if(!args[i+1]||args[i+1].startsWith('--')||options[key])throw Error('Missing/duplicate '+key);
      options[key]=args[++i];
    }else if(key==='--mode'||key.startsWith('--mode='))throw Error('Private Web mode is fixed');
    else forward.push(key);
  }
  // Only local private development has a default. Builds and previews of
  // existing private builds retain explicit pack selection.
  const selection=options['--pack']??(command==='dev'?'private-assets/m6-e/integrated-145':undefined);
  const pack=selectArtPack(root,selection,readLocalPaths(root,options['--paths']));
  const vite=fileURLToPath(new URL('../node_modules/vite/bin/vite.js',import.meta.url));
  const result=spawnSync(process.execPath,[vite,...(command==='dev'?[]:[command]),'--mode','private',...forward],
    {cwd:root,stdio:'inherit',env:{...process.env,QB_PRIVATE_ASSETS:pack}});
  if(result.error)throw result.error;
  process.exitCode=result.status??2;
}catch(error){console.error(error.message+'\nUsage: npm run dev:private -- [--pack PATH_OR_ALIAS] [--paths CONFIG] [--port 5174]');process.exitCode=2;}
