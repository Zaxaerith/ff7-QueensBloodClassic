import {
  botOptionsForMatch,observeGame,
  type BotAction,type BotDifficulty,type BotOptions,type BotView,
} from './bot.js';
import type {BotStrategy} from './bot-strategy.js';
import {byId} from './cards.js';
import {findChallenger} from './challengers.js';
import {
  createGame,exportReplay,legalMoves,mulligan,outcome,pass,play,replayMatch,
  TURN_DRAW_RULES_VERSION,
  type Command,type Game,type Move,type Player,type Replay,
} from './engine.js';
import type {StoragePort} from './ui-data.js';

export const TOURNAMENT_STORAGE_KEY='qbclassic.tournament.v1';
const MAX_TOURNAMENT_PAYLOAD=240_000;
const MAX_COMMANDS=1024;
const MAIN_ROUNDS=5;
const INITIAL_RETRIES_PER_ROUND=1;

export type TournamentStage=
  | 'round-1'
  | 'round-2'
  | 'round-3'
  | 'semifinal'
  | 'final'
  | 'exhibition';

export type TournamentStatus=
  | 'in-progress'
  | 'champion'
  | 'exhibition-cleared'
  | 'eliminated';

export type BracketNodeStatus='pending'|'active'|'won'|'lost'|'locked';

export interface TournamentRoundSpec {
  readonly round:number;
  readonly stage:TournamentStage;
  readonly isExhibition:boolean;
  readonly opponentId:string;
  readonly opponentName:string;
  readonly opponentStrategy:BotStrategy;
  readonly difficulty:BotDifficulty;
  readonly opponentDeck:readonly number[];
}

export interface TournamentRoundResult {
  readonly round:number;
  readonly stage:TournamentStage;
  readonly opponentId:string;
  readonly opponentName:string;
  readonly playerScore:number;
  readonly opponentScore:number;
  readonly winner:Player|null;
  readonly retriesUsed:number;
}

export interface TournamentBracketEntry {
  readonly round:number;
  readonly stage:TournamentStage;
  readonly isExhibition:boolean;
  readonly opponentId:string;
  readonly opponentName:string;
  readonly status:BracketNodeStatus;
  readonly playerScore?:number;
  readonly opponentScore?:number;
}

export interface TournamentSnapshot {
  readonly seed:number;
  readonly currentRound:number;
  readonly mainRounds:number;
  readonly totalRounds:number;
  readonly status:TournamentStatus;
  readonly roundSpec:TournamentRoundSpec;
  readonly roundSettled:boolean;
  readonly roundWon:boolean|null;
  readonly retriesRemaining:number;
  readonly attempt:number;
  readonly canRetry:boolean;
  readonly canAdvance:boolean;
  readonly canStartExhibition:boolean;
  readonly wins:number;
  readonly championshipWon:boolean;
  readonly exhibitionCleared:boolean;
  readonly results:readonly TournamentRoundResult[];
  readonly bracket:readonly TournamentBracketEntry[];
  readonly game:Game;
}

export interface SavedTournament {
  schema:'qbclassic.tournament';
  version:1;
  seed:number;
  playerDeck:number[];
  currentRound:number;
  attempt:number;
  retriesRemaining:number;
  roundSettled:boolean;
  roundWon:boolean|null;
  status:TournamentStatus;
  wins:number;
  championshipWon:boolean;
  exhibitionCleared:boolean;
  results:TournamentRoundResult[];
  replay:Replay;
  check:string;
}

const felixDeck=findChallenger('felix')!.deck;
const reginaDeck=findChallenger('regina')!.deck;

