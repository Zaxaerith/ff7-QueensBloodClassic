// No Python or proprietary data is needed for ordinary Web play/builds.
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const [command,...args]=process.argv.slice(2);
if(!['inspect','build','test'].includes(command)){
  console.error('Usage: node tools/assets-cli.mjs inspect|build [--source PATH ...] | test');process.exitCode=2;
} else {
  const script=fileURLToPath(new URL(command==='test'?'./asset-tests.py':'./assets.py',import.meta.url));
  const result=spawnSync(process.env.QB_PYTHON??'python',[script,...(command==='test'?[]:[command]),...args],
    {stdio:'inherit',env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});
  if(result.error)console.error('Python 3.10+ is required for local asset tools. Set QB_PYTHON to its executable. '+result.error.message);
  process.exitCode=result.status??2;
}
