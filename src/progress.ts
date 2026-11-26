import type {BotDifficulty} from './bot.js';
import {SHADOWBLOOD_QUEEN_ID} from './boss-challengers.js';
import type {Player} from './engine.js';
import type {GoldSaucerChallengeId,SurvivalChallengeId} from './gold-saucer-catalog.js';
import type {SurvivalStatus} from './survival-session.js';
import type {StoragePort} from './ui-data.js';

export const PROGRESS_STORAGE_KEY='qbclassic.progress.v1';
export const PROGRESS_RECOVERY_KEY=`${PROGRESS_STORAGE_KEY}.recovery`;
const MAX_PROGRESS_BYTES=128_000;
const SAFE_ID=/^[a-z0-9][a-z0-9-]{0,63}$/;
const FORBIDDEN_KEYS=new Set(['__proto__','constructor','prototype']);
const DIFFICULTY_ORDER:readonly BotDifficulty[]=['easy','normal','hard'];
const SURVIVAL_RANK_ORDER:readonly SurvivalRank[]=['bronze','silver','gold'];

export type SurvivalRank='bronze'|'silver'|'gold';

export type BloodRankKey=
  | 'bloodathalon'
  | 'bloodletter'
  | 'bloodSquire'
  | 'bloodPatriot'
  | 'bloodMystic'
  | 'bloodExecutioner'
  | 'bloodMarquis'
  | 'bloodSovereign'
  | 'bloodDespot'
  | 'bloodMonarch'
  | 'bloodChampion';

export interface BloodRankSpec {
  readonly rank:number;
  readonly key:BloodRankKey;
  readonly title:string;
  readonly minPoints:number;
}

export const BLOOD_RANKS:readonly BloodRankSpec[]=[
  {rank:1,key:'bloodathalon',title:'Bloodathalon',minPoints:0},
  {rank:2,key:'bloodletter',title:'Bloodletter',minPoints:2},
  {rank:3,key:'bloodSquire',title:'Blood Squire',minPoints:4},
  {rank:4,key:'bloodPatriot',title:'Blood Patriot',minPoints:6},
  {rank:5,key:'bloodMystic',title:'Blood Mystic',minPoints:8},
  {rank:6,key:'bloodExecutioner',title:'Blood Executioner',minPoints:10},
  {rank:7,key:'bloodMarquis',title:'Blood Marquis',minPoints:12},
  {rank:8,key:'bloodSovereign',title:'Blood Sovereign',minPoints:15},
  {rank:9,key:'bloodDespot',title:'Blood Despot',minPoints:18},
  {rank:10,key:'bloodMonarch',title:'Blood Monarch',minPoints:20},
  {rank:11,key:'bloodChampion',title:'Blood Champion',minPoints:22},
];

export interface BloodRankInfo {
  readonly rank:number;
  readonly maxRank:number;
  readonly key:BloodRankKey;
  readonly title:string;
  readonly points:number;
  readonly currentThreshold:number;
  readonly nextThreshold:number|null;
  readonly winsToNextRank:number;
  readonly isMaxRank:boolean;
}

export interface ChallengerProgress {
  wins:number;
  bestScore:number;
  bestMargin:number;
  difficultiesCleared:BotDifficulty[];
}

export interface CarnivalProgress {
  cleared:true;
  bestScore:number;
  bestMargin:number;
}

export interface GoldSaucerProgress {
  wins:number;
  bestScore:number;
  bestMargin:number;
}

export interface SurvivalProgress {
  clears:number;
  bestRank:SurvivalRank|null;
  bestCumulativeScore:number;
  bestRoundsCleared:number;
}

export interface TournamentProgress {
  championships:number;
  exhibitionCleared:boolean;
  bestRunWins:number;
}

export interface PlayerProgress {
  version:1;
  challengers:Record<string,ChallengerProgress>;
  carnival:Record<string,CarnivalProgress>;
  goldSaucer:Partial<Record<GoldSaucerChallengeId,GoldSaucerProgress>>;
  survival:Partial<Record<SurvivalChallengeId,SurvivalProgress>>;
  tournament:TournamentProgress;
}

