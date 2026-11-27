import {t} from './i18n/index.js';
import type {MatchEffect} from './match-effects.js';
import {effectText} from './match-effects.js';
import type {MovePreview} from './move-preview.js';
import {$,element} from './ui-dom.js';

const signed=(n:number)=>`${n>0?'+':''}${n}`;

function removeNode(node:Element){
  if(typeof node.remove==='function'){node.remove();return;}
  const parent=node.parentElement as {children?:Element[]}|null;
  if(parent&&Array.isArray(parent.children)){
    const idx=parent.children.indexOf(node);
    if(idx>=0)parent.children.splice(idx,1);
  }
}

export function isBanterEnabled():boolean {
  return document.documentElement?.dataset?.classicBanter!=='false';
}

export interface MovePreviewOverlayTargets {
  board:HTMLElement;
  leftScores:HTMLElement;
  rightScores:HTMLElement;
  playerSide?:HTMLElement|null;
  rivalSide?:HTMLElement|null;
  legendDeltaHost?:HTMLElement|null;
  preview:MovePreview|null;
}

/** Paint zero-jitter live score delta badges, destruction crosshairs, and cell power deltas. */
export function applyMovePreviewOverlay(targets:MovePreviewOverlayTargets):void {
  const {board,leftScores,rightScores,playerSide,rivalSide,legendDeltaHost,preview}=targets;
  board.querySelectorAll('.preview-destroy').forEach(node=>node.classList.remove('preview-destroy'));
  board.querySelectorAll('.preview-destroy-fx').forEach(removeNode);
  board.querySelectorAll('.preview-cell-delta').forEach(removeNode);
  leftScores.querySelectorAll('.preview-lane-delta').forEach(removeNode);
  rightScores.querySelectorAll('.preview-lane-delta').forEach(removeNode);
  playerSide?.querySelectorAll('.preview-score-delta').forEach(removeNode);
  rivalSide?.querySelectorAll('.preview-score-delta').forEach(removeNode);
  legendDeltaHost?.querySelectorAll('.preview-score-delta').forEach(removeNode);

  if(!preview)return;

  for(let r=0;r<preview.rowDeltas.length;r++){
    const [d0,d1]=preview.rowDeltas[r];
    const leftCell=leftScores.children[r] as HTMLElement|undefined;
    if(leftCell&&d0!==0){
      const badge=element('span',`preview-lane-delta ${d0>0?'positive':'negative'}`,signed(d0));
      badge.dataset.side='0';
      badge.setAttribute('aria-hidden','true');
      leftCell.append(badge);
    }
    const rightCell=rightScores.children[r] as HTMLElement|undefined;
    if(rightCell&&d1!==0){
      const badge=element('span',`preview-lane-delta ${d1>0?'positive':'negative'}`,signed(d1));
      badge.dataset.side='1';
      badge.setAttribute('aria-hidden','true');
      rightCell.append(badge);
    }
  }

  const [s0,s1]=preview.scoreDelta;
  if(playerSide&&s0!==0){
    const badge=element('span',`preview-score-delta ${s0>0?'positive':'negative'}`,signed(s0));
    badge.dataset.side='0';
    badge.setAttribute('aria-hidden','true');
    playerSide.append(badge);
  }
  if(rivalSide&&s1!==0){
    const badge=element('span',`preview-score-delta ${s1>0?'positive':'negative'}`,signed(s1));
    badge.dataset.side='1';
    badge.setAttribute('aria-hidden','true');
    rivalSide.append(badge);
  }
  if(legendDeltaHost&&(s0!==0||s1!==0)){
    const text=s0!==0&&s1!==0?`${signed(s0)} / ${signed(s1)}`:s0!==0?signed(s0):signed(s1);
    const tone=s0>0||(s0===0&&s1<0)?'positive':'negative';
    const badge=element('span',`preview-score-delta preview-score-delta--inline ${tone}`,text);
    badge.setAttribute('aria-hidden','true');
    legendDeltaHost.append(badge);
  }

  const destroyedKeys=new Set<string>();
  for(const cell of preview.destroyedCells){
    const key=`${cell.row}-${cell.col}`;
    if(destroyedKeys.has(key))continue;
    destroyedKeys.add(key);
    const tile=board.querySelector<HTMLElement>(`[data-cell="${key}"]`);
    if(!tile)continue;
    tile.classList.add('preview-destroy');
    const fx=element('span','preview-destroy-fx');
    fx.setAttribute('aria-hidden','true');
    fx.append(element('b','preview-destroy-x','✕'));
    tile.append(fx);
  }

  for(const ch of preview.changedCells){
    const key=`${ch.row}-${ch.col}`;
    if(destroyedKeys.has(key)||ch.delta===0)continue;
    const tile=board.querySelector<HTMLElement>(`[data-cell="${key}"]`);
    if(!tile)continue;
    const deltaEl=element('span',`preview-cell-delta ${ch.delta>0?'positive':'negative'}`,signed(ch.delta));
    deltaEl.setAttribute('aria-hidden','true');
    tile.append(deltaEl);
  }
}

