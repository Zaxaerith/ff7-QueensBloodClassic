import {expect,test} from 'vitest';
import {readFileSync} from 'node:fs';
import {startMatch,type MatchSettings} from '../src/match-flow.js';
import {mulligan,play,pass,legalMoves,createPosition,exportReplay,replayMatch,outcome,type Game} from '../src/engine.js';
import {starterDeck} from '../src/cards.js';
import {saveMatch,restoreMatch,readActive,writeActive,MatchHistory,ReplayTimeline,checkedReplay,MATCH_KEY,REPLAYS_KEY,RULES_VERSION} from '../src/match-archive.js';
import {STORAGE,type StoragePort} from '../src/ui-data.js';
import {QbSession} from '../src/session.js';

class MemoryStore implements StoragePort {
  values=new Map<string,string>();blocked:string|null=null;
  getItem(key:string){return this.values.get(key)??null;}
  setItem(key:string,value:string){if(this.blocked==='*'||this.blocked===key)throw Error('quota');this.values.set(key,value);}
}
const settings:MatchSettings={deck:starterDeck,seed:701,difficulty:'hard',first:'computer'};
const snapshot=(game:Game,id='match-1')=>saveMatch(game,{...settings,seed:game.replay.seed},'经典',id);
const fixture=JSON.parse(readFileSync(new URL('../examples/cli/replay-analysis.json',import.meta.url),'utf8'));
const finished=()=>replayMatch(fixture.operations[0].replay);

