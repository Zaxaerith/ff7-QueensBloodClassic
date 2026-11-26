import {expect,test} from 'vitest';
import {SHADOWBLOOD_QUEEN_ID} from '../src/boss-challengers.js';
import {challengers} from '../src/challengers.js';
import {
  BLOOD_RANKS,compareSurvivalRanks,computeBloodRank,emptyProgress,higherSurvivalRank,
  PROGRESS_RECOVERY_KEY,PROGRESS_STORAGE_KEY,progressSummary,
  readProgress,recordCarnivalClear,recordChallengerResult,
  recordGoldSaucerWin,recordSurvivalRun,recordTournamentRun,writeProgress,
} from '../src/progress.js';
import type {StoragePort} from '../src/ui-data.js';

class MemoryStore implements StoragePort {
  values=new Map<string,string>();
  throwOnRead=false;
  throwOnWrite=false;
  getItem(key:string){
    if(this.throwOnRead)throw new Error('read blocked');
    return this.values.get(key)??null;
  }
  setItem(key:string,value:string){
    if(this.throwOnWrite)throw new Error('quota exceeded');
    this.values.set(key,value);
  }
}

test('empty storage read/write, NPC multi-difficulty accumulation, losses ignored and Shadowblood Queen tracked',()=>{
  const store=new MemoryStore();
  const initial=readProgress(store);
  expect(initial).toEqual({data:emptyProgress(),raw:null,corrupted:false,error:null});

  let p=initial.data;
  const before=structuredClone(p);
  p=recordChallengerResult(p,'ned','normal',12,18,1);
  p=recordChallengerResult(p,'ned','hard',15,15,null);
  expect(p).toEqual(before);
  expect(p.challengers.ned).toBeUndefined();

  const afterHard=recordChallengerResult(p,'ned','hard',24,10,0);
  expect(p).toEqual(before);
  let next=recordChallengerResult(afterHard,'ned','easy',18,12,0);
  next=recordChallengerResult(next,'ned','hard',20,2,0);
  expect(next.challengers.ned).toEqual({
    wins:3,
    bestScore:24,
    bestMargin:18,
    difficultiesCleared:['easy','hard'],
  });

  next=recordChallengerResult(next,SHADOWBLOOD_QUEEN_ID,'hard',35,21,0);
  expect(next.challengers[SHADOWBLOOD_QUEEN_ID]).toEqual({
    wins:1,
    bestScore:35,
    bestMargin:14,
    difficultiesCleared:['hard'],
  });

  expect(writeProgress(store,next)).toBeNull();
  const reloaded=readProgress(store);
  expect(reloaded.corrupted).toBe(false);
  expect(reloaded.error).toBeNull();
  expect(reloaded.data).toEqual(next);

  expect(progressSummary(reloaded.data)).toMatchObject({
    challengersDefeated:2,
    challengerTotalWins:4,
    bossDefeated:true,
    bloodRank:{rank:2,key:'bloodletter',points:2},
  });
});

test('Card Carnival puzzle clears persist across reload and keep highest score and margin',()=>{
  const store=new MemoryStore();
  let p=emptyProgress();
  p=recordCarnivalClear(p,'cc-ch6-01',14,6);
  expect(p.carnival['cc-ch6-01']).toEqual({cleared:true,bestScore:14,bestMargin:8});

  p=recordCarnivalClear(p,'cc-ch6-01',12,2);
  expect(p.carnival['cc-ch6-01']).toEqual({cleared:true,bestScore:14,bestMargin:10});

  p=recordCarnivalClear(p,'cc-ch6-02',22,4);
  expect(writeProgress(store,p)).toBeNull();

  const reloaded=readProgress(store);
  expect(reloaded.data.carnival).toEqual(p.carnival);
  expect(progressSummary(reloaded.data).carnivalCleared).toBe(2);
});

test('Gold Saucer wins and Survival ranks preserve gold over silver and track failed highs without incrementing clears',()=>{
  expect(compareSurvivalRanks('gold','silver')).toBeGreaterThan(0);
  expect(compareSurvivalRanks('silver','bronze')).toBeGreaterThan(0);
  expect(compareSurvivalRanks('bronze',null)).toBeGreaterThan(0);
  expect(higherSurvivalRank('gold','silver')).toBe('gold');
  expect(higherSurvivalRank('bronze','gold')).toBe('gold');
  expect(higherSurvivalRank(null,'bronze')).toBe('bronze');

  let p=emptyProgress();
  p=recordGoldSaucerWin(p,'gs-high-ground',26,12);
  p=recordGoldSaucerWin(p,'gs-high-ground',20,4);
  p=recordGoldSaucerWin(p,'gs-luxury-real-estate',31,19);
  expect(p.goldSaucer['gs-high-ground']).toEqual({wins:2,bestScore:26,bestMargin:16});

  p=recordSurvivalRun(p,'survival-nightmare','failed',42,4);
  expect(p.survival['survival-nightmare']).toEqual({
    clears:0,
    bestRank:null,
    bestCumulativeScore:42,
    bestRoundsCleared:4,
  });

  p=recordSurvivalRun(p,'survival-nightmare','in-progress',999,5);
  expect(p.survival['survival-nightmare']?.bestCumulativeScore).toBe(42);

  p=recordSurvivalRun(p,'survival-boot-camp','cleared-bronze',34,3);
  p=recordSurvivalRun(p,'survival-boot-camp','cleared-gold',68,3);
  p=recordSurvivalRun(p,'survival-boot-camp','cleared-silver',51,3);
  expect(p.survival['survival-boot-camp']).toEqual({
    clears:3,
    bestRank:'gold',
    bestCumulativeScore:68,
    bestRoundsCleared:3,
  });

  p=recordSurvivalRun(p,'survival-nightmare','failed',48,5);
  expect(p.survival['survival-nightmare']).toEqual({
    clears:0,
    bestRank:null,
    bestCumulativeScore:48,
    bestRoundsCleared:5,
  });

  p=recordSurvivalRun(p,'survival-extreme','cleared-silver',64,4);

  const summary=progressSummary(p);
  expect(summary).toMatchObject({
    challengersDefeated:0,
    challengerTotalWins:0,
    bossDefeated:false,
    carnivalCleared:0,
    goldSaucerCleared:2,
    goldSaucerTotalWins:3,
    survivalCleared:2,
    survivalMedals:{bronze:0,silver:1,gold:1},
    bestSurvivalRank:'gold',
    tournamentChampionships:0,
    tournamentExhibitionCleared:false,
  });
});

