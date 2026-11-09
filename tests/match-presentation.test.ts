import {afterEach,beforeEach,expect,test,vi} from 'vitest';
import {MatchPresentation,publicMatch,publicEvents,PRESENTATION_MS} from '../src/match-presentation.js';
import {BotClient,type BotWorkerPort} from '../src/bot-client.js';
import {observeGame,type BotDecision,type BotAction} from '../src/bot.js';
import {createPosition,legalMoves,play,pass,mulligan,type Game} from '../src/engine.js';
import {saveMatch,restoreMatch} from '../src/match-archive.js';
import {startMatch} from '../src/match-flow.js';
import {starterDeck} from '../src/cards.js';

beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(0);});
afterEach(()=>vi.useRealTimers());
class Worker implements BotWorkerPort {
  onmessage:BotWorkerPort['onmessage']=null;onerror:BotWorkerPort['onerror']=null;terminated=false;
  postMessage=vi.fn();terminate(){this.terminated=true;}
  reply(action:BotAction){const decision:BotDecision={action,difficulty:'normal',seed:1,stats:{nodes:1,maxNodes:256,rejected:0,depth:1,budgetReached:false},reason:'test'};this.onmessage?.({data:{ok:true,decision}} as MessageEvent);}
}
const fresh=()=>createPosition({seed:7,hands:[[7,1],[7,1]],decks:[[],[]],board:[{row:0,col:0,owner:0,pawns:1},{row:0,col:4,owner:1,pawns:1}]});
function harness(game=fresh(),reduced=false){
  const workers:Worker[]=[],client=new BotClient(()=>{const w=new Worker();workers.push(w);return w;});
  const saved:ReturnType<typeof saveMatch>[]=[],steps:{phase:string;time:number;commands:number;message:string}[]=[];
  const checkpoint=vi.fn(()=>{saved.push(saveMatch(game,{deck:starterDeck,seed:game.replay.seed,difficulty:'normal',first:'player'},'test','same-match'));return null;});
  const completed=vi.fn(()=>null),result=vi.fn(),choose=vi.fn(()=>client.choose(observeGame(game,1),{seed:7}));
  const p=new MatchPresentation({game:()=>game,choose,cancelBot:()=>client.cancel(),checkpoint,completed,result,
    changed:()=>steps.push({phase:p.phase,time:Date.now(),commands:game.replay.commands.length,message:p.message})},()=>reduced);
  p.resume();
  const action=()=>{const m=legalMoves(game,0)[0];play(game,0,m.handIndex,m.row,m.col);};
  const reply=()=>{const m=legalMoves(game,1)[0];workers.at(-1)!.reply(m?{type:'play',player:1,...m}:{type:'pass',player:1});};
  return {game,p,workers,saved,checkpoint,completed,result,choose,steps,action,reply};
}
async function reach(p:MatchPresentation,phase:string){for(let i=0;i<15&&p.phase!==phase;i++)await vi.advanceTimersToNextTimerAsync();expect(p.phase).toBe(phase);}

test('fast Worker waits for player resolution AND handoff; authority is saved first',async()=>{
  const h=harness();expect(h.p.commitPlayer(h.action)).toBe(true);
  expect(h.checkpoint).toHaveBeenCalledTimes(1);expect(h.saved[0].replay.commands).toHaveLength(1);
  expect(h.game.turn).toBe(1);expect(h.p.phase).toBe('PlayerResolve');expect(h.p.frame?.board[0][0].card).toBeNull();
  h.reply();await reach(h.p,'OpponentTurn');
  expect(h.game.replay.commands).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(PRESENTATION_MS.handoff-1);expect(h.game.replay.commands).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(1);expect(h.game.replay.commands).toHaveLength(2);
  expect(h.game.turn).toBe(0);expect(h.p.phase).toBe('OpponentResolve');expect(h.p.canPlay).toBe(false);
  await vi.runAllTimersAsync();expect(h.p.canPlay).toBe(true);expect(h.checkpoint).toHaveBeenCalledTimes(2);
});

test('slow Worker pays no new handoff after its result arrives',async()=>{
  const h=harness();h.p.commitPlayer(h.action);await vi.advanceTimersByTimeAsync(2000);
  expect(h.p.phase).toBe('OpponentTurn');expect(h.game.replay.commands).toHaveLength(1);
  const ready=Date.now();h.reply();await vi.advanceTimersByTimeAsync(0);
  expect(h.steps.find(s=>s.phase==='OpponentCommit')!.time).toBe(ready);
  expect(h.game.replay.commands).toHaveLength(2);h.p.pause();
});

test('double submit and repeated skip never duplicate Replay commands',async()=>{
  const h=harness();expect(h.p.commitPlayer(h.action)).toBe(true);expect(h.p.commitPlayer(h.action)).toBe(false);
  h.p.skip();h.p.skip();await vi.advanceTimersByTimeAsync(0);expect(h.p.phase).toBe('OpponentTurn');
  h.p.skip();await vi.advanceTimersByTimeAsync(0);expect(h.game.replay.commands).toHaveLength(1);
  h.reply();await vi.advanceTimersByTimeAsync(0);h.p.skip();h.p.skip();await vi.runAllTimersAsync();
  expect(h.game.replay.commands).toHaveLength(2);expect(h.choose).toHaveBeenCalledTimes(1);expect(h.p.canPlay).toBe(true);
});

