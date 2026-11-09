// Stable overlays on the public table; no timers, rules or private hands.
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
    const who=effect.actor===0?'你':'电脑',placement=effect.placement;
    notice.textContent=placement?`${who} · ${effectText(placement)}`:effect.action==='pass'?`${who} · PASS`:'换牌完成';
    if(effect.stage==='summary'){notice.textContent+=' · 棋盘已显示本次行动终态';return;}
    if(effect.stage==='commit'&&placement){
      root.append(cell(placement.row!,placement.col!,'match-drop-target','▼ 实际落点'));return;
    }
    if(effect.stage==='events'){
      // One badge per target cell. Instance checks stop an old death marker from
      // fading a replacement's NEW card at the same coordinates.
      const targets=new Map<string,typeof effect.targets[number][]>();
      for(const t of effect.targets){const id=`${t.row}-${t.col}`,list=targets.get(id)??[];list.push(t);targets.set(id,list);}
      for(const list of targets.values()){
        const t=list[0],labels:Record<string,string>={CardPlayed:'实际落牌',CardReplaced:'替换旧牌',CardDestroyed:'离场记录',PowerChanged:'力量修正',DerivedPowerChanged:'持续重算',CardEnhanced:'首次强化',CardEnfeebled:'首次弱化',ThresholdReached:'阈值触发',CardSpawned:'衍生生成',PawnsClaimed:'棋子变化'};
        const label=(t.current?'':'记录·')+(t.source??labels[t.kind]??'事件目标')+(list.length>1?` /${list.length}条`:'');
        const badge=cell(t.row,t.col,'match-event-target '+(t.current?'current-target':'historical-target'),label);
        badge.dataset.kind=t.kind;root.append(badge);
      }
      const texts=effect.events.slice(0,3).map(effectText);
      notice.textContent=texts.join(' · ')+(effect.events.length>3?` · 另${effect.events.length-3}条，可查看事件日志`:'');
      notice.title=(placement?`本次落牌：${effectText(placement)}；`:'')+effect.events.map(effectText).join('；');
    }
    if(effect.stage==='settle')for(const change of effect.changes){
      root.append(cell(change.row,change.col,`match-net-change ${change.kind} ${change.delta<0?'negative':'positive'}`,change.kind==='power'?`最终 ${change.text}`:change.text));
    }
    if(effect.scoring){
      notice.hidden=true;const {result,revealed,totals}=effect.scoring;
      for(let row=0;row<revealed;row++){
        const [a,b]=result.rows[row],winner=a===b?'本行平局':a>b?'你赢此行':'电脑赢此行';
        const band=element('div','match-score-row'+(row===revealed-1&&!totals?' active':''));
        band.style.setProperty('--effect-row',String(row));
        band.append(element('strong','',`${['上','中','下'][row]}行 · ${winner} · 力量 ${a} : ${b}`),element('span','',`实际计分 ${result.awards[row][0]} : ${result.awards[row][1]}`));root.append(band);
      }
      if(totals){const total=element('div','match-score-total',`${result.winner===null?'DRAW / 平局':result.winner===0?'VICTORY / 你赢了':'DEFEAT / 电脑获胜'} · ${result.scores.join(' : ')}`);root.append(total);}
    }
  }};
}
