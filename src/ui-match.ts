import {getLocale,t} from './i18n/index.js';
import {displayName} from './i18n/card-names.js';
import {findBossChallenger} from './boss-challengers.js';
import {byId,type Card} from './cards.js';
import {getChallengerBanter} from './challenger-banter.js';
import {findChallenger} from './challengers.js';
import {difficultyName, opponentName} from './i18n/game-labels.js';
import {mulligan,legalMoves,play,pass,previewInfluence,previewEffects,exportReplay,replayRulesVersion,LEGACY_RULES_VERSION,type Game,type Move,type RuleEvent,type PlacedCard} from './engine.js';
import {simulateMovePreview} from './move-preview.js';
import {botOptionsForMatch,observeGame} from './bot.js';
import {BotClient} from './bot-client.js';
import {startMatch,resultMarkup,rulesLabel,type MatchSettings} from './match-flow.js';
import {createCardView} from './card-view.js';
import type {CardVisual} from './visuals.js';
import {$,element,button,openDialog,closeDialog,downloadJson,restoreFocus} from './ui-dom.js';
import {boardPawns,observeTable,placedCardView,tileBonusAriaSuffix,tileBonusBadge} from './ui-board.js';
import {mountBackgroundPicker} from './ui-background.js';
import {saveMatch,type SavedMatch,type restoreMatch} from './match-archive.js';
import {MatchPresentation,publicMatch,presentationEventLabel} from './match-presentation.js';
import {batchLegendaryVfx,effectText} from './match-effects.js';
import {mountHandFocus} from './ui-hand-focus.js';
import {applyMovePreviewOverlay,createResultBanterBlock,isBanterEnabled,mountClassicBanter,mountMatchFeedback} from './ui-match-feedback.js';
import {mountMatchInput} from './input/match-input.js';
import {gridStep,legalTarget} from './input/match-cursor.js';
import type {MatchControl} from './input/input-manager.js';
import type {AudioController,MatchAudioSession} from './audio-controller.js';
import type {SfxCue} from './sfx.js';
import '../site/match-presentation.css';

