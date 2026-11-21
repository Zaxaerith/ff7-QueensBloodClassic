import {hasActiveLocale,t} from './i18n/index.js';
import {displayName} from './i18n/card-names.js';
import {scoreBreakdown,play,pass,legalMoves,type Game,type RuleEvent} from './engine.js';
import type {BotDecision} from './bot.js';
import {BotWorkerFailure,elapsedSince,resolutionFailure,type BotDiagnostic,type BotFailureReason} from './bot-diagnostics.js';
import {actionFeedback,eventLabel} from './match-flow.js';
import {byId} from './cards.js';
import {effectPlan,effectTargets,type MatchEffect} from './match-effects.js';

export type PresentationPhase='Suspended'|'Mulligan'|'PlayerSelect'|'Preview'|'PlayerCommit'|'PlayerResolve'|'OpponentTurn'|'OpponentCommit'|'OpponentResolve'|'MatchEnd'|'Result';
// Project UX values, not measured Rebirth animation timings.
export const PRESENTATION_MS=Object.freeze({placement:180,opponentCard:220,effect:220,effectsMax:880,settle:300,pass:260,handoff:300,end:200,lane:280,total:320,mulligan:400});
export function publicMatch(game:Game){
  return {board:structuredClone(game.board),hand:[...game.hands[0]],enemyHandCount:game.hands[1].length,
    deckCounts:[game.decks[0].length,game.decks[1].length],phase:game.phase,turn:game.turn,passes:game.passes,
    mulliganDone:game.mulliganDone[0],result:scoreBreakdown(game)};
}
export type PublicMatch=ReturnType<typeof publicMatch>;
export function publicEvents(events:readonly RuleEvent[]):RuleEvent[]{
  return events.map(event=>event.type==='CardAddedToHand'&&event.player===1
    ?{seq:event.seq,type:event.type,player:1,amount:1,reason:event.reason==='draw'?'draw':'generated',...(event.stage?{stage:event.stage}:{})}
    :structuredClone(event));
}
export function presentationEventLabel(event:RuleEvent):string {
  if(event.type==='CardAddedToHand'&&event.player===1)return event.reason==='draw'?t("theComputerDrewOneCard"):t("theComputerGeneratedOneCardInHand");
  const name=event.cardId===undefined?'':displayName(event.cardId,byId.get(event.cardId)?.name);
  if(event.type==='PawnsClaimed')return t("pawnsClaimedEvent", event.player===0?t("you"):t("computer"), event.row!+1, event.col!+1, event.amount);
  if(event.type==='CardSpawned')return t("cardSpawnedEvent", name, event.row!+1, event.col!+1);
  if(event.type==='CardEnhanced'||event.type==='CardEnfeebled')return t("cardStateTriggered", name, event.type==='CardEnhanced'?t("enhanced"):t("enfeebled"));
  if(event.type==='ThresholdReached')return t("cardThresholdReached", name);
  return eventLabel(event);
}
export interface PublicBatch {before:PublicMatch;after:PublicMatch;events:RuleEvent[];actor:0|1;automaticPass:boolean;}
interface Hooks {
  game:()=>Game|null;choose:()=>Promise<BotDecision|null>;cancelBot:()=>void;
  checkpoint:()=>string|null;completed:()=>string|null;changed:()=>void;result:()=>void;
  diagnostic?:(diagnostic:BotDiagnostic)=>void;
}
type SearchReply={decision:BotDecision|null;warning:string;diagnostic?:BotDiagnostic};
type Search={game:Game;command:number;automaticPass:boolean;reply:Promise<SearchReply>};

/** Coordinates presentation around the ONE authoritative Game. No rule steps
 * are replayed by the clock; only public snapshots enter the display cache. */
