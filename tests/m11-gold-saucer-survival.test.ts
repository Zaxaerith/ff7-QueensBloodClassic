import {expect,test} from 'vitest';
import {SHADOWBLOOD_QUEEN_ID,shadowbloodQueen} from '../src/boss-challengers.js';
import {botSimulation,decideBot,observeGame} from '../src/bot.js';
import {byId,starterDeck} from '../src/cards.js';
import {
  cardStatus,createPosition,outcome,pass,play,
  TURN_DRAW_RULES_VERSION,
} from '../src/engine.js';
import {
  goldSaucerChallenges,survivalChallenges,
} from '../src/gold-saucer-catalog.js';
import {MATCH_KEY} from '../src/match-archive.js';
import {
  GoldSaucerChallengeSession,readActiveSurvival,restoreSurvival,serializeSurvival,
  SURVIVAL_KEY,SurvivalSession,writeActiveSurvival,
} from '../src/survival-session.js';
import {validateDeck,type StoragePort} from '../src/ui-data.js';

class MemoryStore implements StoragePort {
  values=new Map<string,string>();
  getItem(key:string){return this.values.get(key)??null;}
  setItem(key:string,value:string){this.values.set(key,value);}
}

test('engine tileBonus boosts baseline power, triggers enhancement, handles lethal terrain and persists after removal',()=>{
  const game=createPosition({
    turn:0,hands:[[48,51,1],[7]],
    board:[
      {row:0,col:2,owner:0,cardId:7},
      {row:1,col:2,owner:0,pawns:1,tileBonus:2},
      {row:2,col:2,owner:0,pawns:1,tileBonus:-2},
      {row:0,col:0,owner:0,pawns:1},
    ],
  });
  expect('tileBonus' in game.board[0][0]).toBe(false);
  expect('noTurnDraw' in game).toBe(false);
  expect(game.board[1][2].tileBonus).toBe(2);

  play(game,0,0,1,2);
  expect(game.board[1][2].card?.power).toBe(4);
  expect(cardStatus(game.board[1][2].card!)).toBe('enhanced');
  expect(game.board[1][2].card?.enhancedOnce).toBe(true);
  expect(game.board[0][2].card?.power).toBe(5);
  expect(outcome(game).scores).toEqual([9,0]);

  pass(game,1);
  play(game,0,0,1,2);
  expect(game.board[1][2].tileBonus).toBe(2);
  expect(game.board[1][2].card?.power).toBe(4);

  pass(game,1);
  play(game,0,0,2,2);
  expect(game.board[2][2].card).toBeNull();
  expect(game.board[2][2].tileBonus).toBe(-2);
  expect(game.discard[0]).toContain(1);
});

test('engine noTurnDraw suppresses turn handoff draws and syncs through BotView/botSimulation',()=>{
  const game=createPosition({
    turn:0,hands:[[1],[7]],decks:[[8,9],[11,12]],noTurnDraw:true,
    board:[{row:0,col:0,owner:0,pawns:1},{row:0,col:4,owner:1,pawns:1}],
  },TURN_DRAW_RULES_VERSION);

  play(game,0,0,0,0);
  expect(game.turn).toBe(1);
  expect(game.hands[1]).toEqual([7]);
  expect(game.decks[1]).toEqual([11,12]);

  const view=observeGame(game,1);
  expect(view.noTurnDraw).toBe(true);
  const sim=botSimulation(view);
  expect(sim.noTurnDraw).toBe(true);
  play(sim,1,0,0,4);
  expect(sim.hands[0]).toEqual([]);

  const decision=decideBot(view,{difficulty:'normal',seed:1101});
  expect(decision.action.type).toBe('play');
});