export interface ProgressReadResult {
  data:PlayerProgress;
  raw:string|null;
  corrupted:boolean;
  error:string|null;
}

export interface ProgressSummary {
  challengersDefeated:number;
  challengerTotalWins:number;
  bossDefeated:boolean;
  carnivalCleared:number;
  goldSaucerCleared:number;
  goldSaucerTotalWins:number;
  survivalCleared:number;
  survivalMedals:{bronze:number;silver:number;gold:number};
  bestSurvivalRank:SurvivalRank|null;
  tournamentChampionships:number;
  tournamentExhibitionCleared:boolean;
  bloodRank:BloodRankInfo;
}

const isObject=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const isSafeId=(id:unknown):id is string=>typeof id==='string'&&SAFE_ID.test(id)&&!FORBIDDEN_KEYS.has(id);
const isDifficulty=(v:unknown):v is BotDifficulty=>v==='easy'||v==='normal'||v==='hard';
const isSurvivalRank=(v:unknown):v is SurvivalRank=>v==='bronze'||v==='silver'||v==='gold';

function nonNegativeInt(value:number):number {
  if(!Number.isFinite(value))return 0;
  return Math.max(0,Math.trunc(value));
}

function normalizeDifficulties(list:readonly BotDifficulty[]):BotDifficulty[] {
  const unique=new Set<BotDifficulty>(list.filter(isDifficulty));
  return DIFFICULTY_ORDER.filter(d=>unique.has(d));
}

export function survivalRankValue(rank:SurvivalRank|null):number {
  if(!rank)return 0;
  return SURVIVAL_RANK_ORDER.indexOf(rank)+1;
}

export function compareSurvivalRanks(a:SurvivalRank|null,b:SurvivalRank|null):number {
  return survivalRankValue(a)-survivalRankValue(b);
}

export function higherSurvivalRank(a:SurvivalRank|null,b:SurvivalRank|null):SurvivalRank|null {
  return compareSurvivalRanks(a,b)>=0?a:b;
}

export function survivalRankFromStatus(status:SurvivalStatus):SurvivalRank|null {
  if(status==='cleared-gold')return 'gold';
  if(status==='cleared-silver')return 'silver';
  if(status==='cleared-bronze')return 'bronze';
  return null;
}

export function emptyTournamentProgress():TournamentProgress {
  return {championships:0,exhibitionCleared:false,bestRunWins:0};
}

export function emptyProgress():PlayerProgress {
  return {
    version:1,
    challengers:{},
    carnival:{},
    goldSaucer:{},
    survival:{},
    tournament:emptyTournamentProgress(),
  };
}

function cloneProgress(progress:PlayerProgress):PlayerProgress {
  return structuredClone(progress);
}

/** Record an NPC or Boss match result. Only player victories (winner === 0) increment wins and clear difficulties. */
export function recordChallengerResult(
  progress:PlayerProgress,
  challengerId:string,
  difficulty:BotDifficulty,
  playerScore:number,
  opponentScore:number,
  winner:Player|null,
):PlayerProgress {
  const next=cloneProgress(progress);
  if(winner!==0||!isSafeId(challengerId)||!isDifficulty(difficulty))return next;
  const score=nonNegativeInt(playerScore);
  const margin=nonNegativeInt(playerScore-opponentScore);
  const prev=next.challengers[challengerId];
  next.challengers[challengerId]={
    wins:(prev?.wins??0)+1,
    bestScore:prev?Math.max(prev.bestScore,score):score,
    bestMargin:prev?Math.max(prev.bestMargin,margin):margin,
    difficultiesCleared:normalizeDifficulties([...(prev?.difficultiesCleared??[]),difficulty]),
  };
  return next;
}

