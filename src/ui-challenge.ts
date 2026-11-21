import {byId} from './cards.js';
import {createCardView} from './card-view.js';
import {challengers,findChallenger,type Challenger} from './challengers.js';
import {opponentName,opponentProfile,opponentRegionName} from './i18n/game-labels.js';
import {getLocale,t} from './i18n/index.js';
import {$,button,element} from './ui-dom.js';
import type {CardVisual} from './visuals.js';

const rewardLabel={
  'zh-CN':'关联卡','zh-TW':'關聯卡',en:'Associated card',ja:'関連カード',ko:'관련 카드',
  fr:'Carte associée',de:'Zugehörige Karte','es-ES':'Carta asociada','es-419':'Carta asociada',
  it:'Carta associata','pt-BR':'Carta associada',
} as const;

export function mountChallenge(prepare:()=>void, visual:(id:number)=>CardVisual) {
  const roster=$('opponentRoster'), feature=$('challengeFeature');
  let id=challengers[0].id;

  function select(next:string) {
    id=next;
    const npc=findChallenger(id);
    const profile=npc?opponentProfile(npc):null;
    const name=npc?opponentName(npc.id,npc.name):t('mirrorPractice');
    const region=npc?opponentRegionName(npc.regionId):'';
    const description=profile?.description??t('theComputerUsesTheSameDeckAsYou');
    $('prepOpponent').textContent=name;
    $('prepOpponentRegion').textContent=[region,profile?.tier].filter(Boolean).join(' · ');
    $('opponentInfo').textContent=description;
    roster.querySelectorAll<HTMLButtonElement>('button').forEach(node=>{
      node.setAttribute('aria-current',String(node.dataset.opponent===id));
    });
    const copy=element('div','challenge-copy');
    if(region)copy.append(element('p','challenge-region',region));
    copy.append(element('h3','challenge-name',name));
    if(profile)copy.append(element('p','challenge-tier',profile.tier));
    const dossier=element('div','challenge-dossier');
    dossier.append(element('p','challenge-description',description));
    const card=npc?byId.get(npc.rewardCardId):undefined;
    const emblem=element('figure','challenge-emblem'),prepCard=$('prepReward');
    prepCard.replaceChildren();
    prepCard.hidden=!card;
    if(card){
      const label=rewardLabel[getLocale()];
      emblem.append(element('figcaption','',label),createCardView(card,visual(card.id)));
      dossier.append(emblem);
      prepCard.append(element('figcaption','',label),createCardView(card,visual(card.id),{variant:'hand'}));
    }
    dossier.classList.toggle('has-card',Boolean(card));
    feature.replaceChildren(copy,dossier);
  }

  function refresh() {
    function option(npc?:Challenger) {
      const key=npc?.id??'',label=npc?opponentName(npc.id,npc.name):t('mirrorPractice');
      const entry=button(label,()=>{select(key);prepare();},'challenge-option');
      entry.dataset.opponent=key;
      entry.onfocus=()=>{if(key!==id)select(key);};
      return entry;
    }
    const regions=new Map<Challenger['regionId'],Challenger[]>();
    for(const npc of challengers){
      const group=regions.get(npc.regionId)??[];
      group.push(npc);regions.set(npc.regionId,group);
    }
    roster.replaceChildren(...Array.from(regions,([region,entries])=>{
      const group=element('section','challenge-group'),heading=element('h3','',opponentRegionName(region));
      group.append(heading,...entries.map(option));
      return group;
    }),option());
    select(id);
  }

  return {
    refresh,
    focus(){roster.querySelector<HTMLElement>('button[aria-current=true]')?.focus({preventScroll:true});},
    opponent:()=>findChallenger(id),
  };
}
