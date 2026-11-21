import {t} from './i18n/index.js';
import type {MatchEffect} from './match-effects.js';
import {effectText} from './match-effects.js';
import {element} from './ui-dom.js';

export function mountMatchFeedback(table:HTMLElement,board:HTMLElement){
  const root=element('div','match-effects');root.setAttribute('aria-hidden','true');table.append(root);
  const notice=element('p','match-action-notice');notice.setAttribute('role','status');notice.hidden=true;
  document.querySelector('#view-game .battle-feedback')!.append(notice);
  let key:number|undefined;
  function cell(row:number,col:number,className:string,text:string){
    const node=element('div',className),label=element('span','',text);
    node.style.setProperty('--effect-row',String(row));node.style.setProperty('--effect-col',String(col));node.append(label);return node;
  }
  function layout(){root.style.left=board.offsetLeft+'px';root.style.top=board.offsetTop+'px';root.style.width=board.offsetWidth+'px';root.style.height=board.offsetHeight+'px';}
  const resize=new ResizeObserver(layout);resize.observe(table);resize.observe(board);
  return {update(effect:MatchEffect|null){
    layout();if(effect?.key===key)return;key=effect?.key;root.replaceChildren();notice.hidden=!effect;
    if(!effect){notice.textContent='';delete root.dataset.stage;delete root.dataset.batch;return;}
    root.dataset.motion=String(effect.motion);root.dataset.stage=effect.stage;root.dataset.batch=String(effect.batch);root.dataset.effectKey=String(effect.key);
    const who=effect.actor===0?t("you"):t("computer"),placement=effect.placement;
    notice.textContent=placement?`${who} · ${effectText(placement)}`:effect.action==='pass'?`${who} · ${t('pass')}`:t("mulliganComplete");
    if(effect.stage==='summary'){notice.textContent+=t("boardShowsTheResolvedMove");return;}
    if(effect.stage==='commit'&&placement){
      root.append(cell(placement.row!,placement.col!,'match-drop-target',t("playedHere")));return;
    }
    if(effect.stage==='events'){
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