export interface ClassicBanterOverlay {
  readonly element:HTMLElement;
  show:(speaker:string,text:string)=>void;
  hide:()=>void;
}

/** Non-intrusive 1997 FF7 OG blue dialog banter bar overlaid above the board without shifting layout. */
export function mountClassicBanter(host:HTMLElement):ClassicBanterOverlay {
  const box=element('button','classic-banter') as HTMLButtonElement;
  box.type='button';
  box.hidden=true;
  box.setAttribute('aria-live','polite');
  const head=element('span','classic-banter-head');
  const speakerEl=element('strong','classic-banter-speaker');
  const skipEl=element('span','classic-banter-skip');
  head.append(speakerEl,skipEl);
  const textEl=element('span','classic-banter-text');
  box.append(head,textEl);
  host.append(box);

  let fadeTimer:ReturnType<typeof setTimeout>|null=null;
  let hideTimer:ReturnType<typeof setTimeout>|null=null;

  function clearTimers(){
    if(fadeTimer!==null){clearTimeout(fadeTimer);fadeTimer=null;}
    if(hideTimer!==null){clearTimeout(hideTimer);hideTimer=null;}
  }

  function hide(){
    clearTimers();
    box.classList.remove('is-fading');
    box.hidden=true;
  }

  box.onclick=hide;

  function show(speaker:string,text:string){
    clearTimers();
    if(!isBanterEnabled()||!text.trim()){hide();return;}
    speakerEl.textContent=speaker;
    skipEl.textContent=t('banterSkipHint');
    textEl.textContent=text;
    box.setAttribute('aria-label',`${speaker}: ${text}`);
    box.classList.remove('is-fading');
    box.hidden=false;
    fadeTimer=setTimeout(()=>{
      fadeTimer=null;
      box.classList.add('is-fading');
    },3200);
    hideTimer=setTimeout(()=>{
      hideTimer=null;
      hide();
    },3600);
  }

  return {element:box,show,hide};
}

export function createResultBanterBlock(speaker:string,text:string):HTMLElement {
  const quote=element('blockquote','classic-banter-result');
  quote.append(
    element('strong','classic-banter-speaker',speaker),
    element('p','classic-banter-text',text),
  );
  return quote;
}