/** Record a Card Carnival puzzle clear and update best score / best margin. */
export function recordCarnivalClear(
  progress:PlayerProgress,
  puzzleId:string,
  playerScore:number,
  opponentScore:number,
):PlayerProgress {
  const next=cloneProgress(progress);
  if(!isSafeId(puzzleId))return next;
  const score=nonNegativeInt(playerScore);
  const margin=nonNegativeInt(playerScore-opponentScore);
  const prev=next.carnival[puzzleId];
  next.carnival[puzzleId]={
    cleared:true,
    bestScore:prev?Math.max(prev.bestScore,score):score,
    bestMargin:prev?Math.max(prev.bestMargin,margin):margin,
  };
  return next;
}

/** Record a single-match Gold Saucer challenge victory and update best score / best margin. */
export function recordGoldSaucerWin(
  progress:PlayerProgress,
  challengeId:GoldSaucerChallengeId,
  playerScore:number,
  opponentScore:number,
):PlayerProgress {
  const next=cloneProgress(progress);
  if(!isSafeId(challengeId))return next;
  const score=nonNegativeInt(playerScore);
  const margin=nonNegativeInt(playerScore-opponentScore);
  const prev=next.goldSaucer[challengeId];
  next.goldSaucer[challengeId]={
    wins:(prev?.wins??0)+1,
    bestScore:prev?Math.max(prev.bestScore,score):score,
    bestMargin:prev?Math.max(prev.bestMargin,margin):margin,
  };
  return next;
}

/** Record a finalized Gold Saucer Survival run. Failed runs still preserve best cumulative score and rounds cleared. */
export function recordSurvivalRun(
  progress:PlayerProgress,
  challengeId:SurvivalChallengeId,
  status:SurvivalStatus,
  cumulativeScore:number,
  roundsCleared:number,
):PlayerProgress {
  const next=cloneProgress(progress);
  if(!isSafeId(challengeId)||status==='in-progress')return next;
  const score=nonNegativeInt(cumulativeScore);
  const rounds=nonNegativeInt(roundsCleared);
  const rank=survivalRankFromStatus(status);
  const prev=next.survival[challengeId];
  next.survival[challengeId]={
    clears:(prev?.clears??0)+(rank?1:0),
    bestRank:higherSurvivalRank(prev?.bestRank??null,rank),
    bestCumulativeScore:prev?Math.max(prev.bestCumulativeScore,score):score,
    bestRoundsCleared:prev?Math.max(prev.bestRoundsCleared,rounds):rounds,
  };
  return next;
}

/** Record a finalized Shinra-8 Cruise Tournament run. */
export function recordTournamentRun(
  progress:PlayerProgress,
  run:{wins:number;championshipWon:boolean;exhibitionCleared?:boolean},
):PlayerProgress {
  const next=cloneProgress(progress);
  const prev=next.tournament??emptyTournamentProgress();
  const wins=nonNegativeInt(run.wins);
  next.tournament={
    championships:prev.championships+(run.championshipWon?1:0),
    exhibitionCleared:prev.exhibitionCleared||Boolean(run.exhibitionCleared),
    bestRunWins:Math.max(prev.bestRunWins,wins),
  };
  return next;
}

/** Compute Blood Hunter Rank (1..11) from distinct defeated challengers (20 NPCs + Shadowblood Queen) + tournament title. */
export function computeBloodRank(progress:PlayerProgress):BloodRankInfo {
  const defeatedChallengers=Object.values(progress.challengers).filter(row=>row.wins>0).length;
  const tournamentPoint=(progress.tournament?.championships??0)>0?1:0;
  const points=defeatedChallengers+tournamentPoint;

  let current=BLOOD_RANKS[0];
  let nextSpec:BloodRankSpec|null=BLOOD_RANKS[1]??null;
  for(let i=0;i<BLOOD_RANKS.length;i++){
    if(points>=BLOOD_RANKS[i].minPoints){
      current=BLOOD_RANKS[i];
      nextSpec=BLOOD_RANKS[i+1]??null;
    }
  }
  const nextThreshold=nextSpec?nextSpec.minPoints:null;
  return {
    rank:current.rank,
    maxRank:BLOOD_RANKS.length,
    key:current.key,
    title:current.title,
    points,
    currentThreshold:current.minPoints,
    nextThreshold,
    winsToNextRank:nextThreshold===null?0:Math.max(0,nextThreshold-points),
    isMaxRank:nextSpec===null,
  };
}

