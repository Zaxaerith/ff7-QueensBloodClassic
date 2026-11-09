import {createGame,createPosition,legalMoves,mulligan,play,pass,outcome,exportReplay,replayMatch,type Game,type Player,type Position,type Replay} from './engine.js';
import {byId,deckPresets,playableCards,tokenCards} from './cards.js';
import {getCardEvidence,evidenceSources} from './evidence.js';
import {recommendBot,observeGame,type BotOptions,type BotAction} from './bot.js';
import {analyzeDecision,type AnalysisOptions} from './replay-analysis.js';

type Operation = Record<string,unknown> & {op:string};
export class QbSession {
  private game: Game | null=null;
  execute(request: unknown): {ok:boolean;results:unknown[];state?:Game} {
    if(!request||typeof request!=='object') throw new Error('Expected JSON object or operation array');
    const envelope=request as {operations?:unknown;includeState?:boolean};
    const operations=Array.isArray(request)?request:envelope.operations;
    if(!Array.isArray(operations)) throw new Error('Expected operations array');
    const results:unknown[]=[];let ok=true;
    for(const [index,raw] of operations.entries()){
      try {
        if(!raw||typeof raw!=='object'||typeof raw.op!=='string') throw new Error('Operation requires op');
        results.push({ok:true,op:raw.op,result:this.operation(raw)});
      } catch(error){ok=false;results.push({ok:false,index,error:{code:'INVALID_OPERATION',message:error instanceof Error?error.message:String(error)}});}
    }
    return {ok,results,...(envelope.includeState&&this.game?{state:structuredClone(this.game)}:{})};
  }
  private operation(op:Operation):unknown {
    if(op.op==='evidence')return {evidence:getCardEvidence(Number(op.cardId)),sources:evidenceSources};
    if(op.op==='create'){
      const preset=deckPresets.find(p=>p.name===op.preset)??(typeof op.preset==='number'?deckPresets[op.preset]:undefined);
      if(op.preset!==undefined&&!preset) throw new Error('Unknown preset');
      const decks=op.decks??[preset?.cards??deckPresets[0].cards,preset?.cards??deckPresets[0].cards];
      const seed=op.seed??1;
      if(!Number.isSafeInteger(seed)||Number(seed)<0||Number(seed)>0xFFFFFFFF)throw new Error('seed must be a uint32 integer');
      const next=createGame(decks as [number[],number[]],seed as number,(op.firstPlayer??0) as Player);
      this.game=next;return this.summary();
    }
    if(op.op==='importPosition'){const next=createPosition(op.position as Position);this.game=next;return this.summary();}
    if(op.op==='restoreReplay'){const next=replayMatch(op.replay as Replay);this.game=next;return this.summary();}
    if(op.op==='cards') {
      if(op.cardId!==undefined){const card=byId.get(Number(op.cardId));if(!card)throw new Error('Card not implemented');return card;}
      return {numbered:playableCards,tokens:tokenCards,presets:deckPresets};
    }
    if(!this.game) throw new Error('No game: create, importPosition or restoreReplay first');
    if(op.op==='state') return structuredClone(this.game);
    if(op.op==='score') return {phase:this.game.phase,...outcome(this.game)};
    if(op.op==='events'){
      const after=op.after??0;if(!Number.isInteger(after)||Number(after)<0) throw new Error('after must be a nonnegative event sequence');
      return this.game.events.filter(e=>e.seq>Number(after));
    }
    if(op.op==='replay') return exportReplay(this.game);
    if(op.op==='analyze')return analyzeDecision(observeGame(this.game,(op.player??this.game.turn) as Player),op.actual as BotAction,{
      ...(op.difficulty!==undefined?{difficulty:op.difficulty as NonNullable<AnalysisOptions['difficulty']>}:{}),
      ...(op.seed!==undefined?{seed:op.seed as number}:{}),...(op.maxNodes!==undefined?{maxNodes:op.maxNodes as number}:{})});
    if(op.op==='bot'){
      const player=(op.player??this.game.turn) as Player;
      if(op.explain!==undefined&&typeof op.explain!=='boolean')throw Error('explain must be boolean');
      return recommendBot(this.game,player,{
        ...(op.difficulty!==undefined?{difficulty:op.difficulty as BotOptions['difficulty']}:{}),
        ...(op.seed!==undefined?{seed:op.seed as number}:{}),...(op.maxNodes!==undefined?{maxNodes:op.maxNodes as number}:{}),
        ...(op.explain!==undefined?{explain:op.explain as boolean}:{})} as BotOptions);
    }
    if(op.op==='legal'){
      const p=(op.player??this.game.turn) as Player;if(p!==0&&p!==1) throw new Error('Invalid player');
      if(this.game.phase==='finished') return [];
      if(this.game.phase==='mulligan') return this.game.mulliganDone[p]?[]:Array.from({length:1<<this.game.hands[p].length},(_,bits)=>
        ({op:'mulligan',player:p,indices:this.game!.hands[p].flatMap((_,i)=>bits&(1<<i)?[i]:[])}));
      return [...legalMoves(this.game,p).map(m=>({op:'play',player:p,cardId:this.game!.hands[p][m.handIndex],...m})),...(p===this.game.turn?[{op:'pass',player:p}]:[])];
    }
    // Every command, including mulligan, commits only after successful execution.
    const next=structuredClone(this.game),player=(op.player??next.turn) as Player;
    if(op.op==='mulligan'){
      if(!Array.isArray(op.indices)) throw new Error('mulligan requires indices');
      mulligan(next,player,op.indices as number[]);
    } else if(op.op==='play'){
      if(player!==0&&player!==1) throw new Error('Invalid player');
      let index=op.handIndex;
      if(index===undefined){
        const indices=next.hands[player].flatMap((id,i)=>id===op.cardId?[i]:[]);
        if(indices.length!==1) throw new Error('cardId must identify one hand card; use handIndex for duplicate copies');
        index=indices[0];
      }
      if(!Number.isInteger(index)) throw new Error('handIndex must be an integer');
      if(op.cardId!==undefined&&next.hands[player][Number(index)]!==op.cardId) throw new Error('cardId does not match handIndex');
      play(next,player,Number(index),op.row as number,op.col as number);
    } else if(op.op==='pass') pass(next,player);
    else throw new Error(`Unknown operation: ${op.op}`);
    this.game=next;return this.summary();
  }
  private summary(){return {phase:this.game!.phase,turn:this.game!.turn,eventCursor:this.game!.events.length,...outcome(this.game!)};}
}
