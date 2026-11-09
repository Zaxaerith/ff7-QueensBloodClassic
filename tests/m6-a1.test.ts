import {expect,test} from 'vitest';
import {readFileSync} from 'node:fs';
import {byId,playableCards,starterDeck,tokenCards} from '../src/cards.js';
import {M6_TOKEN} from '../src/card-expansion.js';
import {createGame,createPosition,legalMoves,mulligan,play,pass,outcome,exportReplay,replayMatch,type Game,type Player,type Position,type PositionTile} from '../src/engine.js';
import {botActions,botSimulation,observeGame,recommendBot} from '../src/bot.js';
import {analyzeDecision,historicalDecision} from '../src/replay-analysis.js';
import {saveMatch,restoreMatch,ReplayTimeline,RULES_VERSION} from '../src/match-archive.js';
import {readDecks,validateDeck} from '../src/ui-data.js';
import {getCardEvidence} from '../src/evidence.js';
import {QbSession} from '../src/session.js';

// Assertions below describe the documented candidate, not a Rebirth recording.
const johnnys=Object.values(M6_TOKEN);
const deck=[...starterDeck.slice(0,14),134];
const pawn=(owner:Player,row:number,col:number,pawns=3):PositionTile=>({owner,row,col,pawns});
const unit=(cardId:number,owner:Player,row:number,col:number,permanentDelta=0):PositionTile=>({cardId,owner,row,col,permanentDelta});
const spawned=(game:Game)=>game.events.filter(e=>e.type==='CardSpawned');

test('J-Squad is a single-copy legendary in normal and persisted decks; auto-spawned Johnnys cannot be drafted or played from hand',()=>{
  expect(validateDeck(deck)).toBeNull();expect(()=>createGame([deck,deck],134)).not.toThrow();
  expect(validateDeck([...deck.slice(1),134])).toContain('Too many copies');
  const raw=JSON.stringify({version:1,selectedId:'j',decks:[{id:'j',name:'Johnnys',cards:deck}]});
  expect(readDecks(raw)).toMatchObject({issues:[],data:{selectedId:'j',decks:[{cards:deck}]}});
  for(const id of johnnys){
    expect(byId.get(id)).toMatchObject({rarity:'token',cost:0,power:1,influence:[]});
    expect(validateDeck([...deck.slice(0,14),id])).toContain('Generated cards');
  }
  expect(legalMoves(createPosition({hands:[johnnys,[]],board:[pawn(0,1,0)]}),0)).toEqual([]);
});