export function mountMatchFeedback(table:HTMLElement,board:HTMLElement,options?:{feedback?:HTMLElement;hand?:HTMLElement}){
  const root=element('div','match-effects');root.setAttribute('aria-hidden','true');table.append(root);
  const notice=element('p','match-action-notice');notice.setAttribute('role','status');notice.hidden=true;
  (options?.feedback??document.querySelector('#view-game .battle-feedback')!).append(notice);
  let key:number|undefined,landingBatch:number|undefined;
  const hand=options?.hand??$('hand');
  function cell(row:number,col:number,className:string,text?:string){
    const node=element('div',className);
    node.style.setProperty('--effect-row',String(row));
    node.style.setProperty('--effect-col',String(col));
    if(text!==undefined)node.append(element('span','',text));
    return node;
  }
  function placementCue(row:number,col:number,actor:0|1,className:string){
    const cue=cell(row,col,className);
    cue.dataset.owner=String(actor);
    root.append(cue);
    return cue;
  }
  function rivalSelection(count:number){
    const fan=element('div','match-rival-hand');
    for(let index=0;index<Math.min(count,3);index++)fan.append(element('i','match-card-back'));
    root.append(fan);
  }
  function appendBattleNumber(row:number,col:number,delta:number,extraClass='',titleText?:string){
    const tone=delta<0?'negative':'positive';
    const node=cell(row,col,`ff7-battle-num ${tone}${extraClass?' '+extraClass:''}`);
    const digits=element('span','ff7-battle-digits',signed(delta));
    if(titleText)digits.title=titleText;
    node.append(digits);
    root.append(node);
    return node;
  }
  function appendPixelShatter(row:number,col:number){
    const burst=cell(row,col,'match-shatter');
    burst.append(element('i','shatter-flash'));
    for(let i=0;i<6;i++){
      const shard=element('i',`shatter-shard shatter-shard--${i}`);
      burst.append(shard);
    }
    root.append(burst);
  }
  return {update(effect:MatchEffect|null){
    if(effect?.key===key)return;
    key=effect?.key;root.replaceChildren();notice.hidden=!effect;notice.removeAttribute('title');
    hand.querySelector('.match-hand-draw')?.classList.remove('match-hand-draw');
    if(effect?.stage!=='events'||!effect.motion){
      board.querySelectorAll('.match-card-arrival').forEach(tile=>tile.classList.remove('match-card-arrival'));
    }
    if(!effect){
      notice.textContent='';
      delete root.dataset.stage;delete root.dataset.batch;delete root.dataset.motion;delete root.dataset.effectKey;delete root.dataset.opening;
      return;
    }
    root.dataset.motion=String(effect.motion);root.dataset.stage=effect.stage;root.dataset.batch=String(effect.batch);root.dataset.effectKey=String(effect.key);
    root.toggleAttribute('data-opening',Boolean(effect.opening));
    if(effect.action==='transition'){
      notice.hidden=true;notice.textContent='';
      if(effect.stage==='start'||effect.stage==='turn'){
        const banner=element('div','match-turn-banner',t(effect.stage==='start'?'matchStartBanner':effect.actor===0?'playerTurnBanner':'rivalTurnBanner'));
        banner.dataset.owner=String(effect.actor);
        root.append(banner);
      }else if(effect.stage==='draw'){
        if(effect.drawIndex!==undefined)hand.children[effect.drawIndex]?.classList.add('match-hand-draw');
        else if(effect.actor===1)root.append(element('div','match-rival-draw match-card-back'));
      }
      return;
    }
    const who=effect.actor===0?t("you"):t("computer"),placement=effect.placement;
    notice.textContent=placement?`${who} · ${effectText(placement)}`:`${who} · ${t('pass')}`;
    if(effect.stage==='summary'){notice.textContent+=t("boardShowsTheResolvedMove");return;}
    if(effect.stage==='commit'&&placement){
      if(effect.actor===1)notice.textContent=t("computerIsPlayingACard");
      if(effect.motion){
        const target=placementCue(placement.row!,placement.col!,effect.actor,'match-drop-target');
        if(effect.actor===1){
          rivalSelection(effect.rivalHandCount??0);
          target.append(element('i','match-rival-flight match-card-back'));
        }
      }
      return;
    }
    if(effect.stage==='events'){
      // The first group accompanies the after-frame. Later groups describe
      // the same action, even when they mention this cell or card again.
      if(placement&&landingBatch!==effect.batch){
        landingBatch=effect.batch;
        if(effect.motion){
          const row=placement.row!,col=placement.col!;
          const cue=placementCue(row,col,effect.actor,'match-landing');
          cue.toggleAttribute('data-replacement',effect.targets.some(target=>
            target.kind==='CardReplaced'&&target.row===row&&target.col===col));
        }
      }
      // 1997 FF7 classic floating pop-up numbers for PowerChanged & Pixel Shatter for CardDestroyed.
      const powerByCell=new Map<string,{row:number;col:number;delta:number}>();
      const shattered=new Set<string>();
      for(const ev of effect.events){
        if(ev.row===undefined||ev.col===undefined)continue;
        const cid=`${ev.row}-${ev.col}`;
        if(ev.type==='PowerChanged'&&typeof ev.amount==='number'&&ev.amount!==0){
          const cur=powerByCell.get(cid);
          if(cur)cur.delta+=ev.amount;
          else powerByCell.set(cid,{row:ev.row,col:ev.col,delta:ev.amount});
        }else if(ev.type==='CardDestroyed'&&!shattered.has(cid)){
          shattered.add(cid);
          if(effect.motion)appendPixelShatter(ev.row,ev.col);
        }
      }
      for(const pop of powerByCell.values()){
        if(pop.delta!==0)appendBattleNumber(pop.row,pop.col,pop.delta);
      }

      // One badge per target cell. Instance checks stop an old death marker from
      // fading a replacement's NEW card at the same coordinates.
      const targets=new Map<string,typeof effect.targets[number][]>();
      for(const tgt of effect.targets){const id=`${tgt.row}-${tgt.col}`,list=targets.get(id)??[];list.push(tgt);targets.set(id,list);}
      for(const list of targets.values()){
        const target=list[0],labels:Record<string,string>={CardPlayed:t("cardPlayed"),CardReplaced:t("cardReplaced"),CardDestroyed:t("cardRemoved"),PowerChanged:t("powerChanged"),DerivedPowerChanged:t("continuousPowerRecalculated"),CardEnhanced:t("firstEnhancement"),CardEnfeebled:t("firstEnfeeblement"),ThresholdReached:t("thresholdReached"),CardSpawned:t("tokenGenerated"),PawnsClaimed:t("pawnsChanged")};
        const label=(target.current?'':t("historicalTargetPrefix"))+(target.source??labels[target.kind]??t("eventTarget"))+(list.length>1?t("eventCountSuffix", list.length):'');
        const badge=cell(target.row,target.col,'match-event-target '+(target.current?'current-target':'historical-target'),label);
        badge.dataset.kind=target.kind;root.append(badge);
      }
      const texts=effect.events.slice(0,3).map(effectText);
      notice.textContent=texts.join(' · ')+(effect.events.length>3?t("moreEventsSuffix", effect.events.length-3):'');
      notice.title=(placement?t("placedCardPrefix", effectText(placement)):'')+effect.events.map(effectText).join('；');
    }
    if(effect.stage==='settle')for(const change of effect.changes){
      if(change.kind==='power'&&change.delta!==0){
        appendBattleNumber(change.row,change.col,change.delta,'match-net-change power',t("finalEffect", change.text));
      }else{
        root.append(cell(change.row,change.col,`match-net-change ${change.kind} ${change.delta<0?'negative':'positive'}`,change.kind==='power'?t("finalEffect", change.text):change.text));
      }
    }
    if(effect.scoring){
      notice.hidden=true;const {result,revealed,totals}=effect.scoring;
      for(let row=0;row<revealed;row++){
        const [a,b]=result.rows[row],winner=a===b?t("tiedLane"):a>b?t("youWinThisLane"):t("computerWinsThisLane");
        const isActive=row===revealed-1&&!totals;
        const laneWinner=a>b?'0':b>a?'1':'tie';
        const band=element('div','match-score-row'+(isActive?' active':'')+(isActive&&a!==b?' scoring-sweep':''));
        band.style.setProperty('--effect-row',String(row));
        band.dataset.winner=laneWinner;
        band.append(element('strong','',t("laneOutcome", [t("top"),t("middle"),t("bottom")][row], winner, a, b)),element('span','',t("laneAward", result.awards[row][0], result.awards[row][1])));root.append(band);
      }
      if(totals){const total=element('div','match-score-total',`${result.winner===null?t("draw2"):result.winner===0?t("victory2"):t("defeat2")} · ${result.scores.join(' : ')}`);root.append(total);}
    }
  }};
}
