import {getLocale,t} from './i18n/index.js';
import {displayName} from './i18n/card-names.js';
import {describeAbilities} from './i18n/abilities.js';
import type {Card} from './cards.js';
import {cardHasAbility,cardPatternCells,createCardDetails} from './card-view.js';
import {element,button} from './ui-dom.js';
import '../site/hand-focus.css';

export function focusCaption(card:Card|undefined,selected:Card|undefined,locked:boolean):string {
  if(locked)return t("resolvingTheMove");
  if(!card)return t("browseYourHandClickOrPressEnterTo");
  if(selected&&selected.id!==card.id)return t("otherCardPreview", displayName(selected.id,selected.name));
  return selected?t("cardSelectedChooseATileThenConfirm"):t("clickACardToSelectItForPlay");
}
export function rangeNote(card:Card):string {
  return cardHasAbility(card)&&!cardPatternCells(card).some(c=>c.effect)
    ?t("seeTheAbilityDescriptionForReplacementGlobalConditional")
    :t("aRedOutlineShowsTheAbilitysRangeCheck");
}
export function mountHandFocus(host:HTMLElement,showCard:(id:number)=>void){
  const panel=element('aside','hand-focus'),caption=element('p','hand-focus-caption');
  panel.id='handFocus';panel.setAttribute('aria-label',t("selectedHandCardInformation"));
  caption.id='handFocusCaption';caption.setAttribute('aria-live','polite');
  const body=element('div','hand-focus-body'),empty=element('p','hand-focus-empty',t("browseOrSelectAHandCardToSee"));
  body.append(empty);
  const more=button(t("fullDetails"),()=>{if(current)showCard(current.id);});more.dataset.focus='hand-focus-details';
  const key=element('p','hand-focus-key',t("whitePlacementYellowTerritoryRedOutlineAbilityRange"));
  panel.append(caption,body,key,more);host.append(panel);
  let current:Card|undefined;
  let renderedLocale: string;
  return {update(card:Card|undefined,selected:Card|undefined,locked:boolean){
    panel.setAttribute('aria-label',t('selectedHandCardInformation'));empty.textContent=t('browseOrSelectAHandCardToSee');more.textContent=t('fullDetails');key.textContent=t('whitePlacementYellowTerritoryRedOutlineAbilityRange');
    const locale=getLocale();
    caption.textContent=focusCaption(card,selected,locked);panel.dataset.selected=String(!!selected&&card?.id===selected.id);
    if(card!==current||renderedLocale!==locale){
      current=card;renderedLocale=locale;body.replaceChildren();panel.scrollTop=0;
      if(card){
        const detail=createCardDetails(card);detail.setAttribute('aria-label',t("handCardDetails"));
        if(card.placement==='replace')detail.querySelector('dd')!.textContent=t("replaceAnAlliedCard");
        const note=element('p','hand-focus-range',rangeNote(card));
        detail.append(note);
        const summary=card.placement==='replace'?t('replacementHelp'):describeAbilities(card,locale)[0]??'';
        body.append(detail,element('p','frame-hand-ability',summary));
      }else body.append(empty);
    }
    more.disabled=!card;panel.dataset.cardId=card?String(card.id):'';
  }};
}
