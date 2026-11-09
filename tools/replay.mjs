import {readFile} from 'node:fs/promises';
import {withRuntime} from './runtime.mjs';

if(!process.argv[2]) throw new Error('Usage: npm run replay -- path/to/replay.json');
const input=JSON.parse(await readFile(process.argv[2],'utf8'));
await withRuntime(async load=>{
  const {replayMatch,outcome}=await load('engine');
  const game=replayMatch(input);
  console.log(JSON.stringify({seed:input.seed,phase:game.phase,commands:input.commands.length,
    events:game.events.length,...outcome(game)},null,2));
});
