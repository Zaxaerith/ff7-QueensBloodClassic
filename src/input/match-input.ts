import {getLocale,t,type MessageKey} from '../i18n/index.js';
import {$,element} from '../ui-dom.js';
import type {Direction} from '../ui-gamepad.js';
import {InputManager,allowsPass,inputContext,type InputContext,type MatchControl,type SemanticAction} from './input-manager.js';
import {gridStep,smartSnap} from './match-cursor.js';
import '../../site/gamepad.css';

interface MatchView {
  cursor: () => {hand:number; selected:number|null; board:number|null; last:number|null};
  legal: () => number[];
  browse: (index:number) => void;
  select: (index:number) => void;
  aim: (index:number) => void;
  peek: (index:number) => void;
  cancel: () => void;
  control: (control:MatchControl) => void;
  leave: () => void;
}
const glyphs={
  xbox:['A','B','X','Y','Menu','LB/RB'],
  playstation:['×','○','□','△','Options','L1/R1'],
  nintendo:['B','A','Y','X','+','L/R'],
  standard:['A/×','B/○','X/□','Y/△','Menu/Options','LB/RB · L1/R1'],
} as const;
const pauseLabel={
  'zh-CN':'暂停','zh-TW':'暫停',en:'Pause',ja:'ポーズ',ko:'일시 정지',
  fr:'Pause',de:'Pause','es-ES':'Pausa','es-419':'Pausa',it:'Pausa','pt-BR':'Pausa',
} as const;
const controls='button, summary, a[href]';
const formControls='select, input[type=checkbox], input[type=range]';
const spatialGroups='.challenge-picker, .frame-deck-bank, .d4-deck-grid, .d4-library-grid, .d4-deck-tabs, .collection-grid, #mainNav';
const matchControls=new Set<string>(['confirmPlay','confirmMulligan','passBtn','cardDetails','presentationSkip','resultsBtn']);
const browseContexts=new Set<InputContext>(['MATCH_HAND_BROWSE','MATCH_BOARD_TARGET','MATCH_BOARD_INSPECT']);

function usable(node:HTMLElement|null):node is HTMLElement {
  if(!node||node.matches(':disabled')||node.closest('[hidden], [inert]')||!node.getClientRects().length)return false;
  for(let closed=node.closest('details:not([open])');closed;closed=closed.parentElement?.closest('details:not([open])')??null){
    if(!closed.querySelector(':scope > summary')?.contains(node))return false;
  }
  return true;
}
const items=(parent:ParentNode,selector=controls)=>Array.from(parent.querySelectorAll<HTMLElement>(selector)).filter(usable);
const active=()=>document.activeElement as HTMLElement|null;
function moveIn(list:HTMLElement[],step:-1|1,wrap=false){
  if(!list.length)return;
  const current=list.indexOf(active()!);
  const next=current<0?(step<0?list.length-1:0):current+step;
  list[wrap?(next+list.length)%list.length:Math.max(0,Math.min(list.length-1,next))]?.focus();
}
function activate(node:HTMLElement|null){
  if(usable(node))node.click();
}

function spatialNeighbor(origin:HTMLElement,options:HTMLElement[],direction:Direction){
  const horizontal=direction==='left'||direction==='right';
  const forward=direction==='right'||direction==='down';
  const bounds=(node:HTMLElement)=>{
    const {left,right,top,bottom}=node.getBoundingClientRect();
    return horizontal?[left,right,top,bottom]:[top,bottom,left,right];
  };
  const [start,end,crossStart,crossEnd]=bounds(origin);
  let nearest:HTMLElement|null=null,bestGap=Infinity,bestOffset=Infinity;
  for(const option of options){
    if(option===origin||getComputedStyle(option).visibility!=='visible')continue;
    const [candidateStart,candidateEnd,candidateCrossStart,candidateCrossEnd]=bounds(option);
    const gap=forward?candidateStart-end:start-candidateEnd;
    // Only consider buttons in the requested direction that share the visual row or column.
    if(gap<0||Math.min(crossEnd,candidateCrossEnd)<=Math.max(crossStart,candidateCrossStart))continue;
    const centerOffset=Math.abs((candidateCrossStart+candidateCrossEnd)-(crossStart+crossEnd));
    if(gap<bestGap||gap===bestGap&&centerOffset<bestOffset){
      nearest=option;bestGap=gap;bestOffset=centerOffset;
    }
  }
  return nearest;
}

