// A tiny deterministic ended match, never an automated GUI game. GPL-3.0-only
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const root=fileURLToPath(new URL('../../',import.meta.url));
if(process.argv.length!==3)throw Error('Usage: node desktop/tests/make-fixture.mjs <new-local-json>');
const build=JSON.parse(readFileSync(resolve(root,'.parallel-check/r2a/game-build.json')));
const source=resolve(root,'.parallel-check/r2a/build-source-'+build.head.slice(0,12));
const server=await createServer({configFile:false,root:source,logLevel:'silent',server:{middlewareMode:true}});
try{
  const load=name=>server.ssrLoadModule(`/src/${name}.ts`);
  const {starterDeck}=await load('cards'),{startMatch}=await load('match-flow');
  const {mulligan,pass}=await load('engine'),{MatchHistory,saveMatch}=await load('match-archive');
  const settings={deck:[...starterDeck],seed:20261107,difficulty:'normal',first:'player'};
  const game=startMatch(settings);mulligan(game,0,[]);mulligan(game,1,[]);pass(game,game.turn);pass(game,game.turn);
  const storage=new Map(),port={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)};
  const history=new MatchHistory(port),error=history.add(saveMatch(game,settings,'Desktop QA fixture','desktop-qa-record'));
  if(error)throw Error(error);
  writeFileSync(resolve(process.argv[2]),JSON.stringify(Object.fromEntries(storage)),{flag:'wx'});
}finally{await server.close();}