function parseNonNegInt(value:unknown):number|null {
  return typeof value==='number'&&Number.isSafeInteger(value)&&value>=0?value:null;
}

function sanitizeProgress(parsed:unknown):PlayerProgress|null {
  if(!isObject(parsed)||parsed.version!==1)return null;
  const data=emptyProgress();

  if(isObject(parsed.challengers)){
    for(const [id,row] of Object.entries(parsed.challengers)){
      if(!isSafeId(id)||!isObject(row))continue;
      const wins=parseNonNegInt(row.wins);
      const bestScore=parseNonNegInt(row.bestScore);
      const bestMargin=parseNonNegInt(row.bestMargin);
      if(wins===null||wins<1||bestScore===null||bestMargin===null||!Array.isArray(row.difficultiesCleared))continue;
      const difficultiesCleared=normalizeDifficulties(row.difficultiesCleared.filter(isDifficulty));
      data.challengers[id]={wins,bestScore,bestMargin,difficultiesCleared};
    }
  }

  if(isObject(parsed.carnival)){
    for(const [id,row] of Object.entries(parsed.carnival)){
      if(!isSafeId(id)||!isObject(row)||row.cleared!==true)continue;
      const bestScore=parseNonNegInt(row.bestScore);
      const bestMargin=parseNonNegInt(row.bestMargin);
      if(bestScore===null||bestMargin===null)continue;
      data.carnival[id]={cleared:true,bestScore,bestMargin};
    }
  }

  if(isObject(parsed.goldSaucer)){
    for(const [id,row] of Object.entries(parsed.goldSaucer)){
      if(!isSafeId(id)||!isObject(row))continue;
      const wins=parseNonNegInt(row.wins);
      const bestScore=parseNonNegInt(row.bestScore);
      const bestMargin=parseNonNegInt(row.bestMargin);
      if(wins===null||wins<1||bestScore===null||bestMargin===null)continue;
      data.goldSaucer[id as GoldSaucerChallengeId]={wins,bestScore,bestMargin};
    }
  }

  if(isObject(parsed.survival)){
    for(const [id,row] of Object.entries(parsed.survival)){
      if(!isSafeId(id)||!isObject(row))continue;
      const clears=parseNonNegInt(row.clears);
      const bestCumulativeScore=parseNonNegInt(row.bestCumulativeScore);
      const bestRoundsCleared=parseNonNegInt(row.bestRoundsCleared);
      const bestRank=row.bestRank===null?null:isSurvivalRank(row.bestRank)?row.bestRank:undefined;
      if(clears===null||bestCumulativeScore===null||bestRoundsCleared===null||bestRank===undefined)continue;
      data.survival[id as SurvivalChallengeId]={clears,bestRank,bestCumulativeScore,bestRoundsCleared};
    }
  }

  if(isObject(parsed.tournament)){
    const championships=parseNonNegInt(parsed.tournament.championships);
    const bestRunWins=parseNonNegInt(parsed.tournament.bestRunWins);
    const exhibitionCleared=typeof parsed.tournament.exhibitionCleared==='boolean'?parsed.tournament.exhibitionCleared:null;
    if(championships!==null&&bestRunWins!==null&&exhibitionCleared!==null){
      data.tournament={championships,exhibitionCleared,bestRunWins};
    }
  }

  return data;
}

function tryBackupCorrupted(storage:StoragePort,raw:string):void {
  try{storage.setItem(PROGRESS_RECOVERY_KEY,raw);}catch{/* Never throw during recovery backup. */}
}

/** Read local player progress safely. Corrupted or unknown-version payloads fall back to emptyProgress()
 * and preserve the raw string under PROGRESS_RECOVERY_KEY without throwing. */
