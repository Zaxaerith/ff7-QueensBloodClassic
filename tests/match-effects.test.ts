import {afterEach,beforeEach,expect,test,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {createPosition,play,pass,scoreBreakdown,type Position,type Move,type RuleEvent} from '../src/engine.js';
import {MatchPresentation,publicMatch,publicEvents,PRESENTATION_MS,type PublicBatch} from '../src/match-presentation.js';
import {effectPlan,effectTargets,netChanges,effectText,eventSource,type MatchEffect} from '../src/match-effects.js';

const fixtures=JSON.parse(readFileSync(new URL('./fixtures/match-effect-positions.json',import.meta.url),'utf8')) as Record<string,{position:Position;move:Move}>;
function batch(name:string):PublicBatch {
  const fixture=fixtures[name],game=createPosition(fixture.position),before=publicMatch(game),cursor=game.events.length;
  play(game,0,fixture.move.handIndex,fixture.move.row,fixture.move.col);
  return {before,after:publicMatch(game),events:publicEvents(game.events.slice(cursor)),actor:0,automaticPass:false};
}
beforeEach(()=>vi.useFakeTimers());afterEach(()=>vi.useRealTimers());
test.each(['normal','enhance','weaken','chain','replacement','generate','spawn'])('%s: pure projection preserves authoritative endpoints and event order',name=>{
  const b=batch(name),copy=structuredClone(b),plan=effectPlan(b);
  const shown=plan.groups.flat();expect(shown.map(e=>e.seq)).toEqual([...shown.map(e=>e.seq)].sort((a,b)=>a-b));
  expect(plan.groups.length).toBeLessThanOrEqual(4);expect(b).toEqual(copy);
  expect(plan.placement?.type).toBe('CardPlayed');
});
test('actual pawn capture preserves rank; no false resource consumption or max-rank flash',()=>{
  const b=batch('normal'),changes=netChanges(b.before,b.after);
  expect(changes.find(c=>c.row===1&&c.col===1)?.text).toBe('电脑 ♟2 → 你 ♟2');
  expect(effectTargets(b.events,b.before,b.after).find(t=>t.kind==='PawnsClaimed')?.current).toBe(true);
  expect(changes.some(c=>c.row===1&&c.col===0)).toBe(false);
  const unchanged:RuleEvent={seq:99,type:'PawnsClaimed',row:1,col:1,amount:2};
  expect(effectTargets([unchanged],b.after,b.after)).toEqual([]);
  expect(effectTargets([{seq:100,type:'PowerChanged',row:1,col:0,amount:0}],b.before,b.after)).toEqual([]);
});
test('power bubbles show one measured net change, not intermediate inferred sums',()=>{
  const b=batch('enhance');expect(netChanges(b.before,b.after)).toContainEqual({row:0,col:0,kind:'power',delta:2,text:'2 → 4 (+2)'});
  const w=batch('weaken');expect(netChanges(w.before,w.after).find(c=>c.kind==='power')?.text).toBe('5 → 2 (-3)');
  expect(effectText({seq:1,type:'PowerChanged',amount:2,cardId:7})).toContain('力量修正 +2');
  expect(effectText({seq:2,type:'DerivedPowerChanged',power:7,cardId:7})).not.toContain('→ 7');
});
test('replacement keeps event seq, marks the dead OLD instance rather than fading the new card',()=>{
  const b=batch('replacement'),plan=effectPlan(b);
  expect(plan.groups.flat().slice(0,3).map(e=>e.type)).toEqual(['CardReplaced','CardPlayed','CardDestroyed']);
  const targets=effectTargets(plan.groups.flat(),b.before,b.after);
  expect(targets.find(t=>t.kind==='CardDestroyed')?.current).toBe(false);
  expect(targets.find(t=>t.kind==='CardPlayed')?.current).toBe(true);
  expect(b.events.some(e=>e.type==='CardAddedToHand'&&e.cardId===1040)).toBe(true);
});
test('destroyed entering card and transient targets remain evidence, never invented board cards',()=>{
  const b=batch('chain');expect(b.after.board[1][0].card).toBeNull();
  const targets=effectTargets(b.events,b.before,b.after);
  expect(targets.find(t=>t.kind==='CardPlayed')?.current).toBe(false);
  expect(b.events.filter(e=>e.type==='CardDestroyed').length).toBeGreaterThanOrEqual(3);
  expect(netChanges(b.before,b.after).filter(c=>c.kind==='power')).toEqual([]);
});
test('large event chains stay four ordered groups; hidden generated identities stay redacted',()=>{
  const b=batch('normal');b.events=Array.from({length:1001},(_,i)=>({seq:i+1,type:'PowerChanged',cardId:7,amount:i%2?1:-1}));
  const plan=effectPlan(b);expect(plan.groups.length).toBe(4);expect(plan.groups.flat()).toEqual(b.events);
  const redacted=publicEvents([{seq:7,type:'CardAddedToHand',player:1,cardId:145,instanceId:98,reason:'generated'}]);
  expect(JSON.stringify(redacted)).not.toContain('145');expect(effectText(redacted[0])).toBe('电脑生成手牌 1 张');
});
test('source labels require a self trigger; modifier targets and generic first-state flags are not invented sources',()=>{
  expect(eventSource({seq:1,type:'CardDestroyed',cardId:41})).toBe('离场能力');
  expect(eventSource({seq:2,type:'CardPlayed',cardId:20})).toBe('入场能力');
  expect(eventSource({seq:3,type:'PowerChanged',cardId:21,reason:'onPlay',amount:-3})).toBeNull();
  expect(eventSource({seq:4,type:'CardEnhanced',cardId:7})).toBeNull();
});
function presentation(name:string,mode='standard'){
  const game=createPosition(fixtures[name].position),cues:MatchEffect[]=[],frames:string[]=[],checkpoint=vi.fn(()=>null),completed=vi.fn(()=>null),result=vi.fn();
  const p=new MatchPresentation({game:()=>game,choose:()=>new Promise(()=>{}),cancelBot:()=>{},checkpoint,completed,result,
    changed:()=>{if(p.effect)cues.push(structuredClone(p.effect));if(p.frame)frames.push(JSON.stringify(p.frame.board));}},()=>mode==='reduced');
  if(mode==='fast')p.setFast(true);p.resume();return {p,game,cues,frames,checkpoint,completed,result};
}
test('one atomic before→after board, with stable cue identities across notifications and no repeat action',async()=>{
  const h=presentation('enhance'),before=publicMatch(h.game).board,m=fixtures.enhance.move;
  h.p.commitPlayer(()=>play(h.game,0,m.handIndex,m.row,m.col));const after=publicMatch(h.game).board;
  await vi.advanceTimersByTimeAsync(1700);
  expect(h.frames.every(s=>s===JSON.stringify(before)||s===JSON.stringify(after))).toBe(true);
  expect(new Set(h.cues.filter(c=>c.stage==='settle').map(c=>c.key)).size).toBe(1);
  expect(h.game.replay.commands).toHaveLength(1);expect(h.checkpoint).toHaveBeenCalledTimes(1);h.p.pause();
});
test.each(['standard','fast','reduced'])('scoring uses engine awards, reveals three rows once and archives once (%s)',async mode=>{
  const h=presentation('scoring',mode);expect(h.completed).toHaveBeenCalledTimes(1);expect(h.game.phase).toBe('finished');
  if(mode==='standard'){await vi.advanceTimersByTimeAsync(PRESENTATION_MS.pass+PRESENTATION_MS.end);expect(h.p.phase).toBe('MatchEnd');expect(h.result).not.toHaveBeenCalled();}
  await vi.runAllTimersAsync();
  const scored=h.cues.filter(c=>c.scoring?.totals).at(-1)!;expect(scored.scoring!.result).toEqual(scoreBreakdown(h.game));
  expect(scored.scoring!.result.awards).toEqual([[0,3],[17,0],[0,0]]);expect(scored.scoring!.result.rows[1][0]).toBe(5);
  expect(new Set(h.cues.filter(c=>c.scoring).map(c=>c.scoring!.revealed))).toEqual(new Set([0,1,2,3]));
  expect(h.game.replay.commands).toEqual([{type:'pass',player:0}]);expect(h.completed).toHaveBeenCalledTimes(1);expect(h.result).toHaveBeenCalledTimes(1);
});
test('skip and pause cancel scoring safely; resume does not re-execute or re-archive the final PASS',async()=>{
  const h=presentation('scoring');h.p.skip();h.p.skip();await vi.runAllTimersAsync();expect(h.p.phase).toBe('Result');
  h.p.pause();expect(h.p.effect).toBeNull();h.p.resume();expect(h.game.replay.commands).toHaveLength(1);expect(h.completed).toHaveBeenCalledTimes(1);
  const r=presentation('scoring');await vi.advanceTimersByTimeAsync(600);r.p.pause();await vi.runAllTimersAsync();expect(r.result).not.toHaveBeenCalled();
  r.p.resume();expect(r.result).toHaveBeenCalledTimes(1);expect(r.game.replay.commands).toHaveLength(1);
});
