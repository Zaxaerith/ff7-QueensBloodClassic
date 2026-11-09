import {test,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {createPosition,pass,play,exportReplay,outcome,type Game,type Player} from '../src/engine.js';
import {byId} from '../src/cards.js';
import {observeGame,simulateBotAction,botActions,botSimulation,assessBotRoot} from '../src/bot.js';
import {analyzeDecision,historicalDecision,type ReplayAnalysis} from '../src/replay-analysis.js';
import {ReplayTimeline} from '../src/match-archive.js';
import {QbSession} from '../src/session.js';

const passMove=(player:Player=0)=>({type:'pass' as const,player});
const fixture=(player:Player=0)=>{
  const enemy=(1-player) as Player,col=(n:number)=>player===0?n:4-n,hands:[number[],number[]]=[[],[]];hands[player]=[20,7];
  return createPosition({turn:player,hands,board:[{owner:player,row:0,col:col(0),pawns:1},{owner:enemy,row:0,col:col(1),cardId:7}]});
};
for(const player of [0,1] as const)test(`P${player}: Normal/Hard fairly identify entry damage instead of historical PASS`,()=>{
  const game=fixture(player),before=structuredClone(game),view=observeGame(game);
  for(const difficulty of ['normal','hard'] as const){
    const result=analyzeDecision(view,passMove(player),{difficulty,seed:7});
    expect(result.status).toBe('complete');expect(result.recommended!.action).toEqual({type:'play',player,handIndex:0,row:0,col:player===0?0:4});
    expect(result.recommended!.score!).toBeGreaterThan(result.actual.score!);expect(result.hints).toContain('可能损失关键行优势');
    for(const c of [result.actual,...result.candidates]){expect(()=>simulateBotAction(game,c.action)).not.toThrow();expect(c.preview!.result.scores[player]).toBe(outcome(simulateBotAction(game,c.action)).scores[player]);}
    expect(result.recommended!.preview!.events.some(e=>e.type==='CardDestroyed')).toBe(true);
    expect(result.stats.nodes).toBeLessThanOrEqual(result.stats.maxNodes);
  }
  expect(game).toEqual(before);expect(view).toEqual(observeGame(game));
});
test('selected historical action reconstructs before it, independently of future suffix',()=>{
  const a=createPosition({hands:[[20,7],[145]],decks:[[95,107],[107]],board:[{owner:0,row:0,col:0,pawns:1},{owner:1,row:0,col:1,cardId:7},{owner:1,row:0,col:4,pawns:1}]});
  const b=createPosition({hands:[[20,7],[7]],decks:[[107,95],[95]],board:[{owner:0,row:0,col:0,pawns:1},{owner:1,row:0,col:1,cardId:7},{owner:1,row:0,col:4,pawns:1}]});
  pass(a,0);pass(a,1);pass(b,0);play(b,1,0,0,4);pass(b,0);pass(b,1);
  const ra=exportReplay(a),rb=exportReplay(b);
  const ta=new ReplayTimeline(ra),tb=new ReplayTimeline(rb),point=historicalDecision(ta,1);
  expect(point.view.passes).toBe(0);expect(ta.at(1).game.passes).toBe(1);
  const other=historicalDecision(tb,1);expect(other.view).toEqual(point.view);
  expect(analyzeDecision(point.view,point.actual,{seed:17,difficulty:'hard'})).toEqual(analyzeDecision(other.view,other.actual,{seed:17,difficulty:'hard'}));
});
test('observation never accesses hidden IDs, unknown deck order or full replay/events',()=>{
  const game=fixture();game.hands[1]=[145];game.decks=[[95,107],[1,88]];
  const guarded=(a:number[])=>new Proxy(a,{get(target,key){if(key!=='length')throw Error('hidden read');return target.length;}});
  game.hands[1]=guarded(game.hands[1]);game.decks=[guarded(game.decks[0]),guarded(game.decks[1])];
  for(const key of ['events','replay'])Object.defineProperty(game,key,{get(){throw Error('future read');}});
  expect(()=>analyzeDecision(observeGame(game),passMove(),{difficulty:'hard',seed:9})).not.toThrow();
});
test('actual outside a tiny search set is explicitly targeted; exhaustion is not a low score',()=>{
  const game=fixture(),actual={type:'play' as const,player:0 as const,handIndex:0,row:0,col:0};
  const result=analyzeDecision(observeGame(game),actual,{difficulty:'hard',maxNodes:8});
  expect(result.actual.preview).not.toBeNull();expect(result.actual.action).toEqual(actual);
  const exhausted=analyzeDecision(observeGame(game),actual,{maxNodes:1});
  expect(exhausted.status).toBe('incomplete');expect(exhausted.actual.score).toBeNull();expect(exhausted.recommended).toBeNull();expect(exhausted.hints.join()).toContain('不作优劣结论');
});
test('actual and alternatives use identical one-ply scoring including card cost',()=>{
  const view=observeGame(fixture()),analysis=analyzeDecision(view,passMove(),{seed:5});
  for(const c of [analysis.actual,...analysis.candidates])expect(c.score).toBe(assessBotRoot(simulateBotAction(botSimulation(view),c.action),view,c.action).score);
});
test('a historical second copy remains legal despite Bot candidate deduplication',()=>{
  const game=createPosition({hands:[[7,7],[]],board:[{owner:0,row:1,col:0,pawns:1}]});
  const actual={type:'play' as const,player:0 as const,handIndex:1,row:1,col:0},result=analyzeDecision(observeGame(game),actual);
  expect(result.actual.complete).toBe(true);expect(result.actual.action).toEqual(actual);
  expect(result.candidates.filter(c=>c.cardId===7&&c.action.type==='play'&&c.action.row===1&&c.action.col===0)).toHaveLength(0);
});
test('death-generated opposing cards are public response hypotheses, not leaked hidden hands',()=>{
  const game=createPosition({hands:[[20],[]],board:[{owner:0,row:0,col:0,pawns:1},{owner:1,row:0,col:1,cardId:40},{owner:1,row:1,col:4,pawns:1}]});
  const before=structuredClone(game),result=analyzeDecision(observeGame(game),{type:'play',player:0,handIndex:0,row:0,col:0},{difficulty:'hard',seed:7});
  expect(result.actual.replyTotal).toBeGreaterThan(1);expect(result.actual.preview!.events.some(e=>e.type==='CardAddedToHand'&&e.cardId===1040)).toBe(true);expect(game).toEqual(before);
});
test('unstable conditional-aura candidate reports its reason, not an artificial low score',()=>{
  const game=createPosition({hands:[[66],[]],board:[{owner:1,row:0,col:2,cardId:66,permanentDelta:-1},{owner:0,row:2,col:2,cardId:13},{owner:0,row:1,col:2,pawns:2}]});
  const before=structuredClone(game),result=analyzeDecision(observeGame(game),{type:'play',player:0,handIndex:0,row:1,col:2});
  expect(result.actual.reason).toContain('UNSTABLE_AURA');expect(result.actual.score).toBeNull();expect(result.actual.preview).toBeNull();expect(result.status).toBe('incomplete');expect(result.hints.join()).toContain('不作优劣结论');expect(game).toEqual(before);
});
test('replacement, generated hand, persistent aura and public death chains use the shared engine only',()=>{
  const input=JSON.parse(readFileSync(new URL('../examples/cli/replay-analysis.json',import.meta.url),'utf8'));
  const timeline=new ReplayTimeline(input.operations[0].replay),saved=structuredClone(timeline.replay);
  for(const step of [1,2,3,4,5]){
    const point=historicalDecision(timeline,step),before=structuredClone(point.view),analysis=analyzeDecision(point.view,point.actual,{seed:7});
    expect(analysis.actual.complete).toBe(true);expect(point.view).toEqual(before);
    expect(analysis.actual.preview).not.toHaveProperty('hands');expect(analysis.actual.preview).not.toHaveProperty('decks');
    expect(analysis.actual.preview!.events.some(e=>e.reason==='draw')).toBe(false);
    if(step===1)expect(analysis.actual.preview!.events.some(e=>e.type==='CardAddedToHand'&&e.cardId===1010)).toBe(true);
    if(step===3)expect(analysis.actual.preview!.events.some(e=>e.type==='CardReplaced')).toBe(true);
    if(step===5)expect(analysis.actual.preview!.phase).toBe('finished');
  }
  expect(timeline.replay).toEqual(saved);
});
test('deterministic limits in an extreme branch count, invalid requests, and no-placement PASS',()=>{
  const game=createPosition({hands:[[...byId.keys()].filter(id=>id<146),[7]],board:Array.from({length:15},(_,i)=>({owner:0 as const,row:Math.floor(i/5),col:i%5,pawns:3}))});
  for(const maxNodes of [1,8,31]){const view=observeGame(game),options={difficulty:'hard' as const,seed:71,maxNodes},a=analyzeDecision(view,passMove(),options);expect(a.stats.nodes).toBeLessThanOrEqual(maxNodes);expect(a).toEqual(analyzeDecision(view,passMove(),options));}
  for(const options of [{difficulty:'easy'},{seed:-1},{maxNodes:0},{maxNodes:513}])expect(()=>analyzeDecision(observeGame(game),passMove(),options as never)).toThrow();
  expect(()=>analyzeDecision(observeGame(game),{type:'play',player:1,handIndex:0,row:0,col:4})).toThrow();
  const empty=createPosition({passes:1,hands:[[],[]],board:[]}),r=analyzeDecision(observeGame(empty),passMove());expect(r.actual.preview!.phase).toBe('finished');expect(r.candidates).toHaveLength(0);
});
test('initial/mulligan/missing replay data cannot fabricate analysis points',()=>{
  const game=fixture();pass(game,0);pass(game,1);const t=new ReplayTimeline(exportReplay(game));
  expect(()=>historicalDecision(t,0)).toThrow();expect(()=>historicalDecision(t,3)).toThrow();expect(()=>new ReplayTimeline({scores:[1,0]})).toThrow();
  const fake={length:1,replay:{commands:[{type:'mulligan',player:0,indices:[]}]}} as unknown as ReplayTimeline;
  expect(()=>historicalDecision(fake,1)).toThrow(/换牌/);
});
test('CLI analyze is read-only, remains compatible with legal/state and covers both modes',()=>{
  const session=new QbSession(),input=JSON.parse(readFileSync(new URL('../examples/cli/match-analysis.json',import.meta.url),'utf8'));
  const response=session.execute(input);expect(response.ok).toBe(true);
  const rows=response.results as {result:any}[];for(const row of rows.slice(1,3))expect((row.result as ReplayAnalysis).recommended!.cardId).toBe(20);
  const game=rows[3].result as Game;expect(game.replay.commands).toEqual([]);expect(botActions(botSimulation(observeGame(game)))).toContainEqual(passMove());
  const before=session.execute([{op:'state'}]);expect(session.execute([{op:'analyze',actual:{type:'play',player:0,handIndex:88,row:0,col:0}}]).ok).toBe(false);expect(session.execute([{op:'state'}])).toEqual(before);
});