export function readProgress(storage:StoragePort|null):ProgressReadResult {
  if(!storage)return {data:emptyProgress(),raw:null,corrupted:false,error:'Progress storage unavailable'};
  let raw:string|null=null;
  try{
    raw=storage.getItem(PROGRESS_STORAGE_KEY);
  }catch{
    return {data:emptyProgress(),raw:null,corrupted:false,error:'Progress storage read failed'};
  }
  if(raw===null||raw==='')return {data:emptyProgress(),raw:null,corrupted:false,error:null};
  if(raw.length>MAX_PROGRESS_BYTES){
    tryBackupCorrupted(storage,raw);
    return {data:emptyProgress(),raw,corrupted:true,error:'Progress payload exceeds size limit'};
  }
  try{
    const parsed:unknown=JSON.parse(raw);
    const sanitized=sanitizeProgress(parsed);
    if(!sanitized){
      tryBackupCorrupted(storage,raw);
      return {data:emptyProgress(),raw,corrupted:true,error:'Invalid progress storage version or format'};
    }
    return {data:sanitized,raw,corrupted:false,error:null};
  }catch{
    tryBackupCorrupted(storage,raw);
    return {data:emptyProgress(),raw,corrupted:true,error:'Corrupted progress JSON'};
  }
}

/** Persist local player progress safely, mirroring src/ui-data.ts safeWrite recovery semantics. */
export function writeProgress(
  storage:StoragePort|null,
  next:PlayerProgress,
  backupRaw?:string|null,
):string|null {
  if(!storage)return 'Progress storage unavailable';
  try{
    const sanitized=sanitizeProgress(next);
    if(!sanitized)return 'Invalid progress payload';
    const serialized=JSON.stringify(sanitized);
    if(serialized.length>MAX_PROGRESS_BYTES)return 'Progress payload exceeds size limit';
    if(backupRaw)storage.setItem(PROGRESS_RECOVERY_KEY,backupRaw);
    storage.setItem(PROGRESS_STORAGE_KEY,serialized);
    return null;
  }catch{
    return 'Progress storage write failed';
  }
}

/** Aggregate local honor & medal statistics across all single-player challenge categories. */
export function progressSummary(progress:PlayerProgress):ProgressSummary {
  const challengerEntries=Object.entries(progress.challengers).filter(([,row])=>row.wins>0);
  const challengersDefeated=challengerEntries.length;
  const challengerTotalWins=challengerEntries.reduce((sum,[,row])=>sum+row.wins,0);
  const bossDefeated=(progress.challengers[SHADOWBLOOD_QUEEN_ID]?.wins??0)>0;

  const carnivalCleared=Object.values(progress.carnival).filter(row=>row.cleared).length;

  const gsEntries=Object.values(progress.goldSaucer).filter((row):row is GoldSaucerProgress=>Boolean(row&&row.wins>0));
  const goldSaucerCleared=gsEntries.length;
  const goldSaucerTotalWins=gsEntries.reduce((sum,row)=>sum+row.wins,0);

  const survivalMedals={bronze:0,silver:0,gold:0};
  let survivalCleared=0;
  let bestSurvivalRank:SurvivalRank|null=null;
  for(const row of Object.values(progress.survival)){
    if(!row)continue;
    if(row.clears>0||row.bestRank!==null)survivalCleared++;
    if(row.bestRank){
      survivalMedals[row.bestRank]++;
      bestSurvivalRank=higherSurvivalRank(bestSurvivalRank,row.bestRank);
    }
  }

  return {
    challengersDefeated,
    challengerTotalWins,
    bossDefeated,
    carnivalCleared,
    goldSaucerCleared,
    goldSaucerTotalWins,
    survivalCleared,
    survivalMedals,
    bestSurvivalRank,
    tournamentChampionships:progress.tournament?.championships??0,
    tournamentExhibitionCleared:Boolean(progress.tournament?.exhibitionCleared),
    bloodRank:computeBloodRank(progress),
  };
}
