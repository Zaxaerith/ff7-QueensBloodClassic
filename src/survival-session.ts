import {
  botOptionsForMatch,observeGame,
  type BotAction,type BotDifficulty,type BotOptions,type BotView,
} from './bot.js';
import {byId} from './cards.js';
import {
  createGame,createPosition,exportReplay,legalMoves,outcome,pass,play,replayMatch,
  scoreBreakdown,TURN_DRAW_RULES_VERSION,
  type Command,type Game,type Move,type Player,type Position,type PositionTile,type Replay,
} from './engine.js';
import {
  findGoldSaucerChallenge,findSurvivalChallenge,
  type GoldSaucerChallenge,type GoldSaucerChallengeId,
  type SurvivalChallenge,type SurvivalChallengeId,type SurvivalRoundSpec,
} from './gold-saucer-catalog.js';
import type {StoragePort} from './ui-data.js';

export const SURVIVAL_KEY='qbclassic.survival.v1';
const MAX_SURVIVAL_PAYLOAD=240_000;
const MAX_COMMANDS=1024;

export type SurvivalStatus=
  | 'in-progress'
  | 'cleared-bronze'
  | 'cleared-silver'
  | 'cleared-gold'
  | 'failed';

export interface SurvivalRoundRecord {
  readonly round:number;
  readonly opponentName:string;
  readonly playerScore:number;
  readonly opponentScore:number;
  readonly winner:Player|null;
  readonly carriedHandCount:number;
  readonly remainingDeckCount:number;
  readonly bonusDrawEarned:boolean;
}

export interface SurvivalSnapshot {
  readonly challengeId:SurvivalChallengeId;
  readonly challengeName:string;
  readonly rewardCardId:number;
  readonly seed:number;
  readonly currentRound:number;
  readonly totalRounds:number;
  readonly roundSpec:SurvivalRoundSpec;
  readonly nextRoundSpec:SurvivalRoundSpec|null;
  readonly roundSettled:boolean;
  readonly canAdvance:boolean;
  readonly status:SurvivalStatus;
  readonly targets:SurvivalChallenge['targets'];
  readonly cumulativePlayerScore:number;
  readonly cumulativeOpponentScore:number;
  readonly roundScores:readonly SurvivalRoundRecord[];
  readonly carriedPlayerHand:readonly number[];
  readonly remainingPlayerDeck:readonly number[];
  readonly game:Game;
}

export interface SavedSurvival {
  schema:'qbclassic.survival';
  version:1;
  challengeId:SurvivalChallengeId;
  seed:number;
  playerDeck:number[];
  currentRound:number;
  roundSettled:boolean;
  cumulativePlayerScore:number;
  cumulativeOpponentScore:number;
  roundScores:SurvivalRoundRecord[];
  remainingPlayerDeck:number[];
  carriedPlayerHand:number[];
  status:SurvivalStatus;
  replay:Replay;
  check:string;
}

const isObject=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const isInt=(v:unknown,min:number,max:number)=>Number.isSafeInteger(v)&&Number(v)>=min&&Number(v)<=max;
const isCardList=(v:unknown,max=256):v is number[]=>Array.isArray(v)&&v.length<=max&&v.every(id=>Number.isInteger(id)&&byId.has(id));

function fnvHash(payload:string):string {
  let hash=2166136261;
  for(let i=0;i<payload.length;i++){
    hash^=payload.charCodeAt(i);
    hash=Math.imul(hash,16777619);
  }
  return (hash>>>0).toString(16).padStart(8,'0');
}

function gameHash(game:Game):string {
  return fnvHash(JSON.stringify([
    game.board,game.hands,game.decks,game.discard,game.mulliganDone,
    game.phase,game.turn,game.passes,game.nextInstanceId,game.events,game.noTurnDraw??false,
  ]));
}

function roundSeed(baseSeed:number,round:number):number {
  return (baseSeed^Math.imul(round,0x9E3779B1))>>>0;
}

