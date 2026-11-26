import {expect,test} from 'vitest';
import {decideBot} from '../src/bot.js';
import {byId,deckPresets,starterDeck} from '../src/cards.js';
import {presetName} from '../src/i18n/game-labels.js';
import {setLocale} from '../src/i18n/index.js';
import {locales} from '../src/i18n/locales.js';
import {
  readActiveTournament,restoreTournament,serializeTournament,
  TOURNAMENT_ROUNDS,TOURNAMENT_STORAGE_KEY,TournamentSession,writeActiveTournament,
} from '../src/tournament-session.js';
import {validateDeck,type StoragePort} from '../src/ui-data.js';

class MemoryStore implements StoragePort {
  values=new Map<string,string>();
  getItem(key:string){return this.values.get(key)??null;}
  setItem(key:string,value:string){this.values.set(key,value);}
}

function finishCurrentRoundWithPlayerWin(session:TournamentSession):void {
  if(session.game.phase==='mulligan')session.mulligan([]);
  // Play one card for player 0, then have opponent pass and player pass -> player wins cleanly on score!
  const move=session.moves()[0];
  expect(move).toBeDefined();
  session.play(move.handIndex,move.row,move.col);
  session.applyBotAction({type:'pass',player:1});
  session.pass();
}

test('all 6 Shinra-8 tournament rounds and all 8 deck presets are legal 15-card numbered decks with 11-locale names',()=>{
  expect(TOURNAMENT_ROUNDS).toHaveLength(6);
  expect(TOURNAMENT_ROUNDS.map(r=>r.opponentId)).toEqual([
    'felix','aerith-cruise','barret-cruise','tifa-cruise','regina','red-xiii-overfang',
  ]);
  for(const round of TOURNAMENT_ROUNDS){
    expect(validateDeck(round.opponentDeck),round.opponentId).toBeNull();
    expect(round.opponentDeck.every(id=>id>=1&&id<=145&&byId.get(id)?.rarity!=='token'),round.opponentId).toBe(true);
  }
  expect(deckPresets).toHaveLength(8);
  for(const preset of deckPresets){
    expect(validateDeck(preset.cards),preset.name).toBeNull();
  }
  for(const locale of locales){
    setLocale(locale);
    for(let i=0;i<8;i++){
      const label=presetName(i);
      expect(label.trim()).not.toBe('');
      expect(label).not.toContain('M2');
    }
  }
  setLocale('zh-CN');
  expect(presetName(4)).toBe('王权终局共鸣');
  expect(presetName(5)).toBe('亡语献祭深渊');
  expect(presetName(6)).toBe('蚀心减益控场');
  expect(presetName(7)).toBe('陆行鸟与强尼大军');
});

