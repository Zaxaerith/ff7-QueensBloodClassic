import {byId} from './cards.js';
import {cardStatus,type PlacedCard} from './engine.js';
import {createCardView} from './card-view.js';
import type {CardVisual} from './visuals.js';
import {fitTable} from './ui-table-layout.js';

export function placedCardView(placed:PlacedCard,visual:CardVisual){
  const markers=[...(placed.enhancedOnce?['首次强化已触发']:[]),...(placed.enfeebledOnce?['首次弱化已触发']:[]),...(placed.thresholds?.length?['阈值已触发']:[])];
  return createCardView(byId.get(placed.id)!,visual,{variant:'board',currentPower:placed.power,state:cardStatus(placed),markers});
}
/** Same portrait geometry for a live match and a separate read-only replay. */
export function observeTable(table:HTMLElement){
  function resize(){
    const rect=table.getBoundingClientRect();if(!rect.width||!rect.height)return;
    const css=getComputedStyle(table),number=(key:string)=>parseFloat(css.getPropertyValue(key));
    const fitted=fitTable({width:rect.width,height:rect.height,scoreWidth:number('--score-width'),scoreGap:number('--score-gap'),cellGap:number('--cell-gap')});
    table.parentElement!.style.setProperty('--table-span',(fitted.boardWidth+2*number('--score-width')+2*number('--score-gap'))+'px');
    for(const [key,value] of Object.entries(fitted))table.style.setProperty('--'+key.replace(/[A-Z]/g,c=>'-'+c.toLowerCase()),value+'px');
  }
  new ResizeObserver(resize).observe(table);window.addEventListener('resize',resize);
}
