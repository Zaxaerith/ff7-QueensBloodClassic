// Non-modal composition of the existing Classic Frame details, never Game state.
import type {Card} from './cards.js';
import {cardHasAbility,cardPatternCells,createCardDetails} from './card-view.js';
import {element,button} from './ui-dom.js';
import '../site/hand-focus.css';

export function focusCaption(card:Card|undefined,selected:Card|undefined,locked:boolean):string {
  if(locked)return '展示中 · 暂不可选牌';
  if(!card)return '浏览手牌，点击或按 Enter 选牌';
  if(selected&&selected.id!==card.id)return `浏览中 · 棋盘仍预览已选 ${selected.name}`;
  return selected?'已选手牌 · 选格后确认':'浏览中 · 点击手牌准备出牌';
}
export function rangeNote(card:Card):string {
  return cardHasAbility(card)&&!cardPatternCells(card).some(c=>c.effect)
    ?'无局部红格；替换、全局、条件或计分规则以能力说明为准。'
    :'红框仅表示能力范围；是否生效取决于目标与触发条件。';
}
export function mountHandFocus(host:HTMLElement,showCard:(id:number)=>void){
  const panel=element('aside','hand-focus'),caption=element('p','hand-focus-caption');
  panel.id='handFocus';panel.setAttribute('aria-label','当前浏览手牌信息');
  caption.id='handFocusCaption';caption.setAttribute('aria-live','polite');
  const body=element('div','hand-focus-body'),empty=element('p','hand-focus-empty','浏览或选择手牌，在这里查看放置等级、力量、格型和能力。');
  body.append(empty);
  const more=button('完整资料',()=>{if(current)showCard(current.id);});more.dataset.focus='hand-focus-details';
  const key=element('p','hand-focus-key','白：放置点 · 黄：占格 · 红框：能力范围');
  panel.append(caption,body,key,more);host.append(panel);
  let current:Card|undefined;
  return {update(card:Card|undefined,selected:Card|undefined,locked:boolean){
    caption.textContent=focusCaption(card,selected,locked);panel.dataset.selected=String(!!selected&&card?.id===selected.id);
    if(card!==current){
      current=card;body.replaceChildren();panel.scrollTop=0;
      if(card){
        const detail=createCardDetails(card);detail.setAttribute('aria-label','手牌即时说明');
        if(card.placement==='replace')detail.querySelector('dd')!.textContent='替换己方牌';
        detail.querySelector<HTMLElement>('.qb-description')!.title=card.description;
        const note=element('p','hand-focus-range',rangeNote(card));
        detail.append(note);body.append(detail);
      }else body.append(empty);
    }
    more.disabled=!card;panel.dataset.cardId=card?String(card.id):'';
  }};
}