export function boardNextCell(index:number,key:string):number {
  if(key==='ArrowLeft')return gridStep(index,'left');
  if(key==='ArrowRight')return gridStep(index,'right');
  if(key==='ArrowUp')return gridStep(index,'up');
  if(key==='ArrowDown')return gridStep(index,'down');
  return index;
}
export function confirmable(game:Game,move:Move|null,busy=false):boolean {
  return !busy&&!!move&&legalMoves(game,0).some(m=>m.handIndex===move.handIndex&&m.row===move.row&&m.col===move.col);
}
export function publicEventLabel(event:RuleEvent):string {
  if(event.player===1&&event.type==='CardAddedToHand')return event.reason==='draw'?t("theComputerDrewOneCard"):t("theComputerGeneratedOneCardInHand");
  return effectText(event)||presentationEventLabel(event);
}
function placementFeedback(card:Card,target:Move|null):string {
  const name=displayName(card.id,card.name);
  return target?t("pendingPlacement",name,target.row+1,target.col+1):t("selectedCardHint",name);
}
interface MatchHooks {
  visual:(id:number)=>CardVisual;showCard:(id:number)=>void;menu:()=>void;
  hasCheckpoint:()=>boolean;checkpoint:(save:SavedMatch)=>string|null;completed:(save:SavedMatch)=>string|null;
  audio?:{controller:AudioController;visible:()=>boolean};
}
export function mountMatch(hooks:MatchHooks){
  let renderedLocale=getLocale();
  const localizeBackground=mountBackgroundPicker($('board').closest<HTMLElement>('.battle-window')!,$<HTMLSelectElement>('battleBackground'));
  // A cursor may point anywhere. A commit must still originate in legalMoves.
  let game:Game|null=null,selected:number|null=null,focusedCard:number|null=null,target:number|null=null,lastBoard:number|null=null;
  const selectedMulligan=new Set<number>(),botClient=new BotClient();
  let lastMessage='',deckName='',activeSettings:MatchSettings;
  let matchId='',saveIssue='';
  const audio=hooks.audio;
  let audioSession:MatchAudioSession|undefined;
  let lastSfxEffect:unknown=null;
  let vfxTimer:ReturnType<typeof setTimeout>|null=null;
  const playSfx=(cue:SfxCue,options?:{skipIfVictoryTrack?:boolean})=>{
    try{audio?.controller.playSfx?.(cue,options);}catch{/* Audio is optional. */}
  };
  function triggerLegendaryVfx(kind:'mako'|'abyss'|'chain',row?:number,col?:number){
    const reduced=document.documentElement?.dataset?.reduceMotion==='true'
      ||Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
    if(reduced)return;
    if(vfxTimer!==null)clearTimeout(vfxTimer);
    table.dataset.vfx=kind;
    const boardEl=$('board');
    boardEl.querySelectorAll('.vfx-legendary-burst').forEach(node=>node.classList.remove('vfx-legendary-burst'));
    if(row!==undefined&&col!==undefined){
      const tile=boardEl.querySelector<HTMLElement>(`[data-cell="${row}-${col}"]`);
      if(tile){tile.dataset.vfxKind=kind;tile.classList.add('vfx-legendary-burst');}
    }
    vfxTimer=setTimeout(()=>{
      vfxTimer=null;
      delete table.dataset.vfx;
      boardEl.querySelectorAll('.vfx-legendary-burst').forEach(node=>node.classList.remove('vfx-legendary-burst'));
    },280);
  }
  let inspected:number|null=null;
  const chosen=()=>selected!==null?byId.get(presentation.frame?.hand[selected]??game?.hands[0][selected]??-1):undefined;
  const table=$('board').parentElement!,peek=element('aside','board-peek');peek.hidden=true;peek.id='boardPeek';peek.setAttribute('role','tooltip');table.parentElement!.append(peek);
  const handFocus=mountHandFocus(document.querySelector<HTMLElement>('#view-game .hand-area')!,hooks.showCard);
  const effects=mountMatchFeedback(table,$('board'));
  const banter=mountClassicBanter(table);
  const playerSideEl=$('score0').parentElement;
  const rivalSideEl=$('score1').parentElement;
  const aimLayer=element('div','match-aim-layer'),ghost=element('div','match-player-preview');
  aimLayer.setAttribute('aria-hidden','true');aimLayer.append(ghost);table.append(aimLayer);ghost.hidden=true;
  let ghostCard:Card|undefined,ghostLocale=getLocale();
  let boardSignature='',handSignature='';
  const warning=element('p','match-storage-warning');warning.hidden=true;warning.setAttribute('role','alert');table.parentElement!.append(warning);
  const currentSave=()=>saveMatch(game!,activeSettings,deckName,matchId);
  function defaultBackground(opponentId?:string){
    const bg=findBossChallenger(opponentId)?.battleBackgroundId??'hybrid';
    table.parentElement!.dataset.background=bg;
    $<HTMLSelectElement>('battleBackground').value=bg;
  }
  function resumeAudio(){
    if(!game||!audio?.visible())return;
    try{audioSession=audio.controller.startOrResumeMatch(matchId,game.phase);}catch{/* Audio is optional. */}
  }
  function pauseAudio(immediate=false){
    const session=audioSession;
    audioSession=undefined;
    if(!audio||(!session&&!immediate))return;
    try{audio.controller.pauseOrExitMatch(session,immediate);}catch{/* Audio is optional. */}
  }
  const presentation=new MatchPresentation({
    game:()=>game,
    choose:()=>{const view=observeGame(game!,1);return botClient.choose(view,botOptionsForMatch(view,activeSettings));},
    cancelBot:()=>botClient.cancel(),checkpoint:()=>hooks.checkpoint(currentSave()),completed:()=>hooks.completed(currentSave()),
    changed:()=>{
      const eff=presentation.effect;
      if(eff&&eff!==lastSfxEffect){
        lastSfxEffect=eff;
        if(eff.stage==='commit'&&eff.actor===1&&eff.action==='play')playSfx('cardPlace');
        else if(eff.stage==='events'&&eff.events.length){
          audio?.controller.playSfxForEvents?.(eff.events);
          const vfx=batchLegendaryVfx(eff.events,eff.placement);
          if(vfx)triggerLegendaryVfx(vfx.kind,vfx.row,vfx.col);
        }
        else if(eff.stage==='scoring'&&eff.scoring&&!eff.scoring.totals)playSfx('scoreTick');
      }else if(!eff){
        lastSfxEffect=null;
      }
      lastMessage=presentation.message;render();
    },result:showResult,
    paused:()=>pauseAudio(),
    matchEnded:(sequence,winner)=>{if(audioSession&&audio?.visible())audio.controller.enterScoring(audioSession,sequence,winner);},
    totalsRevealed:sequence=>{
      if(audioSession&&audio?.visible())audio.controller.revealResult(audioSession,sequence);
      if(game&&publicMatch(game).result.winner===0)playSfx('fanfareLite',{skipIfVictoryTrack:true});
    },
    diagnostic:diagnostic=>{if(import.meta.env.DEV)console.info('[QB Bot]',diagnostic);},
  },()=>document.documentElement.dataset.reduceMotion==='true'||window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const skip=button(t("skipAnimation"),()=>input.dispatch({type:'control',control:'presentationSkip'}));skip.id='presentationSkip';skip.hidden=true;
  document.querySelector('.battle-actions')!.append(skip);
  const speed=element('label','presentation-tools'),fast=element('input');fast.type='checkbox';fast.id='presentationFast';
  fast.onchange=()=>presentation.setFast(fast.checked);const fastText=document.createTextNode('');speed.append(fast,fastText);
  document.querySelector('.action-more>div')!.append(speed);
  observeTable(table);
  function revealHandCard(node:HTMLElement){
    const strip=$('hand'),area=strip.getBoundingClientRect(),card=node.getBoundingClientRect();
    if(card.left<area.left)strip.scrollLeft-=area.left-card.left+4;
    else if(card.right>area.right)strip.scrollLeft+=card.right-area.right+4;
  }
  new ResizeObserver(()=>{if(focusedCard!==null){const node=$('hand').querySelector<HTMLElement>(`[data-focus="hand-${focusedCard}"]`);if(node)revealHandCard(node);}}).observe($('hand'));
  function updateHandFocus(){
    const hand=presentation.frame?.hand??game?.hands[0]??[],index=focusedCard??selected;
    const browsing=index===null?undefined:byId.get(hand[index]),card=chosen();
    handFocus.update(browsing,card,!presentation.canPlay&&!presentation.canMulligan);
    $('hand').querySelectorAll<HTMLElement>('.hand-card').forEach((node,i)=>{
      node.classList.toggle('browsing',i===focusedCard);
      node.tabIndex=i===(focusedCard??0)?0:-1;
    });
    if(inspected===null)updateDetailsCommand(browsing??card);
  }
  function updateDetailsCommand(card:Card|undefined){
    const details=$<HTMLButtonElement>('cardDetails');
    details.disabled=!card;
    details.title=card?t("cardInfo",displayName(card.id,card.name)):'';
  }
  function browseHand(index:number){
    if(!presentation.canPlay&&!presentation.canMulligan)return;
    const size=(presentation.frame?.hand??game?.hands[0]??[]).length;
    if(!size)return;
    const next=Math.max(0,Math.min(size-1,index));
    if(focusedCard===next&&inspected===null)return;
    focusedCard=next;inspected=null;peek.hidden=true;playSfx('cursor');updateHandFocus();
  }
  function inspect(placed:PlacedCard|null){
    inspected=placed?.id??null;const card=placed?byId.get(placed.id)!:focusedCard===null?chosen():byId.get((presentation.frame?.hand??game?.hands[0]??[])[focusedCard]);
    updateDetailsCommand(card);
    peek.hidden=!placed;
    if(placed){peek.replaceChildren(element('p','peek-power',t("currentAndBasePower", placed.power, byId.get(placed.id)!.power)),createCardView(byId.get(placed.id)!,hooks.visual(placed.id)));}
  }
  function preview(card:Card|undefined,index:number|null,valid:boolean){
    const r=index===null?undefined:Math.floor(index/5),c=index===null?undefined:index%5;
    const pawn=new Set(card&&r!==undefined&&c!==undefined?previewInfluence(card,r,c,0).map(p=>p.join('-')):[]);
    const effect=new Set(card&&r!==undefined&&c!==undefined?previewEffects(card,r,c,0).map(p=>p.join('-')):[]);
    $('board').querySelectorAll<HTMLElement>('.tile').forEach(node=>{node.classList.toggle('preview-pawn',pawn.has(node.dataset.cell!));node.classList.toggle('preview-effect',effect.has(node.dataset.cell!));});
    const movePreview=card&&valid&&game&&presentation.canPlay&&selected!==null&&r!==undefined&&c!==undefined
      ?simulateMovePreview(game,0,selected,r,c):null;
    applyMovePreviewOverlay({
      board:$('board'),
      leftScores:$('leftScores'),
      rightScores:$('rightScores'),
      playerSide:playerSideEl,
      rivalSide:rivalSideEl,
      preview:movePreview,
    });
    ghost.hidden=!card||index===null;
    if(!card||index===null){ghost.replaceChildren();ghostCard=undefined;return;}
    if(card!==ghostCard||ghostLocale!==getLocale()){
      ghost.replaceChildren(createCardView(card,hooks.visual(card.id),{variant:'board'}));
      ghostCard=card;ghostLocale=getLocale();
    }
    ghost.style.setProperty('--effect-row',String(r));ghost.style.setProperty('--effect-col',String(c));
    ghost.toggleAttribute('data-invalid',!valid);
  }
  const legalForHand=()=>game&&presentation.canPlay?legalMoves(game,0).filter(move=>move.handIndex===selected):[];
  function peekCell(index:number){
    const view=presentation.frame;
    inspect(view?.board[Math.floor(index/5)]?.[index%5]?.card??null);
  }
  function aim(index:number){
    if(!presentation.canPlay||index<0||index>=15)return;
    if(target===index){
      if(selected===null&&inspected===null)peekCell(index);
      return;
    }
    target=index;lastBoard=index;playSfx('cursor');
    if(selected!==null) presentation.preview(true);
    else render();
  }
  function selectHand(index:number){
    browseHand(index);
    if(!game)return;
    if(presentation.canMulligan){
      if(selectedMulligan.has(index))selectedMulligan.delete(index);else selectedMulligan.add(index);
      playSfx('cardLift');
      lastMessage=t("mulliganSelectionUpdated");render();
    }else if(presentation.canPlay&&game.hands[0][index]!==undefined){
      selected=index;target=null;playSfx('cardLift');
    }
  }
  function tileCard(placed:PlacedCard){
    return placedCardView(placed,hooks.visual(placed.id));
  }
  function showResult(){
    if(!game||game.phase!=='finished')return;
    const content=element('div','match-result frame-end-sheet');
    const winner=(presentation.frame??publicMatch(game)).result.winner;
    content.dataset.outcome=winner===null?'draw':winner===0?'win':'loss';
    content.innerHTML=resultMarkup(game);
    const oppId=activeSettings.opponent?.npcId;
    if(oppId&&winner!==null&&isBanterEnabled()){
      const postBanter=getChallengerBanter(oppId,getLocale());
      if(postBanter){
        const oppLabel=opponentName(oppId,(findChallenger(oppId)??findBossChallenger(oppId))?.name);
        content.append(createResultBanterBlock(oppLabel,winner===0?postBanter.playerWin:postBanter.playerLoss));
      }
    }
    const failure=element('p','warning');failure.setAttribute('role','alert');
    const actions=element('div','frame-result-actions');
    const rematch=button(t("rematchSameSettings"),()=>{
      const error=start(activeSettings,deckName);
      if(error){failure.textContent=error;return;}
      closeDialog();
    },'primary');
    actions.append(rematch,button(t("backToMenu"),()=>{closeDialog();hooks.menu();}),button(t("exportReplay"),exportCurrent));
    content.append(actions,failure);
    openDialog(t("matchResult"),content,{initial:rematch,returnTo:$('resultsBtn')});
  }
  function humanAction(action:()=>void){
    if(!presentation.canPlay)return;
    if(presentation.commitPlayer(action)){selected=null;focusedCard=null;target=null;inspect(null);render();}
  }
  function render(forceBoard=false){
    if(!game)return;
    inspected=null;peek.hidden=true;
    const focused=(document.activeElement as HTMLElement)?.dataset.focus,scroll=$('hand').scrollLeft;
    const view=presentation.frame??publicMatch(game),locked=!presentation.canPlay;
    if(!presentation.canPlay&&!presentation.canMulligan){selected=null;target=null;}
    if(focusedCard!==null&&focusedCard>=view.hand.length)focusedCard=null;
    const {rows,scores}=view.result,card=chosen(),legal=presentation.canPlay?legalMoves(game,0):[];
    const stage=table.parentElement!;
    stage.dataset.presentationPhase=presentation.phase;
    stage.dataset.turn=String(presentation.effect?.actor??view.turn);
    const scoring=presentation.effect?.scoring;
    const visibleScores=scoring&&!scoring.totals
      ?scoring.result.awards.slice(0,scoring.revealed).reduce<[number,number]>(([a,b],[x,y])=>[a+x,b+y],[0,0])
      :scores;
    skip.textContent=t('skipAnimation');fastText.textContent=t('fastAnimationsThisSession');
    const locale=getLocale();
    if(renderedLocale!==locale){
      localizeBackground();
      lastMessage='';
      renderedLocale=locale;
    }
    skip.hidden=!presentation.busy;skip.disabled=!presentation.skippable;
    const labels:Record<string,string>={Suspended:t("paused"),Mulligan:t("mulligan"),PlayerSelect:t("yourTurn"),Preview:t("placementPreview"),PlayerCommit:t("confirmPlay"),PlayerResolve:t("resolvingYourMove"),OpponentTurn:t("computersTurn"),OpponentCommit:t("computerIsPlaying"),OpponentResolve:t("resolvingComputersMove"),MatchEnd:t("finalScoring"),Result:t("matchOver")};
    const legalSelected=legal.filter(move=>move.handIndex===selected),pending=legalTarget(legalSelected,target);
    const moves=new Set(legalSelected.map(m=>`${m.row}-${m.col}`));
    $('score0').textContent=String(visibleScores[0]);$('score1').textContent=String(visibleScores[1]);
    $('who').textContent=labels[presentation.phase];
    const rules=replayRulesVersion(game.rulesVersion);
    $('who').title=rules;
    $('playerCount').textContent=t("handAndDeckCounts", view.hand.length, view.deckCounts[0]);
    $('enemyName').textContent=activeSettings.opponent
      ? opponentName(activeSettings.opponent.npcId,(findChallenger(activeSettings.opponent.npcId)??findBossChallenger(activeSettings.opponent.npcId))?.name)
      : t('computer');
    $('enemyCount').textContent=t("opponentCounts", difficultyName(activeSettings.difficulty), view.enemyHandCount, view.deckCounts[1]);
    $('leftScores').replaceChildren(...rows.map(([a,b],r)=>{const node=element('div','lane-score'+(a>b?' winning':''),String(a));node.setAttribute('aria-label',t("playerLanePower", r+1, a));return node;}));
    $('rightScores').replaceChildren(...rows.map(([a,b],r)=>{const node=element('div','lane-score'+(b>a?' winning':''),String(b));node.setAttribute('aria-label',t("computerLanePower", r+1, b));return node;}));
    const board=$('board'),signature=JSON.stringify([view.board,locked,selected,target,getLocale()]);
    if(forceBoard||signature!==boardSignature){
    boardSignature=signature;board.replaceChildren();
    for(let r=0;r<3;r++)for(let c=0;c<5;c++){
      const tile=view.board[r][c],key=`${r}-${c}`,available=!!card&&moves.has(key),index=r*5+c;
      const targeted=!locked&&target===index,isPending=targeted&&available;
      const node=button('',()=>input.dispatch({type:'cell',index,hover:false}),
        'tile '+(tile.card?`occupied owner-${tile.card.owner}`:tile.owner!==null?`pawn-${tile.owner}`:'')+(available?' legal':'')+(isPending?' pending':'')+
        (targeted&&card&&!available?' blocked-target':'')+(tile.tileBonus?' has-tile-bonus':''));
      node.classList.toggle('replacement-target',available&&card?.placement==='replace');
      node.dataset.cell=key;node.dataset.focus=`cell-${index}`;node.tabIndex=index===(target??lastBoard??0)?0:-1;
      if(tile.tileBonus)node.dataset.tileBonus=String(tile.tileBonus);
      node.disabled=locked;
      node.setAttribute('aria-label',t("matchTileLabel", r+1, c+1, tile.card?displayName(tile.card.id,byId.get(tile.card.id)!.name)+ " · "+t("currentPower",tile.card.power):tile.owner===null?t("empty2"):t("replayPawnCount", tile.owner+1, tile.pawns), available?t("legalPlacementSuffix"):'', isPending?t("pendingPlacementSuffix"):targeted&&card?' · '+t('inputPlacementBlocked'):'')+tileBonusAriaSuffix(tile.tileBonus));
      if(tile.card){
        node.append(tileCard(tile.card));
        const batch=presentation.batch;
        if(!forceBoard&&batch&&view===batch.after&&presentation.effect?.motion&&batch.before.board[r][c].card?.instanceId!==tile.card.instanceId)node.classList.add('match-card-arrival');
      }else node.append(boardPawns(tile.owner,tile.pawns));
      const bonusBadge=tileBonusBadge(tile.tileBonus);
      if(bonusBadge)node.append(bonusBadge);
      const range=element('span','range-overlay');range.setAttribute('aria-hidden','true');node.append(range);
      if(tile.card)node.setAttribute('aria-describedby','boardPeek');
      board.append(node);
    }
    }
    const hand=$('hand'),nextHandSignature=JSON.stringify([view.hand,selected,[...selectedMulligan],presentation.canPlay,presentation.canMulligan,view.mulliganDone,locale]);
    if(forceBoard||handSignature!==nextHandSignature){
    handSignature=nextHandSignature;hand.replaceChildren();
    for(const [i,id] of view.hand.entries()){
      const card=byId.get(id)!,picked=game.phase==='mulligan'?selectedMulligan.has(i):selected===i;
      const node=button('',()=>input.dispatch({type:'hand',index:i,hover:false}),'hand-card'+(picked?' selected':''));
      node.dataset.focus=`hand-${i}`;node.setAttribute('aria-pressed',String(picked));
      const face=createCardView(card,hooks.visual(id),{variant:'hand'});node.append(face);
      node.setAttribute('aria-label',face.getAttribute('aria-label')!);
      if(picked&&game.phase!=='mulligan')node.append(element('span','selection-tag',t("selected")));
      node.setAttribute('aria-controls','handFocus');
      if(picked&&game.phase==='mulligan')node.append(element('span','check',t("swap")));
      node.disabled=!(presentation.canPlay||presentation.canMulligan&&!view.mulliganDone);
      hand.append(node);
    }
    }
    effects.update(presentation.effect);
    const rivalFlight=table.querySelector<HTMLElement>('.match-rival-flight:not(:has(.qb-card))');
    const revealed=byId.get(presentation.effect?.placement?.cardId??-1);
    if(rivalFlight&&revealed)rivalFlight.append(createCardView(revealed,hooks.visual(revealed.id),{variant:'board'}));
    hand.scrollLeft=scroll;
    if(input.modality!=='pointer')restoreFocus(focused);
    preview(card,target,!!pending);updateHandFocus();
    if(!card&&target!==null)peekCell(target);
    const opening=presentation.phase==='Mulligan';
    $('confirmMulligan').hidden=!opening;$('confirmPlay').hidden=!pending;
    $<HTMLButtonElement>('confirmMulligan').disabled=!presentation.canMulligan;
    $('confirmMulligan').textContent=t("confirmMulliganCount", selectedMulligan.size);
    $<HTMLButtonElement>('confirmPlay').disabled=!confirmable(game,pending,locked);
    $<HTMLButtonElement>('passBtn').disabled=!presentation.canPlay;
    $<HTMLButtonElement>('matchRestart').disabled=!presentation.canPlay&&!presentation.canMulligan;
    $('resultsBtn').hidden=presentation.phase!=='Result';
    $('handHelp').textContent=opening?t("selectCardsToReplaceThenConfirm"):presentation.busy?t("resolvingTheMove2"):card?t("legalPlacementCount", displayName(card.id,card.name), moves.size):t("selectCardSelectTileConfirm");
    const status=presentation.busy?t("presentationLocked", labels[presentation.phase]):opening?t("mulliganHint"):presentation.phase==='Result'?t("passEnding"):!legal.length?t("noLegalPlaysYouCanPass"):pending?t("pendingPatternHint"):view.passes?t("theComputerPassedPassingEndsTheMatch"):t("legalPlacementHint");
    $('status').textContent=rules===LEGACY_RULES_VERSION?`${rulesLabel(rules)} · ${status}`:status;
    const feedback=card&&target!==null?(pending?placementFeedback(card,pending):t('inputPlacementBlocked')):lastMessage;
    $('feedback').textContent=feedback;$('feedback').title=feedback;
    warning.textContent=presentation.issue||saveIssue;warning.hidden=!warning.textContent;
  }
  function pause(){banter.hide();presentation.pause();target=null;selected=null;focusedCard=null;inspect(null);}
  function start(settings:MatchSettings,name:string):string|null {
    const next=startMatch(settings),id=crypto.randomUUID();
    // A successful write replaces the old slot in one step. On failure the
    // active match is still bound to its original settings, ID and checkpoint.
    const save=saveMatch(next,settings,name,id);
    const error=hooks.checkpoint(save);
    if(error&&hooks.hasCheckpoint())return t("newMatchSaveFailed");
    const boss=findBossChallenger(settings.opponent?.npcId);
    pause();activeSettings=save.settings;deckName=name;game=next;presentation.reset();
    matchId=id;saveIssue=error??'';defaultBackground(settings.opponent?.npcId);selected=null;focusedCard=0;target=null;lastBoard=null;selectedMulligan.clear();
    lastMessage=boss?`${t("bossBattleBanner")} · ${opponentName(boss.id,boss.name)} · ${t("newGameStartingPlayer", name)}`:t("newGameStartingPlayer", name);
    resumeAudio();presentation.resume();render();
    const oppId=settings.opponent?.npcId;
    const introBanter=oppId?getChallengerBanter(oppId,getLocale()):null;
    if(oppId&&introBanter){
      const oppLabel=opponentName(oppId,(findChallenger(oppId)??boss)?.name);
      banter.show(oppLabel,introBanter.intro);
    }else{
      banter.hide();
    }
    $('hand').querySelectorAll<HTMLElement>('.hand-card').forEach((node,index)=>{
      node.style.setProperty('--deal-index',String(index));
      node.classList.add('frame-initial-deal');
    });
    return null;
  }
  function restore(restored:ReturnType<typeof restoreMatch>){
    pause();game=structuredClone(restored.game);activeSettings=structuredClone(restored.save.settings);deckName=restored.save.deckName;matchId=restored.save.id;
    presentation.reset();selected=null;focusedCard=0;target=null;lastBoard=null;selectedMulligan.clear();saveIssue='';defaultBackground(restored.save.settings.opponent?.npcId);lastMessage=t("localMatchRestored");
  }
  function exportCurrent(){if(game)downloadJson(exportReplay(game),`queens-blood-${game.replay.seed}.json`);}
  function confirmMulligan(){
    if(!game||!presentation.canMulligan)return;
    if(presentation.commitPlayer(()=>{if(!game!.mulliganDone[0])mulligan(game!,0,[...selectedMulligan].sort((a,b)=>a-b));if(!game!.mulliganDone[1])mulligan(game!,1,[]);},true)){
      playSfx('confirm');
      selectedMulligan.clear();selected=null;focusedCard=null;target=null;render();
    }
  }
  function confirmPlay(){
    if(!game||!presentation.canPlay)return;
    const move=legalTarget(legalForHand(),target);
    if(move){playSfx('cardPlace');humanAction(()=>play(game!,0,move.handIndex,move.row,move.col));}
  }
  function confirmPass(){
    if(game&&presentation.canPlay){playSfx('confirm');humanAction(()=>pass(game!,0));}
  }
  let passConfirmation:HTMLButtonElement|null=null;
  function requestPass(){
    if(!game||!presentation.canPlay)return;
    passConfirmation=button(t("confirmPass"),()=>input.dispatch({type:'control',control:'confirmPass'}),'danger');
    const content=element('div');
    content.append(element('p','',game.passes?t("confirmPassToEnd"):t("confirmPassPrompt")),button(t("cancel"),closeDialog),passConfirmation);
    openDialog(t("passTurn"),content);
  }
  function details(){
    const boardCard=target===null?null:presentation.frame?.board[Math.floor(target/5)]?.[target%5]?.card?.id;
    const id=chosen()?.id??boardCard??inspected??(presentation.frame?.hand??game?.hands[0])?.[focusedCard??0];
    if(id!==undefined)hooks.showCard(id);
  }
  $('replayBtn').onclick=exportCurrent;
  $('matchRestart').onclick=()=>{
    const content=element('div'),failure=element('p','warning');
    failure.setAttribute('role','alert');
    content.append(button(t('cancel'),closeDialog),button(t('discardAndStart'),()=>{
      const error=start(activeSettings,deckName);
      if(error){failure.textContent=error;return;}
      $('matchContinue').click();
      closeDialog();
    },'danger'),failure);
    openDialog(t('restartSameSettings'),content);
  };
  $('battleLogBtn').onclick=()=>{if(!game)return;const content=element('div','event-log');content.append(element('p','muted',t("eventLogHelp")));for(const text of game.events.map(e=>{const text=publicEventLabel(e);return text?`[${e.seq}] ${text}`:'';}).filter(Boolean).slice(-60))content.append(element('p','',text));openDialog(t("matchEvents"),content);};
  function cancelTarget(){
    if(target===null&&selected===null)return;
    selected=null;target=null;playSfx('cancel');
    presentation.preview(false);
    lastMessage=t("pendingPlacementCancelled");render();
  }
  const actions:Record<MatchControl,()=>void>={
    confirmPlay,confirmMulligan,passBtn:requestPass,cardDetails:details,
    confirmPass:()=>{
      const dialog=$<HTMLDialogElement>('infoDialog');
      if(dialog.open){
        if(!dialog.contains(passConfirmation))return;
        closeDialog();
      }
      confirmPass();
    },
    presentationSkip:()=>presentation.skip(),
    resultsBtn:()=>{if(presentation.phase==='Result')showResult();},
  };
  for(const control of ['confirmPlay','confirmMulligan','passBtn','cardDetails','resultsBtn'] as const){
    $(control).onclick=()=>input.dispatch({type:'control',control});
  }
  const input=mountMatchInput({
    cursor:()=>({hand:focusedCard??selected??0,selected,board:target,last:lastBoard}),
    legal:()=>legalForHand().map(move=>move.row*5+move.col),
    browse:browseHand,select:selectHand,aim,peek:peekCell,cancel:cancelTarget,leave:hooks.menu,
    control:control=>actions[control](),
  });
  window.addEventListener('pagehide',()=>{pauseAudio(true);pause();});
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden){pauseAudio(true);presentation.skip();}
    else if(presentation.active)resumeAudio();
  });
  return {start,restore,pause,refresh:()=>{if(presentation.active)render(true);},hasMatch:()=>game!==null,rulesVersion:()=>game&&replayRulesVersion(game.rulesVersion),unfinished:()=>!!game&&game.phase!=='finished',restart:()=>start(activeSettings,deckName),resume:()=>{if(game){defaultBackground(activeSettings?.opponent?.npcId);resumeAudio();presentation.resume();render();}},exportCurrent};
}