export class MatchPresentation {
  phase:PresentationPhase='Suspended';frame:PublicMatch|null=null;batch:PublicBatch|null=null;
  effect:MatchEffect|null=null;
  message='';issue='';active=false;fast=false;
  private generation=0;private archived=false;private skipBatch=false;
  private batchNumber=0;private effectNumber=0;
  private waiting:{timer:ReturnType<typeof setTimeout>;finish:(ok:boolean)=>void}|null=null;
  constructor(private hooks:Hooks,private reduced:()=>boolean=()=>false){}
  get canPlay(){const g=this.hooks.game();return this.active&&(this.phase==='PlayerSelect'||this.phase==='Preview')&&g?.phase==='playing'&&g.turn===0;}
  get canMulligan(){return this.active&&this.phase==='Mulligan'&&this.hooks.game()?.phase==='mulligan';}
  get busy(){return this.active&&!this.canPlay&&!this.canMulligan&&this.phase!=='Result';}
  get skippable(){return this.busy&&!!this.waiting;}
  private notify(){try{this.hooks.changed();}catch{/* A failed view cannot roll back a committed rule action. */}}
  private state(phase:PresentationPhase,message=this.message){this.phase=phase;this.message=message;this.notify();}
  private alive(epoch:number){return this.active&&epoch===this.generation;}
  private wait(ms:number,epoch:number):Promise<boolean>{
    if(!this.alive(epoch))return Promise.resolve(false);
    if(ms===0||this.skipBatch)return Promise.resolve(true);
    return new Promise(resolve=>{
      const finish=(ok:boolean)=>{if(this.waiting?.finish!==finish)return;clearTimeout(this.waiting.timer);this.waiting=null;resolve(ok);};
      this.waiting={timer:setTimeout(()=>finish(this.alive(epoch)),ms),finish};
      this.notify();
    });
  }
  private duration(ms:number){return this.fast||this.reduced()?0:ms;}
  skip(){if(this.waiting){this.skipBatch=true;this.waiting.finish(true);}}
  setFast(value:boolean){this.fast=value;if(value)this.skip();this.notify();}
  preview(pending:boolean){if(this.canPlay){this.effect=null;this.state(pending?'Preview':'PlayerSelect');}}
  pause(){
    this.active=false;this.generation++;this.waiting?.finish(false);this.hooks.cancelBot();
    this.batch=null;this.frame=null;this.effect=null;this.skipBatch=false;this.state('Suspended');
  }
  /** Called only when binding a NEW/restored authoritative match, never on art refresh. */
  reset(){this.pause();this.archived=false;this.issue='';}
  resume(){
    if(this.active)return;
    const game=this.hooks.game();if(!game)return;
    this.active=true;this.generation++;this.frame=publicMatch(game);this.batch=null;this.effect=null;
    this.dispatch(this.generation);
  }
  private checkpoint(){try{this.issue=this.hooks.checkpoint()??'';}catch{this.issue=t("autosaveFailedYouCanKeepPlayingAndExport");}}
  private archive(){
    if(this.hooks.game()?.phase!=='finished'||this.archived)return;
    this.archived=true; // rendering/skip/resume must never duplicate an archive attempt
    try{const issue=this.hooks.completed();if(issue)this.issue=issue;}catch{this.issue=t("couldNotArchiveTheMatchExportAReplay");}
  }
  commitPlayer(action:()=>void,opening=false,automaticPass=false):boolean {
    if(opening?!this.canMulligan:!this.canPlay)return false;
    const game=this.hooks.game()!,before=publicMatch(game),cursor=game.events.length,epoch=this.generation;
    this.effect=null;
    this.state('PlayerCommit',automaticPass?t("noLegalPlaysAutoPass"):t("submittingYourMove"));
    try{action();}catch{this.frame=publicMatch(game);this.state(opening?'Mulligan':'PlayerSelect',t("invalidMove"));return false;}
    this.checkpoint();this.archive();
    this.batch={before,after:publicMatch(game),events:publicEvents(game.events.slice(cursor)),actor:0,automaticPass};
    const search=game.phase==='playing'&&game.turn===1?this.search():undefined;
    void this.playerSequence(epoch,search,opening);return true;
  }
  private search():Search {
    const game=this.hooks.game()!,command=game.replay.commands.length;
    // Turn-local legalMoves also checks allied replacement targets. Board
    // fullness and current score are NEVER used to decide automatic passing.
    if(!legalMoves(game,1).length)return {game,command,automaticPass:true,reply:Promise.resolve({decision:null,warning:''})};
    const started=performance.now();
    const failed=(error:unknown):SearchReply=>({decision:null,warning:error instanceof Error?error.message:String(error),
      diagnostic:error instanceof BotWorkerFailure?error.diagnostic:{source:'worker',reason:'worker-error',elapsedMs:elapsedSince(started),nodes:null,resolutionFailures:0,degraded:true}});
    let reply:Search['reply'];
    try{reply=this.hooks.choose().then(decision=>({decision,warning:decision?.warning??'',diagnostic:decision?.diagnostic??{
      source:'worker',reason:decision?.stats.exhausted?'search-exhausted':decision?.action.type==='pass'?'strategic-pass':decision?'decision':'missing-decision',
      elapsedMs:elapsedSince(started),nodes:decision?.stats.nodes??null,resolutionFailures:decision?.stats.resolutionFailures??0,degraded:!!decision?.stats.exhausted||!decision}}),failed);}
    catch(error){reply=Promise.resolve(failed(error));}
    return {game,command,automaticPass:false,reply};
  }
  private async playerSequence(epoch:number,search:Search|undefined,opening:boolean){
    try{
      if(!await this.resolveBatch(epoch,opening))return;
      this.dispatch(epoch,search);
    }catch{this.recover(epoch);}
  }
  private dispatch(epoch:number,search?:Search){
    if(!this.alive(epoch))return;
    const game=this.hooks.game()!;this.frame=publicMatch(game);this.batch=null;this.skipBatch=false;
    if(game.phase==='mulligan'){this.state('Mulligan',t("chooseCardsToExchangeThenConfirm"));return;}
    if(game.phase==='finished'){
      this.archive();this.state('Result',t("matchOverViewTheFinalScoreByLane"));this.hooks.result();return;
    }
    if(game.turn===0){
      if(!legalMoves(game,0).length){
        // Enter the existing commit gate synchronously, without exposing an
        // actionable PlayerSelect frame or inventing an engine end condition.
        this.phase='PlayerSelect';this.commitPlayer(()=>pass(game,0),false,true);
      }else this.state('PlayerSelect',t("yourTurnSelectCardSelectTileConfirm"));
    }
    else void this.opponent(epoch,search??this.search());
  }
  private async opponent(epoch:number,search:Search){
    try{
      this.skipBatch=false;this.state('OpponentTurn',t("computersTurnWaitingForAMove"));
      // Both barriers start together; a slow worker does not pay a second delay.
      const [ready,answer]=await Promise.all([this.wait(this.fast||this.reduced()?80:PRESENTATION_MS.handoff,epoch),search.reply]);
      const game=this.hooks.game();
      if(!ready||!this.alive(epoch))return;
      if(game!==search.game||game?.phase!=='playing'||game.turn!==1||game.replay.commands.length!==search.command){this.pause();return;}
      const before=publicMatch(game),cursor=game.events.length;
      this.effect=null;
      this.state('OpponentCommit',t("computerIsPlayingACard"));
      const warning=this.commitOpponent(game,answer,search.automaticPass);
      this.checkpoint();this.archive();
      this.batch={before,after:publicMatch(game),events:publicEvents(game.events.slice(cursor)),actor:1,automaticPass:search.automaticPass};
      if(!await this.resolveBatch(epoch,false,warning))return;
      this.dispatch(epoch);
    }catch{this.recover(epoch);}
  }
  private commitOpponent(game:Game,{decision,warning,diagnostic}:SearchReply,automaticPass:boolean):string {
    const action=decision?.action,started=performance.now();
    let failures=diagnostic?.resolutionFailures??decision?.stats.resolutionFailures??0;
    let cause:BotFailureReason=diagnostic?.reason==='decision'||diagnostic?.reason==='strategic-pass'||!diagnostic?'invalid-action':diagnostic.reason as BotFailureReason;
    const record=(source:BotDiagnostic['source'],reason:BotDiagnostic['reason'],degraded:boolean)=>{
      try{this.hooks.diagnostic?.({source,reason,elapsedMs:(diagnostic?.elapsedMs??0)+elapsedSince(started),nodes:diagnostic?.nodes??decision?.stats.nodes??null,resolutionFailures:failures,degraded});}catch{/* Diagnostics must not interrupt play. */}
    };
    // An evaluated PASS (even with a nonfatal warning) is not search exhaustion.
    if(automaticPass||action?.type==='pass'&&action.player===1&&!decision?.stats.exhausted){
      try{pass(game,1);}catch(error){if(resolutionFailure(error))failures++;record(automaticPass?'automatic-pass':'worker','rule-resolution',true);throw error;}
      record(automaticPass?'automatic-pass':'worker',automaticPass?'no-legal-moves':'strategic-pass',false);return warning;
    }
    if(decision?.stats.exhausted){cause=failures?'rule-resolution':'search-exhausted';warning=t('botSearchWarning');}
    if(action?.type==='play'&&action.player===1){
      try{play(game,1,action.handIndex,action.row,action.col);record('worker','decision',false);return warning;}
      catch(error){cause=resolutionFailure(error)?'rule-resolution':'invalid-action';if(resolutionFailure(error))failures++;warning=t('computersPlacementFailedToResolve');}
    }else if(!decision&&!diagnostic)cause='missing-decision';
    const reason=warning?(!hasActiveLocale()||warning===t('computersPlacementFailedToResolve')?warning:t('botSearchWarning')):(action?t('computerReturnedAnInvalidAction'):t('computerReturnedNoAction'));
    // Atomic fallback is unchanged: failed trials never mutate the live match.
    for(const move of legalMoves(game,1)){
      try{play(game,1,move.handIndex,move.row,move.col);record('fallback',cause,true);return t('botFallbackMove',reason);}
      catch(error){if(resolutionFailure(error))failures++;}
    }
    try{pass(game,1);}catch(error){if(resolutionFailure(error))failures++;record('fallback','rule-resolution',true);throw error;}
    record('fallback',failures?'rule-resolution':cause,true);return t('botNoResolvableMove',reason);
  }
  private async resolveBatch(epoch:number,opening=false,warning=''):Promise<boolean>{
    const batch=this.batch!;this.skipBatch=false;this.frame=batch.before;
    const plan=effectPlan(batch),batchNumber=++this.batchNumber;
    const cue=(stage:MatchEffect['stage'],events:readonly RuleEvent[]=[])=>{
      this.effect={key:++this.effectNumber,batch:batchNumber,stage,actor:batch.actor,action:plan.placement?'play':batch.events.some(e=>e.type==='TurnPassed')?'pass':'mulligan',motion:!this.fast&&!this.reduced()&&!this.skipBatch,
        placement:plan.placement,events,changes:plan.changes,targets:effectTargets(events,batch.before,batch.after)};
    };
    cue('commit');
    const summary=actionFeedback(batch.events)+(batch.automaticPass?t("autoPassSuffix"):'')+(warning?` · ${warning}`:'');
    const passed=batch.events.some(e=>e.type==='TurnPassed');
    this.state(batch.actor===0?'PlayerResolve':'OpponentResolve',opening?t("mulliganCompleteUpdatingHands"):passed?summary:t("resolvingPlayedCard", batch.actor===0?t("you"):t("computer")));
    const first=opening?PRESENTATION_MS.mulligan:passed?PRESENTATION_MS.pass:batch.actor===1?PRESENTATION_MS.opponentCard:PRESENTATION_MS.placement;
    if(!await this.wait(this.duration(first),epoch))return false;
    this.frame=batch.after;
    // Board updates once. Ordered evidence overlays do not reconstruct a Game.
    if(!opening&&!passed)for(const group of plan.groups){
      cue('events',group);
      this.message=group.map(presentationEventLabel).join(' · ');this.notify();
      if(!await this.wait(this.duration(PRESENTATION_MS.effect),epoch))return false;
    }
    cue('settle');this.message=summary;this.notify();
    if(!passed&&!opening&&!await this.wait(this.duration(PRESENTATION_MS.settle),epoch))return false;
    if(batch.after.phase==='finished'){
      cue('scoring');this.effect!.scoring={result:batch.after.result,revealed:0,totals:false};
      this.state('MatchEnd',t("twoConsecutivePassesShowingTheFinalScore"));
      if(!await this.wait(this.duration(PRESENTATION_MS.end),epoch))return false;
      for(let row=0;row<3;row++){
        cue('scoring');this.effect!.scoring={result:batch.after.result,revealed:row+1,totals:false};
        const result=batch.after.result;
        this.message=t("scoringLaneProgress", row+1, result.rows[row].join(' : '), result.awards[row].join(' : '));this.notify();
        if(!await this.wait(this.duration(PRESENTATION_MS.lane),epoch))return false;
      }
      cue('scoring');this.effect!.scoring={result:batch.after.result,revealed:3,totals:true};
      this.message=`${batch.after.result.winner===null?t("draw2"):batch.after.result.winner===0?t("victory2"):t("defeat2")} · ${batch.after.result.scores.join(' : ')}`;this.notify();
      if(!await this.wait(this.duration(PRESENTATION_MS.total),epoch))return false;
    }else{
      cue('summary');this.notify();
    }
    return this.alive(epoch);
  }
  private recover(epoch:number){
    if(!this.alive(epoch))return;
    // An unexpected presentation error converges to authority, never replays an action.
    const frame=publicMatch(this.hooks.game()!);this.pause();this.frame=frame;
    this.state('Suspended',t("animationInterruptedReturnToTheMenuAndContinue"));
  }
}