test('pause clears display wait, cancels Worker and rejects late replies across resume',async()=>{
  const h=harness();h.p.commitPlayer(h.action);const stale=h.workers[0];h.p.pause();
  const saved=JSON.stringify(h.game);expect(stale.terminated).toBe(true);expect(h.p.batch).toBeNull();expect(h.p.frame).toBeNull();
  stale.reply({type:'pass',player:1});await vi.runAllTimersAsync();expect(JSON.stringify(h.game)).toBe(saved);
  h.p.resume();h.p.resume();expect(h.choose).toHaveBeenCalledTimes(2);
  stale.reply({type:'pass',player:1});h.reply();await vi.runAllTimersAsync();expect(h.game.replay.commands).toHaveLength(2);h.p.pause();
});

test('fresh/restored player, bot-pending and bot-committed checkpoints resume without replaying effects',async()=>{
  const h=harness();const before=saveMatch(h.game,{deck:starterDeck,seed:7,difficulty:'normal',first:'player'},'test','same');
  h.p.commitPlayer(h.action);const pending=h.saved[0];h.reply();await reach(h.p,'OpponentResolve');const after=h.saved[1];h.p.pause();
  for(const [save,requests,commands] of [[before,0,0],[pending,1,1],[after,0,2]] as const){
    const restored=restoreMatch(save).game,copy=structuredClone(restored),r=harness(restored);
    r.p.resume();expect(r.choose).toHaveBeenCalledTimes(requests);expect(restored).toEqual(copy);
    expect(restored.replay.commands).toHaveLength(commands);r.p.pause();
  }
});

test('PASS is committed once, archived before display and Result is delayed',async()=>{
  const game=fresh();game.hands=[[],[]];game.decks=[[],[]];const h=harness(game);
  expect(h.p.commitPlayer(()=>pass(game,0))).toBe(false); // resume already submitted the automatic PASS
  expect(h.choose).not.toHaveBeenCalled();await reach(h.p,'OpponentResolve');
  expect(game.phase).toBe('finished');expect(h.completed).toHaveBeenCalledTimes(1);expect(h.result).not.toHaveBeenCalled();
  await vi.runAllTimersAsync();expect(h.p.phase).toBe('Result');expect(h.result).toHaveBeenCalledTimes(1);
  h.p.skip();h.p.resume();expect(h.completed).toHaveBeenCalledTimes(1);expect(game.replay.commands).toHaveLength(2);
  h.p.pause();h.p.resume();expect(h.completed).toHaveBeenCalledTimes(1);
});

test('public cache contains neither hidden hand/deck IDs nor private draw identity',()=>{
  const game=createPosition({hands:[[7],[145]],decks:[[],[144]],board:[]});
  const frame=publicMatch(game),events=publicEvents([{seq:1,type:'CardAddedToHand',player:1,cardId:144,instanceId:987,power:8,reason:'draw',stage:'draw'}]);
  expect(frame).not.toHaveProperty('hands');expect(frame).not.toHaveProperty('decks');expect(frame.enemyHandCount).toBe(1);
  expect(JSON.stringify({frame,events})).not.toContain('144');expect(JSON.stringify(frame)).not.toContain('145');expect(events[0]).not.toHaveProperty('cardId');expect(events[0]).not.toHaveProperty('instanceId');
  frame.board[0][0].pawns=3;expect(game.board[0][0].pawns).toBe(0);
});

test('reduced motion settles without CSS completion, keeping an 80ms handoff',async()=>{
  const h=harness(fresh(),true);h.p.commitPlayer(h.action);h.reply();await vi.advanceTimersByTimeAsync(0);
  expect(h.p.phase).toBe('OpponentTurn');await vi.advanceTimersByTimeAsync(79);expect(h.game.replay.commands).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(1);expect(h.p.canPlay).toBe(true);expect(h.game.replay.commands).toHaveLength(2);
});

test('mulligan checkpoint restores once, before/after snapshots never become the engine',async()=>{
  const game=startMatch({deck:starterDeck,seed:7,difficulty:'normal',first:'player'}),h=harness(game);
  expect(h.p.commitPlayer(()=>{mulligan(game,0,[0,2]);mulligan(game,1,[]);},true)).toBe(true);
  const copy=structuredClone(game);expect(h.p.commitPlayer(()=>mulligan(game,0,[]),true)).toBe(false);
  h.p.skip();await vi.runAllTimersAsync();expect(game).toEqual(copy);expect(h.saved).toHaveLength(1);
  const r=harness(restoreMatch(h.saved[0]).game);expect(r.p.phase).toBe('PlayerSelect');expect(r.saved).toHaveLength(0);r.p.pause();
});