export const TOURNAMENT_ROUNDS:readonly TournamentRoundSpec[]=[
  {
    round:1,
    stage:'round-1',
    isExhibition:false,
    opponentId:'felix',
    opponentName:'Felix',
    opponentStrategy:'felix',
    difficulty:'easy',
    opponentDeck:felixDeck,
  },
  {
    round:2,
    stage:'round-2',
    isExhibition:false,
    opponentId:'aerith-cruise',
    opponentName:'Aerith',
    opponentStrategy:'zogan',
    difficulty:'normal',
    opponentDeck:[1,1,8,8,13,13,24,24,31,31,48,48,89,111,21],
  },
  {
    round:3,
    stage:'round-3',
    isExhibition:false,
    opponentId:'barret-cruise',
    opponentName:'Barret',
    opponentStrategy:'biff',
    difficulty:'normal',
    opponentDeck:[1,1,2,2,3,3,20,20,35,35,41,41,51,51,87],
  },
  {
    round:4,
    stage:'semifinal',
    isExhibition:false,
    opponentId:'tifa-cruise',
    opponentName:'Tifa',
    opponentStrategy:'lidrehl',
    difficulty:'hard',
    opponentDeck:[1,1,7,7,8,8,13,13,51,51,52,54,59,76,88],
  },
  {
    round:5,
    stage:'final',
    isExhibition:false,
    opponentId:'regina',
    opponentName:'Regina',
    opponentStrategy:'regina',
    difficulty:'hard',
    opponentDeck:reginaDeck,
  },
  {
    round:6,
    stage:'exhibition',
    isExhibition:true,
    opponentId:'red-xiii-overfang',
    opponentName:'Red XIII · Overfang',
    opponentStrategy:'turner',
    difficulty:'hard',
    opponentDeck:[1,1,7,8,20,20,26,26,28,28,61,61,63,90,144],
  },
];

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
    game.phase,game.turn,game.passes,game.nextInstanceId,game.events,
  ]));
}

function matchSeed(baseSeed:number,round:number,attempt:number):number {
  return (baseSeed^Math.imul(round,0x9E3779B1)^Math.imul(attempt,0x85EBCA6B))>>>0;
}

function assertValidSeed(seed:number):void {
  if(!Number.isInteger(seed)||seed<0||seed>0xFFFFFFFF)throw new Error('Tournament seed must be uint32');
}

export class TournamentSession {
  readonly seed:number;
  readonly playerDeck:readonly number[];
  #currentRound:number;
  #attempt:number;
  #retriesRemaining:number;
  #roundSettled:boolean;
  #roundWon:boolean|null;
  #status:TournamentStatus;
  #wins:number;
  #championshipWon:boolean;
  #exhibitionCleared:boolean;
  #results:TournamentRoundResult[];
  #game:Game;

  private constructor(init:{
    seed:number;
    playerDeck:readonly number[];
    currentRound:number;
    attempt:number;
    retriesRemaining:number;
    roundSettled:boolean;
    roundWon:boolean|null;
    status:TournamentStatus;
    wins:number;
    championshipWon:boolean;
    exhibitionCleared:boolean;
    results:TournamentRoundResult[];
    game:Game;
  }) {
    this.seed=init.seed;
    this.playerDeck=[...init.playerDeck];
    this.#currentRound=init.currentRound;
    this.#attempt=init.attempt;
    this.#retriesRemaining=init.retriesRemaining;
    this.#roundSettled=init.roundSettled;
    this.#roundWon=init.roundWon;
    this.#status=init.status;
    this.#wins=init.wins;
    this.#championshipWon=init.championshipWon;
    this.#exhibitionCleared=init.exhibitionCleared;
    this.#results=structuredClone(init.results);
    this.#game=structuredClone(init.game);
  }

  static start(playerDeck:readonly number[],seed=501):TournamentSession {
    assertValidSeed(seed);
    const round1=TOURNAMENT_ROUNDS[0];
    const game=createGame([playerDeck,round1.opponentDeck],matchSeed(seed,1,0),0,TURN_DRAW_RULES_VERSION);
    return new TournamentSession({
      seed,
      playerDeck,
      currentRound:1,
      attempt:0,
      retriesRemaining:INITIAL_RETRIES_PER_ROUND,
      roundSettled:false,
      roundWon:null,
      status:'in-progress',
      wins:0,
      championshipWon:false,
      exhibitionCleared:false,
      results:[],
      game,
    });
  }

