import {expect,test} from 'vitest';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {byId,chainDeck} from '../src/cards.js';
import {createGame,createPosition,mulligan,legalMoves,pass,play,outcome,scoreBreakdown,exportReplay,replayMatch,type Game,type Player,type PositionTile} from '../src/engine.js';
import {observeGame,decideBot,recommendBot,simulateBotAction,type BotDifficulty,type BotAction} from '../src/bot.js';
import {QbSession} from '../src/session.js';
const difficulties:BotDifficulty[]=['easy','normal','hard'];
const unit=(cardId:number,owner:Player,row:number,col:number):PositionTile=>({cardId,owner,row,col});
const pawn=(owner:Player,row:number,col:number,pawns=3):PositionTile=>({owner,row,col,pawns});
const apply=(game:Game,action:BotAction)=>{if(action.type==='pass')pass(game,action.player);else play(game,action.player,action.handIndex,action.row,action.col);};

for(const player of [0,1] as const){
  const col=(c:number)=>player===0?c:4-c,enemy=(1-player) as Player;
  test(`P${player} both evaluators identify entry damage and mirrored winning lane`,()=>{
    const hands:[number[],number[]]=[[],[]];hands[player]=[20,7];
    const game=createPosition({turn:player,hands,board:[pawn(player,0,col(0),1),unit(7,enemy,0,col(1))]});
    const before=structuredClone(game);
    for(const difficulty of ['normal','hard'] as const){
      const decision=recommendBot(game,player,{difficulty,seed:7,explain:true});
      expect(decision.action).toEqual({type:'play',player,handIndex:0,row:0,col:col(0)});
      const after=simulateBotAction(game,decision.action);expect(outcome(after).scores[player]).toBe(3);
      expect(after.events.some(e=>e.type==='CardDestroyed')).toBe(true);
    }
    expect(game).toEqual(before);
  });
  test(`P${player} all difficulties return executable decisions for replacement, destruction, aura and tokens`,()=>{
    const hands:[number[],number[]]=[[],[]];hands[player]=[51,59,26,10,1010,27];hands[enemy]=[7];
    const game=createPosition({turn:player,hands,decks:[[7],[8]],board:[unit(41,player,1,col(1)),unit(13,player,2,col(0)),unit(7,enemy,0,col(1)),pawn(player,1,col(0))]});
    const before=structuredClone(game);
    for(const difficulty of difficulties){
      const decision=recommendBot(game,player,{difficulty,seed:42,maxNodes:120});
      expect(()=>simulateBotAction(game,decision.action)).not.toThrow();expect(game).toEqual(before);
      if(decision.action.type==='play'){const {handIndex,row,col}=decision.action;expect(legalMoves(game,player)).toContainEqual({handIndex,row,col});}
    }
  });
}