function standardOpeningTiles():PositionTile[] {
  return [
    {row:0,col:0,owner:0,pawns:1},
    {row:1,col:0,owner:0,pawns:1},
    {row:2,col:0,owner:0,pawns:1},
    {row:0,col:4,owner:1,pawns:1},
    {row:1,col:4,owner:1,pawns:1},
    {row:2,col:4,owner:1,pawns:1},
  ];
}

function retainPlayableHand(hand:readonly number[]):number[] {
  return hand.filter(id=>{
    const card=byId.get(id);
    return !!card&&(card.cost>0||card.placement==='replace');
  });
}

function evaluateSurvivalStatus(score:number,targets:SurvivalChallenge['targets']):Exclude<SurvivalStatus,'in-progress'> {
  if(score>=targets.gold)return 'cleared-gold';
  if(score>=targets.silver)return 'cleared-silver';
  if(score>=targets.bronze)return 'cleared-bronze';
  return 'failed';
}

function assertValidSeed(seed:number):void {
  if(!Number.isInteger(seed)||seed<0||seed>0xFFFFFFFF)throw new Error('Seed must be uint32');
}

export class GoldSaucerChallengeSession {
  readonly challenge:GoldSaucerChallenge;
  readonly seed:number;
  readonly difficulty:BotDifficulty;
  readonly playerDeck:readonly number[];
  #initial:Game;
  #game:Game;

  constructor(
    challengeOrId:GoldSaucerChallenge|GoldSaucerChallengeId,
    playerDeck:readonly number[],
    options:{seed?:number;difficulty?:BotDifficulty}={},
  ) {
    const challenge=typeof challengeOrId==='string'?findGoldSaucerChallenge(challengeOrId):challengeOrId;
    if(!challenge)throw new Error('Unknown Gold Saucer challenge');
    const seed=options.seed??1101;
    assertValidSeed(seed);
    const difficulty=options.difficulty??challenge.defaultDifficulty;
    if(!['easy','normal','hard'].includes(difficulty))throw new Error('Invalid challenge difficulty');

    // Reuse createGame to enforce 15-card deck legality and deterministic shuffles.
    const dealt=createGame([playerDeck,challenge.opponentDeck],seed,0,TURN_DRAW_RULES_VERSION);
    const playerHand=[...dealt.hands[0],...(challenge.bonusPlayerHand??[])];
    const position:Position={
      seed,
      phase:'playing',
      turn:0,
      passes:0,
      hands:[playerHand,[...dealt.hands[1]]],
      decks:[[...dealt.decks[0]],[...dealt.decks[1]]],
      discard:[[],[]],
      board:structuredClone([...challenge.openingBoard]),
      ...(challenge.noTurnDraw?{noTurnDraw:true}:{}),
    };
    this.challenge=challenge;
    this.seed=seed;
    this.difficulty=difficulty;
    this.playerDeck=[...playerDeck];
    this.#initial=createPosition(position,TURN_DRAW_RULES_VERSION);
    this.#game=structuredClone(this.#initial);
  }