  get game():Game {return this.#game;}
  get currentRound():number {return this.#currentRound;}
  get status():TournamentStatus {return this.#status;}

  roundSpec(round=this.#currentRound):TournamentRoundSpec {
    return TOURNAMENT_ROUNDS[round-1];
  }

  mulligan(indices:number[]):TournamentSnapshot {
    if(this.#game.phase!=='mulligan')throw new Error('Mulligan is already complete');
    mulligan(this.#game,0,indices);
    if(!this.#game.mulliganDone[1])mulligan(this.#game,1,[]);
    return this.snapshot();
  }

  moves():Move[] {return legalMoves(this.#game,this.#game.turn);}

  play(handIndex:number,row:number,col:number):TournamentSnapshot {
    if(this.#roundSettled)throw new Error('Current tournament match is already finished');
    play(this.#game,this.#game.turn,handIndex,row,col);
    this.syncMatchCompletion();
    return this.snapshot();
  }

  pass():TournamentSnapshot {
    if(this.#roundSettled)throw new Error('Current tournament match is already finished');
    pass(this.#game,this.#game.turn);
    this.syncMatchCompletion();
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

  applyBotAction(action:BotAction):TournamentSnapshot {
    if(action.player!==1)throw new Error('Expected computer action for player 1');
    if(action.type==='pass')return this.pass();
    return this.play(action.handIndex,action.row,action.col);
  }

  private syncMatchCompletion():void {
    if(this.#roundSettled||this.#game.phase!=='finished')return;
    const spec=this.roundSpec();
    const result=outcome(this.#game);
    const won=result.winner===0;
    this.#roundSettled=true;
    this.#roundWon=won;

    if(won){
      this.#wins++;
      this.#results.push({
        round:spec.round,
        stage:spec.stage,
        opponentId:spec.opponentId,
        opponentName:spec.opponentName,
        playerScore:result.scores[0],
        opponentScore:result.scores[1],
        winner:result.winner,
        retriesUsed:this.#attempt,
      });
      if(spec.round===MAIN_ROUNDS){
        this.#championshipWon=true;
        this.#status='champion';
      } else if(spec.isExhibition){
        this.#exhibitionCleared=true;
        this.#status='exhibition-cleared';
      }
      return;
    }

    // Loss or draw: allow 1 retry if remaining, otherwise settle tournament outcome.
    if(this.#retriesRemaining===0){
      this.recordDefeat(spec,result.scores,result.winner);
    }
  }

  private recordDefeat(spec:TournamentRoundSpec,scores:[number,number],winner:Player|null):void {
    this.#results.push({
      round:spec.round,
      stage:spec.stage,
      opponentId:spec.opponentId,
      opponentName:spec.opponentName,
      playerScore:scores[0],
      opponentScore:scores[1],
      winner,
      retriesUsed:this.#attempt,
    });
    this.#status=spec.isExhibition?'champion':'eliminated';
  }

  retryRound():TournamentSnapshot {
    if(!this.#roundSettled||this.#roundWon!==false||this.#retriesRemaining<=0)
      throw new Error('Retry is not available for the current tournament round');
    const spec=this.roundSpec();
    this.#retriesRemaining--;
    this.#attempt++;
    this.#roundSettled=false;
    this.#roundWon=null;
    this.#game=createGame(
      [this.playerDeck,spec.opponentDeck],
      matchSeed(this.seed,spec.round,this.#attempt),
      0,
      TURN_DRAW_RULES_VERSION,
    );
    return this.snapshot();
  }

  concede():TournamentSnapshot {
    if(!this.#roundSettled||this.#roundWon!==false||this.#status!=='in-progress')
      throw new Error('Cannot concede unless awaiting retry after a non-win');
    const spec=this.roundSpec();
    const result=outcome(this.#game);
    this.#retriesRemaining=0;
    this.recordDefeat(spec,result.scores,result.winner);
    return this.snapshot();
  }

  advanceRound():TournamentSnapshot {
    if(!this.#roundSettled||this.#roundWon!==true)
      throw new Error('Must win the current tournament round before advancing');
    if(this.#currentRound>=MAIN_ROUNDS)
      throw new Error('Main bracket complete; use startExhibition() for the bonus Red XIII match');
    return this.beginRound(this.#currentRound+1);
  }

  startExhibition():TournamentSnapshot {
    if(!this.#championshipWon||this.#currentRound!==MAIN_ROUNDS||!this.#roundSettled||this.#roundWon!==true)
      throw new Error('Win the Final (Round 5) to unlock the Red XIII bonus exhibition');
    return this.beginRound(TOURNAMENT_ROUNDS.length);
  }

  private beginRound(round:number):TournamentSnapshot {
    const spec=this.roundSpec(round);
    this.#currentRound=round;
    this.#attempt=0;
    this.#retriesRemaining=INITIAL_RETRIES_PER_ROUND;
    this.#roundSettled=false;
    this.#roundWon=null;
    this.#status='in-progress';
    this.#game=createGame(
      [this.playerDeck,spec.opponentDeck],
      matchSeed(this.seed,spec.round,0),
      0,
      TURN_DRAW_RULES_VERSION,
    );
    return this.snapshot();
  }

  snapshot():TournamentSnapshot {
    const spec=this.roundSpec();
    const resultByRound=new Map(this.#results.map(r=>[r.round,r]));
    const bracket:TournamentBracketEntry[]=TOURNAMENT_ROUNDS.map(r=>{
      const rec=resultByRound.get(r.round);
      if(rec){
        return {
          round:r.round,stage:r.stage,isExhibition:r.isExhibition,
          opponentId:r.opponentId,opponentName:r.opponentName,
          status:rec.winner===0?'won':'lost',
          playerScore:rec.playerScore,opponentScore:rec.opponentScore,
        };
      }
      if(r.round===this.#currentRound){
        return {
          round:r.round,stage:r.stage,isExhibition:r.isExhibition,
          opponentId:r.opponentId,opponentName:r.opponentName,
          status:'active',
        };
      }
      if(r.isExhibition&&!this.#championshipWon){
        return {
          round:r.round,stage:r.stage,isExhibition:r.isExhibition,
          opponentId:r.opponentId,opponentName:r.opponentName,
          status:'locked',
        };
      }
      return {
        round:r.round,stage:r.stage,isExhibition:r.isExhibition,
        opponentId:r.opponentId,opponentName:r.opponentName,
        status:'pending',
      };
    });

    const canRetry=this.#roundSettled&&this.#roundWon===false&&this.#retriesRemaining>0&&this.#status==='in-progress';
    const canAdvance=this.#roundSettled&&this.#roundWon===true&&this.#currentRound<MAIN_ROUNDS;
    const canStartExhibition=this.#championshipWon&&this.#currentRound===MAIN_ROUNDS&&this.#roundSettled&&this.#roundWon===true;

    return structuredClone({
      seed:this.seed,
      currentRound:this.#currentRound,
      mainRounds:MAIN_ROUNDS,
      totalRounds:TOURNAMENT_ROUNDS.length,
      status:this.#status,
      roundSpec:spec,
      roundSettled:this.#roundSettled,
      roundWon:this.#roundWon,
      retriesRemaining:this.#retriesRemaining,
      attempt:this.#attempt,
      canRetry,
      canAdvance,
      canStartExhibition,
      wins:this.#wins,
      championshipWon:this.#championshipWon,
      exhibitionCleared:this.#exhibitionCleared,
      results:this.#results,
      bracket,
      game:this.#game,
    });
  }

  serialize():SavedTournament {return serializeTournament(this);}

  static restore(value:unknown):TournamentSession {return restoreTournament(value);}

  /** @internal */
  static fromValidated(data:{
    seed:number;
    playerDeck:number[];
    currentRound:number;
    attempt:number;
    retriesRemaining:number;
    roundSettled:boolean;
    roundWon:boolean|null;
    status:TournamentStatus;
    wins:number;
    championshipWon:boolean;
    exhibitionCleared:boolean;
    results:TournamentRoundResult[];
    game:Game;
  }):TournamentSession {
    return new TournamentSession(data);
  }
}

function checkedTournamentReplay(value:unknown):Replay {
  if(!isObject(value)||value.version!==1||!isInt(value.seed,0,0xFFFFFFFF)||
    (value.firstPlayer!==0&&value.firstPlayer!==1)||!Array.isArray(value.decks)||value.decks.length!==2||
    !isCardList(value.decks[0],15)||!isCardList(value.decks[1],15)||
    !Array.isArray(value.commands)||value.commands.length>MAX_COMMANDS)
    throw new Error('Invalid tournament replay');
  const commands:Command[]=value.commands.map(raw=>{
    if(!isObject(raw)||(raw.player!==0&&raw.player!==1))throw new Error('Invalid tournament command');
    const player=raw.player;
    if(raw.type==='pass')return {type:'pass',player};
    if(raw.type==='play'){
      if(!isInt(raw.handIndex,0,255)||!isInt(raw.row,0,2)||!isInt(raw.col,0,4))throw new Error('Invalid play command');
      return {type:'play',player,handIndex:Number(raw.handIndex),row:Number(raw.row),col:Number(raw.col)};
    }
    if(raw.type==='mulligan'&&Array.isArray(raw.indices)&&raw.indices.length<=5&&
      raw.indices.every(n=>isInt(n,0,4))&&new Set(raw.indices).size===raw.indices.length){
      return {type:'mulligan',player,indices:[...raw.indices] as number[]};
    }
    throw new Error('Unsupported tournament command type');
  });
  return {
    version:1,
    rulesVersion:TURN_DRAW_RULES_VERSION,
    seed:Number(value.seed),
    decks:[[...value.decks[0]],[...value.decks[1]]],
    firstPlayer:value.firstPlayer,
    commands,
  };
}

function tournamentChecksum(save:Omit<SavedTournament,'check'>,game:Game):string {
  return fnvHash(JSON.stringify([
    save.schema,save.version,save.seed,save.playerDeck,save.currentRound,save.attempt,
    save.retriesRemaining,save.roundSettled,save.roundWon,save.status,save.wins,
    save.championshipWon,save.exhibitionCleared,save.results,gameHash(game),
  ]));
}

export function serializeTournament(session:TournamentSession):SavedTournament {
  const snap=session.snapshot();
  const replay=exportReplay(session.game);
  const body:Omit<SavedTournament,'check'>={
    schema:'qbclassic.tournament',
    version:1,
    seed:snap.seed,
    playerDeck:[...session.playerDeck],
    currentRound:snap.currentRound,
    attempt:snap.attempt,
    retriesRemaining:snap.retriesRemaining,
    roundSettled:snap.roundSettled,
    roundWon:snap.roundWon,
    status:snap.status,
    wins:snap.wins,
    championshipWon:snap.championshipWon,
    exhibitionCleared:snap.exhibitionCleared,
    results:structuredClone([...snap.results]),
    replay,
  };
  return {...body,check:tournamentChecksum(body,session.game)};
}

export function restoreTournament(value:unknown):TournamentSession {
  if(!isObject(value)||value.schema!=='qbclassic.tournament'||value.version!==1||
    typeof value.check!=='string'||!/^[0-9a-f]{8}$/.test(value.check))
    throw new Error('Invalid tournament save envelope');
  if(JSON.stringify(value).length>MAX_TOURNAMENT_PAYLOAD)throw new Error('Tournament save exceeds size limit');
  if(!isInt(value.seed,0,0xFFFFFFFF)||!isCardList(value.playerDeck,15)||value.playerDeck.length!==15)
    throw new Error('Invalid tournament seed or deck');
  const currentRound=Number(value.currentRound);
  if(!isInt(currentRound,1,TOURNAMENT_ROUNDS.length))throw new Error('Invalid tournament round');
  if(!isInt(value.attempt,0,4)||!isInt(value.retriesRemaining,0,4))throw new Error('Invalid tournament retry state');
  if(typeof value.roundSettled!=='boolean'||(value.roundWon!==null&&typeof value.roundWon!=='boolean'))
    throw new Error('Invalid tournament round settled state');
  if(!['in-progress','champion','exhibition-cleared','eliminated'].includes(String(value.status)))
    throw new Error('Invalid tournament status');
  if(!isInt(value.wins,0,TOURNAMENT_ROUNDS.length)||typeof value.championshipWon!=='boolean'||typeof value.exhibitionCleared!=='boolean')
    throw new Error('Invalid tournament win counters');
  if(!Array.isArray(value.results)||value.results.length>TOURNAMENT_ROUNDS.length)
    throw new Error('Invalid tournament results');

  const results:TournamentRoundResult[]=value.results.map(r=>{
    if(!isObject(r)||!isInt(r.round,1,TOURNAMENT_ROUNDS.length)||typeof r.stage!=='string'||
      typeof r.opponentId!=='string'||typeof r.opponentName!=='string'||
      !isInt(r.playerScore,0,100_000)||!isInt(r.opponentScore,0,100_000)||
      (r.winner!==null&&r.winner!==0&&r.winner!==1)||!isInt(r.retriesUsed,0,4))
      throw new Error('Invalid tournament round result');
    return {
      round:Number(r.round),stage:r.stage as TournamentStage,
      opponentId:r.opponentId,opponentName:r.opponentName,
      playerScore:Number(r.playerScore),opponentScore:Number(r.opponentScore),
      winner:r.winner as Player|null,retriesUsed:Number(r.retriesUsed),
    };
  });

  const replay=checkedTournamentReplay(value.replay);
  const spec=TOURNAMENT_ROUNDS[currentRound-1];
  if(replay.seed!==matchSeed(Number(value.seed),currentRound,Number(value.attempt)))
    throw new Error('Tournament replay seed mismatch');
  if(JSON.stringify(replay.decks)!==JSON.stringify([value.playerDeck,spec.opponentDeck]))
    throw new Error('Tournament replay deck mismatch');
  const game=replayMatch(replay);
  if(value.roundSettled!==(game.phase==='finished'))
    throw new Error('Tournament settled flag disagrees with game phase');

  const body:Omit<SavedTournament,'check'>={
    schema:'qbclassic.tournament',
    version:1,
    seed:Number(value.seed),
    playerDeck:[...value.playerDeck],
    currentRound,
    attempt:Number(value.attempt),
    retriesRemaining:Number(value.retriesRemaining),
    roundSettled:value.roundSettled,
    roundWon:value.roundWon,
    status:value.status as TournamentStatus,
    wins:Number(value.wins),
    championshipWon:value.championshipWon,
    exhibitionCleared:value.exhibitionCleared,
    results,
    replay,
  };
  if(tournamentChecksum(body,game)!==value.check)throw new Error('Tournament save checksum mismatch');

  return TournamentSession.fromValidated({...body,game});
}

export function readActiveTournament(storage:StoragePort|null):{present:boolean;session:TournamentSession|null;error:string|null} {
  if(!storage)return {present:false,session:null,error:'Tournament storage unavailable'};
  try{
    const raw=storage.getItem(TOURNAMENT_STORAGE_KEY);
    if(!raw||raw==='null')return {present:false,session:null,error:null};
    if(raw.length>MAX_TOURNAMENT_PAYLOAD+4000)return {present:true,session:null,error:'Invalid tournament save'};
    return {present:true,session:restoreTournament(JSON.parse(raw)),error:null};
  }catch{
    return {present:true,session:null,error:'Invalid tournament save'};
  }
}

export function writeActiveTournament(storage:StoragePort|null,save:SavedTournament|null):string|null {
  try{
    if(!storage)throw new Error('Tournament storage unavailable');
    if(save)restoreTournament(save);
    const raw=JSON.stringify(save);
    if(raw.length>MAX_TOURNAMENT_PAYLOAD+4000)throw new Error('Tournament save exceeds size limit');
    storage.setItem(TOURNAMENT_STORAGE_KEY,raw);
    return null;
  }catch{
    return 'Failed to save tournament progress';
  }
}
