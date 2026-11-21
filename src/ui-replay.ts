import {t} from './i18n/index.js';
import {displayName} from './i18n/card-names.js';
import {byId} from './cards.js';
import {outcome,previewInfluence,previewEffects,replayRulesVersion,LEGACY_RULES_VERSION,type Replay,type RuleEvent} from './engine.js';
import {historicalDecision} from './replay-analysis.js';
import {analysisActionText,localizeAnalysisError} from './i18n/research-text.js';
import {mountAnalysis,type StudyPreview} from './ui-analysis.js';
import {ReplayTimeline} from './match-archive.js';
import {eventLabel,resultMarkup,rulesLabel} from './match-flow.js';
import {createCardView} from './card-view.js';
import {boardPawns,observeTable,placedCardView} from './ui-board.js';
import type {CardVisual} from './visuals.js';
import {$,element,button,openDialog,downloadJson} from './ui-dom.js';

export function replayEventLabel(e:RuleEvent):string {
  const known=eventLabel(e);if(known)return known;
  const name=e.cardId===undefined?'':displayName(e.cardId,byId.get(e.cardId)?.name);
  if(e.type==='CardSpawned')return t("replayCardSpawned", name, e.row!+1, e.col!+1);
  if(e.type==='CardEnhanced'||e.type==='CardEnfeebled')return t("cardStateTriggered", name, e.type==='CardEnhanced'?t("enhanced"):t("enfeebled"));
  if(e.type==='ThresholdReached')return t("cardThresholdReached", name);
  if(e.type==='PawnsClaimed')return t("replayPawnsClaimed", e.player!+1, e.row!+1, e.col!+1, e.amount);
  if(e.type==='MatchStarted')return t("startingPosition");
  if(e.type==='TurnEnded')return t("replayTurnEnded", e.player!+1);
  return e.type;
}
interface ReplayHooks {visual:(id:number)=>CardVisual;showCard:(id:number)=>void;exit:()=>void;}
export function mountReplay(hooks:ReplayHooks){
  let timeline:ReplayTimeline|null=null,step=0,current:ReturnType<ReplayTimeline['at']>|null=null;
  let preview:StudyPreview|null=null;
  const boardView=$('replayBoard'),handView=$('replayHand');
  const first=$<HTMLButtonElement>('replayFirst'),previous=$<HTMLButtonElement>('replayPrev');
  const next=$<HTMLButtonElement>('replayNext'),last=$<HTMLButtonElement>('replayLast');
  const progress=$<HTMLProgressElement>('replayProgress');
  const menu=$('view-replay').querySelector<HTMLDetailsElement>('.action-more')!;
  const analysis=mountAnalysis({preview:value=>{preview=value;render();},eventText:replayEventLabel});
  observeTable(boardView.parentElement!);
  function render(){
    if(!timeline)return;current=timeline.at(step);const {game,command,events}=current;
    const active=document.activeElement;
    const cardFocus=active instanceof HTMLElement?active.dataset.replayFocus:undefined;
    const transportFocused=[first,previous,next,last].some(button=>button===active);
    const board=preview?(preview.mode==='target'?preview.view.board:preview.study.preview!.board):game.board;
    const result=preview?(preview.mode==='target'?outcome({...game,board,phase:'playing'}):preview.study.preview!.result):outcome(game);
    const move=preview?.study.action,card=preview?.study.cardId?byId.get(preview.study.cardId):null;
    const pawn=new Set(move?.type==='play'&&card&&preview?.mode==='target'?previewInfluence(card,move.row,move.col,move.player).map(p=>p.join('-')):[]);
    const effect=new Set(move?.type==='play'&&card&&preview?.mode==='target'?previewEffects(card,move.row,move.col,move.player).map(p=>p.join('-')):[]);
    $('replayStep').textContent=`${step} / ${timeline.length}`;
    progress.max=Math.max(1,timeline.length);
    progress.value=step;
    progress.setAttribute('aria-valuetext',`${step} / ${timeline.length}`);
    $('replayTurn').textContent=game.phase==='finished'?t("finalPosition"):game.phase==='mulligan'?t("mulligan"):t("replayPlayerTurn", game.turn+1);
    $('replayScore0').textContent=String(result.scores[0]);$('replayScore1').textContent=String(result.scores[1]);
    $('replayPlayerCount').textContent=t("handAndDeckCounts", game.hands[0].length, game.decks[0].length);
    $('replayEnemyCount').textContent=t("handAndDeckCounts", game.hands[1].length, game.decks[1].length);
    $('replayAction').textContent=!command?(timeline.replay.version===2?t("replayBeginsFromAFixedPositionOnlyRecorded"):t("startingPositionBeforeTheFirstMove")):command.type==='pass'?t("replayPass", command.player+1):command.type==='mulligan'?t("replayMulligan", command.player+1, command.indices.length):replayEventLabel(events.find(e=>e.type==='CardPlayed')!);
    $('replayHint').textContent=game.phase==='finished'?t("replayFinalScore", result.scores[0], result.scores[1]):t("replayShowsPlayer1sHandAndTheCount");
    if(preview){
      $('replayTurn').textContent=preview.mode==='target'?t("beforeTheMoveAbilityRange"):t("analysisSimulation");
      $('replayAction').textContent=analysisActionText(preview.study.action,preview.study.cardId);
      $('replayHint').textContent=preview.mode==='target'?t("yellowMarksTerritoryRedMarksAbilityRangeReturn"):t("oneMoveSimulatedReturnToHistoryToView");
      $('replayPlayerCount').textContent=$('replayEnemyCount').textContent=t("analysisPreviewHiddenCardsConcealed");
    }
    const rules=replayRulesVersion(timeline.replay.rulesVersion);
    $('replayTurn').title=rules;
    if(rules===LEGACY_RULES_VERSION)$('replayHint').prepend(`${rulesLabel(rules)} · `);
    $('replayExit').textContent=preview?t("backToHistory"):t("exitReplay");
    const analyzeButton=$<HTMLButtonElement>('replayAnalyze');
    try{historicalDecision(timeline,step);analyzeButton.disabled=false;analyzeButton.title=t("analyzeUsingTheActivePlayersInformationAtThat");}catch(error){analyzeButton.disabled=true;analyzeButton.title=localizeAnalysisError(error);}
    for(const side of [0,1] as const)$('replayScores'+side).replaceChildren(...result.rows.map((row,r)=>{const node=element('div','lane-score'+(row[side]>row[1-side]?' winning':''),String(row[side]));node.setAttribute('aria-label',t("replayLanePower", r+1, side+1, row[side]));return node;}));
    boardView.replaceChildren(...board.flatMap((row,r)=>row.map((tile,c)=>{
      const key=`${r}-${c}`,target=preview?.mode==='target'&&move?.type==='play'&&move.row===r&&move.col===c;
      const node=button('',()=>{if(tile.card)hooks.showCard(tile.card.id);},'tile '+(tile.card?`occupied owner-${tile.card.owner}`:tile.owner===null?'':`pawn-${tile.owner}`)+(target?' pending':'')+(pawn.has(key)?' preview-pawn':'')+(effect.has(key)?' preview-effect':''));
      node.disabled=!tile.card;node.dataset.cell=`${r}-${c}`;
      node.dataset.replayFocus=`cell-${key}`;
      node.setAttribute('aria-label',t("replayTileLabel", r+1, c+1, tile.card?t("replayTileCard", displayName(tile.card.id,byId.get(tile.card.id)!.name), tile.card.power):tile.owner===null?t("empty2"):t("replayPawnCount", tile.owner+1, tile.pawns)));
      node.append(tile.card?placedCardView(tile.card,hooks.visual(tile.card.id)):boardPawns(tile.owner,tile.pawns));return node;
    })));
    handView.replaceChildren(...(preview?[element('p','analysis-caution',t("analysisPreviewShowsOnlyVisibleCards"))]:game.hands[0].map((id,index)=>{
      const node=button('',()=>hooks.showCard(id),'hand-card');
      node.dataset.replayFocus=`hand-${index}`;
      node.setAttribute('aria-label',t("viewCard", displayName(id,byId.get(id)!.name)));
      node.append(createCardView(byId.get(id)!,hooks.visual(id),{variant:'hand'}));
      return node;
    })));
    first.disabled=previous.disabled=step===0;
    last.disabled=next.disabled=step===timeline.length;
    const stepFocus=!next.disabled?next:!previous.disabled?previous:$('replayExit');
    if(cardFocus){
      const selector=`[data-replay-focus="${CSS.escape(cardFocus)}"]:not(:disabled)`;
      (boardView.querySelector<HTMLElement>(selector)??handView.querySelector<HTMLElement>(selector)??stepFocus).focus();
    }else if(transportFocused&&active instanceof HTMLButtonElement&&active.disabled)stepFocus.focus();
    $('replayEvents').textContent=t("replayEventCount", events.length);
    $<HTMLButtonElement>('replayScoreDetails').disabled=game.phase!=='finished';
  }
  const cancel=()=>{analysis.cancel();preview=null;};
  const go=(index:number)=>{cancel();step=index;render();};
  first.onclick=()=>go(0);previous.onclick=()=>go(Math.max(0,step-1));next.onclick=()=>go(Math.min(timeline!.length,step+1));last.onclick=()=>go(timeline!.length);
  $('replayExit').onclick=()=>{if(preview){preview=null;render();}else{cancel();hooks.exit();}};
  $('replayAnalyze').onclick=()=>{if(timeline)try{analysis.open(historicalDecision(timeline,step));}catch(error){openDialog(t("analysisUnavailable"),element('p','',localizeAnalysisError(error)));}};
  $('replayEvents').onclick=()=>{
    if(!current)return;
    const list=element('ol','replay-event-log');
    for(const event of current.events)list.append(element('li','',replayEventLabel(event)));
    const body=element('div','replay-event-details');
    body.append(element('p','frame-card-number',$('replayStep').textContent??''),
      current.events.length?list:element('p','muted',t("noAdditionalEventsInThisStep")));
    openDialog(t("replayEvents"),body);
  };
  $('replayScoreDetails').onclick=()=>{if(current?.game.phase==='finished'){const content=element('div','match-result');content.innerHTML=resultMarkup(current.game);openDialog(t("replayFinalScoring"),content);}};
  $('replayExport').onclick=()=>{if(timeline)downloadJson(timeline.replay,`queens-blood-replay-${timeline.replay.seed}.json`);};
  return {open:(replay:Replay)=>{timeline=new ReplayTimeline(replay);go(0);},refresh:render,cancel:()=>{menu.open=false;cancel();}};
}
