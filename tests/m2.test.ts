import {expect,test} from 'vitest';
import {createGame,createPosition,play,pass,legalMoves,outcome,cardStatus,exportReplay,replayMatch,chooseBotMove,mulligan,type Player,type PositionTile,type Position} from '../src/engine.js';
import {byId,playableCards,tokenCards,deckPresets} from '../src/cards.js';
import {M2_TOKEN,parsePattern} from '../src/card-expansion.js';
import {QbSession} from '../src/session.js';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';

const unit=(id:number,owner:Player,row:number,col:number,delta=0):PositionTile=>({row,col,owner,cardId:id,permanentDelta:delta});
const pawn=(owner:Player,row:number,col:number,pawns=3):PositionTile=>({row,col,owner,pawns});
const make=(board:PositionTile[],hands:[number[],number[]]=[[],[]],turn:Player=0)=>createPosition({board,hands,turn});

test('pattern parser preserves mixed marks and rejects malformed shapes',()=>{
  expect(parsePattern('-----/--@--/--C-A/-----/-----')).toEqual({influence:[[0,1]],effects:[[0,1],[2,0]]});
  for(const bad of ['--C--','-----/-----/--C--/-----','-----/-----/--CC-/-----/-----'])expect(()=>parsePattern(bad)).toThrow();
});
test('candidate database contains executable definitions and all referenced tokens',()=>{
  expect(playableCards.length).toBeGreaterThanOrEqual(137);expect(tokenCards.length).toBeGreaterThanOrEqual(18);
  expect(new Set([...playableCards,...tokenCards].map(c=>c.id)).size).toBe(playableCards.length+tokenCards.length);
  for(const c of [...playableCards,...tokenCards])for(const a of c.abilities){
    if(a.timing==='aura'||a.timing==='dynamic')continue;
    for(const action of a.actions){
      if(action.kind==='addToHand')for(const id of action.cards)expect(byId.get(id)?.rarity).toBe('token');
      if(action.kind==='spawn')for(const id of action.cardsByRank)expect(byId.get(id)?.rarity).toBe('token');
    }
  }
});
for(const owner of [0,1] as const){
  const enemy=(1-owner) as Player,flip=(c:number)=>owner===0?c:4-c;
  test(`P${owner+1} dynamic counts: intrinsic growth cannot feed other scalers; removal recomputes scores`,()=>{
    const s=make([unit(7,owner,0,flip(0),1),unit(107,owner,1,flip(1)),unit(95,owner,2,flip(4)),pawn(enemy,0,flip(1))],owner===0?[[],[20]]:[[20],[]],enemy);
    expect(s.board[1][flip(1)].card?.power).toBe(2);expect(s.board[2][flip(4)].card?.power).toBe(7);
    expect(cardStatus(s.board[1][flip(1)].card!)).toBe('neutral');
    expect(s.board[1][flip(1)].card?.enhancedOnce).toBe(false);
    const score=outcome(s).scores[owner];play(s,enemy,0,0,flip(1));
    expect(s.board[1][flip(1)].card?.power).toBe(1);expect(s.board[2][flip(4)].card?.power).toBe(5);
    expect(outcome(s).scores[owner]).toBeLessThan(score);
  });
  test(`P${owner+1} Alexander and Shadowblood Queen count sides independently and lose bonuses on destruction`,()=>{
    const s=make([unit(11,owner,0,flip(2),-1),unit(11,enemy,1,flip(3),-1),unit(145,owner,1,flip(0)),unit(103,owner,2,flip(0)),pawn(owner,1,flip(2))],owner===0?[[20],[]]:[[],[20]],owner);
    expect(s.board[1][flip(0)].card?.power).toBe(9);expect(s.board[2][flip(0)].card?.power).toBe(7);
    play(s,owner,0,1,flip(2));expect(s.board[1][flip(0)].card?.power).toBe(6);expect(s.board[2][flip(0)].card?.power).toBe(7);
  });
  test(`P${owner+1} Two Face condition activates, supports both sides, and disappears with its enhancer`,()=>{
    const s=make([unit(66,owner,1,flip(2)),unit(11,enemy,0,flip(2)),pawn(owner,2,flip(2)),pawn(enemy,1,flip(3))],owner===0?[[13],[60]]:[[60],[13]],owner);
    expect(s.board[0][flip(2)].card?.power).toBe(4);
    play(s,owner,0,2,flip(2));expect(s.board[1][flip(2)].card?.power).toBe(5);expect(s.board[0][flip(2)].card?.power).toBe(8);
    play(s,enemy,0,1,flip(3));expect(s.board[2][flip(2)].card).toBe(null);expect(s.board[0][flip(2)].card?.power).toBe(4);
  });
  test(`P${owner+1} Gi Nattak snapshots effective power including aura and distributes to both rows`,()=>{
    const s=make([unit(46,owner,1,flip(1),14),unit(7,owner,0,flip(1)),unit(13,owner,2,flip(1))],owner===0?[[123],[]]:[[],[123]],owner);
    expect(s.board[1][flip(1)].card?.power).toBe(20);play(s,owner,0,1,flip(1));
    expect(s.board[0][flip(1)].card?.power).toBe(22);expect(s.board[2][flip(1)].card?.power).toBe(21);expect(s.board[1][flip(1)].card?.power).toBe(3);
    expect(s.events.find(e=>e.type==='CardReplaced')?.power).toBe(20);expect(s.discard[owner]).toEqual([46]);
    expect(replayMatch(JSON.parse(JSON.stringify(exportReplay(s))))).toEqual(s);
  });
  test(`P${owner+1} negative replacement amount clips at edges and affects allies as well as enemies`,()=>{
    const s=make([unit(1,owner,1,flip(1),4),unit(11,enemy,2,flip(2),2)],owner===0?[[67],[]]:[[],[67]],owner);
    play(s,owner,0,1,flip(1));expect(s.board[2][flip(2)].card?.power).toBe(1);expect(s.board[2][flip(2)].owner).toBe(enemy);
  });
}
test('destruction growth is per live observed event, never retrospective discard count',()=>{
  const s=createPosition({board:[unit(113,0,2,0),unit(47,1,0,4),unit(35,0,2,2),unit(1,0,1,1),pawn(1,1,2)],hands:[[],[20]],turn:1,discard:[[],[1,7]]});
  expect(s.board[2][0].card?.power).toBe(6);play(s,1,0,1,2);
  expect(s.board[2][0].card?.power).toBe(7);expect(s.board[0][4].card?.power).toBe(3);expect(s.board[2][2].card?.power).toBe(3);
});
test('enfeebled Two Face weakens both sides; aura recalculation does not stack',()=>{
  const s=make([unit(66,0,1,2,-1),unit(11,0,0,2,2),unit(11,1,2,2,2),pawn(0,0,0)],[[1],[]]);
  expect(s.board[0][2].card?.power).toBe(2);expect(s.board[2][2].card?.power).toBe(2);
  play(s,0,0,0,0);expect(s.board[0][2].card?.power).toBe(2);expect(s.board[2][2].card?.power).toBe(2);
});
test('Cloud threshold fires once across later power increases',()=>{
  const s=make([unit(86,0,1,2,3),unit(7,0,0,2),pawn(0,1,1),pawn(0,2,2)],[[139,13],[]]);
  expect(s.board[1][2].card?.power).toBe(6);play(s,0,0,1,1);
  expect(s.board[1][2].card?.power).toBe(7);expect(s.board[0][2].card?.power).toBe(5);expect(s.board[1][1].card?.power).toBe(3);
  pass(s,1);play(s,0,0,2,2);expect(s.board[1][2].card?.power).toBe(9);
  expect(s.board[1][1].card?.permanentDelta).toBe(2);expect(s.board[1][2].card?.thresholds).toEqual([0]);
  expect(s.events.filter(e=>e.type==='ThresholdReached'&&e.cardId===86)).toHaveLength(1);
  expect(replayMatch(exportReplay(s))).toEqual(s);
});
test('lethal first-enfeebled card cannot execute a pending ordinary trigger',()=>{
  const s=make([unit(61,0,2,2),unit(11,1,0,3),pawn(1,2,3)],[[],[20]],1);
  play(s,1,0,2,3);expect(s.board[2][2].card).toBe(null);expect(s.board[0][3].card?.power).toBe(4);
});
test('Bahamut Arisen rank snapshots survive destruction; spawned cards do not consume deck/hand cards',()=>{
  const s=make([pawn(0,1,0),pawn(0,0,0),unit(7,1,0,1)],[[105,51],[]]);
  play(s,0,0,1,0);expect(s.board[0][0].card?.id).toBe(M2_TOKEN.elemental3);expect(s.hands[0]).toEqual([51]);expect(s.decks[0]).toEqual([]);
  pass(s,1);play(s,0,0,0,0);expect(s.board[0][1].card?.power).toBe(5);expect(s.board[1][0].card?.power).toBe(7);
  expect(s.events.filter(e=>e.type==='CardSpawned')).toHaveLength(1);
});
test('multi-generation Grangalan hand chain uses tokens without inventing deck draws',()=>{
  const s=createPosition({board:[pawn(0,1,0),pawn(0,0,0,1)],hands:[[56],[]],decks:[[7],[]]});
  play(s,0,0,1,0);expect(s.hands[0]).toEqual([M2_TOKEN.junior]);pass(s,1);
  expect(s.hands[0]).toEqual([M2_TOKEN.junior,7]);play(s,0,0,0,0);
  expect(s.hands[0]).toEqual([7,M2_TOKEN.baby]);expect(s.decks[0]).toEqual([]);
  expect(s.events.filter(e=>e.type==='CardAddedToHand'&&e.reason==='draw')).toHaveLength(1);
});
test('Moogle Trio generates two distinct hand cards before the normal redraw',()=>{
  const s=createPosition({board:[pawn(0,1,0)],hands:[[110],[]],decks:[[7],[]]});
  play(s,0,0,1,0);expect(s.hands[0]).toEqual([M2_TOKEN.mage,M2_TOKEN.bard]);
  pass(s,1);expect(s.hands[0]).toEqual([M2_TOKEN.mage,M2_TOKEN.bard,7]);
});
test('Ultimate Party Animal changes all winning lanes, never awards tied lanes or losing-card bonuses',()=>{
  const s=make([unit(142,0,0,0),unit(7,1,0,4),unit(7,0,1,0),unit(7,1,1,4),unit(88,0,2,0),unit(7,1,2,4)]);
  expect(outcome(s)).toMatchObject({rows:[[1,2],[2,2],[1,2]],scores:[0,6],winner:1});
});
test('unstable conditional feedback is an explicit atomic error, not an invented traversal-dependent result',()=>{
  const session=new QbSession();session.execute([{op:'create',seed:7}]);
  const before=session.execute([{op:'state'}]);
  const result=session.execute([{op:'importPosition',position:{board:[unit(66,0,1,2,1),unit(66,1,0,2,-1)],hands:[[],[]]}}]);
  expect(JSON.stringify(result)).toContain('UNSTABLE_AURA');expect(session.execute([{op:'state'}])).toEqual(before);
});
test('scenario import validates all tiles and is reproducible after normalization',()=>{
  for(const board of [[pawn(0,4,0)],[pawn(0,1,0),pawn(1,1,0)],[{row:0,col:0,owner:null,pawns:2}],[{row:0,col:0,owner:0,cardId:9999}]])
    expect(()=>createPosition({board:board as PositionTile[],hands:[[],[]]})).toThrow();
  const s=make([unit(107,0,1,1),unit(7,0,0,0,1)]);expect(replayMatch(exportReplay(s))).toEqual(s);
});
test('CLI session uses the exact engine and preserves state on illegal operations',()=>{
  const position:Position={board:[pawn(0,1,0)],hands:[[1],[]],seed:7};
  const core=createPosition(position),session=new QbSession();
  expect(session.execute([{op:'importPosition',position}]).ok).toBe(true);
  const before=session.execute([{op:'state'}]);
  expect(session.execute([{op:'play',cardId:1,row:1,col:4}]).ok).toBe(false);
  expect(session.execute([{op:'state'}])).toEqual(before);
  session.execute([{op:'play',cardId:1,row:1,col:0}]);play(core,0,0,1,0);
  expect((session.execute([{op:'state'}]).results[0] as {result:unknown}).result).toEqual(core);
});
test('CLI rejects ambiguous card IDs and mismatched handIndex; later batch queries still work',()=>{
  const s=new QbSession();s.execute([{op:'importPosition',position:{board:[pawn(0,1,0)],hands:[[1,1],[]]}}]);
  const before=s.execute([{op:'state'}]);
  expect(s.execute([{op:'play',cardId:1,row:1,col:0},{op:'play',cardId:7,handIndex:0,row:1,col:0}]).ok).toBe(false);
  expect(s.execute([{op:'state'}])).toEqual(before);
  const result=s.execute([{op:'play',cardId:1,handIndex:1,row:1,col:0},{op:'events',after:1},{op:'replay'},{op:'score'}]);expect(result.ok).toBe(true);
});
test('actual CLI consumes one stdin sequence and emits machine-readable JSON without startup banners',()=>{
  const cli=spawnSync(process.execPath,['tools/qb-cli.mjs'],{input:JSON.stringify({operations:[{op:'create',seed:701},{op:'mulligan',player:0,indices:[]},{op:'mulligan',player:1,indices:[]},{op:'pass'},{op:'pass'},{op:'score'}]}),encoding:'utf8',timeout:20000});
  expect(cli.status,cli.stderr).toBe(0);const result=JSON.parse(cli.stdout);expect(result.ok).toBe(true);expect(result.results.at(-1).result).toMatchObject({phase:'finished',scores:[0,0],winner:null});
});
test('JSONL CLI retains a single session after invalid input and a rejected move',()=>{
  const input=[JSON.stringify([{op:'create',seed:2}]),'not json',JSON.stringify([{op:'pass'}]),JSON.stringify([{op:'state'}])].join('\n');
  const cli=spawnSync(process.execPath,['tools/qb-cli.mjs','--jsonl'],{input,encoding:'utf8',timeout:20000});
  expect(cli.status).toBe(1);const lines=cli.stdout.trim().split('\n').map(x=>JSON.parse(x));
  expect(lines.map(x=>x.ok)).toEqual([true,false,false,true]);expect(lines[3].results[0].result.phase).toBe('mulligan');
});
test('CLI-exported M2 position replay reproduces the fixed 46:0 result',()=>{
  const input=JSON.parse(readFileSync(new URL('./fixtures/m2-gi-nattak.json',import.meta.url),'utf8'));
  const s=replayMatch(input);expect(input.version).toBe(2);expect(outcome(s)).toMatchObject({rows:[[22,0],[3,0],[21,0]],scores:[46,0],winner:0});
  expect(s.events).toHaveLength(15);expect(s.phase).toBe('finished');
});
test('unsupported integer overflow in a scenario is rejected atomically',()=>{
  const session=new QbSession();session.execute([{op:'create'}]);const before=session.execute([{op:'state'}]);
  const result=session.execute([{op:'importPosition',position:{board:[unit(11,0,0,0,Number.MAX_SAFE_INTEGER)],hands:[[],[]]}}]);
  expect(JSON.stringify(result)).toContain('integer range');expect(session.execute([{op:'state'}])).toEqual(before);
});
for(const first of [0,1] as const)test(`headless M2 full match P${first+1} first, same public API and JSON replay`,()=>{
  const deck=deckPresets[4].cards,s=createGame([deck,deck],731,first);mulligan(s,0,[]);mulligan(s,1,[]);
  for(let i=0;s.phase!=='finished';i++){
    expect(i).toBeLessThan(120);const move=chooseBotMove(s);
    if(move){expect(legalMoves(s,s.turn)).toContainEqual(move);play(s,s.turn,move.handIndex,move.row,move.col);}else pass(s,s.turn);
    expect(s.board.flat().every(t=>!t.card||t.card.power>0)).toBe(true);
  }
  expect(replayMatch(JSON.parse(JSON.stringify(exportReplay(s))))).toEqual(s);
});
