import {fileURLToPath} from 'node:url';
import {readLocalPaths,selectArtPack} from './local-paths.mjs';
import {inspectPrivatePack} from './private-pack.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
try{
  const args=process.argv.slice(2),options={};
  for(let i=0;i<args.length;i++){
    if(!['--pack','--paths'].includes(args[i])||!args[i+1]||args[i+1].startsWith('--')||options[args[i]])throw Error('Usage: npm run art:validate -- --pack PATH_OR_ALIAS [--paths CONFIG]');
    options[args[i]]=args[++i];
  }
  const pack=selectArtPack(root,options['--pack'],readLocalPaths(root,options['--paths']));
  const result=inspectPrivatePack(root,pack,{allowExternal:true});
  console.log(JSON.stringify({ok:true,version:1,pack:result.directory,cards:result.manifest.cards.map(c=>c.cardId),files:result.files.size},null,2));
}catch(error){console.error(JSON.stringify({ok:false,error:error.message}));process.exitCode=1;}