test('TournamentSession plays 5-round knockout with full mulligan, unlocks Red XIII exhibition on championship, and persists cleanly',()=>{
  const store=new MemoryStore();
  const session=TournamentSession.start(starterDeck,501);
  const opening=session.snapshot();
  expect(opening.currentRound).toBe(1);
  expect(opening.mainRounds).toBe(5);
  expect(opening.totalRounds).toBe(6);
  expect(opening.game.phase).toBe('mulligan');
  expect(opening.game.hands.map(h=>h.length)).toEqual([5,5]);
  expect(opening.game.decks.map(d=>d.length)).toEqual([10,10]);
  expect(opening.bracket[0].status).toBe('active');
  expect(opening.bracket[5].status).toBe('locked');
  expect(opening.canStartExhibition).toBe(false);

  // Round 1: exercise real mulligan + Bot turn + save/restore mid-match.
  session.mulligan([0,2]);
  expect(session.game.phase).toBe('playing');
  const firstMove=session.moves()[0];
  session.play(firstMove.handIndex,firstMove.row,firstMove.col);
  const botDecision=decideBot(session.botView(),session.botOptions());
  session.applyBotAction(botDecision.action);

  expect(writeActiveTournament(store,serializeTournament(session))).toBeNull();
  expect(store.getItem(TOURNAMENT_STORAGE_KEY)).toBeTruthy();
  const loaded=readActiveTournament(store);
  expect(loaded.present).toBe(true);
  expect(loaded.error).toBeNull();
  const resumed=loaded.session!;
  expect(resumed.snapshot()).toEqual(session.snapshot());

  // Fresh clean run through all 5 main rounds + unlock Round 6 Red XIII Bonus Exhibition.
  const run=TournamentSession.start(starterDeck,777);
  for(let r=1;r<=5;r++){
    expect(run.currentRound).toBe(r);
    expect(run.game.phase).toBe('mulligan');
    expect(run.game.hands[0]).toHaveLength(5);
    expect(run.game.decks[0]).toHaveLength(10);
    finishCurrentRoundWithPlayerWin(run);
    const snap=run.snapshot();
    expect(snap.roundSettled).toBe(true);
    expect(snap.roundWon).toBe(true);
    expect(snap.wins).toBe(r);
    if(r<5){
      expect(snap.status).toBe('in-progress');
      expect(snap.canAdvance).toBe(true);
      expect(snap.canStartExhibition).toBe(false);
      run.advanceRound();
    } else {
      expect(snap.status).toBe('champion');
      expect(snap.championshipWon).toBe(true);
      expect(snap.canAdvance).toBe(false);
      expect(snap.canStartExhibition).toBe(true);
      expect(snap.bracket[5].status).toBe('pending');
    }
  }

  // Persist right after winning Round 5, restore, then enter Round 6 Bonus Exhibition against Red XIII!
  const restoredChamp=restoreTournament(JSON.parse(JSON.stringify(run.serialize())));
  const r6=restoredChamp.startExhibition();
  expect(r6.currentRound).toBe(6);
  expect(r6.roundSpec.opponentId).toBe('red-xiii-overfang');
  expect(r6.roundSpec.isExhibition).toBe(true);
  expect(r6.game.phase).toBe('mulligan');
  expect(r6.status).toBe('in-progress');

  finishCurrentRoundWithPlayerWin(restoredChamp);
  const finalSnap=restoredChamp.snapshot();
  expect(finalSnap.status).toBe('exhibition-cleared');
  expect(finalSnap.championshipWon).toBe(true);
  expect(finalSnap.exhibitionCleared).toBe(true);
  expect(finalSnap.wins).toBe(6);
  expect(finalSnap.bracket.every(b=>b.status==='won')).toBe(true);
});

test('TournamentSession allows one retry on draw/loss and eliminates after exhausting retries',()=>{
  const session=TournamentSession.start(starterDeck,888);
  session.mulligan([]);
  // Double pass -> 0:0 draw -> not a win -> retry offered once!
  session.pass();
  session.applyBotAction({type:'pass',player:1});
  const afterDraw=session.snapshot();
  expect(afterDraw.roundSettled).toBe(true);
  expect(afterDraw.roundWon).toBe(false);
  expect(afterDraw.retriesRemaining).toBe(1);
  expect(afterDraw.canRetry).toBe(true);
  expect(afterDraw.status).toBe('in-progress');

  // Use the 1 retry -> fresh mulligan match with 0 retries remaining.
  const retried=session.retryRound();
  expect(retried.attempt).toBe(1);
  expect(retried.retriesRemaining).toBe(0);
  expect(retried.game.phase).toBe('mulligan');

  // Draw again with 0 retries -> eliminated!
  session.mulligan([]);
  session.pass();
  session.applyBotAction({type:'pass',player:1});
  const eliminated=session.snapshot();
  expect(eliminated.status).toBe('eliminated');
  expect(eliminated.canRetry).toBe(false);
  expect(eliminated.bracket[0].status).toBe('lost');
  expect(()=>session.advanceRound()).toThrow();

  // Tampered save rejected cleanly.
  const save=session.serialize();
  const tampered={...save,wins:5};
  expect(()=>restoreTournament(tampered)).toThrow();
});
