import {expect,test} from 'vitest';
import {readFileSync} from 'node:fs';
import {createPosition,play,pass,outcome,exportReplay,replayMatch,type Player,type PositionTile} from '../src/engine.js';
import {byId,playableCards,tokenCards} from '../src/cards.js';
import {getCardEvidence,evidenceDimensions,evidenceSources} from '../src/evidence.js';
import {QbSession} from '../src/session.js';

const unit=(id:number,owner:Player,row:number,col:number,delta=0):PositionTile=>({row,col,owner,cardId:id,permanentDelta:delta});
const pawn=(owner:Player,row:number,col:number,pawns=3):PositionTile=>({row,col,owner,pawns});
for(const owner of [0,1] as const){
  const enemy=(1-owner) as Player,flip=(c:number)=>owner===0?c:4-c;
  const make=(board:PositionTile[],hand:number[])=>createPosition({board,hands:owner===0?[hand,[]]:[[],hand],turn:owner});
  test(`M3 P${owner+1} Ignilisk +2 persists for allies only across both marked offsets`,()=>{
    const s=make([pawn(owner,0,flip(1)),unit(7,owner,0,flip(2)),unit(7,enemy,2,flip(1))],[25]);
    play(s,owner,0,0,flip(1));expect(s.board[0][flip(2)].card?.power).toBe(4);expect(s.board[2][flip(1)].card?.power).toBe(2);
    const t=make([pawn(owner,0,flip(1)),unit(7,owner,2,flip(1))],[25]);play(t,owner,0,0,flip(1));
    expect(t.board[2][flip(1)].card?.power).toBe(4);expect(t.board[0][flip(2)]).toMatchObject({owner,pawns:1});
  });
  test(`M3 P${owner+1} Scrutineye enhances both adjacent rows but claims only two-away rows`,()=>{
    const s=make([pawn(owner,1,flip(2)),unit(7,owner,0,flip(2)),unit(7,enemy,2,flip(2))],[28]);
    play(s,owner,0,1,flip(2));expect(s.board[0][flip(2)].card?.power).toBe(3);expect(s.board[2][flip(2)].card?.power).toBe(3);
    expect(s.board[1][flip(3)].owner).toBe(null);
    const t=make([pawn(owner,0,flip(2)),unit(7,enemy,1,flip(2))],[28]);play(t,owner,0,0,flip(2));
    expect(t.board[1][flip(2)].card?.power).toBe(3);expect(t.board[2][flip(2)]).toMatchObject({owner,pawns:1});
  });
  test(`M3 P${owner+1} Desert Sahagin responds once to enfeeblement, not enhancement`,()=>{
    const s=make([unit(63,owner,1,flip(2)),unit(7,owner,2,flip(2)),pawn(owner,0,flip(2)),pawn(owner,0,flip(1))],[26,133]);
    play(s,owner,0,0,flip(2));expect(s.board[1][flip(2)].card?.power).toBe(2);expect(s.board[2][flip(2)].card?.power).toBe(6);
    pass(s,enemy);play(s,owner,0,0,flip(1));expect(s.board[1][flip(2)].card?.power).toBe(1);expect(s.board[2][flip(2)].card?.power).toBe(6);
    expect(s.events.filter(e=>e.type==='PowerChanged'&&e.reason==='firstEnfeebled')).toHaveLength(1);
    expect(replayMatch(exportReplay(s))).toEqual(s);
    const t=make([unit(63,owner,1,flip(2)),unit(7,owner,2,flip(2)),pawn(owner,1,flip(1))],[139]);
    play(t,owner,0,1,flip(1));expect(t.board[1][flip(2)].card?.power).toBe(4);expect(t.board[2][flip(2)].card?.power).toBe(3);
    expect(t.events.some(e=>e.type==='PowerChanged'&&e.reason==='firstEnfeebled')).toBe(false);
  });
  test(`M3 P${owner+1} Bahba Velamyu acts on destruction, targets enemies and clips its column`,()=>{
    const s=make([pawn(owner,1,flip(1)),unit(7,enemy,0,flip(2)),unit(7,owner,1,flip(2)),unit(7,enemy,2,flip(2))],[73,52]);
    play(s,owner,0,1,flip(1));expect(s.board[0][flip(2)].card?.power).toBe(2);expect(s.board[2][flip(2)].card?.power).toBe(2);
    pass(s,enemy);play(s,owner,0,1,flip(1));expect(s.board[0][flip(2)].card?.power).toBe(1);expect(s.board[2][flip(2)].card?.power).toBe(1);
    expect(s.board[1][flip(2)].card?.power).toBe(2);expect(s.discard[owner]).toContain(73);
    expect(s.events.filter(e=>e.type==='PowerChanged'&&e.reason==='onDestroy')).toHaveLength(2);
  });
  test(`M3 P${owner+1} Adjudicator counts either status across both sides, excludes itself and recalculates`,()=>{
    const s=make([unit(75,owner,2,flip(1),1),unit(7,owner,0,flip(0),1),unit(7,enemy,1,flip(3),-1),unit(7,enemy,0,flip(4)),pawn(owner,1,flip(2))],[20]);
    expect(s.board[2][flip(1)].card?.power).toBe(4);play(s,owner,0,1,flip(2));
    expect(s.board[1][flip(3)].card).toBe(null);expect(s.board[2][flip(1)].card?.power).toBe(3);
    expect(s.board[2][flip(1)].card?.dynamicDelta).toBe(1);
  });
  test(`M3 P${owner+1} Gilgamesh snapshots effective old power and weakens both far corners`,()=>{
    const s=make([unit(7,owner,0,flip(2),1),unit(13,owner,1,flip(2)),unit(7,owner,2,flip(0),8),unit(7,enemy,2,flip(4),8)],[106]);
    expect(s.board[0][flip(2)].card?.power).toBe(5);play(s,owner,0,0,flip(2));
    expect(s.events.find(e=>e.type==='CardReplaced')?.power).toBe(5);
    expect(s.board[2][flip(0)].card?.power).toBe(5);expect(s.board[2][flip(4)].card?.power).toBe(5);
    expect(s.board[0][flip(2)].card).toMatchObject({id:106,power:5,permanentDelta:0});
    expect(s.board[0][flip(1)].owner).toBe(null);expect(replayMatch(exportReplay(s))).toEqual(s);
  });
  test(`M3 P${owner+1} Roche weakens allies on irregular marked cells, not enemies or unmarked cells`,()=>{
    const s=make([pawn(owner,1,flip(2)),unit(7,owner,0,flip(1)),unit(7,owner,1,flip(0)),unit(7,owner,2,flip(2)),unit(7,enemy,0,flip(3)),unit(7,owner,2,flip(4))],[133]);
    play(s,owner,0,1,flip(2));
    for(const [r,c] of [[0,1],[1,0],[2,2]])expect(s.board[r][flip(c)].card?.power).toBe(1);
    expect(s.board[0][flip(3)].card?.power).toBe(2);expect(s.board[2][flip(4)].card?.power).toBe(2);
    for(const [r,c] of [[0,2],[1,1],[1,3]])expect(s.board[r][flip(c)]).toMatchObject({owner,pawns:1});
    expect(outcome(s).scores[owner]).toBe(9); // 1 middle edge + 5 Roche, bottom 1+2; top lost.
  });
}

