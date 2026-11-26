import {t} from './i18n/index.js';
import type {MatchEffect} from './match-effects.js';
import {effectText} from './match-effects.js';
import {$,element} from './ui-dom.js';

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
      // One badge per target cell. Instance checks stop an old death marker from
      // fading a replacement's NEW card at the same coordinates.
      const targets=new Map<string,typeof effect.targets[number][]>();
      for(const t of effect.targets){const id=`${t.row}-${t.col}`,list=targets.get(id)??[];list.push(t);targets.set(id,list);}
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
      root.append(cell(change.row,change.col,`match-net-change ${change.kind} ${change.delta<0?'negative':'positive'}`,change.kind==='power'?t("finalEffect", change.text):change.text));
    }
    if(effect.scoring){
      notice.hidden=true;const {result,revealed,totals}=effect.scoring;
      for(let row=0;row<revealed;row++){
        const [a,b]=result.rows[row],winner=a===b?t("tiedLane"):a>b?t("youWinThisLane"):t("computerWinsThisLane");
        const band=element('div','match-score-row'+(row===revealed-1&&!totals?' active':''));
        band.style.setProperty('--effect-row',String(row));
        band.append(element('strong','',t("laneOutcome", [t("top"),t("middle"),t("bottom")][row], winner, a, b)),element('span','',t("laneAward", result.awards[row][0], result.awards[row][1])));root.append(band);
      }
      if(totals){const total=element('div','match-score-total',`${result.winner===null?t("draw2"):result.winner===0?t("victory2"):t("defeat2")} · ${result.scores.join(' : ')}`);root.append(total);}
    }
  }};
}