for(const owner of [0,1] as const){
  const enemy=(1-owner) as Player,flip=(col:number)=>owner===0?col:4-col;
  const make=(board:PositionTile[],hand:number[]=[134],other:number[]=[],draw:number[]=[])=>{
    const hands:[number[],number[]]=[[],[]],decks:[number[],number[]]=[[],[]];
    hands[owner]=hand;hands[enemy]=other;decks[owner]=draw;
    return createPosition({turn:owner,hands,decks,board:board.map(t=>({...t,col:flip(t.col)}))});
  };
  const at=(game:Game,row:number,col:number)=>game.board[row][flip(col)];

  test(`P${owner+1} J-Squad requires an empty allied rank-three tile and rejects every other target atomically`,()=>{
    const game=make([pawn(owner,1,0),pawn(owner,0,0,1),pawn(owner,2,0,2),pawn(enemy,1,4),unit(7,owner,1,2)]);
    expect(legalMoves(game,owner)).toEqual([{handIndex:0,row:1,col:flip(0)}]);
    const before=structuredClone(game);
    for(const [r,c] of [[0,0],[2,0],[1,4],[1,2],[0,2]]){
      expect(()=>play(game,owner,0,r,flip(c))).toThrow('Illegal move');expect(game).toEqual(before);
    }
  });

  for(const [rank,id,orthogonal,diagonal,score] of [
    [1,M6_TOKEN.johnny1,3,3,18],
    [2,M6_TOKEN.johnny2,4,2,19],
    [3,M6_TOKEN.johnny3,2,6,19]
  ])test(`P${owner+1} rank ${rank} spawns its Johnny, clips the far pattern, buffs both sides and scores`,()=>{
    const game=make([
      pawn(owner,1,4),pawn(owner,0,2,rank),pawn(enemy,1,0),
      unit(7,owner,0,0),unit(7,enemy,0,4),unit(7,owner,2,2),
      unit(7,owner,2,0),unit(7,enemy,2,4),unit(7,owner,1,2),
      unit(7,enemy,0,1),unit(7,owner,0,3),unit(7,owner,2,1)
    ],[134],[],[7]);
    play(game,owner,0,1,flip(4));
    expect(at(game,0,2).card).toMatchObject({id,owner,power:1,permanentDelta:0});
    for(const [r,c] of [[0,0],[0,4],[2,2]])expect(at(game,r,c).card?.power).toBe(orthogonal);
    for(const c of [0,4])expect(at(game,2,c).card?.power).toBe(diagonal);
    for(const [r,c] of [[1,2],[0,1],[0,3],[2,1]])expect(at(game,r,c).card?.power).toBe(2);
    expect(at(game,1,0)).toMatchObject({owner:enemy,pawns:3,card:null});
    expect(at(game,1,1)).toEqual({owner:null,pawns:0,card:null});
    expect(game.hands[owner]).toEqual([]);expect(game.decks[owner]).toEqual([7]);
    expect(spawned(game).map(e=>e.cardId)).toEqual([id]);
    expect(game.events.filter(e=>e.type==='PawnsClaimed')).toEqual([]);
    expect(game.events.filter(e=>e.type==='CardPlayed').map(e=>e.cardId)).toEqual([134]);
    pass(game,enemy);expect(game.hands[owner]).toEqual([7]);expect(game.decks[owner]).toEqual([]);
    expect(game.events.filter(e=>e.type==='CardAddedToHand')).toMatchObject([{player:owner,reason:'draw'}]);
    pass(game,owner);
    expect(game.phase).toBe('finished');expect(outcome(game).scores[owner]).toBe(score);
    expect(outcome(game).scores[enemy]).toBe(0);expect(replayMatch(exportReplay(game))).toEqual(game);
  });

  test(`P${owner+1} a mixed-rank batch stacks auras, never counts tokens as hand plays, and preserves rank snapshots`,()=>{
    const game=make([pawn(owner,1,4),pawn(owner,0,0,1),pawn(owner,0,2,2),pawn(owner,2,2,3),
      unit(7,owner,2,0),unit(7,enemy,0,4),unit(32,owner,1,0)]);
    play(game,owner,0,1,flip(4));
    expect(at(game,0,0).card).toMatchObject({id:M6_TOKEN.johnny1,power:7});
    expect(at(game,0,2).card).toMatchObject({id:M6_TOKEN.johnny2,power:2});
    expect(at(game,2,2).card).toMatchObject({id:M6_TOKEN.johnny3,power:4});
    expect(at(game,2,0).card?.power).toBe(3);expect(at(game,0,4).card?.power).toBe(8);
    expect(at(game,1,0).card?.power).toBe(2); // Sea Devil observes only J-Squad.
    expect(spawned(game)).toHaveLength(3);expect(outcome(game).scores[owner]).toBe(20);
    expect(new Set(game.board.flat().flatMap(t=>t.card?[t.card.instanceId]:[])).size).toBe(7);
  });

  for(const method of ['replace','destroy'] as const){
    test(`P${owner+1} ${method} of the mother leaves its spawned Johnny independent without spawning again`,()=>{
      const game=make([pawn(owner,1,0),pawn(owner,0,2,2),unit(7,owner,2,2),pawn(enemy,1,1,2)],[134,51],[39]);
      play(game,owner,0,1,flip(0));
      if(method==='replace'){pass(game,enemy);play(game,owner,0,1,flip(0));}
      else play(game,enemy,0,1,flip(1));
      expect(game.discard[owner]).toContain(134);
      expect(at(game,0,2).card).toMatchObject({id:M6_TOKEN.johnny2,power:1});
      expect(at(game,2,2).card?.power).toBe(4);expect(spawned(game)).toHaveLength(1);
      expect(replayMatch(exportReplay(game))).toEqual(game);
    });

    test(`P${owner+1} ${method} of a Johnny removes its aura from both sides without respawning`,()=>{
      const game=make([pawn(owner,1,0),pawn(owner,0,2,2),unit(7,owner,2,2),unit(7,enemy,0,4),pawn(enemy,0,3,2)],[134,51],[39]);
      play(game,owner,0,1,flip(0));
      expect(at(game,2,2).card?.power).toBe(4);expect(at(game,0,4).card?.power).toBe(4);
      if(method==='replace'){pass(game,enemy);play(game,owner,0,0,flip(2));}
      else play(game,enemy,0,0,flip(3));
      expect(game.discard[owner]).toContain(M6_TOKEN.johnny2);
      expect(at(game,2,2).card?.power).toBe(2);expect(at(game,0,4).card?.power).toBe(2);
      expect(at(game,1,0).card?.id).toBe(134);expect(spawned(game)).toHaveLength(1);
    });
  }

  test(`P${owner+1} generated auras activate Cloud once and update Ifrit through the shared status mechanism`,()=>{
    const game=make([pawn(owner,1,4),pawn(owner,0,2,1),unit(86,owner,2,2,3),unit(7,owner,2,1),unit(95,owner,1,0)]);
    play(game,owner,0,1,flip(4));
    expect(at(game,2,2).card?.power).toBe(7);expect(at(game,2,1).card?.power).toBe(4);
    expect(at(game,1,0).card?.power).toBe(9);
    expect(game.events.filter(e=>e.type==='ThresholdReached'&&e.cardId===86)).toHaveLength(1);
    expect(replayMatch(exportReplay(game))).toEqual(game);
  });

  test(`P${owner+1} a Johnny enables Two Face and its destruction disables the conditional aura`,()=>{
    const game=make([pawn(owner,1,0),pawn(owner,0,2,1),unit(66,owner,0,4),unit(7,enemy,1,4),pawn(enemy,0,3,2)],[134],[39]);
    play(game,owner,0,1,flip(0));
    expect(at(game,0,4).card?.power).toBe(4);expect(at(game,1,4).card?.power).toBe(6);
    play(game,enemy,0,0,flip(3));
    expect(at(game,0,4).card?.power).toBe(3);expect(at(game,1,4).card?.power).toBe(2);
  });

  test(`P${owner+1} the batch stabilizes together under Mindflayer, then losing support causes a death chain`,()=>{
    const game=make([pawn(owner,1,4),pawn(owner,0,2,1),pawn(owner,2,2,2),
      unit(27,owner,1,2),unit(35,owner,1,0),pawn(enemy,0,3,2)],[134],[39]);
    play(game,owner,0,1,flip(4));
    expect(at(game,0,2).card?.power).toBe(2);expect(at(game,2,2).card?.power).toBe(1);
    play(game,enemy,0,0,flip(3));
    expect(at(game,0,2).card).toBeNull();expect(at(game,2,2).card).toBeNull();
    expect(game.discard[owner]).toEqual([M6_TOKEN.johnny1,M6_TOKEN.johnny2]);
    expect(at(game,1,0).card?.power).toBe(5);expect(spawned(game)).toHaveLength(2);
    expect(game.events.filter(e=>e.type==='CardDestroyed').map(e=>e.reason)).toEqual(['ability','power']);
    expect(replayMatch(exportReplay(game))).toEqual(game);
  });
}