test('replacement/destruction/generation and event seq are unchanged by presentation',async()=>{
  const game=createPosition({hands:[[51],[]],board:[{row:0,col:0,owner:0,cardId:10},{row:0,col:1,owner:1,cardId:7}]});
  const expected=structuredClone(game),m=legalMoves(game,0)[0];play(expected,0,m.handIndex,m.row,m.col);
  const h=harness(game);h.p.commitPlayer(()=>play(game,0,m.handIndex,m.row,m.col));
  expect(game).toEqual(expected);expect(h.p.batch?.events.map(e=>e.seq)).toEqual([...game.events.slice(-h.p.batch!.events.length)].map(e=>e.seq));
  h.p.pause();await vi.runAllTimersAsync();expect(game).toEqual(expected);
  const generated=createPosition({hands:[[10],[]],board:[{row:0,col:0,owner:0,pawns:1}]});const g=harness(generated);g.p.commitPlayer(g.action);
  expect(g.p.batch?.events.some(e=>e.type==='CardAddedToHand'&&e.reason==='generated')).toBe(true);g.p.pause();
});

test('invalid action leaves state intact; storage/view failure cannot resubmit a valid action',async()=>{
  const h=harness();const old=structuredClone(h.game);expect(h.p.commitPlayer(()=>play(h.game,0,99,0,0))).toBe(false);expect(h.game).toEqual(old);expect(h.checkpoint).not.toHaveBeenCalled();
  const g=fresh();let throws=true;
  const p=new MatchPresentation({game:()=>g,choose:()=>Promise.resolve(null),cancelBot:()=>{},checkpoint:()=>{throw Error('quota');},completed:()=>null,result:()=>{},changed:()=>{if(throws){throws=false;throw Error('view');}}},()=>true);
  p.resume();expect(p.commitPlayer(()=>pass(g,0))).toBe(true);expect(p.issue).toContain('保存失败');await vi.runAllTimersAsync();
  expect(g.replay.commands).toHaveLength(2);expect(g.phase).toBe('finished');expect(p.phase).toBe('Result');
});

test('turning on fast mode during a wait releases it once, without scheduling another worker',async()=>{
  const h=harness();h.p.commitPlayer(h.action);h.reply();h.p.setFast(true);h.p.setFast(true);
  await vi.advanceTimersByTimeAsync(0);expect(h.p.phase).toBe('OpponentTurn');
  h.p.resume();expect(h.choose).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(80);expect(h.p.canPlay).toBe(true);expect(h.game.replay.commands).toHaveLength(2);
});

test('replacement event feedback preserves seq even when stage classifications interleave',async()=>{
  const game=createPosition({hands:[[51],[]],board:[{row:0,col:0,owner:0,cardId:10}]});const h=harness(game);
  h.p.commitPlayer(()=>play(game,0,0,0,0));const batch=h.p.batch!;
  expect(batch.events.slice(0,3).map(e=>e.type)).toEqual(['CardReplaced','CardPlayed','CardDestroyed']);
  await vi.advanceTimersByTimeAsync(PRESENTATION_MS.placement);
  const feedback=h.steps.filter(s=>s.phase==='PlayerResolve').map(s=>s.message).join('\n');
  expect(feedback.indexOf('替换 Mandragora')).toBeLessThan(feedback.indexOf('Insectoid Chimera →'));
  h.p.pause();
});

test('archive failure is not retried by skip/render-like notifications, and display failure converges safely',async()=>{
  const game=fresh();game.hands=[[],[]];game.passes=1;const archive=vi.fn(()=>{throw Error('quota');});
  const p=new MatchPresentation({game:()=>game,choose:()=>Promise.resolve(null),cancelBot:()=>{},checkpoint:()=>null,completed:archive,changed:()=>{},result:()=>{throw Error('dialog');}},()=>true);
  p.resume();await vi.runAllTimersAsync();
  expect(game.phase).toBe('finished');expect(game.replay.commands).toHaveLength(1);expect(archive).toHaveBeenCalledTimes(1);
  expect(p.phase).toBe('Suspended');expect(p.frame?.phase).toBe('finished');
  p.skip();p.setFast(true);expect(archive).toHaveBeenCalledTimes(1);
});

test('unexpected clock/presentation failure cancels pending computation and shows the saved endpoint',async()=>{
  const game=fresh(),cancel=vi.fn(),choose=vi.fn(()=>Promise.resolve(null));
  const p=new MatchPresentation({game:()=>game,choose,cancelBot:cancel,checkpoint:()=>null,completed:()=>null,changed:()=>{},result:()=>{}},()=>{throw Error('presentation preference failed');});
  p.resume();p.commitPlayer(()=>pass(game,0));await vi.advanceTimersByTimeAsync(0);
  expect(p.phase).toBe('Suspended');expect(p.frame).toEqual(publicMatch(game));expect(game.turn).toBe(1);
  expect(game.replay.commands).toHaveLength(1);expect(choose).toHaveBeenCalledTimes(1);expect(cancel).toHaveBeenCalled();
});