test('catalog preserves M3 evidence scopes alongside the M6 J-Squad candidate',()=>{
  const catalog=JSON.parse(readFileSync(new URL('../data/card-catalog.json',import.meta.url),'utf8'));
  expect(playableCards).toHaveLength(145);expect(tokenCards).toHaveLength(21);expect(byId.has(134)).toBe(true);
  expect(catalog.coverageSummary).toMatchObject({candidate:145,executable:145,missingData:0,tokens:21});
  for(let id=1;id<=145;id++){
    const evidence=getCardEvidence(id),row=catalog.cards[id-1];expect(row.verification).toEqual(evidence.dimensions);
    for(const dimension of evidenceDimensions){
      const entry=evidence.dimensions[dimension];expect(['verified','candidate','conflict','missing']).toContain(entry.status);
      for(const ref of entry.sources)expect(evidenceSources[ref]).toBeDefined();
      if(dimension==='timing')expect(entry.status).not.toBe('verified');
    }
  }
  expect(getCardEvidence(63).dimensions.effect.status).toBe('conflict');
  expect(getCardEvidence(63).dimensions.implementation).toMatchObject({status:'verified',scope:'project'});
  expect(catalog.cards[133]).toMatchObject({rulesImplemented:true,rules:{cost:3,power:2,influence:[]}});
  expect(getCardEvidence(134).dimensions.abilityPattern.status).toBe('candidate');
  expect(getCardEvidence(134).issues.join(' ')).toContain('来源冲突');
});

test('M3 conditional-cycle detection rejects repeats atomically in either orientation without inventing outcomes',()=>{
  for(const mirror of [false,true]){
    const session=new QbSession();session.execute([{op:'create',seed:7}]);const before=session.execute([{op:'state'}]);
    const board=[unit(66,0,1,2,1),unit(66,1,0,2,-1)].map(t=>mirror?{...t,row:2-t.row,col:4-t.col}:t);
    const response=session.execute([{op:'importPosition',position:{board,hands:[[],[]]}}]);
    expect(JSON.stringify(response)).toContain('UNSTABLE_AURA');expect(JSON.stringify(response)).toContain('Rebirth ordering is unverified');
    expect(session.execute([{op:'state'}])).toEqual(before);
  }
});

test('M3 JSON fixed position runs through the CLI session core and round-trips a v2 replay',()=>{
  const request=JSON.parse(readFileSync(new URL('../examples/cli/desert-sahagin.json',import.meta.url),'utf8'));
  const session=new QbSession(),result=session.execute(request);expect(result.ok).toBe(true);
  const replay=(session.execute([{op:'replay'}]).results[0] as {result:unknown}).result;
  const restored=new QbSession();expect(restored.execute([{op:'restoreReplay',replay}]).ok).toBe(true);
  expect(restored.execute([{op:'state'}])).toEqual(session.execute([{op:'state'}]));
  expect((session.execute([{op:'score'}]).results[0] as {result:unknown}).result).toMatchObject({phase:'finished',scores:[11,0],winner:0});
  const evidence=session.execute([{op:'evidence',cardId:134}]);expect(evidence.ok).toBe(true);
  expect(JSON.stringify(evidence)).toContain('candidate');
});