const simplePosition:Position={seed:134,hands:[[134],[]],board:[pawn(0,1,0),pawn(0,0,0,1),pawn(0,2,0,1)]};
for(const difficulty of ['easy','normal','hard'] as const)test(`${difficulty} Bot recognizes and simulates a J-Squad action within its normal public view`,()=>{
  const game=createPosition(simplePosition),before=structuredClone(game),view=observeGame(game),viewBefore=structuredClone(view);
  expect(botActions(botSimulation(view))).toContainEqual({type:'play',player:0,handIndex:0,row:1,col:0});
  const decision=recommendBot(game,0,{difficulty,seed:7,maxNodes:32});
  expect(decision.action).toEqual({type:'play',player:0,handIndex:0,row:1,col:0});
  expect(decision.stats.rejected).toBe(0);expect(game).toEqual(before);expect(view).toEqual(viewBefore);
});

test('Session legal/play, analysis, saves and Replay v2 accept J-Squad without protocol or state mutation',()=>{
  const session=new QbSession();expect(session.execute([{op:'importPosition',position:simplePosition}]).ok).toBe(true);
  const state=()=>session.execute({operations:[{op:'state'}],includeState:true}).state!;
  const before=state(),action={type:'play' as const,player:0 as const,handIndex:0,row:1,col:0};
  expect(JSON.stringify(session.execute([{op:'legal'}]))).toContain('134');
  const query=session.execute([{op:'bot',difficulty:'hard',maxNodes:32},{op:'analyze',actual:action,maxNodes:32}]);
  expect(query.ok).toBe(true);expect(state()).toEqual(before);
  expect(session.execute([{op:'play',cardId:134,row:1,col:0}]).ok).toBe(true);
  const after=state();expect(spawned(after)).toHaveLength(2);
  const saved=saveMatch(after,{deck,seed:134,difficulty:'hard',first:'player'},'J-Squad','m6-a1');
  expect(saved).toMatchObject({schema:'qbclassic.match',version:1,rulesVersion:RULES_VERSION,replay:{version:2,rulesVersion:RULES_VERSION}});
  expect(restoreMatch(JSON.parse(JSON.stringify(saved))).game).toEqual(after);
  expect(session.execute([{op:'pass'},{op:'pass'}]).ok).toBe(true);
  const finished=state(),timeline=new ReplayTimeline(exportReplay(finished));
  expect(timeline.at(1).game).toEqual(after);expect(timeline.at(timeline.length).game).toEqual(finished);
  const point=historicalDecision(timeline,1),original=JSON.stringify(timeline.replay);
  const analysis=analyzeDecision(point.view,point.actual,{difficulty:'hard',maxNodes:32});
  expect(analysis.actual).toMatchObject({cardId:134,complete:true});
  expect(analysis.actual.preview?.events.filter(e=>e.type==='CardSpawned')).toHaveLength(2);
  expect(JSON.stringify(timeline.replay)).toBe(original);
  const restored=new QbSession();expect(restored.execute([{op:'restoreReplay',replay:exportReplay(finished)}]).ok).toBe(true);
  expect(restored.execute({operations:[],includeState:true}).state).toEqual(finished);
});

