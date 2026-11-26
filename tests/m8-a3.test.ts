import {afterEach,expect,test,vi} from 'vitest';
import {assessBotRoot,botOptionsForMatch,botSimulation,decideBot,DEFAULT_BOT_NODES,evaluateBotPosition,observeGame,simulateBotAction,type BotDifficulty,type BotOptions} from '../src/bot.js';
import {strategyForOpponent,strategyScore,type BotStrategy} from '../src/bot-strategy.js';
import {BotClient,type BotRequest,type BotWorkerPort} from '../src/bot-client.js';
import {challengers} from '../src/challengers.js';
import {byId,starterDeck} from '../src/cards.js';
import {createPosition,exportReplay,mulligan,replayMatch,type Game} from '../src/engine.js';
import {restoreMatch,saveMatch} from '../src/match-archive.js';
import {startMatch,type MatchSettings} from '../src/match-flow.js';
import {MatchPresentation} from '../src/match-presentation.js';
import {locales} from '../src/i18n/locales.js';
import {setLocale} from '../src/i18n/index.js';
const difficulties:BotDifficulty[]=['easy','normal','hard'];
const strategies:BotStrategy[]=['neutral','nene','zogan','isabelle'];
const frontier=()=>createPosition({turn:1,hands:[[],[1,9,13,31]],board:[
  {row:1,col:0,owner:0,cardId:1},{row:1,col:3,owner:1,pawns:2},
  {row:0,col:3,owner:1,pawns:1},{row:2,col:3,owner:1,pawns:1},
]});
const support=()=>createPosition({turn:1,hands:[[],[1,9,13,31]],board:[
  {row:0,col:0,owner:0,cardId:8},{row:1,col:0,owner:0,cardId:1},{row:2,col:3,owner:1,cardId:48},
  {row:0,col:3,owner:1,pawns:2},{row:1,col:3,owner:1,pawns:2},{row:2,col:4,owner:1,pawns:1},
]});
const ranks=()=>createPosition({turn:1,hands:[[],[1,98,96,21]],board:[
  {row:0,col:0,owner:0,cardId:20},{row:1,col:0,owner:0,cardId:20},{row:2,col:0,owner:0,cardId:20},
  {row:1,col:3,owner:1,pawns:2},{row:1,col:2,owner:1,pawns:1},
]});
afterEach(()=>{vi.useRealTimers();setLocale('zh-CN');});
test('stable NPC IDs select preferences independently of difficulty; mirror and unknown IDs stay neutral',()=>{
  const view=observeGame(frontier());
  for(const difficulty of difficulties)for(const id of strategies){
    const settings={difficulty,...(id==='neutral'?{}:{opponent:{npcId:id}})};
    expect(botOptionsForMatch(view,settings)).toMatchObject({difficulty,strategy:id});
  }
  expect(strategyForOpponent('Nene')).toBe('neutral');expect(strategyForOpponent('bad-id')).toBe('neutral');
  expect(()=>decideBot(view,{strategy:'Nene'} as unknown as BotOptions)).toThrow('Unknown Bot strategy');
});
test('same board, hand and seed produce an expansion vs support decision difference without card-name rules',()=>{
  const game=frontier(),view=observeGame(game),before=structuredClone(game);
  const nene=decideBot(view,{strategy:'nene',difficulty:'normal',seed:701,explain:true});
  const zogan=decideBot(view,{strategy:'zogan',difficulty:'normal',seed:701,explain:true});
  expect(nene.action).toEqual({type:'play',player:1,handIndex:0,row:0,col:3});
  expect(zogan.action).toEqual({type:'play',player:1,handIndex:2,row:2,col:3});
  expect(nene.action).not.toEqual(zogan.action);expect(game).toEqual(before);
  for(const d of [nene,zogan])expect(()=>simulateBotAction(game,d.action)).not.toThrow();
});
test('resolved amplification chain increases Zogan preference; stronger universal moves may coincide',()=>{
  const game=support(),view=observeGame(game),action={type:'play',player:1,handIndex:3,row:1,col:3} as const;
  const trial=simulateBotAction(game,action),base=assessBotRoot(trial,view,action).score;
  expect(trial.board[2][3].card?.enhancedOnce).toBe(true);
  expect(trial.events.some(e=>e.type==='CardEnhanced')).toBe(true);
  expect(assessBotRoot(trial,view,action,'zogan').score).toBeGreaterThan(base);
  for(const strategy of strategies)expect(decideBot(view,{strategy,difficulty:'normal',seed:701}).action).toEqual(action);
});
test('Isabelle rewards rank preparation and actual generated power, only with a held spawn payoff',()=>{
  const game=ranks(),view=observeGame(game),action={type:'play',player:1,handIndex:1,row:1,col:3} as const;
  const prepared=simulateBotAction(game,action),bonus=strategyScore(prepared,1,'isabelle');
  expect(prepared.board[1][2].pawns).toBe(3);
  const withoutPayoff=structuredClone(prepared);withoutPayoff.hands[1]=withoutPayoff.hands[1].filter(id=>id!==96);
  expect(bonus).toBeGreaterThan(strategyScore(withoutPayoff,1,'isabelle'));
  const shiva=prepared.hands[1].indexOf(96),ready=structuredClone(prepared);ready.turn=1;
  const resolved=simulateBotAction(ready,{type:'play',player:1,handIndex:shiva,row:1,col:2});
  expect(resolved.events.some(e=>e.type==='CardSpawned')).toBe(true);
  expect(strategyScore(resolved,1,'isabelle')).toBeGreaterThan(0);
  expect(assessBotRoot(prepared,view,action,'isabelle').score).toBeGreaterThan(assessBotRoot(prepared,view,action).score);
});
test.each(difficulties)('%s respects existing budgets and executes each profile on a fixed board',difficulty=>{
  const game=frontier(),view=observeGame(game);
  for(const strategy of strategies){
    const decision=decideBot(view,{difficulty,strategy,seed:701});
    expect(decision.strategy).toBe(strategy);expect(decision.stats.maxNodes).toBe(DEFAULT_BOT_NODES[difficulty]);
    expect(decision.stats.nodes).toBeLessThanOrEqual(DEFAULT_BOT_NODES[difficulty]);
    expect(decision.stats.exhausted).toBe(false);expect(decision.stats.rejected).toBe(0);
    expect(()=>simulateBotAction(game,decision.action)).not.toThrow();
  }
  expect(decideBot(view,{difficulty,seed:701})).toEqual(decideBot(view,{difficulty,strategy:'neutral',seed:701}));
});
test('every profile preserves a winning second PASS and an actual no-placement PASS',()=>{
  const game=createPosition({turn:1,passes:1,hands:[[],[1]],board:[{row:0,col:4,owner:1,cardId:21},{row:1,col:4,owner:1,pawns:1}]});
  const empty=createPosition({turn:1,hands:[[],[]],board:[]});
  for(const strategy of strategies)for(const difficulty of difficulties){
    expect(decideBot(observeGame(game),{strategy,difficulty,seed:701}).action.type).toBe('pass');
    expect(decideBot(observeGame(empty),{strategy,difficulty,seed:701}).stats.exhausted).toBe(false);
  }
});
test('unknown future draw IDs never become tactical hand facts, but known generated cards do',()=>{
  const game=createPosition({hands:[[51],[]],decks:[[145],[]],board:[
    {owner:0,row:1,col:0,cardId:13},{owner:0,row:0,col:0,pawns:1},{owner:0,row:2,col:4,cardId:7},
  ]});
  const view=observeGame(game),action={type:'play',player:0,handIndex:0,row:2,col:4} as const;
  const root=simulateBotAction(botSimulation(view),action),leaf=simulateBotAction(root,{type:'pass',player:1});
  expect(root.hands[0]).toEqual([]);expect(leaf.hands[0]).toEqual([1]);
  const noPhantom=structuredClone(leaf);noPhantom.hands[0]=[];
  expect(assessBotRoot(leaf,view,action,'zogan').score-assessBotRoot(leaf,view,action).score).toBe(0);
  const hard=decideBot(view,{difficulty:'hard',strategy:'zogan',seed:1,explain:true});
  const replacement=hard.candidates!.find(c=>JSON.stringify(c.action)===JSON.stringify(action))!;
  expect(replacement.replies).toBe(1);
  expect(replacement.score).toBeCloseTo(evaluateBotPosition(leaf,0).score,3);
  expect(strategyScore(leaf,0,'zogan',[])).toBe(strategyScore(noPhantom,0,'zogan',[]));
  const generated=structuredClone(leaf);generated.events.push({seq:generated.events.length+1,type:'CardAddedToHand',player:0,cardId:1,reason:'generated'});
  expect(assessBotRoot(generated,view,action,'zogan').score-assessBotRoot(generated,view,action).score).toBeCloseTo(.63);
});
test('Nene rank preference survives hard replies and does not reward passing for a spent opening',()=>{
  const tied=createPosition({hands:[[12,9],[]],board:[{owner:0,row:2,col:4,pawns:2}]});
  for(const difficulty of ['normal','hard'] as const){
    const result=decideBot(observeGame(tied),{difficulty,strategy:'nene',seed:1,maxNodes:40,explain:true});
    const scores=[0,1].map(index=>result.candidates!.find(c=>c.action.type==='play'&&c.action.handIndex===index)!.score);
    expect(scores[0]-scores[1]).toBeCloseTo(.6);
  }
  const last=createPosition({hands:[[5],[]],board:[{owner:0,row:1,col:4,pawns:1},{owner:1,row:1,col:0,cardId:7}]});
  for(const difficulty of difficulties)expect(decideBot(observeGame(last),{difficulty,strategy:'nene',seed:1,maxNodes:20}).action.type).toBe('play');
});
test('a spent first-enhanced flag alone never earns a current support bonus',()=>{
  const fresh=createPosition({hands:[[],[]],board:[{owner:0,row:1,col:0,cardId:48}]}),spent=structuredClone(fresh);
  spent.board[1][0].card!.enhancedOnce=true;
  expect(strategyScore(spent,0,'zogan')).toBe(strategyScore(fresh,0,'zogan'));
});
test('all locales preserve profiles, public seed and decisions; hidden IDs and shuffle seed have no influence',()=>{
  const game=frontier();game.hands[0]=[7];game.decks=[[8],[9]];
  const copy=structuredClone(game);copy.hands[0]=[145];copy.decks=[[133],[122]];copy.replay.seed=999;
  const forbidden=()=>{throw Error('hidden state read');};
  const hidden=structuredClone(game);
  hidden.hands[0]=new Proxy([7],{get(target,key,receiver){if(key!=='length')forbidden();return Reflect.get(target,key,receiver);}});
  hidden.decks=hidden.decks.map(deck=>new Proxy(deck,{get(target,key,receiver){if(key!=='length')forbidden();return Reflect.get(target,key,receiver);}})) as Game['decks'];
  Object.defineProperty(hidden,'replay',{get:forbidden});Object.defineProperty(hidden,'events',{get:forbidden});
  const publicView=observeGame(hidden,1);expect(publicView).toEqual(observeGame(copy,1));
  for(const strategy of strategies){
    const settings={difficulty:'normal' as const,...(strategy==='neutral'?{}:{opponent:{npcId:strategy}})};
    const options=botOptionsForMatch(publicView,settings),baseline=decideBot(publicView,options);
    for(const locale of locales){setLocale(locale);expect(botOptionsForMatch(observeGame(copy),settings)).toEqual(options);expect(decideBot(publicView,options)).toEqual(baseline);}
  }
});
class Worker implements BotWorkerPort {
  onmessage:BotWorkerPort['onmessage']=null;onerror:BotWorkerPort['onerror']=null;request?:BotRequest;terminated=false;
  postMessage(request:BotRequest){this.request=request;}terminate(){this.terminated=true;}
  reply(){const r=this.request!;this.onmessage?.({data:{ok:true,decision:decideBot(r.view,r.options)}} as MessageEvent);}
}
test('NPC pending Continue cancels late replies, keeps saved identity despite menu changes and commits once',async()=>{
  vi.useFakeTimers();const npc=challengers[1];
  const settings:MatchSettings={deck:starterDeck,seed:701,difficulty:'normal',first:'computer',opponent:{npcId:npc.id,deck:npc.deck}};
  let game=startMatch(settings);mulligan(game,0,[]);mulligan(game,1,[]);
  const saved=saveMatch(game,settings,'NPC','m8-a3'),restored=restoreMatch(saved);let active=restored.save.settings;
  game=restored.game;const workers:Worker[]=[],client=new BotClient(()=>{const worker=new Worker();workers.push(worker);return worker;});
  const checkpoints:ReturnType<typeof saveMatch>[]=[];
  const choose=vi.fn(()=>{const view=observeGame(game);return client.choose(view,botOptionsForMatch(view,active));});
  const p=new MatchPresentation({game:()=>game,choose,cancelBot:()=>client.cancel(),checkpoint:()=>{checkpoints.push(saveMatch(game,active,'NPC','m8-a3'));return null;},completed:()=>null,changed:()=>{},result:()=>{}},()=>true);
  p.resume();const first=workers[0],before=exportReplay(game);p.pause();
  const menu={...settings,difficulty:'easy' as const,opponent:{npcId:'nene',deck:challengers[0].deck}};
  expect(menu.opponent.npcId).not.toBe(active.opponent?.npcId);
  first.reply();await vi.runAllTimersAsync();expect(exportReplay(game)).toEqual(before);expect(first.terminated).toBe(true);
  active=restoreMatch(saved).save.settings;p.resume();p.resume();expect(choose).toHaveBeenCalledTimes(2);
  expect(workers[1].request!.options).toMatchObject({strategy:'zogan',difficulty:'normal'});
  workers[1].reply();first.reply();await vi.runAllTimersAsync();
  expect(game.replay.commands.length).toBe(before.commands.length+1);expect(checkpoints).toHaveLength(1);
  expect(replayMatch(exportReplay(game))).toEqual(game);expect(restoreMatch(checkpoints[0]).game).toEqual(game);
  expect(startMatch(active).replay.decks[1]).toEqual(npc.deck);
  p.pause();p.resume();await vi.runAllTimersAsync();expect(choose).toHaveBeenCalledTimes(2);p.pause();
});