test('observation cannot read opposing hand IDs, either deck order, replay or private draw events',()=>{
  const game=createPosition({hands:[[7,8],[145]],decks:[[95],[107]],board:[pawn(0,1,0)]});
  const guarded=(rows:number[])=>new Proxy(rows,{get(target,key,receiver){if(key!=='length')throw Error('Hidden information accessed');return Reflect.get(target,key,receiver);}});
  game.hands[1]=guarded(game.hands[1]);game.decks=[guarded(game.decks[0]),guarded(game.decks[1])];
  Object.defineProperty(game,'replay',{get(){throw Error('Hidden replay accessed');}});Object.defineProperty(game,'events',{get(){throw Error('Hidden events accessed');}});
  const view=observeGame(game);expect(view.enemyHandCount).toBe(1);expect(view.deckCounts).toEqual([1,1]);
  expect(()=>decideBot(view,{difficulty:'hard',seed:9})).not.toThrow();
  expect(Object.keys(view).sort()).toEqual(['board','deckCounts','discard','enemyHandCount','hand','nextInstanceId','passes','player','rulesVersion']);
});
test('identical public information and seed yield identical decisions despite different secrets',()=>{
  const a=createPosition({hands:[[20,7],[145,51]],decks:[[13,7],[1,8]],board:[pawn(0,1,0),pawn(1,1,4)]});
  const b=structuredClone(a);b.hands[1]=[39,26];b.decks=[[145,107],[96,88]];b.replay.seed=100;b.events=[];
  for(const difficulty of difficulties)expect(recommendBot(a,0,{difficulty,seed:5,explain:true})).toEqual(recommendBot(b,0,{difficulty,seed:5,explain:true}));
});
test('all difficulties can close an already winning match, including terminal bonuses',()=>{
  const game=createPosition({passes:1,hands:[[7],[8]],board:[unit(53,0,0,0),unit(7,1,0,4),pawn(0,1,0)]});
  for(const difficulty of difficulties)expect(recommendBot(game,0,{difficulty})).toMatchObject({action:{type:'pass',player:0},reason:'连续 PASS 可以锁定胜局'});
});
test('Hard considers dangerous public counterplay that Normal does not',()=>{
  const game=createPosition({hands:[[11],[5]],board:[pawn(0,0,1,2),pawn(0,1,0,2),pawn(1,0,2,2),unit(20,1,0,4)]});
  const normal=recommendBot(game,0,{difficulty:'normal',seed:5}),hard=recommendBot(game,0,{difficulty:'hard',seed:5,explain:true});
  expect(normal.action).toMatchObject({type:'play',row:0});expect(hard.action).toMatchObject({type:'play',row:1});
  expect(hard.stats.depth).toBe(2);expect(hard.candidates?.some(c=>c.replies>0)).toBe(true);
});
test('no placement and no hand remain valid PASS; two passes end and preserve the original simulation input',()=>{
  for(const difficulty of difficulties){
    const game=createPosition({passes:1,hands:[[],[]],board:[]}),before=structuredClone(game);
    const decision=recommendBot(game,0,{difficulty});expect(decision.action).toEqual({type:'pass',player:0});
    expect(simulateBotAction(game,decision.action).phase).toBe('finished');expect(game).toEqual(before);
  }
});
test('engine simulation preserves generated-hand vs draw behavior and aura destruction',()=>{
  const game=createPosition({hands:[[10,51],[]],decks:[[8],[]],board:[pawn(0,1,0),unit(41,0,1,1)]});
  const before=structuredClone(game),after=simulateBotAction(game,{type:'play',player:0,handIndex:0,row:1,col:0});
  expect(after.hands[0]).toEqual([51,1010]);expect(game).toEqual(before);
  expect(()=>simulateBotAction(game,{type:'play',player:0,handIndex:0,row:2,col:4})).toThrow();expect(game).toEqual(before);
});
test('Hard includes a death-generated opposing token response even when the opponent originally held no cards',()=>{
  const game=createPosition({hands:[[20],[]],board:[pawn(0,0,0,1),unit(40,1,0,1),pawn(1,1,4,1)]});
  const result=recommendBot(game,0,{difficulty:'hard',seed:7,explain:true});
  const attack=result.candidates!.find(c=>c.action.type==='play');
  expect(attack?.replies).toBeGreaterThan(1);expect(game.hands[1]).toEqual([]);
});
test('Hard models a turn draw into an empty opposing hand using public reply hypotheses',()=>{
  const game=createPosition({hands:[[7],[]],decks:[[],[145]],board:[pawn(0,1,0,1),pawn(1,1,4,1)]});
  const options={difficulty:'hard',seed:66,explain:true} as const;
  const result=recommendBot(game,0,options);
  expect(result.candidates!.find(candidate=>candidate.action.type==='play')?.replies).toBeGreaterThan(1);
  const other=structuredClone(game);other.decks[1]=[51];
  expect(recommendBot(other,0,options)).toEqual(result);
});
test('large branch counts always obey explicit node budgets with deterministic fallback',()=>{
  const game=createPosition({hands:[[...byId.keys()].filter(id=>id<146),[7]],board:Array.from({length:15},(_,i)=>pawn(0,Math.floor(i/5),i%5))});
  for(const difficulty of difficulties)for(const maxNodes of [1,7,31]){
    const decision=recommendBot(game,0,{difficulty,maxNodes,seed:701});
    expect(decision.stats.nodes).toBeLessThanOrEqual(maxNodes);expect(()=>simulateBotAction(game,decision.action)).not.toThrow();
    expect(decision).toEqual(recommendBot(game,0,{difficulty,maxNodes,seed:701}));
  }
  for(const options of [{difficulty:'bad'},{seed:-1},{maxNodes:0},{maxNodes:513}])expect(()=>recommendBot(game,0,options as never)).toThrow();
});
test('Session Bot queries are read-only and old legal/play operations consume the returned action',()=>{
  const session=new QbSession();session.execute([{op:'importPosition',position:{hands:[[20],[1]],board:[pawn(0,0,0),unit(7,1,0,1)]}}]);
  const before=session.execute([{op:'state'}]);
  const response=session.execute([{op:'bot',difficulty:'hard',seed:7,explain:true}]);expect(response.ok).toBe(true);expect(session.execute([{op:'state'}])).toEqual(before);
  const decision=(response.results[0] as {result:ReturnType<typeof recommendBot>}).result;
  expect(session.execute([{...decision.action,op:decision.action.type}]).ok).toBe(true);
  const saved=session.execute([{op:'state'}]);expect(session.execute([{op:'bot',player:0}]).ok).toBe(false);expect(session.execute([{op:'state'}])).toEqual(saved);
});
for(const first of [0,1] as const)test(`complete API match first P${first}, deterministic decisions and JSON replay`,()=>{
  const game=createGame([chainDeck,chainDeck],701,first);mulligan(game,0,[]);mulligan(game,1,[]);
  let turns=0;
  while(game.phase==='playing'&&turns<100){apply(game,recommendBot(game,game.turn,{difficulty:game.turn===0?'normal':'easy',seed:701+turns,maxNodes:64}).action);turns++;}
  expect(game.phase).toBe('finished');expect(turns).toBeLessThan(100);expect(replayMatch(exportReplay(game))).toEqual(game);
  expect(scoreBreakdown(game).awards.reduce((sum,r)=>sum+r[0],0)).toBe(outcome(game).scores[0]);
});
test('actual JSON CLI compares all three difficulties on an unchanged imported fixture',()=>{
  const input=readFileSync(new URL('../examples/cli/bot-vs-bot.json',import.meta.url),'utf8');
  const cli=spawnSync(process.execPath,['tools/qb-cli.mjs'],{cwd:new URL('../',import.meta.url),input,encoding:'utf8'});
  expect(cli.status).toBe(0);const response=JSON.parse(cli.stdout);expect(response.ok).toBe(true);
  expect(response.results.slice(1,4).map((r:any)=>r.result.difficulty)).toEqual(difficulties);
  expect(response.results.at(-1).result.replay.commands).toEqual([]);
});