test('pre-M6 v1/v2 saves retain their recorded checks under qb-classic-m3-v1',()=>{
  const legacy=JSON.parse(readFileSync(new URL('./fixtures/m6-a1-legacy-saves.json',import.meta.url),'utf8'));
  expect(legacy.baseline).toBe('643afba');
  expect(legacy.saves.map((s:{check:string})=>s.check)).toEqual(['1aa439ec','a6317141']);
  for(const save of legacy.saves){
    expect(save.rulesVersion).toBe('qb-classic-m3-v1');
    const copy=restoreMatch(save);
    expect(copy.save).toEqual(save);expect(replayMatch(copy.save.replay)).toEqual(copy.game);
  }
});

test('a short normal-deck opening plays J-Squad and restores its generated cards through Replay v1',()=>{
  const cards=[1,1,2,2,4,4,13,13,26,26,98,134,71,71,69],game=createGame([cards,cards],3);
  mulligan(game,0,[]);mulligan(game,1,[]);
  play(game,0,game.hands[0].indexOf(71),2,0); // Twin Brain raises the top home tile to rank three.
  pass(game,1);play(game,0,game.hands[0].indexOf(134),0,0);
  expect(spawned(game).map(e=>e.cardId)).toEqual([M6_TOKEN.johnny1]);
  expect(exportReplay(game).version).toBe(1);expect(replayMatch(exportReplay(game))).toEqual(game);
  const saved=saveMatch(game,{deck:cards,seed:3,difficulty:'normal',first:'player'},'J opening','m6-v1');
  expect(restoreMatch(JSON.parse(JSON.stringify(saved))).game).toEqual(game);
});

test('145-card inventory separates source support, conflict and candidate timing without promoting game verification',()=>{
  const rows=readFileSync(new URL('./fixtures/card-rule-status.csv',import.meta.url),'utf8').trim().split(/\r?\n/).slice(1).map(row=>row.split(','));
  expect(rows.map(row=>Number(row[0]))).toEqual(Array.from({length:145},(_,i)=>i+1));
  expect(playableCards).toHaveLength(145);expect(tokenCards).toHaveLength(21);
  expect(rows.every(row=>row[2]==='true')).toBe(true);
  expect(rows[133][3]).toBe('conflict');expect(rows[65][3]).toBe('insufficient');
  expect(rows.filter(row=>row[3]==='supported').map(row=>Number(row[0]))).toEqual([106,133]);
  expect(rows.every(row=>row[6]==='candidate')).toBe(true);
  const evidence=getCardEvidence(134);
  expect(evidence.dimensions.abilityPattern).toMatchObject({status:'candidate',sources:expect.arrayContaining(['wiki','johnnyTest'])});
  expect(evidence.dimensions.effect.status).toBe('conflict');
  expect(evidence.dimensions.implementation).toMatchObject({status:'verified',scope:'project'});
});
