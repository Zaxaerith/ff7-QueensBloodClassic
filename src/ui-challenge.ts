import {bossChallengers,findBossChallenger,type BossChallenger} from './boss-challengers.js';
import {byId} from './cards.js';
import {createCardView} from './card-view.js';
import {challengers,findChallenger,type Challenger,type ChallengerRegionId} from './challengers.js';
import {bossProfile,difficultyName,opponentName,opponentProfile,opponentRegionName} from './i18n/game-labels.js';
import {getLocale,t} from './i18n/index.js';
import type {PlayerProgress} from './progress.js';
import type {SfxCue} from './sfx.js';
import {$,button,element} from './ui-dom.js';
import type {CardVisual} from './visuals.js';

export type ChallengeOpponent = Challenger | BossChallenger;
type RegionFilter = 'all' | ChallengerRegionId | 'boss';

const REGION_ORDER: readonly ChallengerRegionId[] = [
  'kalm', 'under-junon', 'crows-nest', 'shinra-8',
  'costa-del-sol', 'corel', 'gongaga', 'cosmo-canyon', 'nibel',
];

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
  let activeFilter:RegionFilter='all';
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
      if(node.dataset.opponent!==undefined){
        node.setAttribute('aria-current',String(node.dataset.opponent===id));
      }
    });
    feature.dataset.challengeTier=boss?'boss':npc?.keeper?'keeper':'';
    const copy=element('div','challenge-copy');
    if(region)copy.append(element('p','challenge-region',region));
    copy.append(element('h3','challenge-name',name));
    if(tier||npc?.keeper){
      const badges=element('div','challenge-badges');
      if(tier)badges.append(element('p',boss?'challenge-tier challenge-tier--boss':'challenge-tier',tier));
      if(npc?.keeper){
        const keeperBadge=element('span','challenge-keeper-badge',`◆ ${t('keeperOfCruorBadge')}`);
        keeperBadge.dataset.keeper='true';
        badges.append(keeperBadge);
      }
      copy.append(badges);
    }
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
    const isDefeated=(opponentId:string)=>(progress?.challengers[opponentId]?.wins??0)>0;

    function option(entry?:ChallengeOpponent,extraClass='') {
      const key=entry?.id??'',label=entry?opponentName(entry.id,entry.name):t('mirrorPractice');
      const node=button(label,()=>{playSfx?.('confirm');select(key);prepare();},extraClass?`challenge-option ${extraClass}`:'challenge-option');
      node.dataset.opponent=key;
      if(entry&&'keeper' in entry&&entry.keeper){
        node.dataset.keeper='true';
        node.title=t('keeperOfCruorBadge');
      }
      const record=key?progress?.challengers[key]:undefined;
      if(record&&record.wins>0){
        node.dataset.cleared='true';
        node.dataset.wins=String(record.wins);
      }
      node.onfocus=()=>{if(key!==id){playSfx?.('cursor');select(key);}};
      return node;
    }

    const regions=new Map<ChallengerRegionId,Challenger[]>();
    for(const regionId of REGION_ORDER)regions.set(regionId,[]);
    for(const npc of challengers){
      const group=regions.get(npc.regionId)??[];
      group.push(npc);
      regions.set(npc.regionId,group);
    }

    const totalNamed=challengers.length+bossChallengers.length;
    const totalDefeated=challengers.filter(npc=>isDefeated(npc.id)).length+bossChallengers.filter(boss=>isDefeated(boss.id)).length;
    const bossDefeated=bossChallengers.filter(boss=>isDefeated(boss.id)).length;

    // Horizontal FF7 Classic region filter pill bar (no data-opponent attribute on tabs).
    const tabBar=element('div','challenge-region-tabs');
    tabBar.setAttribute('role','tablist');
    tabBar.setAttribute('aria-label',t('opponent'));

    const addTab=(filterKey:RegionFilter,label:string,defeated:number,total:number,extraClass='')=>{
      const active=activeFilter===filterKey;
      const tab=button(`${label} (${defeated}/${total})`,()=>{
        if(activeFilter===filterKey)return;
        activeFilter=filterKey;
        playSfx?.('cursor');
        if(filterKey==='boss'){
          if(!findBossChallenger(id))id=bossChallengers[0].id;
        }else if(filterKey!=='all'){
          const list=regions.get(filterKey)??[];
          if(list.length&&!list.some(npc=>npc.id===id))id=list[0].id;
        }
        refresh();
      },`challenge-region-tab${active?' is-active':''}${extraClass?' '+extraClass:''}`);
      tab.setAttribute('role','tab');
      tab.setAttribute('aria-selected',String(active));
      tab.dataset.regionFilter=filterKey;
      tabBar.append(tab);
    };

    addTab('all',t('challengeFilterAll'),totalDefeated,totalNamed);
    for(const regionId of REGION_ORDER){
      const entries=regions.get(regionId)??[];
      if(!entries.length)continue;
      const cleared=entries.filter(npc=>isDefeated(npc.id)).length;
      addTab(regionId,opponentRegionName(regionId),cleared,entries.length);
    }
    addTab('boss',t('bossChallengeSection'),bossDefeated,bossChallengers.length,'challenge-region-tab--boss');

    const visibleGroups:HTMLElement[]=[tabBar];
    for(const regionId of REGION_ORDER){
      if(activeFilter!=='all'&&activeFilter!==regionId)continue;
      const entries=regions.get(regionId)??[];
      if(!entries.length)continue;
      const cleared=entries.filter(npc=>isDefeated(npc.id)).length;
      const group=element('section','challenge-group');
      group.dataset.region=regionId;
      const heading=element('h3','',`${opponentRegionName(regionId)} (${cleared}/${entries.length})`);
      group.append(heading,...entries.map(npc=>option(npc)));
      visibleGroups.push(group);
    }

    if(activeFilter==='all'||activeFilter==='boss'){
      const bossGroup=element('section','challenge-group challenge-group--boss');
      bossGroup.dataset.region='boss';
      bossGroup.append(
        element('h3','',`${t('bossChallengeSection')} (${bossDefeated}/${bossChallengers.length})`),
        ...bossChallengers.map(boss=>option(boss,'challenge-option--boss')),
      );
      visibleGroups.push(bossGroup);
    }

    if(activeFilter==='all'){
      visibleGroups.push(option());
    }

    roster.replaceChildren(...visibleGroups);
    select(id);
  }

  return {
    refresh,
    focus(){roster.querySelector<HTMLElement>('button[aria-current=true]')?.focus({preventScroll:true});},
    opponent:()=>resolveOpponent(id),
  };
}
