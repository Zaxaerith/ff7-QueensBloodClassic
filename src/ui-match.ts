import {byId} from './cards.js';
import {mulligan,legalMoves,play,pass,previewInfluence,previewEffects,exportReplay,replayRulesVersion,LEGACY_RULES_VERSION,type Game,type Move,type RuleEvent,type PlacedCard} from './engine.js';
import {observeGame} from './bot.js';
import {BotClient} from './bot-client.js';
import {startMatch,resultMarkup,rulesLabel,type MatchSettings} from './match-flow.js';
import {createCardView} from './card-view.js';
import type {CardVisual} from './visuals.js';
import {$,element,button,openDialog,closeDialog,downloadJson,restoreFocus} from './ui-dom.js';
import {observeTable,placedCardView} from './ui-board.js';
import {mountBackgroundPicker} from './ui-background.js';
import {saveMatch,type SavedMatch,type restoreMatch} from './match-archive.js';
import {MatchPresentation,publicMatch,presentationEventLabel} from './match-presentation.js';
import {effectText} from './match-effects.js';
import {mountHandFocus} from './ui-hand-focus.js';
import {mountMatchFeedback} from './ui-match-feedback.js';
import '../site/match-presentation.css';

export function boardNextCell(index:number,key:string):number {
  const row=Math.floor(index/5),col=index%5;
  if(key==='ArrowLeft')return row*5+Math.max(0,col-1);
  if(key==='ArrowRight')return row*5+Math.min(4,col+1);
  if(key==='ArrowUp')return Math.max(0,row-1)*5+col;
  if(key==='ArrowDown')return Math.min(2,row+1)*5+col;
  return index;
}
export function confirmable(game:Game,move:Move|null,busy=false):boolean {
  return !busy&&!!move&&legalMoves(game,0).some(m=>m.handIndex===move.handIndex&&m.row===move.row&&m.col===move.col);
}
export function publicEventLabel(event:RuleEvent):string {
  if(event.player===1&&event.type==='CardAddedToHand')return event.reason==='draw'?'电脑补牌 1 张':'电脑生成手牌 1 张';
  return effectText(event)||presentationEventLabel(event);
}
interface MatchHooks {visual:(id:number)=>CardVisual;showCard:(id:number)=>void;menu:()=>void;checkpoint:(save:SavedMatch)=>string|null;completed:(save:SavedMatch)=>string|null;}
export function mountMatch(hooks:MatchHooks){
  mountBackgroundPicker($('board').closest<HTMLElement>('.battle-window')!,$<HTMLSelectElement>('battleBackground'));
  // Hand indices are transient UI state: browse, arm, then choose a target.
  // Browsing alone never changes selected/pending or calls a rule operation.
  let game:Game|null=null,selected:number|null=null,focusedCard:number|null=null,pending:Move|null=null,focusCell=0;
  const selectedMulligan=new Set<number>(),botClient=new BotClient();
  let lastMessage='',deckName='',activeSettings:MatchSettings;
  let matchId='',saveIssue='';
  let inspected:number|null=null;
  const chosen=()=>selected!==null?byId.get(presentation.frame?.hand[selected]??game?.hands[0][selected]??-1):undefined;
  const table=$('board').parentElement!,peek=element('aside','board-peek');peek.hidden=true;peek.id='boardPeek';peek.setAttribute('role','tooltip');table.parentElement!.append(peek);
  const handFocus=mountHandFocus(document.querySelector<HTMLElement>('#view-game .hand-area')!,hooks.showCard);
  const effects=mountMatchFeedback(table,$('board'));
  let boardSignature='';
  const warning=element('p','match-storage-warning');warning.hidden=true;warning.setAttribute('role','alert');table.parentElement!.append(warning);
  const currentSave=()=>saveMatch(game!,activeSettings,deckName,matchId);
  function persist(){saveIssue=hooks.checkpoint(currentSave())??'';}
  function defaultBackground(){table.parentElement!.dataset.background='hybrid';$<HTMLSelectElement>('battleBackground').value='hybrid';}
  const presentation=new MatchPresentation({
    game:()=>game,
    choose:()=>botClient.choose(observeGame(game!,1),{difficulty:activeSettings.difficulty,seed:(activeSettings.seed^game!.replay.commands.length)>>>0}),
    cancelBot:()=>botClient.cancel(),checkpoint:()=>hooks.checkpoint(currentSave()),completed:()=>hooks.completed(currentSave()),
    changed:()=>{lastMessage=presentation.message;render();},result:showResult,
  },()=>document.documentElement.dataset.reduceMotion==='true'||window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const skip=button('跳过展示',()=>presentation.skip());skip.id='presentationSkip';skip.hidden=true;
  document.querySelector('.battle-actions')!.append(skip);
  const speed=element('label','presentation-tools'),fast=element('input');fast.type='checkbox';fast.id='presentationFast';
  fast.onchange=()=>presentation.setFast(fast.checked);speed.append(fast,document.createTextNode('快速展示（本次会话）'));
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
    const browsing=index===null?undefined:byId.get(hand[index]);
    handFocus.update(browsing,chosen(),!presentation.canPlay&&!presentation.canMulligan);
    $('hand').querySelectorAll<HTMLElement>('.hand-card').forEach((node,i)=>node.classList.toggle('browsing',i===focusedCard));
    if(inspected===null)$<HTMLButtonElement>('cardDetails').disabled=!browsing&&!chosen();
  }
  function browseHand(index:number,node:HTMLElement,scroll=false){
    if(!presentation.canPlay&&!presentation.canMulligan)return;
    focusedCard=index;inspected=null;peek.hidden=true;updateHandFocus();
    if(scroll)revealHandCard(node);
  }
  function inspect(placed:PlacedCard|null){
    inspected=placed?.id??null;const card=placed?byId.get(placed.id)!:focusedCard===null?chosen():byId.get((presentation.frame?.hand??game?.hands[0]??[])[focusedCard]);
    $<HTMLButtonElement>('cardDetails').disabled=!card;$('cardDetails').title=card?`查看 ${card.name} 的完整资料`:'';
    peek.hidden=!placed;
    if(placed){peek.replaceChildren(element('p','peek-power',`当前力量 ${placed.power} · 基础 ${byId.get(placed.id)!.power}`),createCardView(byId.get(placed.id)!,hooks.visual(placed.id)));}
  }
  function preview(row?:number,col?:number){
    const card=presentation.canPlay?chosen():undefined,r=row??pending?.row,c=col??pending?.col;
    const pawn=new Set(card&&r!==undefined&&c!==undefined?previewInfluence(card,r,c,0).map(p=>p.join('-')):[]);
    const effect=new Set(card&&r!==undefined&&c!==undefined?previewEffects(card,r,c,0).map(p=>p.join('-')):[]);
    $('board').querySelectorAll<HTMLElement>('.tile').forEach(node=>{node.classList.toggle('preview-pawn',pawn.has(node.dataset.cell!));node.classList.toggle('preview-effect',effect.has(node.dataset.cell!));});
  }
  function tileCard(placed:PlacedCard){
    return placedCardView(placed,hooks.visual(placed.id));
  }
  function showResult(){
    if(!game||game.phase!=='finished')return;
    const content=element('div','match-result');content.innerHTML=resultMarkup(game);
    content.append(button('再战 · 相同设置',()=>{closeDialog();start(activeSettings,deckName);}),button('导出回放',exportCurrent),button('返回菜单',()=>{closeDialog();hooks.menu();}));
    openDialog('RESULT / 对局结束',content);
  }
  function humanAction(action:()=>void){
    if(!presentation.canPlay)return;
    if(presentation.commitPlayer(action)){selected=null;focusedCard=null;pending=null;inspect(null);render();}
  }
  function render(forceBoard=false){
    if(!game)return;
    inspected=null;peek.hidden=true;
    const focused=(document.activeElement as HTMLElement)?.dataset.focus,scroll=$('hand').scrollLeft;
    const view=presentation.frame??publicMatch(game),locked=!presentation.canPlay;
    if(!presentation.canPlay&&!presentation.canMulligan){selected=null;pending=null;}
    if(focusedCard!==null&&focusedCard>=view.hand.length)focusedCard=null;
    const {rows,scores}=view.result,card=chosen(),legal=presentation.canPlay?legalMoves(game,0):[];
    table.parentElement!.dataset.presentationPhase=presentation.phase;
    skip.hidden=!presentation.busy;skip.disabled=!presentation.skippable;
    const labels:Record<string,string>={Suspended:'已暂停',Mulligan:'开局换牌',PlayerSelect:'你的回合',Preview:'预览落点',PlayerCommit:'确认出牌',PlayerResolve:'你的结算',OpponentTurn:'电脑回合',OpponentCommit:'电脑落牌',OpponentResolve:'电脑结算',MatchEnd:'终局结算',Result:'对局结束'};
    const moves=new Set(legal.filter(m=>m.handIndex===selected).map(m=>`${m.row}-${m.col}`));
    $('score0').textContent=String(scores[0]);$('score1').textContent=String(scores[1]);
    $('who').textContent=labels[presentation.phase];
    const rules=replayRulesVersion(game.rulesVersion);
    $('who').title=rules;
    $('playerCount').textContent=`手牌 ${view.hand.length} · 牌库 ${view.deckCounts[0]}`;
    $('enemyCount').textContent=`${activeSettings.difficulty.toUpperCase()} · 手牌 ${view.enemyHandCount} · 牌库 ${view.deckCounts[1]}`;
    $('leftScores').replaceChildren(...rows.map(([a,b],r)=>{const node=element('div','lane-score'+(a>b?' winning':''),String(a));node.setAttribute('aria-label',`第${r+1}行你的力量 ${a}`);return node;}));
    $('rightScores').replaceChildren(...rows.map(([a,b],r)=>{const node=element('div','lane-score'+(b>a?' winning':''),String(b));node.setAttribute('aria-label',`第${r+1}行电脑力量 ${b}`);return node;}));
    const board=$('board'),signature=JSON.stringify([view.board,locked,selected,pending]);
    if(forceBoard||signature!==boardSignature){
    boardSignature=signature;board.replaceChildren();
    for(let r=0;r<3;r++)for(let c=0;c<5;c++){
      const tile=view.board[r][c],key=`${r}-${c}`,available=!!card&&moves.has(key),index=r*5+c;
      const isPending=!locked&&pending?.row===r&&pending.col===c;
      const node=button('',()=>{
        if(!game)return;
        if(tile.card&&(!available||!presentation.canPlay)){hooks.showCard(tile.card.id);return;}
        if(!presentation.canPlay)return;
        if(available&&selected!==null){pending={handIndex:selected,row:r,col:c};presentation.preview(true);lastMessage=`待确认：${card!.name} → ${r+1}-${c+1}；尚未出牌`;render();}
        else if(!card&&tile.card)hooks.showCard(tile.card.id);
        else {lastMessage=card?'此位置不合法，请选择金框落点':'请先选择手牌';$('feedback').textContent=lastMessage;}
      },'tile '+(tile.card?`occupied owner-${tile.card.owner}`:tile.owner!==null?`pawn-${tile.owner}`:'')+(available?' legal':'')+(isPending?' pending':''));
      node.dataset.cell=key;node.dataset.focus=`cell-${index}`;node.tabIndex=index===focusCell?0:-1;
      node.disabled=!tile.card&&locked;
      node.setAttribute('aria-label',`第${r+1}行第${c+1}列 ${tile.card?byId.get(tile.card.id)!.name+' 力量'+tile.card.power:tile.owner===null?'空白':`玩家${tile.owner+1}棋子${tile.pawns}`}${available?'，合法落点':''}${isPending?'，待确认':''}`);
      if(tile.card){
        node.append(tileCard(tile.card));
        const batch=presentation.batch;
        if(!forceBoard&&batch&&view===batch.after&&presentation.effect?.motion&&batch.before.board[r][c].card?.instanceId!==tile.card.instanceId)node.classList.add('match-card-arrival');
      }else node.append(element('span','pawn',tile.owner===null?'·':'♟'.repeat(tile.pawns)));
      const range=element('span','range-overlay');range.setAttribute('aria-hidden','true');node.append(range);
      if(isPending)node.append(element('span','pending-label','待确认'));
      if(tile.card)node.setAttribute('aria-describedby','boardPeek');
      node.onpointerenter=()=>{inspect(tile.card);if(available)preview(r,c);};node.onpointerleave=()=>{peek.hidden=true;preview();};
      node.onfocus=()=>{focusCell=index;inspect(tile.card);board.querySelectorAll<HTMLButtonElement>('.tile').forEach(n=>{n.tabIndex=n===node?0:-1;});if(available)preview(r,c);};node.onblur=()=>{peek.hidden=true;preview();};
      node.onkeydown=event=>{const next=boardNextCell(index,event.key);if(next!==index){event.preventDefault();board.querySelector<HTMLButtonElement>(`[data-focus="cell-${next}"]`)?.focus();}};
      board.append(node);
    }
    }
    effects.update(presentation.effect);
    const hand=$('hand');hand.replaceChildren();
    for(const [i,id] of view.hand.entries()){
      const card=byId.get(id)!,picked=game.phase==='mulligan'?selectedMulligan.has(i):selected===i;
      const node=button('',()=>{if(!game||!presentation.canPlay&&!presentation.canMulligan)return;focusedCard=i;if(game.phase==='mulligan'){selectedMulligan.has(i)?selectedMulligan.delete(i):selectedMulligan.add(i);selected=i;}else selected=selected===i?null:i;pending=null;presentation.preview(false);inspect(null);lastMessage=game.phase==='mulligan'?'已更新换牌选择':selected===null?'已取消选牌':`已选 ${card.name}，请选择金框落点`;render();},'hand-card'+(picked?' selected':''));
      node.dataset.focus=`hand-${i}`;node.setAttribute('aria-pressed',String(picked));
      const face=createCardView(card,hooks.visual(id),{variant:'hand'});node.append(face);
      node.setAttribute('aria-label',face.getAttribute('aria-label')!);
      if(picked&&game.phase!=='mulligan')node.append(element('span','selection-tag','已选'));
      node.setAttribute('aria-controls','handFocus');
      node.onpointerenter=()=>browseHand(i,node);node.onfocus=()=>browseHand(i,node,true);
      if(picked&&game.phase==='mulligan')node.append(element('span','check','换'));
      node.disabled=!(presentation.canPlay||presentation.canMulligan&&!view.mulliganDone);
      node.onkeydown=event=>{if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();hand.querySelector<HTMLButtonElement>(`[data-focus="hand-${Math.max(0,Math.min(game!.hands[0].length-1,i+(event.key==='ArrowRight'?1:-1)))}"]`)?.focus();}};
      hand.append(node);
    }
    hand.scrollLeft=scroll;restoreFocus(focused);preview();updateHandFocus();
    const opening=presentation.phase==='Mulligan';
    $('confirmMulligan').hidden=!opening;$('confirmPlay').hidden=opening||game.phase==='finished';
    $<HTMLButtonElement>('confirmMulligan').disabled=!presentation.canMulligan;
    $('confirmMulligan').textContent=`完成换牌（${selectedMulligan.size} 张）`;
    $<HTMLButtonElement>('confirmPlay').disabled=!confirmable(game,pending,locked);
    $<HTMLButtonElement>('passBtn').disabled=!presentation.canPlay;
    $<HTMLButtonElement>('cardDetails').disabled=!card&&focusedCard===null&&inspected===null;
    $('resultsBtn').hidden=presentation.phase!=='Result';
    $('handHelp').textContent=opening?'选中要换掉的牌，再确认':presentation.busy?'正在展示，请稍候':card?`${card.name} · ${moves.size} 个合法位置`:'选卡 → 选格 → 确认';
    const status=presentation.busy?`${labels[presentation.phase]} · 结果展示期间行动锁定，可跳过展示或返回菜单`:opening?'开局5张，可换一次；直接确认则保留全部':presentation.phase==='Result'?'连续两次 PASS，对局结束':!legal.length?'没有合法出牌，可以 PASS':pending?'待确认落点；黄底为占格，红框为能力范围，数值尚未改变':view.passes?'电脑已 PASS；你再 PASS 将结束对局':'你的回合 · 金框表示所选卡的合法位置';
    $('status').textContent=rules===LEGACY_RULES_VERSION?`${rulesLabel(rules)} · ${status}`:status;
    $('feedback').textContent=lastMessage;$('feedback').title=lastMessage;
    warning.textContent=presentation.issue||saveIssue;warning.hidden=!warning.textContent;
  }
  function pause(){presentation.pause();pending=null;selected=null;focusedCard=null;inspect(null);}
  function start(settings:MatchSettings,name:string){
    const next=startMatch(settings);pause();activeSettings={...settings,deck:[...settings.deck]};deckName=name;game=next;presentation.reset();
    matchId=crypto.randomUUID();defaultBackground();selected=null;pending=null;focusCell=0;selectedMulligan.clear();lastMessage=`${name} · 先手为本原型自定义设置`;persist();presentation.resume();render();
  }
  function restore(restored:ReturnType<typeof restoreMatch>){
    pause();game=structuredClone(restored.game);activeSettings={...restored.save.settings,deck:[...restored.save.settings.deck]};deckName=restored.save.deckName;matchId=restored.save.id;
    presentation.reset();selected=null;pending=null;focusCell=0;selectedMulligan.clear();saveIssue='';defaultBackground();lastMessage='已恢复本机存档；未重复补牌或结算能力';
  }
  function exportCurrent(){if(game)downloadJson(exportReplay(game),`queens-blood-${game.replay.seed}.json`);}
  $('confirmMulligan').onclick=()=>{
    if(!game||!presentation.canMulligan)return;
    if(presentation.commitPlayer(()=>{if(!game!.mulliganDone[0])mulligan(game!,0,[...selectedMulligan].sort((a,b)=>a-b));if(!game!.mulliganDone[1])mulligan(game!,1,[]);},true)){
      selectedMulligan.clear();selected=null;focusedCard=null;pending=null;render();
    }
  };
  $('confirmPlay').onclick=()=>{if(game&&presentation.canPlay&&confirmable(game,pending)){const move=pending!;humanAction(()=>play(game!,0,move.handIndex,move.row,move.col));}};
  $('passBtn').onclick=()=>{
    if(!game||!presentation.canPlay)return;
    const content=element('div');content.append(element('p','',game.passes?'电脑已 PASS。确认跳过将结束对局。':'跳过本回合；若对手也跳过，对局结束。'),button('取消',closeDialog),button('确认 PASS',()=>{closeDialog();humanAction(()=>pass(game!,0));},'danger'));openDialog('PASS / 跳过',content);
  };
  $('cardDetails').onclick=()=>{const id=inspected??(focusedCard===null?undefined:(presentation.frame?.hand??game?.hands[0])?.[focusedCard])??chosen()?.id;if(id!==undefined)hooks.showCard(id);};
  $('resultsBtn').onclick=()=>{if(presentation.phase==='Result')showResult();};$('replayBtn').onclick=exportCurrent;
  $('battleLogBtn').onclick=()=>{if(!game)return;const content=element('div','event-log');content.append(element('p','muted','最近60条公开记录，编号为原事件顺序；完整行动可导出Replay复查。'));for(const text of game.events.map(e=>{const text=publicEventLabel(e);return text?`[${e.seq}] ${text}`:'';}).filter(Boolean).slice(-60))content.append(element('p','',text));openDialog('EVENTS / 对局事件',content);};
  document.addEventListener('keydown',event=>{if(event.key!=='Escape'||!presentation.active||$<HTMLDialogElement>('infoDialog').open)return;event.preventDefault();if(pending){pending=null;presentation.preview(false);lastMessage='已取消待确认落点';render();}else if(selected!==null){selected=null;presentation.preview(false);render();}else hooks.menu();});
  window.addEventListener('pagehide',pause);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)presentation.skip();});
  return {start,restore,pause,refresh:()=>{if(presentation.active)render(true);},hasMatch:()=>game!==null,rulesVersion:()=>game&&replayRulesVersion(game.rulesVersion),unfinished:()=>!!game&&game.phase!=='finished',restart:()=>start(activeSettings,deckName),resume:()=>{if(game){defaultBackground();presentation.resume();render();}},exportCurrent};
}