test('all 6 Gold Saucer challenges and 3 survival tiers have legal 15-card numbered opponent decks',()=>{
  expect(goldSaucerChallenges.map(c=>c.id)).toEqual([
    'gs-high-ground',
    'gs-outflanked',
    'gs-mais-here',
    'gs-luxury-real-estate',
    'gs-behind-enemy-lines',
    'gs-chadley-callous',
  ]);
  expect(survivalChallenges.map(c=>c.id)).toEqual([
    'survival-boot-camp',
    'survival-extreme',
    'survival-nightmare',
  ]);
  for(const challenge of goldSaucerChallenges){
    expect(validateDeck(challenge.opponentDeck),challenge.id).toBeNull();
    expect(challenge.opponentDeck.every(id=>id>=1&&id<=145&&byId.get(id)?.rarity!=='token')).toBe(true);
  }
  for(const survival of survivalChallenges){
    for(const round of survival.rounds){
      expect(validateDeck(round.opponentDeck),`${survival.id}-r${round.round}`).toBeNull();
      expect(round.opponentDeck.every(id=>id>=1&&id<=145&&byId.get(id)?.rarity!=='token')).toBe(true);
    }
  }
});

test.each(goldSaucerChallenges)('Gold Saucer challenge $id initializes gimmick, accepts legal Bot reply and settles',challenge=>{
  const session=new GoldSaucerChallengeSession(challenge.id,starterDeck,{seed:1101});
  if(challenge.id==='gs-high-ground'){
    expect(session.game.board[0][2].tileBonus).toBe(2);
    expect(session.game.board[1][2].tileBonus).toBe(2);
    expect(session.game.board[2][2].tileBonus).toBe(2);
  } else if(challenge.id==='gs-outflanked'){
    expect(session.game.board[0][4].card?.id).toBe(7);
    expect(session.game.board[2][4].card?.id).toBe(8);
    expect(session.game.board[1][1]).toMatchObject({owner:0,pawns:2});
  } else if(challenge.id==='gs-mais-here'){
    expect(session.game.hands[0]).toHaveLength(7);
    expect(session.game.hands[0].slice(-2)).toEqual([1010,1092]);
    expect(session.game.decks[0]).toHaveLength(10);
  } else if(challenge.id==='gs-luxury-real-estate'){
    expect(session.game.board[1][1]).toMatchObject({owner:0,pawns:3});
    expect(session.game.board[1][3]).toMatchObject({owner:1,pawns:3});
    expect(challenge.rewardCardId).toBe(114);
  } else if(challenge.id==='gs-behind-enemy-lines'){
    expect(session.game.board[1][3]).toMatchObject({owner:0,pawns:2});
    expect(session.game.board[0][1]).toMatchObject({owner:1,pawns:1});
    expect(session.game.board[2][1]).toMatchObject({owner:1,pawns:1});
    expect(challenge.rewardCardId).toBe(117);
  } else if(challenge.id==='gs-chadley-callous'){
    expect(session.game.hands[0]).toHaveLength(7);
    expect(session.game.hands[0].slice(-2)).toEqual([51,2125]);
    expect(challenge.rewardCardId).toBe(118);
  }

  const move=session.moves()[0];
  expect(move).toBeDefined();
  session.play(move.handIndex,move.row,move.col);
  expect(session.game.turn).toBe(1);

  const decision=decideBot(session.botView(),session.botOptions());
  session.applyBotAction(decision.action);
  expect(session.game.turn).toBe(0);

  while(session.game.phase!=='finished')session.pass();
  expect(session.result()).not.toBeNull();

  session.retry();
  expect(session.game.phase).toBe('playing');
  expect(session.result()).toBeNull();
});