export function mountMatchInput(view:MatchView):InputManager {
  const app=$('app'),match=$('view-game'),board=$('board'),hand=$('hand');
  const mulliganButton=$('confirmMulligan');
  const table=match.querySelector<HTMLElement>('.battle-window')!;
  const commands=match.querySelector<HTMLElement>('.battle-actions')!;
  const menu=commands.querySelector<HTMLDetailsElement>('.action-more')!;
  const summary=menu.querySelector<HTMLElement>('summary')!;
  const replay=$('view-replay');
  const replayMenu=replay.querySelector<HTMLDetailsElement>('.action-more')!;
  const replaySummary=replayMenu.querySelector<HTMLElement>('summary')!;
  const playButton=$<HTMLButtonElement>('confirmPlay'),detailsButton=$<HTMLButtonElement>('cardDetails');
  const passButton=$<HTMLButtonElement>('passBtn');
  const dialog=$<HTMLDialogElement>('infoDialog');
  const hint=element('div','gamepad-hints'),dialogHint=element('div','gamepad-hints');
  const challengeHints=$('challengeHints');
  const prepareHints=element('p','gamepad-hints frame-prepare-hints');
  prepareHints.hidden=true;
  $('startGame').parentElement!.after(prepareHints);
  const hintLabel=element('span','');
  const playHints=element('div','gamepad-play-hints');
  const playControls=element('div','gamepad-play-controls');
  const passHint=element('span','gamepad-pass-hint'),passLabel=element('span');
  const meter=element('progress','gamepad-pass-meter');
  meter.max=1;meter.value=0;meter.hidden=true;
  passHint.append(passLabel,meter);playHints.append(playControls,passHint);commands.append(playHints);
  hint.append(hintLabel);
  match.querySelector('.battle-feedback')!.append(hint);dialog.append(dialogHint);

  const settings=element('label','field'),settingsLabel=element('span'),confirmSetting=element('select');
  for(const [value,text] of [['south','× / A / B'],['east','○ / B / A']]){
    const option=element('option','',text);option.value=value;confirmSetting.append(option);
  }
  settings.append(settingsLabel,confirmSetting);
  $('configInput').append(settings);
  confirmSetting.onchange=()=>input.setConfirmMode(confirmSetting.value==='east'?'east':'south');

  let menuReturn:HTMLElement|null=null,replayMenuReturn:HTMLElement|null=null;
  let previousPhase:string|undefined,firstTurn=false;
  const route=()=>app.dataset.view??'home';
  const phase=()=>table.dataset.presentationPhase??'';
  const handCard=(index:number)=>hand.querySelector<HTMLElement>(`[data-focus="hand-${index}"]`);
  const tile=(index:number)=>board.querySelector<HTMLElement>(`[data-focus="cell-${index}"]`);
  const isControl=(node:HTMLElement|null)=>node?.matches(controls)===true;
  const context=():InputContext=>{
    if(route()==='game'&&menu.open&&!dialog.open)return 'MATCH_PAUSE';
    const cursor=view.cursor(),focus=active();
    const zone=input.modality!=='pointer'&&commands.contains(focus)&&focus!==passButton?'command'
      :input.modality==='keyboard'&&hand.contains(focus)?'hand'
      :cursor.selected!==null&&cursor.board!==null?'target'
      :cursor.board!==null||board.contains(focus)?'inspect':'hand';
    return inputContext(route(),dialog.open,phase(),zone);
  };
  const focus=(node:HTMLElement|null)=>{if(input.modality!=='pointer'&&usable(node))node.focus();};
  function browse(index:number){
    view.browse(index);
    focus(handCard(view.cursor().hand));
  }
  function aim(index:number){
    view.aim(index);
    focus(tile(index));
  }
  function select(index:number){
    const last=view.cursor().last;
    view.select(index);
    if(phase()!=='Mulligan'&&view.cursor().selected!==null)aim(smartSnap(view.legal(),last));
  }
  function returnHand(){
    const cursor=view.cursor();
    view.cancel();
    browse(cursor.selected??cursor.hand);
  }
  function closeMenu(){
    menu.open=false;
    board.inert=hand.inert=false;
    if(usable(menuReturn))menuReturn.focus();
    else if(phase()==='Result')focus($('resultsBtn'));
    else focus(handCard(view.cursor().hand));
    menuReturn=null;
  }
  function openMenu(){
    if(menu.open){closeMenu();return;}
    menuReturn=active();menu.open=true;
    board.inert=hand.inert=true;
    $('matchContinue').focus();
  }
  function closeReplayMenu(){
    replayMenu.open=false;
    focus(usable(replayMenuReturn)?replayMenuReturn:replaySummary);
    replayMenuReturn=null;
  }
  function confirmControl(node:HTMLElement|null){
    if(!usable(node))return;
    if(node===summary&&menu.open){closeMenu();return;}
    if(matchControls.has(node.id))view.control(node.id as MatchControl);
    else activate(node);
  }
  function menuItems(){
    const root=$('view-'+route());
    return [...items(root,input.modality==='gamepad'?controls+', '+formControls:controls),
      ...items(app,'.header-actions button'), ...items($('mainNav'))];
  }
  function adjustForm(node:HTMLElement|null,step:-1|1){
    if(node instanceof HTMLSelectElement){
      const next=node.options[node.selectedIndex+step];
      if(next&&!next.disabled){
        node.value=next.value;
        node.dispatchEvent(new Event('change',{bubbles:true}));
      }
      return true;
    }
    if(node instanceof HTMLInputElement&&node.type==='range'){
      const previous=node.value;
      node.stepUp(step);
      if(node.value!==previous)node.dispatchEvent(new Event('input',{bubbles:true}));
      return true;
    }
    return false;
  }
  function cycleDeckBank(step:-1|1){
    const root=$('view-'+route()),bank=root.querySelector<HTMLElement>('[data-deck-bank]');
    if(!bank)return false;
    const slots=items(bank),current=slots.findIndex(node=>node.getAttribute('aria-pressed')==='true');
    if(!slots.length)return false;
    const focusedInBank=bank.contains(active());
    const next=current<0?(step>0?0:slots.length-1):(current+step+slots.length)%slots.length;
    slots[next].click();
    if(focusedInBank&&!dialog.open)focus(bank.querySelector<HTMLElement>('[aria-pressed=true]'));
    return true;
  }
  function switchPage(step:-1|1){
    const pages=items($('mainNav'),'button[data-route]').filter(page=>getComputedStyle(page).visibility==='visible');
    if(!pages.length)return;
    const current=pages.findIndex(page=>page.getAttribute('aria-current')==='page');
    const next=current<0?(step>0?0:pages.length-1):(current+step+pages.length)%pages.length;
    if(next!==current)activate(pages[next]);
  }
  function handleOutside(action:SemanticAction,current:InputContext){
    const type=action.type;
    if(current==='DIALOG_MODAL'){
      const options=items(dialog,input.modality==='gamepad'?controls+', '+formControls:controls);
      if(type==='cancel'||type==='details')activate($('dialogClose'));
      else if(type==='confirm'){
        const node=active();
        if(input.modality==='gamepad'&&node?.matches('select, input[type=range]'))return;
        const focusable=isControl(node)||(input.modality==='gamepad'&&node?.matches('input[type=checkbox]'));
        activate(dialog.contains(node)&&focusable?node:$('dialogClose'));
      }
      else if(type==='control'&&action.control==='confirmPass')view.control(action.control);
      else if(type==='scroll')dialog.scrollBy(0,120*action.step);
      else if(type==='move'){
        const step=action.direction==='down'||action.direction==='right'?1:-1;
        if(input.modality==='gamepad'&&(action.direction==='left'||action.direction==='right')&&adjustForm(active(),step))return;
        if(options.length<2)dialog.scrollBy(0,step*120);
        else moveIn(options,step);
      }
      return;
    }
    if(current==='REPLAY'){
      if(type==='cancel'){
        if(replayMenu.open)closeReplayMenu();
        else activate($('replayExit'));
      }
      else if(type==='confirm'){
        const focused=active();
        if(replayMenu.open&&focused===replaySummary)closeReplayMenu();
        else activate(replay.contains(focused)&&isControl(focused)?focused:$('replayNext'));
      }else if(type==='details'){
        const focused=active();
        if($('replayBoard').contains(focused)||$('replayHand').contains(focused))activate(focused);
        else $('replayEvents').click();
      }else if(type==='menu'){
        if(replayMenu.open)closeReplayMenu();
        else{
          replayMenuReturn=active();replayMenu.open=true;focus(replaySummary);
        }
      }else if(type==='move'&&replayMenu.open&&replayMenu.contains(active())){
        moveIn(items(replayMenu),action.direction==='up'||action.direction==='left'?-1:1,true);
      }else if(type==='move'&&(action.direction==='left'||action.direction==='right'))activate($(action.direction==='left'?'replayPrev':'replayNext'));
      else if(type==='switch')activate($(action.step<0?'replayPrev':'replayNext'));
      else if(type==='move')moveIn(items(replay),action.direction==='up'?-1:1);
      else if(type==='scroll')replay.querySelector('.replay-window')?.scrollBy(0,120*action.step);
      else if(type==='help')activate($('instructionsBtn'));
      return;
    }
    if(type==='cancel'){
      if(route()==='carnival'&&usable($('carnivalBack')))activate($('carnivalBack'));
      else if(route()!=='home')activate($('backMenu'));
      return;
    }
    if(type==='help'){activate($('instructionsBtn'));return;}
    if(type==='editDeck'){activate($('changeDeck'));return;}
    if(type==='menu'&&current==='PREPARE'){activate($('startGame'));return;}
    if(type==='menu'&&route()==='decks'){activate($('loadTemplate'));return;}
    if(type==='confirm'){
      const node=active();
      if(input.modality==='gamepad'){
        if(route()==='decks'&&node?.matches('.d4-card-button')){
          const edit=$(node.closest('#deckSlots')?'deckRemove':'deckAdd') as HTMLButtonElement;
          if(!edit.disabled)edit.click();
          return;
        }
        if(node?.matches('input[type=checkbox]')){activate(node);return;}
        if(node?.matches('select, input[type=range]'))return;
      }
      activate(isControl(node)?node:menuItems()[0]??null);
      return;
    }
    if(type==='switch'){
      if(current==='NAV_MENU'&&input.modality==='gamepad')switchPage(action.step);
      else if(!cycleDeckBank(action.step))moveIn(items($('mainNav')),action.step,true);
      return;
    }
    if(type==='details'){
      const focused=active();
      const card=focused?.closest<HTMLElement>('.d4-card-button');
      if(card){
        const inspector=$(route()==='decks'?'deckInfo':'homeDeckInfo');
        const details=inspector.querySelector<HTMLElement>('[data-card-details]');
        if(details)details.click();
      }else if(focused?.matches('.collection-card'))activate(focused);
      return;
    }
    if(type==='move'){
      const focused=active();
      const group=focused?.closest<HTMLElement>(spatialGroups);
      const step=action.direction==='up'||action.direction==='left'?-1:1;
      const horizontal=action.direction==='left'||action.direction==='right';
      if(input.modality==='gamepad'&&horizontal&&adjustForm(focused,step))return;
      if(focused&&input.modality==='gamepad'&&horizontal&&route()==='decks'&&$('deckInfo').contains(focused)){
        const next=spatialNeighbor(focused,items($('deckInfo')),action.direction);
        if(next)next.focus();
        else if(action.direction==='left')focus($('view-decks').querySelector<HTMLElement>('.d4-card-button[aria-pressed=true]'));
        return;
      }
      if(focused&&group&&input.modality==='gamepad'){
        const next=spatialNeighbor(focused,items(group),action.direction);
        if(next)next.focus();
        else if(action.direction==='right'&&group.id==='deckCards'){
          focus($('deckInfo').querySelector<HTMLElement>('[data-card-details]'));
        }else if(!horizontal&&!group.matches('.challenge-picker')){
          // Vertical edges can reach aligned page tools. Horizontal edges never wrap to another row.
          const page=items($('view-'+route()),controls+', '+formControls).filter(node=>!group.contains(node));
          spatialNeighbor(focused,page,action.direction)?.focus();
        }
        return;
      }
      moveIn(menuItems(),step,true);
    }else if(type==='scroll')window.scrollBy(0,120*action.step);
  }

  function handle(action:SemanticAction,current:InputContext){
    const {type}=action;
    if(current==='DIALOG_MODAL'||current==='NAV_MENU'||current==='PREPARE'||current==='REPLAY'){handleOutside(action,current);return;}
    if(current==='MATCH_PAUSE'){
      if(type==='cancel'||type==='menu')closeMenu();
      else if(type==='help')activate($('matchHelp'));
      else if(type==='confirm')confirmControl(menu.contains(active())?active():$('matchContinue'));
      else if(type==='move'){
        const step=action.direction==='up'||action.direction==='left'?-1:1;
        if(input.modality==='gamepad'&&(action.direction==='left'||action.direction==='right')&&adjustForm(active(),step))return;
        moveIn(items(menu,input.modality==='gamepad'?controls+', '+formControls:controls),step,true);
      }
      else if(type==='scroll')menu.querySelector('div')?.scrollBy(0,120*action.step);
      return;
    }
    if(type==='control'){view.control(action.control);return;}
    if(current==='NPC_TURN'||current==='PRESENTATION_LOCK'){
      if(type==='confirm')view.control('presentationSkip');
      return;
    }
    const cursor=view.cursor(),focused=active();
    if(type==='menu'){openMenu();return;}
    if(type==='pass'){view.control('confirmPass');return;}
    if(type==='mulliganCommit'){view.control('confirmMulligan');return;}
    if(type==='help'){activate($('instructionsBtn'));return;}
    if(type==='details'){view.control('cardDetails');return;}
    if(type==='hand'){
      if(action.hover){
        if(cursor.selected===null&&current!=='MATCH_BOARD_INSPECT')view.browse(action.index);
      }else if(input.modality==='pointer'&&current!=='MULLIGAN'&&cursor.selected===action.index)returnHand();
      else select(action.index);
      return;
    }
    if(type==='cell'){
      if(action.hover&&cursor.selected===null){view.peek(action.index);return;}
      aim(action.index);
      if(!action.hover)view.control(cursor.selected===null?'cardDetails':'confirmPlay');
      return;
    }
    if(type==='cancel'){
      if(menu.open){closeMenu();return;}
      if(current==='RESULT')return;
      if(current==='MULLIGAN'){
        if(handCard(cursor.hand)?.classList.contains('selected'))view.select(cursor.hand);
        else focus(handCard(cursor.hand));
      }else if(cursor.board===null&&cursor.selected===null&&!commands.contains(focused))openMenu();
      else returnHand();
      return;
    }
    if(current==='MATCH_COMMAND'||current==='RESULT'||commands.contains(focused)){
      if(type==='confirm')confirmControl(isControl(focused)?focused:$('resultsBtn'));
      else if(type==='move'){
        if(action.direction==='left'&&current!=='RESULT'){if(menu.open)closeMenu();else returnHand();}
        else moveIn(menu.open?items(menu):items(commands),action.direction==='up'||action.direction==='left'?-1:1);
      }
      return;
    }
    if(type==='confirm'&&input.modality==='keyboard'&&isControl(focused)&&!hand.contains(focused)&&!board.contains(focused)){
      confirmControl(focused);
      return;
    }
    if(type==='switch'){
      const index=cursor.hand+action.step;
      if(!handCard(index))return;
      if(current==='MATCH_BOARD_TARGET'){
        view.select(index);
        aim(cursor.board??0);
      }else browse(index);
      return;
    }
    if(current==='MATCH_BOARD_TARGET'||current==='MATCH_BOARD_INSPECT'){
      const focusedIndex=board.contains(focused)?Number(focused?.dataset.focus?.slice(5)):0;
      const index=cursor.board??focusedIndex;
      if(type==='confirm')view.control(current==='MATCH_BOARD_TARGET'?'confirmPlay':'cardDetails');
      else if(type==='move'){
        if(current==='MATCH_BOARD_INSPECT'&&index>=10&&action.direction==='down')returnHand();
        else aim(gridStep(index,action.direction));
      }
      return;
    }
    if(type==='confirm')select(cursor.hand);
    else if(type==='move'){
      if(action.direction==='left'||action.direction==='right')browse(cursor.hand+(action.direction==='left'?-1:1));
      else if(action.direction==='up'&&current==='MATCH_HAND_BROWSE')aim(cursor.last??10);
      else if(action.direction==='down'&&current==='MULLIGAN'&&input.modality==='keyboard')focus(mulliganButton);
    }
  }

  function hints(){
    const current=context(),gamepad=input.modality==='gamepad';
    const opening=current==='MULLIGAN';
    document.body.dataset.inputModality=input.modality;
    document.documentElement.toggleAttribute('data-gamepad-input',gamepad);
    if(gamepad&&route()==='game')table.dataset.gamepadState=current;
    else delete table.dataset.gamepadState;
    settingsLabel.textContent=t('inputConfirmButton');
    summary.textContent=menu.open?t('paused'):pauseLabel[getLocale()];
    const show=route()==='game'&&(opening||browseContexts.has(current))&&!menu.open&&gamepad;
    playHints.hidden=!show;
    hint.hidden=show||route()!=='game'||(!gamepad&&!input.unsupported)||current==='DIALOG_MODAL';
    dialogHint.hidden=!gamepad||!dialog.open;
    prepareHints.hidden=current!=='PREPARE'||!gamepad;
    challengeHints.hidden=current!=='NAV_MENU'||route()!=='home'||!gamepad||!active()?.matches('[data-opponent]');
    if(input.unsupported){hintLabel.textContent=t('gamepadUnsupported');return;}
    if(!gamepad){
      hintLabel.textContent='';
      meter.setAttribute('aria-label',t('gamepadHoldPass'));
      return;
    }
    const [south,east,details,pass,menuKey,shoulders]=glyphs[input.family];
    const [confirm,cancel]=input.confirmMode==='south'?[south,east]:[east,south];
    const label=(key:string,message:MessageKey)=>`${key} ${t(message)}`;
    if(!challengeHints.hidden)challengeHints.textContent=label(confirm,'startingDeck');
    if(!prepareHints.hidden){
      const shortcuts=[label(shoulders,'switchSavedDeck'),label(pass,'chooseOrEditDeck')];
      if(usable($('startGame')))shortcuts.push(label(menuKey,'newGame'));
      shortcuts.push(label(cancel,'back'));
      prepareHints.textContent=shortcuts.join('　');
    }
    if(show){
      const labels:string[]=[];
      if(opening){
        labels.push(label(confirm,'gamepadSelect'),`${pass} ${mulliganButton.textContent}`);
      }else if(current==='MATCH_HAND_BROWSE')labels.push(label(confirm,'gamepadSelect'));
      else if(current==='MATCH_BOARD_TARGET'&&!playButton.hidden&&!playButton.disabled)labels.push(label(confirm,'confirmPlay'));
      if(!detailsButton.disabled)labels.push(label(details,'cardDetails2'));
      if(current==='MATCH_BOARD_TARGET'||current==='MATCH_BOARD_INSPECT')labels.push(label(cancel,'back'));
      if(current==='MATCH_BOARD_TARGET'&&hand.children.length>1)labels.push(label(shoulders,'hand'));
      labels.push(`${menuKey} ${pauseLabel[getLocale()]}`);
      playControls.replaceChildren(...labels.map(text=>element('span','',text)));
      passHint.hidden=!allowsPass(current);
      passLabel.textContent=label(pass,'gamepadHoldPass');
      meter.setAttribute('aria-label',t('gamepadHoldPass'));
      if(opening&&!hand.contains(active()))focus(handCard(view.cursor().hand));
      return;
    }
    const labels=[
      label(confirm,current==='MULLIGAN'?'swap':current==='MATCH_BOARD_TARGET'?'confirmPlay':current==='RESULT'?'matchResult2':'gamepadConfirm'),
      label(cancel,'back'),
      label(details,'cardDetails2'),
    ];
    if(current==='NPC_TURN'||current==='PRESENTATION_LOCK')hintLabel.textContent=usable($('presentationSkip'))?label(confirm,'skipAnimation'):'';
    else if(current==='DIALOG_MODAL')dialogHint.textContent=labels.slice(0,2).join('　');
    else hintLabel.textContent=(current==='MULLIGAN'?[...labels,label(pass,'confirmMulligan')]:labels).join('　');
  }

  const input:InputManager=new InputManager({
    context,handle,changed:hints,
    progress(value){
      if(meter.value===value)return;
      meter.value=value;
      meter.hidden=value===0;
      passButton.style.setProperty('--pass-progress',String(value));
    },
    pointerTarget(node){
      if(route()!=='game'||dialog.open)return null;
      const hovered=node?.closest<HTMLElement>('#hand .hand-card, #board .tile');
      if(!hovered)return null;
      const [type,index]=hovered.dataset.focus!.split('-');
      return {type:type==='hand'?'hand':'cell',index:Number(index),hover:true};
    },
  });
  input.bindPassButton(passButton);
  summary.onclick=event=>{event.preventDefault();input.dispatch({type:'menu'});};
  $('matchContinue').onclick=()=>{closeMenu();input.contextChanged();};
  $('matchHelp').onclick=()=>activate($('instructionsBtn'));
  $('matchLeave').onclick=view.leave;
  document.addEventListener('focusin',()=>{
    const node=active();
    if(input.modality==='keyboard'&&hand.contains(node)&&node?.dataset.focus&&view.cursor().selected===null){
      input.dispatch({type:'hand',index:Number(node.dataset.focus.slice(5)),hover:true});
    }
    input.contextChanged();
  });
  const changes=new MutationObserver(()=>{
    const current=phase(),entered=current==='PlayerSelect'&&previousPhase!=='PlayerSelect'&&previousPhase!=='Preview';
    previousPhase=current;
    if(current==='Mulligan')firstTurn=true;
    if(route()!=='replay'){replayMenu.open=false;replayMenuReturn=null;}
    if(route()!=='game'||current==='OpponentTurn'||current==='PlayerResolve'||current==='OpponentResolve'){
      menu.open=false;menuReturn=null;
      if(route()!=='game')firstTurn=false;
    }
    if(route()==='game'&&!dialog.open){
      const state=context();
      if(entered&&(firstTurn||input.modality==='gamepad')){
        firstTurn=false;browse(0);
      }else if(input.modality==='gamepad'){
        if(state==='NPC_TURN'||state==='PRESENTATION_LOCK')focus(usable($('presentationSkip'))?$('presentationSkip'):$('who'));
        else if(state==='RESULT'&&!commands.contains(active()))focus($('resultsBtn'));
        else if(!usable(active())||!isControl(active())){
          const cursor=view.cursor();
          focus(cursor.board===null?handCard(cursor.hand):tile(cursor.board));
        }
      }
    }
    input.contextChanged();
  });
  changes.observe(app,{attributeFilter:['data-view']});
  changes.observe(table,{attributeFilter:['data-presentation-phase']});
  changes.observe(dialog,{attributeFilter:['open']});
  menu.addEventListener('toggle',()=>{board.inert=hand.inert=menu.open;input.contextChanged();});
  changes.observe(document.documentElement,{attributeFilter:['lang']});
  let resizeFrame:number|null=null;
  window.addEventListener('resize',()=>{
    if(resizeFrame!==null||input.modality!=='gamepad'||route()!=='game')return;
    resizeFrame=requestAnimationFrame(()=>{
      resizeFrame=null;
      const node=active(),scope=dialog.open?dialog:match;
      if(input.modality==='gamepad'&&route()==='game'&&scope.contains(node)&&usable(node))node.scrollIntoView({block:'nearest',inline:'nearest'});
    });
  });
  input.start();
  return input;
}