test('Tournament progress and Blood Hunter Rank 1-11 progress cleanly up to Rank 11 Blood Champion',()=>{
  expect(BLOOD_RANKS).toHaveLength(11);
  let p=emptyProgress();
  expect(computeBloodRank(p)).toMatchObject({
    rank:1,key:'bloodathalon',title:'Bloodathalon',points:0,nextThreshold:2,winsToNextRank:2,isMaxRank:false,
  });

  // Eliminated tournament run updates bestRunWins without incrementing championships.
  p=recordTournamentRun(p,{wins:3,championshipWon:false});
  expect(p.tournament).toEqual({championships:0,exhibitionCleared:false,bestRunWins:3});
  expect(computeBloodRank(p).points).toBe(0);

  // Defeat all 20 regular challengers + Shadowblood Queen -> 21 points (Rank 10 Blood Monarch, 1 to Rank 11).
  for(const npc of challengers){
    p=recordChallengerResult(p,npc.id,'normal',20,10,0);
  }
  expect(computeBloodRank(p)).toMatchObject({rank:10,key:'bloodMonarch',title:'Blood Monarch',points:20});

  p=recordChallengerResult(p,SHADOWBLOOD_QUEEN_ID,'hard',30,15,0);
  expect(computeBloodRank(p)).toMatchObject({rank:10,points:21,nextThreshold:22,winsToNextRank:1,isMaxRank:false});

  // Win Shinra-8 Championship + Red XIII Exhibition -> 22 points -> Rank 11 Blood Champion!
  p=recordTournamentRun(p,{wins:6,championshipWon:true,exhibitionCleared:true});
  expect(p.tournament).toEqual({championships:1,exhibitionCleared:true,bestRunWins:6});
  expect(computeBloodRank(p)).toMatchObject({
    rank:11,maxRank:11,key:'bloodChampion',title:'Blood Champion',points:22,nextThreshold:null,winsToNextRank:0,isMaxRank:true,
  });

  const store=new MemoryStore();
  expect(writeProgress(store,p)).toBeNull();
  expect(readProgress(store).data.tournament).toEqual(p.tournament);
  expect(progressSummary(p)).toMatchObject({
    tournamentChampionships:1,
    tournamentExhibitionCleared:true,
    bloodRank:{rank:11,key:'bloodChampion'},
  });
});

test('corrupted JSON, legacy progress without tournament key, and unknown versions recover safely',()=>{
  const store=new MemoryStore();
  const brokenJson='{bad-json';
  store.setItem(PROGRESS_STORAGE_KEY,brokenJson);

  const fromBroken=readProgress(store);
  expect(fromBroken.data).toEqual(emptyProgress());
  expect(fromBroken.corrupted).toBe(true);
  expect(fromBroken.raw).toBe(brokenJson);
  expect(fromBroken.error).toBeTruthy();
  expect(store.getItem(PROGRESS_RECOVERY_KEY)).toBe(brokenJson);

  const fresh=recordCarnivalClear(fromBroken.data,'cc-ch6-01',10,4);
  expect(writeProgress(store,fresh,fromBroken.raw)).toBeNull();
  expect(store.getItem(PROGRESS_RECOVERY_KEY)).toBe(brokenJson);
  expect(readProgress(store).data).toEqual(fresh);

  // Legacy v1 payload missing the tournament field loads without corruption.
  const legacyV1=JSON.stringify({version:1,challengers:{},carnival:{'cc-ch6-01':{cleared:true,bestScore:10,bestMargin:4}},goldSaucer:{},survival:{}});
  store.setItem(PROGRESS_STORAGE_KEY,legacyV1);
  const fromLegacy=readProgress(store);
  expect(fromLegacy.corrupted).toBe(false);
  expect(fromLegacy.data.tournament).toEqual({championships:0,exhibitionCleared:false,bestRunWins:0});

  const futurePayload=JSON.stringify({version:99,challengers:{}});
  store.setItem(PROGRESS_STORAGE_KEY,futurePayload);
  const fromFuture=readProgress(store);
  expect(fromFuture.data).toEqual(emptyProgress());
  expect(fromFuture.corrupted).toBe(true);
  expect(store.getItem(PROGRESS_RECOVERY_KEY)).toBe(futurePayload);

  expect(readProgress(null).data).toEqual(emptyProgress());
  expect(writeProgress(null,fresh)).toBeTruthy();
  store.throwOnRead=true;
  expect(readProgress(store).data).toEqual(emptyProgress());
  store.throwOnRead=false;
  store.throwOnWrite=true;
  expect(writeProgress(store,fresh,futurePayload)).toBeTruthy();
});