test('SurvivalSession bonusDrawRow grants +1 extra draw on winning the treasure lane and survives save/restore',()=>{
  // Boot Camp Round 1 has bonusDrawRow === 1; Round 2 has drawAtStart === 2.
  const winSession=SurvivalSession.start('survival-boot-camp',starterDeck,2026);
  expect(winSession.roundSpec(1).bonusDrawRow).toBe(1);
  const row1Move=winSession.moves().find(m=>m.row===1)!;
  expect(row1Move).toBeDefined();
  winSession.play(row1Move.handIndex,row1Move.row,row1Move.col);
  // Opponent passes, then player passes -> player wins Row 1 cleanly.
  winSession.applyBotAction({type:'pass',player:1});
  winSession.pass();

  const r1Won=winSession.snapshot();
  expect(r1Won.roundSettled).toBe(true);
  expect(r1Won.roundScores[0].bonusDrawEarned).toBe(true);
  const handAfterR1=r1Won.carriedPlayerHand.length;
  const deckAfterR1=r1Won.remainingPlayerDeck.length;

  // Save/restore right between Round 1 and Round 2, then advance: should draw 2 (base) + 1 (bonus) = 3 cards!
  const restoredWon=restoreSurvival(JSON.parse(JSON.stringify(winSession.serialize())));
  const r2AfterBonus=restoredWon.advanceRound();
  expect(r2AfterBonus.game.hands[0]).toHaveLength(handAfterR1+3);
  expect(r2AfterBonus.game.decks[0]).toHaveLength(deckAfterR1-3);
  expect(1+r2AfterBonus.game.hands[0].length+r2AfterBonus.game.decks[0].length).toBe(15);

  // Contrast: if player does not win Row 1, bonusDrawEarned is false and Round 2 draws only base 2 cards.
  const noWinSession=SurvivalSession.start('survival-boot-camp',starterDeck,2026);
  noWinSession.pass();
  noWinSession.applyBotAction({type:'pass',player:1});
  const r1Tie=noWinSession.snapshot();
  expect(r1Tie.roundScores[0].bonusDrawEarned).toBe(false);
  const r2NoBonus=noWinSession.advanceRound();
  expect(r2NoBonus.game.hands[0]).toHaveLength(r1Tie.carriedPlayerHand.length+2);
  expect(r2NoBonus.game.decks[0]).toHaveLength(r1Tie.remainingPlayerDeck.length-2);
});

test('SurvivalSession Boot Camp (3 rounds) and Extreme Survival (4 rounds) conserve cards, evaluate tiers and persist',()=>{
  const store=new MemoryStore();

  // Boot Camp (3 rounds)
  const boot=SurvivalSession.start('survival-boot-camp',starterDeck,2026);
  let bootPlayed=0;
  for(let r=1;r<=3;r++){
    const move=boot.moves()[0];
    if(move){
      boot.play(move.handIndex,move.row,move.col);
      bootPlayed++;
      boot.applyBotAction(decideBot(boot.botView(),boot.botOptions()).action);
    }
    while(boot.game.phase!=='finished')boot.pass();
    const snap=boot.snapshot();
    expect(bootPlayed+snap.carriedPlayerHand.length+snap.remainingPlayerDeck.length).toBe(15);
    if(r<3)boot.advanceRound();
  }
  const bootFinal=boot.snapshot();
  expect(bootFinal.roundScores).toHaveLength(3);
  expect(bootFinal.cumulativePlayerScore).toBe(bootFinal.roundScores.reduce((a,b)=>a+b.playerScore,0));
  expect(bootFinal.status).not.toBe('in-progress');

  // Extreme Survival (4 rounds · reward #102 · targets 40/60/80 · Round 4 no-draw finale)
  const extreme=SurvivalSession.start('survival-extreme',starterDeck,4044);
  expect(extreme.challenge.rewardCardId).toBe(102);
  expect(extreme.challenge.targets).toEqual({bronze:40,silver:60,gold:80});
  expect(extreme.totalRounds).toBe(4);
  let extremePlayed=0;

  for(let r=1;r<=3;r++){
    expect(extreme.roundSpec(r).noTurnDraw).toBe(false);
    expect(extreme.roundSpec(r).bonusDrawRow).toBeDefined();
    const move=extreme.moves()[0];
    if(move){
      extreme.play(move.handIndex,move.row,move.col);
      extremePlayed++;
      extreme.applyBotAction(decideBot(extreme.botView(),extreme.botOptions()).action);
    }
    while(extreme.game.phase!=='finished')extreme.pass();
    extreme.advanceRound();
  }

  // Round 4 of Extreme Survival: drawAtStart === 0, noTurnDraw === true, no bonusDrawRow.
  const r4Snap=extreme.snapshot();
  expect(r4Snap.currentRound).toBe(4);
  expect(r4Snap.roundSpec.drawAtStart).toBe(0);
  expect(r4Snap.roundSpec.noTurnDraw).toBe(true);
  expect(r4Snap.roundSpec.bonusDrawRow).toBeUndefined();
  expect(r4Snap.game.noTurnDraw).toBe(true);

  expect(writeActiveSurvival(store,extreme.serialize())).toBeNull();
  const restoredExtreme=readActiveSurvival(store).session!;
  expect(restoredExtreme.snapshot()).toEqual(r4Snap);

  const r4Move=restoredExtreme.moves()[0];
  if(r4Move){
    const oppHandBefore=restoredExtreme.game.hands[1].length;
    restoredExtreme.play(r4Move.handIndex,r4Move.row,r4Move.col);
    extremePlayed++;
    expect(restoredExtreme.game.hands[1]).toHaveLength(oppHandBefore);
    restoredExtreme.applyBotAction(decideBot(restoredExtreme.botView(),restoredExtreme.botOptions()).action);
  }
  while(restoredExtreme.game.phase!=='finished')restoredExtreme.pass();
  const extremeFinal=restoredExtreme.snapshot();
  expect(extremeFinal.roundScores).toHaveLength(4);
  expect(extremeFinal.roundScores[3].bonusDrawEarned).toBe(false);
  expect(extremeFinal.status).not.toBe('in-progress');
  expect(extremePlayed+extremeFinal.carriedPlayerHand.length+extremeFinal.remainingPlayerDeck.length).toBe(15);
});

