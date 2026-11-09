import {afterEach,beforeEach,expect,test,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {createPosition,legalMoves,pass,scoreBreakdown,replayMatch,type Game,type Position} from '../src/engine.js';
import {MatchPresentation} from '../src/match-presentation.js';
import {MatchHistory,saveMatch,restoreMatch,readActive,writeActive,type SavedMatch} from '../src/match-archive.js';
import {starterDeck} from '../src/cards.js';
import {observeGame,type BotDecision} from '../src/bot.js';
import type {StoragePort} from '../src/ui-data.js';

const fixture=(name:string):Position=>JSON.parse(readFileSync(new URL(`./fixtures/auto-pass-${name}.json`,import.meta.url),'utf8')).operations[0].position;
beforeEach(()=>vi.useFakeTimers());afterEach(()=>vi.useRealTimers());
class Memory implements StoragePort {rows=new Map<string,string>();getItem(k:string){return this.rows.get(k)??null;}setItem(k:string,v:string){this.rows.set(k,v);}}
function setup(game:Game,mode='standard',storage=new Memory()){
  const history=new MatchHistory(storage),checkpoints:SavedMatch[]=[];
  const snapshot=()=>saveMatch(game,{deck:starterDeck,seed:game.replay.seed,difficulty:'normal',first:'player'},'auto pass fixture','auto-pass-case');
  const checkpoint=vi.fn(()=>{const save=snapshot();checkpoints.push(save);return writeActive(storage,save);});
  const completed=vi.fn(()=>{const error=history.add(snapshot());return error??writeActive(storage,null);});
  const choose=vi.fn(async():Promise<BotDecision>=>{const move=legalMoves(game,1)[0];return {action:move?{type:'play',player:1,...move}:{type:'pass',player:1},difficulty:'normal',seed:1,reason:'fixture',stats:{nodes:1,maxNodes:1,rejected:0,depth:1,budgetReached:false}};});
  const p=new MatchPresentation({game:()=>game,choose,cancelBot:()=>{},checkpoint,completed,changed:()=>{},result:()=>{}},()=>mode==='reduced');
  if(mode==='fast')p.setFast(true);
  return {p,game,storage,history,choose,checkpoint,checkpoints,completed,snapshot};
}
async function reach(p:MatchPresentation,phase:string){for(let i=0;i<15&&p.phase!==phase;i++)await vi.advanceTimersToNextTimerAsync();expect(p.phase).toBe(phase);}

for(const mode of ['standard','fast','reduced'])test(`23:0 full-board reproduction automatically ends once (${mode})`,async()=>{
  const h=setup(createPosition(fixture('full-board')),mode);
  expect(h.game.board.flat().every(t=>t.card)).toBe(true);expect(h.game.hands[0]).toHaveLength(4);expect(legalMoves(h.game,0)).toHaveLength(0);
  expect(scoreBreakdown(h.game).scores).toEqual([23,0]);h.p.resume();
  expect(h.game.phase).toBe('finished');expect(h.game.replay.commands).toEqual([{type:'pass',player:0}]);
  expect(h.checkpoint).toHaveBeenCalledTimes(1);expect(h.completed).toHaveBeenCalledTimes(1);expect(h.p.message).toContain('自动跳过');
  expect(h.p.commitPlayer(()=>pass(h.game,0))).toBe(false);h.p.skip();h.p.skip();await vi.runAllTimersAsync();
  expect(h.p.phase).toBe('Result');expect(h.choose).not.toHaveBeenCalled();
  expect(h.history.records).toHaveLength(1);expect(h.history.records[0].scores).toEqual([23,0]);
  const replay=h.history.replay(h.history.records[0].id);expect(scoreBreakdown(replayMatch(replay))).toEqual(scoreBreakdown(h.game));
  expect(replay.commands).toHaveLength(1);expect(readActive(h.storage).present).toBe(false);
  h.p.pause();h.p.resume();expect(h.completed).toHaveBeenCalledTimes(1);expect(h.game.replay.commands).toHaveLength(1);
});

test('full board with an allied replacement remains playable; voluntary PASS still exists',()=>{
  const h=setup(createPosition(fixture('replacement')));h.p.resume();
  expect(legalMoves(h.game,0)).toHaveLength(15);expect(h.p.canPlay).toBe(true);expect(h.game.phase).toBe('playing');
  expect(h.checkpoint).not.toHaveBeenCalled();expect(h.game.replay.commands).toHaveLength(0);
  expect(h.p.commitPlayer(()=>pass(h.game,0))).toBe(true);expect(h.game.phase).toBe('finished');h.p.pause();
});

test('no player placement on a non-full board passes to a playable opponent, never awards an early win',async()=>{
  const game=createPosition({hands:[[1],[7]],decks:[[],[]],board:[{row:0,col:4,owner:1,pawns:1}]});
  const h=setup(game);h.p.resume();
  expect(game.phase).toBe('playing');expect(game.turn).toBe(1);expect(game.passes).toBe(1);expect(h.completed).not.toHaveBeenCalled();
  await reach(h.p,'OpponentResolve');expect(h.choose).toHaveBeenCalledTimes(1);
  expect(game.replay.commands.map(c=>c.type)).toEqual(['pass','play']);expect(game.passes).toBe(0);expect(game.phase).toBe('playing');h.p.pause();
});

test('both sides have no placements: two automatic PASS commands, two checkpoints, one archive',async()=>{
  const position=fixture('full-board');position.passes=0;const h=setup(createPosition(position));h.p.resume();
  expect(h.game.phase).toBe('playing');expect(h.game.replay.commands).toHaveLength(1);h.p.resume();
  h.p.skip();await vi.advanceTimersByTimeAsync(0);h.p.skip();await vi.runAllTimersAsync();
  expect(h.game.replay.commands).toEqual([{type:'pass',player:0},{type:'pass',player:1}]);
  expect(h.checkpoint).toHaveBeenCalledTimes(2);expect(h.completed).toHaveBeenCalledTimes(1);expect(h.choose).not.toHaveBeenCalled();
});

test('computer replacement is included in legal detection on a full board',async()=>{
  const position=fixture('replacement');position.turn=1;position.passes=0;position.hands[1]=[51];position.board![0].owner=1;
  const h=setup(createPosition(position));h.p.resume();expect(h.choose).toHaveBeenCalledTimes(1);
  await reach(h.p,'OpponentResolve');expect(h.game.replay.commands[0].type).toBe('play');expect(h.game.phase).toBe('playing');h.p.pause();
});

test('automatic PASS checks each incoming hand after its draw, including the Worker view',async()=>{
  const game=createPosition({seed:66,hands:[[],[]],decks:[[1],[5]],board:[
    {row:1,col:0,owner:0,pawns:1},{row:0,col:4,owner:1,pawns:1}
  ]});
  const h=setup(game),views:ReturnType<typeof observeGame>[]=[];
  const fixtureDecision=h.choose.getMockImplementation()!;
  h.choose.mockImplementation(()=>{views.push(observeGame(game,1));return fixtureDecision();});
  h.p.resume();
  expect(game.replay.commands).toEqual([{type:'pass',player:0}]);
  expect(legalMoves(game,1)).toHaveLength(1);
  await reach(h.p,'PlayerSelect');
  expect(h.choose).toHaveBeenCalledTimes(1);
  expect(views).toMatchObject([{hand:[5],deckCounts:[1,0],enemyHandCount:0}]);
  expect(game.replay.commands.map(command=>command.type)).toEqual(['pass','play']);
  expect(legalMoves(game,0)).toHaveLength(1);expect(game.hands[0]).toEqual([1]);
  h.p.pause();
});

test('exit mid automatic PASS and Continue preserve the already committed action',async()=>{
  const position=fixture('full-board');position.passes=0;const first=setup(createPosition(position));first.p.resume();first.p.pause();
  await vi.runAllTimersAsync();expect(first.game.replay.commands).toHaveLength(1);
  const restored=readActive(first.storage);expect(restored.restored?.game.turn).toBe(1);
  const h=setup(restoreMatch(first.checkpoints[0]).game,'standard',first.storage);h.p.resume();await vi.runAllTimersAsync();
  expect(h.game.replay.commands).toEqual([{type:'pass',player:0},{type:'pass',player:1}]);expect(h.checkpoint).toHaveBeenCalledTimes(1);
  expect(h.history.records).toHaveLength(1);expect(h.completed).toHaveBeenCalledTimes(1);
});

test('post-play rotating impact outlines are absent; selection previews are retained',()=>{
  const css=readFileSync(new URL('../site/match-presentation.css',import.meta.url),'utf8');
  const ui=readFileSync(new URL('../src/ui-match.ts',import.meta.url),'utf8');
  const originalCss=readFileSync(new URL('../site/style.css',import.meta.url),'utf8');
  // D3 permits finite card/delta transitions, never rotating preview outlines.
  expect(css).not.toMatch(/presentation-impact|infinite|pulse|blink/);expect(ui).not.toContain('presentation-impact');
  expect(css).toContain('match-card-enter 180ms ease-out both');
  expect(ui).toContain("'preview-pawn'");expect(ui).toContain("'preview-effect'");expect(originalCss).toContain('.tile.legal::after');
});