  get game():Game {return this.#game;}

  moves():Move[] {return legalMoves(this.#game,this.#game.turn);}

  play(handIndex:number,row:number,col:number):Game {
    play(this.#game,this.#game.turn,handIndex,row,col);
    return this.#game;
  }

  pass():Game {
    pass(this.#game,this.#game.turn);
    return this.#game;
  }

  botView():BotView {return observeGame(this.#game,1);}

  botOptions():BotOptions {
    const view=this.botView();
    return {
      ...botOptionsForMatch(view,{difficulty:this.difficulty}),
      strategy:this.challenge.opponentStrategy,
    };
  }

  applyBotAction(action:BotAction):Game {
    if(action.player!==1)throw new Error('Expected computer action for player 1');
    if(action.type==='pass')pass(this.#game,1);
    else play(this.#game,1,action.handIndex,action.row,action.col);
    return this.#game;
  }

  retry():Game {
    this.#game=structuredClone(this.#initial);
    return this.#game;
  }

  result():(ReturnType<typeof scoreBreakdown>&{status:'won'|'lost'|'draw'})|null {
    if(this.#game.phase!=='finished')return null;
    const score=scoreBreakdown(this.#game);
    const status=score.winner===null?'draw':score.winner===0?'won':'lost';
    return {...score,status};
  }
}

export class SurvivalSession {
  readonly challenge:SurvivalChallenge;
  readonly seed:number;
  readonly playerDeck:readonly number[];
  #currentRound:number;
  #roundSettled:boolean;
  #cumulativePlayerScore:number;
  #cumulativeOpponentScore:number;
  #roundScores:SurvivalRoundRecord[];
  #remainingPlayerDeck:number[];
  #carriedPlayerHand:number[];
  #status:SurvivalStatus;
  #game:Game;

  private constructor(init:{
    challenge:SurvivalChallenge;
    seed:number;
    playerDeck:readonly number[];
    currentRound:number;
    roundSettled:boolean;
    cumulativePlayerScore:number;
    cumulativeOpponentScore:number;
    roundScores:SurvivalRoundRecord[];
    remainingPlayerDeck:number[];
    carriedPlayerHand:number[];
    status:SurvivalStatus;
    game:Game;
  }) {
    this.challenge=init.challenge;
    this.seed=init.seed;
    this.playerDeck=[...init.playerDeck];
    this.#currentRound=init.currentRound;
    this.#roundSettled=init.roundSettled;
    this.#cumulativePlayerScore=init.cumulativePlayerScore;
    this.#cumulativeOpponentScore=init.cumulativeOpponentScore;
    this.#roundScores=structuredClone(init.roundScores);
    this.#remainingPlayerDeck=[...init.remainingPlayerDeck];
    this.#carriedPlayerHand=[...init.carriedPlayerHand];
    this.#status=init.status;
    this.#game=structuredClone(init.game);
  }

  static start(
    challengeOrId:SurvivalChallenge|SurvivalChallengeId,
    playerDeck:readonly number[],
    seed=1101,
  ):SurvivalSession {
    const challenge=typeof challengeOrId==='string'?findSurvivalChallenge(challengeOrId):challengeOrId;
    if(!challenge)throw new Error('Unknown Survival challenge');
    assertValidSeed(seed);
    const round1=challenge.rounds[0];
    // Validate player 15-card deck and deterministically shuffle the shared player deck.
    const dealt=createGame([playerDeck,round1.opponentDeck],roundSeed(seed,1),0,TURN_DRAW_RULES_VERSION);
    const shuffledPlayerDeck=[...dealt.hands[0],...dealt.decks[0]];
    const drawCount=Math.min(round1.drawAtStart,shuffledPlayerDeck.length);
    const openingHand=shuffledPlayerDeck.slice(0,drawCount);
    const remainingDeck=shuffledPlayerDeck.slice(drawCount);

    const game=SurvivalSession.createRoundGame(round1,seed,openingHand,remainingDeck);
    return new SurvivalSession({
      challenge,
      seed,
      playerDeck,
      currentRound:1,
      roundSettled:false,
      cumulativePlayerScore:0,
      cumulativeOpponentScore:0,
      roundScores:[],
      remainingPlayerDeck:remainingDeck,
      carriedPlayerHand:openingHand,
      status:'in-progress',
      game,
    });
  }

  private static createRoundGame(
    spec:SurvivalRoundSpec,
    baseSeed:number,
    playerHand:readonly number[],
    playerDeck:readonly number[],
  ):Game {
    const rSeed=roundSeed(baseSeed,spec.round);
    const oppDealt=createGame([spec.opponentDeck,spec.opponentDeck],rSeed,0,TURN_DRAW_RULES_VERSION);
    const position:Position={
      seed:rSeed,
      phase:'playing',
      turn:0,
      passes:0,
      hands:[[...playerHand],[...oppDealt.hands[1]]],
      decks:[[...playerDeck],[...oppDealt.decks[1]]],
      discard:[[],[]],
      board:structuredClone([...(spec.openingBoard??standardOpeningTiles())]),
      ...(spec.noTurnDraw?{noTurnDraw:true}:{}),
    };
    return createPosition(position,TURN_DRAW_RULES_VERSION);
  }

  get game():Game {return this.#game;}
  get currentRound():number {return this.#currentRound;}
  get totalRounds():number {return this.challenge.rounds.length;}
  get status():SurvivalStatus {return this.#status;}

  roundSpec(round=this.#currentRound):SurvivalRoundSpec {
    return this.challenge.rounds[round-1];
  }

  moves():Move[] {return legalMoves(this.#game,this.#game.turn);}

  play(handIndex:number,row:number,col:number):SurvivalSnapshot {
    if(this.#status!=='in-progress'||this.#roundSettled)throw new Error('Current survival round is already finished');
    play(this.#game,this.#game.turn,handIndex,row,col);
    this.syncRoundCompletion();
    return this.snapshot();
  }

  pass():SurvivalSnapshot {
    if(this.#status!=='in-progress'||this.#roundSettled)throw new Error('Current survival round is already finished');
    pass(this.#game,this.#game.turn);
    this.syncRoundCompletion();
    return this.snapshot();
  }

  botView():BotView {return observeGame(this.#game,1);}

  botOptions():BotOptions {
    const view=this.botView();
    const spec=this.roundSpec();
    return {
      ...botOptionsForMatch(view,{difficulty:spec.difficulty}),
      strategy:spec.opponentStrategy,
    };
  }

  applyBotAction(action:BotAction):SurvivalSnapshot {
    if(action.player!==1)throw new Error('Expected computer action for player 1');
    if(action.type==='pass')return this.pass();
    return this.play(action.handIndex,action.row,action.col);
  }

  private syncRoundCompletion():void {
    if(this.#roundSettled||this.#game.phase!=='finished')return;
    const spec=this.roundSpec();
    const result=outcome(this.#game);
    const carried=retainPlayableHand(this.#game.hands[0]);
    const remaining=[...this.#game.decks[0]];
    const bonusDrawEarned=spec.bonusDrawRow!==undefined
      &&result.rows[spec.bonusDrawRow][0]>result.rows[spec.bonusDrawRow][1];
    this.#cumulativePlayerScore+=result.scores[0];
    this.#cumulativeOpponentScore+=result.scores[1];
    this.#carriedPlayerHand=carried;
    this.#remainingPlayerDeck=remaining;
    this.#roundScores.push({
      round:this.#currentRound,
      opponentName:spec.opponentName,
      playerScore:result.scores[0],
      opponentScore:result.scores[1],
      winner:result.winner,
      carriedHandCount:carried.length,
      remainingDeckCount:remaining.length,
      bonusDrawEarned,
    });
    this.#roundSettled=true;
    if(this.#currentRound>=this.totalRounds){
      this.#status=evaluateSurvivalStatus(this.#cumulativePlayerScore,this.challenge.targets);
    }
  }

  advanceRound():SurvivalSnapshot {
    if(!this.#roundSettled)throw new Error('Cannot advance before the current round finishes');
    if(this.#currentRound>=this.totalRounds)throw new Error('Survival challenge has already reached the final round');
    const prevRecord=this.#roundScores[this.#roundScores.length-1];
    const nextRound=this.#currentRound+1;
    const spec=this.roundSpec(nextRound);
    const bonusDraw=prevRecord?.bonusDrawEarned?1:0;
    const drawCount=Math.min(spec.drawAtStart+bonusDraw,this.#remainingPlayerDeck.length);
    const drawn=this.#remainingPlayerDeck.slice(0,drawCount);
    const nextDeck=this.#remainingPlayerDeck.slice(drawCount);
    const nextHand=[...this.#carriedPlayerHand,...drawn];

    this.#currentRound=nextRound;
    this.#roundSettled=false;
    this.#remainingPlayerDeck=nextDeck;
    this.#carriedPlayerHand=nextHand;
    this.#game=SurvivalSession.createRoundGame(spec,this.seed,nextHand,nextDeck);
    return this.snapshot();
  }

  snapshot():SurvivalSnapshot {
    const spec=this.roundSpec();
    const nextSpec=this.#currentRound<this.totalRounds?this.roundSpec(this.#currentRound+1):null;
    const liveHand=this.#roundSettled?this.#carriedPlayerHand:retainPlayableHand(this.#game.hands[0]);
    const liveDeck=this.#roundSettled?this.#remainingPlayerDeck:this.#game.decks[0];
    return structuredClone({
      challengeId:this.challenge.id,
      challengeName:this.challenge.name,
      rewardCardId:this.challenge.rewardCardId,
      seed:this.seed,
      currentRound:this.#currentRound,
      totalRounds:this.totalRounds,
      roundSpec:spec,
      nextRoundSpec:nextSpec,
      roundSettled:this.#roundSettled,
      canAdvance:this.#roundSettled&&this.#currentRound<this.totalRounds,
      status:this.#status,
      targets:this.challenge.targets,
      cumulativePlayerScore:this.#cumulativePlayerScore,
      cumulativeOpponentScore:this.#cumulativeOpponentScore,
      roundScores:this.#roundScores,
      carriedPlayerHand:liveHand,
      remainingPlayerDeck:liveDeck,
      game:this.#game,
    });
  }

  serialize():SavedSurvival {
    return serializeSurvival(this);
  }

  static restore(value:unknown):SurvivalSession {
    return restoreSurvival(value);
  }

  /** @internal */
  static fromValidated(data:{
    challenge:SurvivalChallenge;
    seed:number;
    playerDeck:number[];
    currentRound:number;
    roundSettled:boolean;
    cumulativePlayerScore:number;
    cumulativeOpponentScore:number;
    roundScores:SurvivalRoundRecord[];
    remainingPlayerDeck:number[];
    carriedPlayerHand:number[];
    status:SurvivalStatus;
    game:Game;
  }):SurvivalSession {
    return new SurvivalSession(data);
  }
}

function checkedSurvivalReplay(value:unknown):Replay {
  if(!isObject(value)||value.version!==2||!isInt(value.seed,0,0xFFFFFFFF)||
    (value.firstPlayer!==0&&value.firstPlayer!==1)||!Array.isArray(value.commands)||value.commands.length>MAX_COMMANDS||
    !isObject(value.position))throw new Error('Invalid survival replay');
  const p=value.position;
  if(!Array.isArray(p.hands)||p.hands.length!==2||!isCardList(p.hands[0])||!isCardList(p.hands[1]))throw new Error('Invalid survival hands');
  if(p.decks!==undefined&&(!Array.isArray(p.decks)||p.decks.length!==2||!isCardList(p.decks[0])||!isCardList(p.decks[1])))throw new Error('Invalid survival decks');
  if(p.discard!==undefined&&(!Array.isArray(p.discard)||p.discard.length!==2||!isCardList(p.discard[0])||!isCardList(p.discard[1])))throw new Error('Invalid survival discard');
  if(p.board!==undefined&&(!Array.isArray(p.board)||p.board.length>15))throw new Error('Invalid survival board');

  const commands:Command[]=value.commands.map(raw=>{
    if(!isObject(raw)||(raw.player!==0&&raw.player!==1))throw new Error('Invalid survival command');
    const player=raw.player;
    if(raw.type==='pass')return {type:'pass',player};
    if(raw.type==='play'){
      if(!isInt(raw.handIndex,0,255)||!isInt(raw.row,0,2)||!isInt(raw.col,0,4))throw new Error('Invalid play command');
      return {type:'play',player,handIndex:Number(raw.handIndex),row:Number(raw.row),col:Number(raw.col)};
    }
    throw new Error('Unsupported survival command type');
  });

  const pick=(v:Record<string,unknown>,keys:string[])=>
    Object.fromEntries(keys.filter(k=>v[k]!==undefined).map(k=>[k,structuredClone(v[k])]));
  const position=pick(p,['seed','phase','turn','passes','hands','decks','discard','noTurnDraw']) as Position;
  if(Array.isArray(p.board)){
    position.board=p.board.map(tile=>{
      if(!isObject(tile))throw new Error('Invalid survival board tile');
      return pick(tile,['row','col','owner','pawns','cardId','permanentDelta','enhancedOnce','enfeebledOnce','thresholds','tileBonus']) as PositionTile;
    });
  }
  return {
    version:2,
    rulesVersion:TURN_DRAW_RULES_VERSION,
    seed:Number(value.seed),
    decks:[[],[]],
    firstPlayer:value.firstPlayer,
    position,
    commands,
  };
}

function survivalChecksum(save:Omit<SavedSurvival,'check'>,game:Game):string {
  return fnvHash(JSON.stringify([
    save.schema,save.version,save.challengeId,save.seed,save.playerDeck,save.currentRound,
    save.roundSettled,save.cumulativePlayerScore,save.cumulativeOpponentScore,
    save.roundScores,save.remainingPlayerDeck,save.carriedPlayerHand,save.status,
    gameHash(game),
  ]));
}

export function serializeSurvival(session:SurvivalSession):SavedSurvival {
  const snap=session.snapshot();
  const replay=exportReplay(session.game);
  const body:Omit<SavedSurvival,'check'>={
    schema:'qbclassic.survival',
    version:1,
    challengeId:snap.challengeId,
    seed:snap.seed,
    playerDeck:[...session.playerDeck],
    currentRound:snap.currentRound,
    roundSettled:snap.roundSettled,
    cumulativePlayerScore:snap.cumulativePlayerScore,
    cumulativeOpponentScore:snap.cumulativeOpponentScore,
    roundScores:structuredClone([...snap.roundScores]),
    remainingPlayerDeck:[...snap.remainingPlayerDeck],
    carriedPlayerHand:[...snap.carriedPlayerHand],
    status:snap.status,
    replay,
  };
  return {...body,check:survivalChecksum(body,session.game)};
}

export function restoreSurvival(value:unknown):SurvivalSession {
  if(!isObject(value)||value.schema!=='qbclassic.survival'||value.version!==1||
    typeof value.challengeId!=='string'||typeof value.check!=='string'||!/^[0-9a-f]{8}$/.test(value.check))
    throw new Error('Invalid survival save envelope');
  if(JSON.stringify(value).length>MAX_SURVIVAL_PAYLOAD)throw new Error('Survival save exceeds size limit');
  const challenge=findSurvivalChallenge(value.challengeId);
  if(!challenge)throw new Error('Unknown survival challenge in save');
  if(!isInt(value.seed,0,0xFFFFFFFF)||!isCardList(value.playerDeck,15)||value.playerDeck.length!==15)
    throw new Error('Invalid survival seed or deck');
  // Validate original player deck legality.
  createGame([value.playerDeck as number[],challenge.rounds[0].opponentDeck],Number(value.seed),0,TURN_DRAW_RULES_VERSION);

  const currentRound=Number(value.currentRound);
  if(!isInt(currentRound,1,challenge.rounds.length)||typeof value.roundSettled!=='boolean')
    throw new Error('Invalid survival round state');
  if(!isInt(value.cumulativePlayerScore,0,1_000_000)||!isInt(value.cumulativeOpponentScore,0,1_000_000))
    throw new Error('Invalid survival scores');
  if(!isCardList(value.remainingPlayerDeck)||!isCardList(value.carriedPlayerHand))
    throw new Error('Invalid survival carried cards');
  if(!['in-progress','cleared-bronze','cleared-silver','cleared-gold','failed'].includes(String(value.status)))
    throw new Error('Invalid survival status');
  if(!Array.isArray(value.roundScores)||value.roundScores.length!==(value.roundSettled?currentRound:currentRound-1))
    throw new Error('Invalid survival round score count');

  const roundScores:SurvivalRoundRecord[]=value.roundScores.map((r,i)=>{
    if(!isObject(r)||r.round!==i+1||typeof r.opponentName!=='string'||
      !isInt(r.playerScore,0,100_000)||!isInt(r.opponentScore,0,100_000)||
      (r.winner!==null&&r.winner!==0&&r.winner!==1)||
      !isInt(r.carriedHandCount,0,256)||!isInt(r.remainingDeckCount,0,256)||
      typeof r.bonusDrawEarned!=='boolean')
      throw new Error('Invalid survival round record');
    return {
      round:Number(r.round),opponentName:r.opponentName,
      playerScore:Number(r.playerScore),opponentScore:Number(r.opponentScore),
      winner:r.winner as Player|null,
      carriedHandCount:Number(r.carriedHandCount),remainingDeckCount:Number(r.remainingDeckCount),
      bonusDrawEarned:r.bonusDrawEarned,
    };
  });

  const replay=checkedSurvivalReplay(value.replay);
  const game=replayMatch(replay);
  if(value.roundSettled!==(game.phase==='finished'))throw new Error('Survival settled flag disagrees with game phase');

  const body:Omit<SavedSurvival,'check'>={
    schema:'qbclassic.survival',
    version:1,
    challengeId:challenge.id,
    seed:Number(value.seed),
    playerDeck:[...(value.playerDeck as number[])],
    currentRound,
    roundSettled:value.roundSettled,
    cumulativePlayerScore:Number(value.cumulativePlayerScore),
    cumulativeOpponentScore:Number(value.cumulativeOpponentScore),
    roundScores,
    remainingPlayerDeck:[...(value.remainingPlayerDeck as number[])],
    carriedPlayerHand:[...(value.carriedPlayerHand as number[])],
    status:value.status as SurvivalStatus,
    replay,
  };
  if(survivalChecksum(body,game)!==value.check)throw new Error('Survival save checksum mismatch');

  return SurvivalSession.fromValidated({
    challenge,
    seed:body.seed,
    playerDeck:body.playerDeck,
    currentRound:body.currentRound,
    roundSettled:body.roundSettled,
    cumulativePlayerScore:body.cumulativePlayerScore,
    cumulativeOpponentScore:body.cumulativeOpponentScore,
    roundScores:body.roundScores,
    remainingPlayerDeck:body.remainingPlayerDeck,
    carriedPlayerHand:body.carriedPlayerHand,
    status:body.status,
    game,
  });
}

export function readActiveSurvival(storage:StoragePort|null):{present:boolean;session:SurvivalSession|null;error:string|null} {
  if(!storage)return {present:false,session:null,error:'Survival storage unavailable'};
  try{
    const raw=storage.getItem(SURVIVAL_KEY);
    if(!raw||raw==='null')return {present:false,session:null,error:null};
    if(raw.length>MAX_SURVIVAL_PAYLOAD+4000)return {present:true,session:null,error:'Invalid survival save'};
    return {present:true,session:restoreSurvival(JSON.parse(raw)),error:null};
  }catch{
    return {present:true,session:null,error:'Invalid survival save'};
  }
}

export function writeActiveSurvival(storage:StoragePort|null,save:SavedSurvival|null):string|null {
  try{
    if(!storage)throw new Error('Survival storage unavailable');
    if(save)restoreSurvival(save);
    const raw=JSON.stringify(save);
    if(raw.length>MAX_SURVIVAL_PAYLOAD+4000)throw new Error('Survival save exceeds size limit');
    storage.setItem(SURVIVAL_KEY,raw);
    return null;
  }catch{
    return 'Failed to save survival progress';
  }
}