test('Nightmare Survival (5 rounds) culminates in Shadowblood Queen Boss finale, enforces no-draw R4-5 and persists cleanly',()=>{
  const store=new MemoryStore();
  store.setItem(MATCH_KEY,'{"unrelated":"normal-match"}');
  const session=SurvivalSession.start('survival-nightmare',starterDeck,3033);
  let playedByPlayer=0;

  // Verify Nightmare Round 5 reuses M12 Shadowblood Queen boss configuration.
  const r5Spec=session.roundSpec(5);
  expect(r5Spec.bossId).toBe(SHADOWBLOOD_QUEEN_ID);
  expect(r5Spec.battleBackgroundId).toBe('shadowblood-queen');
  expect(r5Spec.opponentStrategy).toBe('queen');
  expect(r5Spec.opponentDeck).toEqual(shadowbloodQueen.deck);
  expect(r5Spec.openingBoard).toEqual(shadowbloodQueen.openingBoard);
  expect(r5Spec.drawAtStart).toBe(0);
  expect(r5Spec.noTurnDraw).toBe(true);
  expect(r5Spec.bonusDrawRow).toBeUndefined();

  // Complete Rounds 1-3 (choosing non-bonus row or passing so we test exact conservation across all 5 rounds).
  for(let r=1;r<=3;r++){
    const move=session.moves()[0];
    if(move){
      session.play(move.handIndex,move.row,move.col);
      playedByPlayer++;
      session.applyBotAction(decideBot(session.botView(),session.botOptions()).action);
    }
    while(session.game.phase!=='finished')session.pass();
    if(r<3)session.advanceRound();
  }

  // Persist after Round 3 finishes and restore as if browser reopened.
  const savedAfterR3=serializeSurvival(session);
  expect(writeActiveSurvival(store,savedAfterR3)).toBeNull();
  expect(store.getItem(SURVIVAL_KEY)).toBeTruthy();
  expect(store.getItem(MATCH_KEY)).toBe('{"unrelated":"normal-match"}');

  const loaded=readActiveSurvival(store);
  expect(loaded.present).toBe(true);
  expect(loaded.error).toBeNull();
  const restored=loaded.session!;
  expect(restored.snapshot()).toEqual(session.snapshot());

  // Advance to Round 4 (base drawAtStart === 0, optional +1 only if Round 3 bonus row was won; in-round noTurnDraw === true).
  const r3End=restored.snapshot();
  const expectedR4Draw=Math.min(r3End.roundScores[2].bonusDrawEarned?1:0,r3End.remainingPlayerDeck.length);
  const r4Start=restored.advanceRound();
  expect(r4Start.currentRound).toBe(4);
  expect(r4Start.roundSpec.drawAtStart).toBe(0);
  expect(r4Start.roundSpec.noTurnDraw).toBe(true);
  expect(r4Start.roundSpec.bonusDrawRow).toBeUndefined();
  expect(r4Start.game.noTurnDraw).toBe(true);
  expect(r4Start.game.hands[0]).toHaveLength(r3End.carriedPlayerHand.length+expectedR4Draw);
  expect(r4Start.game.decks[0]).toHaveLength(r3End.remainingPlayerDeck.length-expectedR4Draw);

  // Playing a card in Round 4 must NOT draw on turn handoff for either player.
  const r4Move=restored.moves()[0];
  expect(r4Move).toBeDefined();
  const r4HandBefore=restored.game.hands[0].length;
  const r4DeckBefore=restored.game.decks[0].length;
  const oppHandBefore=restored.game.hands[1].length;
  restored.play(r4Move.handIndex,r4Move.row,r4Move.col);
  playedByPlayer++;
  expect(restored.game.hands[1]).toHaveLength(oppHandBefore);
  restored.applyBotAction(decideBot(restored.botView(),restored.botOptions()).action);
  expect(restored.game.hands[0]).toHaveLength(r4HandBefore-1);
  expect(restored.game.decks[0]).toHaveLength(r4DeckBefore);

  // Finish Round 4 and advance to Round 5: Shadowblood Queen Boss finale (strictly 0 start draw + noTurnDraw).
  while(restored.game.phase!=='finished')restored.pass();
  const r4End=restored.snapshot();
  expect(r4End.roundScores[3].bonusDrawEarned).toBe(false);

  const r5Start=restored.advanceRound();
  expect(r5Start.currentRound).toBe(5);
  expect(r5Start.game.noTurnDraw).toBe(true);
  expect(r5Start.game.hands[0]).toEqual(r4End.carriedPlayerHand);
  expect(r5Start.game.decks[0]).toEqual(r4End.remainingPlayerDeck);
  // Pre-placed #145 Shadowblood Queen at B5 (1,4) with Queen's opening pawns.
  expect(r5Start.game.board[1][4].card).toMatchObject({id:145,owner:1,power:3,dynamicDelta:0});
  expect(r5Start.game.board[0][4]).toMatchObject({owner:1,pawns:2,card:null});
  expect(r5Start.game.board[2][4]).toMatchObject({owner:1,pawns:2,card:null});
  expect(r5Start.game.board[0][3]).toMatchObject({owner:1,pawns:1,card:null});
  expect(r5Start.game.board[2][3]).toMatchObject({owner:1,pawns:1,card:null});

  // Play one turn in Round 5 and let Shadowblood Queen Bot respond with strategy 'queen'.
  const r5Move=restored.moves()[0];
  if(r5Move){
    restored.play(r5Move.handIndex,r5Move.row,r5Move.col);
    playedByPlayer++;
  } else {
    restored.pass();
  }
  const queenOpts=restored.botOptions();
  expect(queenOpts).toMatchObject({difficulty:'hard',strategy:'queen'});
  const queenDecision=decideBot(restored.botView(),queenOpts);
  restored.applyBotAction(queenDecision.action);

  // Mid-Round-5 save/restore preserves Shadowblood Queen board state, noTurnDraw and Boss metadata!
  const midR5Save=restored.serialize();
  const midR5Restored=restoreSurvival(JSON.parse(JSON.stringify(midR5Save)));
  expect(midR5Restored.game.noTurnDraw).toBe(true);
  expect(midR5Restored.game.board[1][4].card?.id).toBe(145);
  expect(midR5Restored.snapshot()).toEqual(restored.snapshot());

  // Finish Round 5.
  while(midR5Restored.game.phase!=='finished')midR5Restored.pass();
  const final=midR5Restored.snapshot();
  expect(final.roundScores).toHaveLength(5);
  expect(final.roundScores[4].bonusDrawEarned).toBe(false);
  expect(final.status).not.toBe('in-progress');
  expect(playedByPlayer+final.carriedPlayerHand.length+final.remainingPlayerDeck.length).toBe(15);

  // Tampered survival save is rejected cleanly.
  const tampered={...midR5Save,cumulativePlayerScore:midR5Save.cumulativePlayerScore+100};
  expect(()=>restoreSurvival(tampered)).toThrow();
  store.setItem(SURVIVAL_KEY,JSON.stringify(tampered));
  const badRead=readActiveSurvival(store);
  expect(badRead).toMatchObject({present:true,session:null});
  expect(badRead.error).toBeTruthy();
});