test('save protocol reconstructs opening, partial mulligan, computer and player turns exactly',()=>{
  const game=startMatch(settings);
  const equal=()=>{const before=structuredClone(game),saved=snapshot(game);expect(saved).not.toHaveProperty('board');expect(saved).not.toHaveProperty('hands');expect(restoreMatch(JSON.parse(JSON.stringify(saved))).game).toEqual(before);expect(game).toEqual(before);};
  equal();mulligan(game,0,[0,2]);equal();expect(game.mulliganDone).toEqual([true,false]);
  mulligan(game,1,[1]);equal();expect(game.turn).toBe(1);
  const move=legalMoves(game,1)[0];play(game,1,move.handIndex,move.row,move.col);equal();expect(game.turn).toBe(0);
});
test('restored deterministic RNG/deck order gives the identical next mulligan and draw',()=>{
  const game=startMatch(settings),restored=restoreMatch(snapshot(game)).game;
  for(const state of [game,restored]){mulligan(state,0,[0,1,3]);mulligan(state,1,[2,4]);const m=legalMoves(state,1)[0];play(state,1,m.handIndex,m.row,m.col);}
  expect(restored).toEqual(game);
});
test('JSON fixture preserves replacement, generated hand, aura, discard and terminal scoring',()=>{
  const game=finished(),copy=restoreMatch(snapshot(game)).game;
  expect(copy).toEqual(game);expect(copy.hands[0]).toContain(1010);expect(copy.discard[0]).toContain(10);
  expect(copy.events.some(e=>e.type==='CardReplaced')).toBe(true);expect(outcome(copy)).toEqual(outcome(game));
  expect(copy.phase).toBe('finished');expect(copy.passes).toBe(2);
});
test('death-generated cards and instance counters survive restoration without replaying an extra trigger',()=>{
  const game=createPosition({turn:1,hands:[[],[39]],board:[{row:1,col:1,cardId:40,owner:0},{row:1,col:2,owner:1,pawns:3}]});
  play(game,1,0,1,2);const copy=restoreMatch(snapshot(game)).game;
  expect(copy).toEqual(game);expect(copy.hands[0]).toEqual([1040]);expect(copy.events.filter(e=>e.type==='CardDestroyed')).toHaveLength(1);
});
test('once/threshold flags and later power recalculation are not retriggered after restore',()=>{
  const game=createPosition({hands:[[139,13],[]],board:[{row:1,col:2,owner:0,cardId:86,permanentDelta:3},{row:0,col:2,owner:0,cardId:7},{row:1,col:1,owner:0,pawns:3},{row:2,col:2,owner:0,pawns:3}]});
  play(game,0,0,1,1);const copy=restoreMatch(snapshot(game)).game;expect(copy).toEqual(game);
  for(const state of [game,copy]){pass(state,1);play(state,0,0,2,2);}
  expect(copy).toEqual(game);expect(copy.events.filter(e=>e.type==='ThresholdReached'&&e.cardId===86)).toHaveLength(1);
});
test('restoring a single PASS then passing completes exactly once, including special score policies',()=>{
  const game=createPosition({hands:[[],[]],board:[{cardId:142,owner:0,row:0,col:0},{cardId:7,owner:1,row:0,col:4},{cardId:53,owner:0,row:1,col:0},{cardId:7,owner:1,row:1,col:4}]});
  pass(game,0);const copy=restoreMatch(snapshot(game)).game;pass(copy,1);pass(game,1);
  expect(copy).toEqual(game);expect(outcome(copy).scores).toEqual([17,3]);expect(copy.events.filter(e=>e.type==='MatchEnded')).toHaveLength(1);
});
test('invalid versions, corruption, truncation and metadata mismatch are rejected without rewriting raw storage',()=>{
  const store=new MemoryStore(),save=snapshot(finished());
  for(const raw of ['{',JSON.stringify({...save,version:7}),JSON.stringify({...save,rulesVersion:'future'}),JSON.stringify({...save,check:'00000000'}),JSON.stringify({...save,settings:{...save.settings,seed:99}}),JSON.stringify({...save,replay:{...save.replay,commands:save.replay.commands.slice(0,-1)}})]){
    store.setItem(MATCH_KEY,raw);expect(readActive(store)).toMatchObject({present:true,restored:null});expect(readActive(store).error).toBeTruthy();expect(store.getItem(MATCH_KEY)).toBe(raw);
  }
});
test('schema and size bounds reject illegal coordinates, command types and oversized payloads',()=>{
  const replay=exportReplay(finished());
  for(const bad of [{...replay,commands:[{type:'play',player:0,handIndex:0,row:9,col:0}]},{...replay,commands:[{type:'hack',player:0}]},{...replay,commands:Array(1025).fill({type:'pass',player:0})},{...replay,padding:'x'.repeat(240_001)}])expect(()=>checkedReplay(bad)).toThrow();
  const store=new MemoryStore(),valid=snapshot(finished());writeActive(store,valid);const previous=store.getItem(MATCH_KEY);
  expect(writeActive(store,{...valid,replay:{...replay,commands:Array(1025).fill({type:'pass',player:0})}})).toContain('失败');expect(store.getItem(MATCH_KEY)).toBe(previous);
});
test('storage failure leaves previous save and running game untouched; explicit clear is small and safe',()=>{
  const store=new MemoryStore(),game=startMatch(settings),first=snapshot(game);expect(writeActive(store,first)).toBeNull();
  mulligan(game,0,[]);const next=snapshot(game),before=structuredClone(game);store.blocked='*';expect(writeActive(store,next)).toContain('失败');expect(store.getItem(MATCH_KEY)).toBe(JSON.stringify(first));expect(game).toEqual(before);
  store.blocked=null;expect(writeActive(store,null)).toBeNull();expect(readActive(store).present).toBe(false);expect(writeActive(null,next)).toContain('失败');
});
test('old records remain summaries with no invented replay; new results link by stable match ID and delete both',()=>{
  const store=new MemoryStore(),old={id:'old',date:'2026-10-31T00:00:00Z',deckName:'旧记录',difficulty:'easy',seed:1,scores:[1,0]};store.setItem(STORAGE.records,JSON.stringify({version:1,records:[old]}));
  const history=new MatchHistory(store);expect(history.records).toEqual([old]);expect(history.available('old')).toBe(false);expect(()=>history.replay('old')).toThrow();
  expect(history.add(snapshot(finished()))).toBeNull();expect(history.records).toHaveLength(2);expect(history.available('match-1')).toBe(true);
  expect(replayMatch(history.replay('match-1'))).toEqual(finished());expect(history.add(snapshot(finished()))).toBeNull();expect(history.records).toHaveLength(2);
  expect(history.remove('match-1')).toBeNull();expect(history.records).toEqual([old]);expect(JSON.parse(store.getItem(REPLAYS_KEY)!).items).toEqual([]);
});
test('archive limits retain at most 20 summaries/replays, without orphan bodies',()=>{
  const store=new MemoryStore(),history=new MatchHistory(store),game=finished();for(let i=0;i<23;i++)expect(history.add(snapshot(game,'id-'+i))).toBeNull();
  expect(history.records).toHaveLength(20);const items=JSON.parse(store.getItem(REPLAYS_KEY)!).items;expect(items).toHaveLength(20);expect(items.every((r:{recordId:string})=>history.records.some(s=>s.id===r.recordId))).toBe(true);expect(history.available('id-0')).toBe(false);
});
test('failed second archive write rolls back replay bodies and leaves summary and active save recoverable',()=>{
  const store=new MemoryStore(),history=new MatchHistory(store);history.add(snapshot(finished(),'old'));const old=store.getItem(REPLAYS_KEY);writeActive(store,snapshot(finished(),'new'));store.blocked=STORAGE.records;
  expect(history.add(snapshot(finished(),'new'))).toContain('失败');expect(store.getItem(REPLAYS_KEY)).toBe(old);expect(history.records[0].id).toBe('old');expect(readActive(store).restored?.save.id).toBe('new');
});
test('corrupt or incompatible replay body cannot be opened despite a retained summary',()=>{
  const store=new MemoryStore(),history=new MatchHistory(store);history.add(snapshot(finished()));const data=JSON.parse(store.getItem(REPLAYS_KEY)!);data.items[0].check='bad';store.setItem(REPLAYS_KEY,JSON.stringify(data));expect(()=>new MatchHistory(store).replay('match-1')).toThrow();
  data.items[0].rulesVersion=RULES_VERSION+'changed';store.setItem(REPLAYS_KEY,JSON.stringify(data));expect(new MatchHistory(store).available('match-1')).toBe(false);
});
test('timeline forward/backward/start/end reconstructs exact frames and only the selected command events',()=>{
  const game=finished(),timeline=new ReplayTimeline(exportReplay(game));expect(timeline.at(timeline.length).game).toEqual(game);
  const frame=timeline.at(3);expect(frame.events.some(e=>e.type==='CardReplaced')).toBe(true);expect(frame.command?.type).toBe('play');
  expect(timeline.at(1)).toEqual(timeline.at(1));expect(timeline.at(0).command).toBeNull();expect(()=>timeline.at(-1)).toThrow();expect(()=>timeline.at(timeline.length+1)).toThrow();
  const independent=timeline.at(2);independent.game.hands[0].push(145);expect(timeline.at(2).game.hands[0]).not.toContain(145);expect(game).toEqual(finished());
});
test('live replay cannot enter the completed-only player, and browsing leaves a live match unchanged',()=>{
  const live=startMatch(settings),before=structuredClone(live);expect(()=>new ReplayTimeline(exportReplay(live))).toThrow();const timeline=new ReplayTimeline(exportReplay(finished()));timeline.at(0);timeline.at(timeline.length);timeline.at(2);expect(live).toEqual(before);
});
test('existing QbSession restores the exact same fixture without any CLI protocol changes',()=>{
  const session=new QbSession(),result=session.execute({...fixture,includeState:true});expect(result.ok).toBe(true);expect(result.state).toEqual(finished());
});
