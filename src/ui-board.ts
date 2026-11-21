import {t} from './i18n/index.js';
import {byId} from './cards.js';
import {cardStatus,type PlacedCard} from './engine.js';
import {createCardView} from './card-view.js';
import type {CardVisual} from './visuals.js';
import {fitTable} from './ui-table-layout.js';
import {element} from './ui-dom.js';

export function boardPawns(owner:0|1|null,count:number){
  const group=element('span','frame-pawns');
  group.setAttribute('aria-hidden','true');
  if(owner===null)group.classList.add('empty');
  else for(let i=0;i<count;i++)group.append(element('i','frame-pawn'));
  return group;
}

export function placedCardView(placed:PlacedCard,visual:CardVisual){
  const markers=[...(placed.enhancedOnce?[t("firstEnhancementTriggered")]:[]),...(placed.enfeebledOnce?[t("firstEnfeeblementTriggered")]:[]),...(placed.thresholds?.length?[t("thresholdTriggered")]:[])];
  return createCardView(byId.get(placed.id)!,visual,{variant:'board',currentPower:placed.power,state:cardStatus(placed),markers});
}
/** Same portrait geometry for a live match and a separate read-only replay. */
export function observeTable(table:HTMLElement){
  const scores=table.querySelector<HTMLElement>('.lane-scores')!;
  const board=table.querySelector<HTMLElement>('.board')!;
  function resize(){
    const rect=table.getBoundingClientRect();if(!rect.width||!rect.height)return;
    const style=getComputedStyle(table),scoreWidth=scores.getBoundingClientRect().width;
    const scoreGap=parseFloat(style.columnGap),cellGap=parseFloat(getComputedStyle(board).columnGap);
    const ratio=parseFloat(style.getPropertyValue('--frame-cell-ratio'));
    const width=Math.max(0,rect.width-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight));
    const height=Math.max(0,rect.height-parseFloat(style.paddingTop)-parseFloat(style.paddingBottom));
    const fitted=fitTable({width,height,scoreWidth,scoreGap,cellGap,...(ratio>0?{cellRatio:ratio}:{})});
    table.parentElement!.style.setProperty('--table-span',(fitted.boardWidth+2*scoreWidth+2*scoreGap)+'px');
    for(const [key,value] of Object.entries(fitted))table.style.setProperty('--'+key.replace(/[A-Z]/g,c=>'-'+c.toLowerCase()),value+'px');
  }
  new ResizeObserver(resize).observe(table);window.addEventListener('resize',resize);
}
