import {bossChallengers,findBossChallenger,type BossChallenger} from './boss-challengers.js';
import {byId} from './cards.js';
import {createCardView} from './card-view.js';
import {challengers,findChallenger,type Challenger} from './challengers.js';
import {bossProfile,difficultyName,opponentName,opponentProfile,opponentRegionName} from './i18n/game-labels.js';
import {getLocale,t} from './i18n/index.js';
import type {PlayerProgress} from './progress.js';
import type {SfxCue} from './sfx.js';
import {$,button,element} from './ui-dom.js';
import type {CardVisual} from './visuals.js';

export type ChallengeOpponent = Challenger | BossChallenger;

const rewardLabel={
  'zh-CN':'关联卡','zh-TW':'關聯卡',en:'Associated card',ja:'関連カード',ko:'관련 카드',
  fr:'Carte associée',de:'Zugehörige Karte','es-ES':'Carta asociada','es-419':'Carta asociada',
  it:'Carta associata','pt-BR':'Carta associada',
} as const;

export function mountChallenge(
  prepare:()=>void,
  visual:(id:number)=>CardVisual,
  getProgress?:()=>PlayerProgress,
  playSfx?:(cue:SfxCue)=>void,
) {
  const roster=$('opponentRoster'), feature=$('challengeFeature');
  let id:string=challengers[0].id;
  const resolveOpponent=(key:string):ChallengeOpponent|undefined=>findChallenger(key)??findBossChallenger(key);

  function select(next:string) {
    id=next;
    const npc=findChallenger(id);
    const boss=npc?undefined:findBossChallenger(id);
    const profile=npc?opponentProfile(npc):null;
    const bossInfo=boss?bossProfile(boss):null;
    const name=bossInfo?.name??(npc?opponentName(npc.id,npc.name):t('mirrorPractice'));
    const region=bossInfo?.section??(npc?opponentRegionName(npc.regionId):'');
    const tier=bossInfo?.tier??profile?.tier;
    const description=bossInfo?.description??profile?.description??t('theComputerUsesTheSameDeckAsYou');
    $('prepOpponent').textContent=name;
    $('prepOpponentRegion').textContent=[region,tier].filter(Boolean).join(' · ');
    $('opponentInfo').textContent=description;
    roster.querySelectorAll<HTMLButtonElement>('button').forEach(node=>{
      node.setAttribute('aria-current',String(node.dataset.opponent===id));
    });
    feature.dataset.challengeTier=boss?'boss':'';
    const copy=element('div','challenge-copy');
    if(region)copy.append(element('p','challenge-region',region));
    copy.append(element('h3','challenge-name',name));
    if(tier)copy.append(element('p',boss?'challenge-tier challenge-tier--boss':'challenge-tier',tier));
    const record=id?getProgress?.().challengers[id]:undefined;
    if(record&&record.wins>0){
      const honor=element('div','honor-badge-row challenge-honor');
      const star=element('span','honor-badge honor-badge--cleared',`★ ${t('progressDefeated')}`);
      const stats=[t('progressWins',record.wins),t('progressBestScore',record.bestScore)];
      const topDifficulty=record.difficultiesCleared[record.difficultiesCleared.length-1];
      if(topDifficulty)stats.push(difficultyName(topDifficulty));
      honor.append(star,element('span','honor-meta',stats.join(' · ')));
      copy.append(honor);
    }
    const dossier=element('div','challenge-dossier');
    if(bossInfo){
      const notes=element('div','challenge-notes');
      notes.append(element('p','challenge-rule',bossInfo.ruleSummary),element('p','challenge-description',bossInfo.tactic));
      dossier.append(notes);
    }else dossier.append(element('p','challenge-description',description));
    const rewardId=boss?.rewardCardId??npc?.rewardCardId;
    const card=rewardId!==undefined?byId.get(rewardId):undefined;
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
    const progress=getProgress?.();
    function option(entry?:ChallengeOpponent,extraClass='') {
      const key=entry?.id??'',label=entry?opponentName(entry.id,entry.name):t('mirrorPractice');
      const node=button(label,()=>{playSfx?.('confirm');select(key);prepare();},extraClass?`challenge-option ${extraClass}`:'challenge-option');
      node.dataset.opponent=key;
      const record=key?progress?.challengers[key]:undefined;
      if(record&&record.wins>0){
        node.dataset.cleared='true';
        node.dataset.wins=String(record.wins);
      }
      node.onfocus=()=>{if(key!==id){playSfx?.('cursor');select(key);}};
      return node;
    }
    const regions=new Map<Challenger['regionId'],Challenger[]>();
    for(const npc of challengers){
      const group=regions.get(npc.regionId)??[];
      group.push(npc);regions.set(npc.regionId,group);
    }
    const bossGroup=element('section','challenge-group challenge-group--boss');
    bossGroup.append(element('h3','',t('bossChallengeSection')),...bossChallengers.map(boss=>option(boss,'challenge-option--boss')));
    roster.replaceChildren(...Array.from(regions,([region,entries])=>{
      const group=element('section','challenge-group'),heading=element('h3','',opponentRegionName(region));
      group.append(heading,...entries.map(npc=>option(npc)));
      return group;
    }),bossGroup,option());
    select(id);
  }

  return {
    refresh,
    focus(){roster.querySelector<HTMLElement>('button[aria-current=true]')?.focus({preventScroll:true});},
    opponent:()=>resolveOpponent(id),
  };
}
