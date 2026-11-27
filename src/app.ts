import {getLocale,localizePage,setLocale,t} from './i18n/index.js';
import {isLocale,localeLabels,locales,resolveLocale} from './i18n/locales.js';
import {bloodRankTitle,deckLabel,difficultyName,opponentName,presetName,recordedDeckLabel,seedLabel,survivalChallengeTitle} from './i18n/game-labels.js';
import {shadowbloodQueen} from './boss-challengers.js';
import {challengers} from './challengers.js';
import {goldSaucerChallenges,survivalChallenges} from './gold-saucer-catalog.js';
import {puzzleCatalog} from './puzzle-catalog.js';
import {getCardVisual} from './visuals.js';
import {loadVisualPack} from './visual-pack.js';
import {mountArtImport} from './ui-art-import.js';
import {refreshRenderedArtwork} from './browser-art.js';
import {deckPresets} from './cards.js';
import {mountChallenge} from './ui-challenge.js';
import {mountMatch} from './ui-match.js';
import {mountLibrary} from './ui-library.js';
import {mountReplay} from './ui-replay.js';
import {mountCarnival} from './ui-carnival.js';
import {mountGoldSaucer} from './ui-gold-saucer.js';
import {mountTournament} from './ui-tournament.js';
import {carnivalMessages} from './i18n/carnival.js';
import {MatchHistory,readActive,writeActive} from './match-archive.js';
import {
  computeBloodRank,progressSummary,readProgress,writeProgress,recordChallengerResult,
  recordCarnivalClear,recordGoldSaucerWin,recordSurvivalRun,recordTournamentRun,
  type PlayerProgress,type SurvivalRank,
} from './progress.js';
import {STORAGE,readDecks,readConfig,readAudioConfig,safeRead,safeWrite,libraryEntries,presetDeck,libraryRuleSummary,type StoragePort,type DeckStore,type SavedDeck} from './ui-data.js';
import {$,element,button,options,initDialog,openDialog,closeDialog,notice,downloadJson} from './ui-dom.js';
import {startMatch,rulesLabel,type MatchSettings} from './match-flow.js';
import {createAudioController} from './audio-controller.js';

type Route='home'|'prepare'|'game'|'decks'|'collection'|'records'|'config'|'replay'|'carnival'|'gold-saucer'|'tournament';
const routes:Route[]=['home','prepare','game','decks','collection','records','config','replay','carnival','gold-saucer','tournament'];
let route:Route='home',resolveVisual=getCardVisual,entries=libraryEntries(null),storage:StoragePort|null=null;
let deckReturn:'home'|'prepare'='home';
let replayReturnId:string|undefined;
try{storage=window.localStorage;}catch{}
const browserLocale=()=>resolveLocale(navigator.languages?.length?navigator.languages:[navigator.language]);
setLocale(browserLocale());
const configRead=safeRead(storage,STORAGE.config);let config=readConfig(configRead.raw);
if(config.locale)setLocale(config.locale);
const stored=safeRead(storage,STORAGE.decks),loaded=readDecks(stored.raw);
let decks=loaded.data,recoveryRaw=loaded.issues.length?stored.raw:null;
const history=new MatchHistory(storage),activeSave=readActive(storage);let slotPresent=activeSave.present;
const progressRead=readProgress(storage);
let progress:PlayerProgress=progressRead.data,progressRecoveryRaw=progressRead.corrupted?progressRead.raw:null;
function updateBloodRankBadge(){
  const badge=$('bloodRankBadge');
  const rank=computeBloodRank(progress);
  const label=t('bloodRankLabel',rank.rank,bloodRankTitle(rank.key));
  badge.textContent=label;
  badge.dataset.rank=String(rank.rank);
  badge.setAttribute('aria-label',`${t('bloodRankDossier')} · ${label}`);
  badge.hidden=route==='game'||route==='replay';
}
function openHunterDossier(){
  audio.playSfx('confirm');
  const summary=progressSummary(progress);
  const rank=summary.bloodRank;
  const content=element('div','hunter-dossier');

  const crest=element('div','dossier-crest');
  crest.dataset.rank=String(rank.rank);
  const crestTitle=element('strong','dossier-rank-title',t('bloodRankLabel',rank.rank,bloodRankTitle(rank.key)));
  const crestSub=element('p','muted',rank.isMaxRank
    ?t('bloodRankMax')
    :t('bloodRankPoints',rank.points,rank.winsToNextRank));
  const meter=element('progress','dossier-progress');
  meter.max=rank.isMaxRank?1:Math.max(1,(rank.nextThreshold??rank.points)-rank.currentThreshold);
  meter.value=rank.isMaxRank?1:Math.max(0,rank.points-rank.currentThreshold);
  crest.append(crestTitle,crestSub,meter);

  const grid=element('div','dossier-grid');
  const npcWins=challengers.filter(npc=>(progress.challengers[npc.id]?.wins??0)>0).length;

  // 1. World Tour + Shadowblood Queen
  const worldCard=element('section','dossier-card');
  worldCard.append(
    element('h3','',t('dossierWorldTour')),
    element('p','dossier-stat',t('dossierProgressRatio',npcWins,challengers.length)),
    element('p',summary.bossDefeated?'honor-badge honor-badge--cleared':'muted',
      `${summary.bossDefeated?'★ ':''}${t('dossierQueenBadge')} · ${t(summary.bossDefeated?'dossierUnlocked':'dossierNotYet')}`),
  );

  // 2. Shinra-8 Cruise Tournament + Red XIII Exhibition
  const tourneyCard=element('section','dossier-card');
  tourneyCard.append(
    element('h3','',t('dossierTournament')),
    element('p','dossier-stat',t('tournamentChampionshipCount',summary.tournamentChampionships)),
    element('p',summary.tournamentExhibitionCleared?'honor-badge tourney-exhibition-badge':'muted',
      `${summary.tournamentExhibitionCleared?'★ ':''}${t('tournamentExhibitionBadge')} · ${t(summary.tournamentExhibitionCleared?'dossierUnlocked':'dossierNotYet')}`),
  );

  // 3. Card Carnival Puzzles
  const carnivalCard=element('section','dossier-card');
  carnivalCard.append(
    element('h3','',t('dossierCarnival')),
    element('p','dossier-stat',t('dossierProgressRatio',summary.carnivalCleared,puzzleCatalog.length)),
  );

  // 4. Gold Saucer Single Challenges & 3 Survival Medals
  const gsCard=element('section','dossier-card');
  gsCard.append(
    element('h3','',t('dossierGoldSaucer')),
    element('p','dossier-stat',t('dossierProgressRatio',summary.goldSaucerCleared,goldSaucerChallenges.length)),
  );
  const medalRow=element('div','honor-badge-row');
  const medalKey:Record<SurvivalRank,'medalBronze'|'medalSilver'|'medalGold'>={bronze:'medalBronze',silver:'medalSilver',gold:'medalGold'};
  for(const surv of survivalChallenges){
    const best=progress.survival[surv.id]?.bestRank??null;
    const tag=element('span',best?'survival-medal':'muted',
      `${survivalChallengeTitle(surv.id)}: ${best?t(medalKey[best]):t('dossierNotYet')}`);
    if(best)tag.dataset.rank=best;
    medalRow.append(tag);
  }
  gsCard.append(medalRow);

  grid.append(worldCard,tourneyCard,carnivalCard,gsCard);
  content.append(crest,grid);
  openDialog(t('bloodRankDossier'),content);
}
function updateProgress(updater:(current:PlayerProgress)=>PlayerProgress){
  const next=updater(progress);
  if(next===progress)return;
  progress=next;
  const error=writeProgress(storage,progress,progressRecoveryRaw);
  if(!error)progressRecoveryRaw=null;
  updateBloodRankBadge();
}
let selectedDeck:SavedDeck=decks.decks.find(d=>d.id===decks.selectedId)??presetDeck();
initDialog();
function saveDecks(next:DeckStore){
  const error=safeWrite(storage,STORAGE.decks,next,recoveryRaw);if(error){notice(error);return false;}
  // Saved selections follow edits to that record. A preset or a draft chosen
  // for this session owns its own copy and stays selected until explicitly changed.
  if(decks.decks.includes(selectedDeck))selectedDeck=next.decks.find(d=>d.id===selectedDeck.id)??presetDeck();
  decks=next;recoveryRaw=null;return true;
}
function homeSummary(){
  const resume=$('resumeGame'),unfinished=match.unfinished();
  $('resumeMatch').hidden=!match.hasMatch()&&!activeSave.error;
  resume.hidden=!match.hasMatch();
  resume.textContent=unfinished?t("resumeGame"):t("viewLastResult");
  const rules=match.rulesVersion();
  $('continueInfo').textContent=activeSave.error&&!rules?readActive(storage).error:rules?`${unfinished?t("continueGame"):t("lastResult")} · ${rulesLabel(rules)}。`:t("turnDrawHint");
  $('continueInfo').title=rules??'';
}
function chooseDeck(deck:SavedDeck){
  const savedDeck=decks.decks.find(d=>d.id===deck.id&&d.name===deck.name&&JSON.stringify(d.cards)===JSON.stringify(deck.cards));
  selectedDeck=savedDeck??{...deck,cards:[...deck.cards]};
  const selectedId=savedDeck?.id??null;
  const saved=saveDecks({...decks,selectedId});
  if(route==='decks'){
    navigate(deckReturn);
    if(saved)notice(t("deckSelected", deckLabel(deck), selectedId?'':t("saveDeckForNextSession")));
  }else library.showHomeDeck(selectedDeck);
}
const library=mountLibrary({entries:()=>entries,visual:id=>resolveVisual(id),decks:()=>decks,save:saveDecks,choose:chooseDeck});
const audio=createAudioController();
const challenge=mountChallenge(()=>navigate('prepare'),id=>resolveVisual(id),()=>progress,cue=>audio.playSfx(cue));
const audioConfig=readAudioConfig(safeRead(storage,STORAGE.audio).raw);
audio.setVolume('bgm',audioConfig.bgmVolume);
audio.setMuted('bgm',audioConfig.bgmMuted);
audio.setVolume('sfx',audioConfig.sfxVolume);
audio.setMuted('sfx',audioConfig.sfxMuted);
{
  const activateAudio=(event:Event)=>{
    if(event.isTrusted&&!document.hidden)void audio.activateSfxFromGesture();
  };
  for(const type of ['click','keydown','touchend'])document.addEventListener(type,activateAudio,{capture:true});
  const settingsAudio=$('audioSettings');
  const controls=$('audioSettingsControls');
  settingsAudio.hidden=false;
  const saveAudio=()=>{
    const message=t(safeWrite(storage,STORAGE.audio,audioConfig)?'settingsStorageError':'settingsSaved');
    if($('appNotice').textContent!==message)notice(message);
  };
  function bindAudioControls(root:HTMLElement,onUpdate?:()=>void){
    const bgmGroup=root.querySelector<HTMLElement>('[data-bgm-group]');
    const bgmNote=root.querySelector<HTMLElement>('[data-bgm-unavailable]');
    const bgmVolume=root.querySelector<HTMLInputElement>('[data-bgm-volume]');
    const bgmReadout=root.querySelector<HTMLElement>('[data-bgm-level]');
    const bgmMute=root.querySelector<HTMLInputElement>('[data-bgm-mute]');
    const sfxVolume=root.querySelector<HTMLInputElement>('[data-sfx-volume]');
    const sfxReadout=root.querySelector<HTMLElement>('[data-sfx-level]');
    const sfxMute=root.querySelector<HTMLInputElement>('[data-sfx-mute]');
    if(bgmGroup)bgmGroup.hidden=!audio.hasAudio;
    if(bgmNote)bgmNote.hidden=audio.hasAudio;
    const refresh=()=>{
      if(bgmVolume)bgmVolume.value=String(audioConfig.bgmVolume);
      if(bgmReadout)bgmReadout.textContent=audioConfig.bgmVolume+'%';
      if(bgmMute)bgmMute.checked=audioConfig.bgmMuted;
      if(sfxVolume)sfxVolume.value=String(audioConfig.sfxVolume);
      if(sfxReadout)sfxReadout.textContent=audioConfig.sfxVolume+'%';
      if(sfxMute)sfxMute.checked=audioConfig.sfxMuted;
    };
    if(bgmVolume)bgmVolume.oninput=()=>{
      audioConfig.bgmVolume=bgmVolume.valueAsNumber;
      audio.setVolume('bgm',audioConfig.bgmVolume);
      refresh();
      onUpdate?.();
      saveAudio();
    };
    if(bgmMute)bgmMute.onchange=()=>{
      audioConfig.bgmMuted=bgmMute.checked;
      audio.setMuted('bgm',audioConfig.bgmMuted);
      onUpdate?.();
      saveAudio();
    };
    if(sfxVolume)sfxVolume.oninput=()=>{
      audioConfig.sfxVolume=sfxVolume.valueAsNumber;
      audio.setVolume('sfx',audioConfig.sfxVolume);
      refresh();
      audio.playSfx('cursor');
      onUpdate?.();
      saveAudio();
    };
    if(sfxMute)sfxMute.onchange=()=>{
      audioConfig.sfxMuted=sfxMute.checked;
      audio.setMuted('sfx',audioConfig.sfxMuted);
      if(!audioConfig.sfxMuted)audio.playSfx('cursor');
      onUpdate?.();
      saveAudio();
    };
    refresh();
    return refresh;
  }
  const refreshSettings=bindAudioControls(controls);
  const matchAudioButton=$<HTMLButtonElement>('matchAudioSettings');
  matchAudioButton.hidden=false;
  matchAudioButton.onclick=()=>{
    audio.playSfx('confirm');
    const content=controls.cloneNode(true) as HTMLElement;
    content.removeAttribute('id');
    bindAudioControls(content,refreshSettings);
    openDialog(t('audioSettings'),content);
  };
}
const match=mountMatch({visual:id=>resolveVisual(id),showCard:library.showCard,menu:()=>navigate('home'),
  audio:{controller:audio,visible:()=>route==='game'&&!document.hidden},
  hasCheckpoint:()=>slotPresent,checkpoint:save=>{
  const error=writeActive(storage,save);if(!error)slotPresent=true;return error;
},completed:save=>{
  const error=history.add(save);if(error)return error;
  const npcId=save.settings.opponent?.npcId;
  const archived=history.records.find(r=>r.id===save.id);
  if(npcId&&archived){
    const [p0,p1]=archived.scores;
    const winner=p0>p1?0:p1>p0?1:null;
    updateProgress(cur=>recordChallengerResult(cur,npcId,save.settings.difficulty,p0,p1,winner));
  }
  const clearError=writeActive(storage,null);if(!clearError)slotPresent=false;return clearError;
}});
if(activeSave.restored)match.restore(activeSave.restored);
const replay=mountReplay({visual:id=>resolveVisual(id),showCard:library.showCard,exit:()=>navigate('records')});
function applyArtwork(resolve:typeof getCardVisual){
  resolveVisual=resolve;
  refreshRenderedArtwork(document,resolveVisual);
}
const artImport=import.meta.env.MODE==='private'?null:mountArtImport($('view-config').querySelector<HTMLElement>('.window')!,applyArtwork);
let carnival:ReturnType<typeof mountCarnival>|undefined;
let goldSaucer:ReturnType<typeof mountGoldSaucer>|undefined;
let tournament:ReturnType<typeof mountTournament>|undefined;
function navigate(next:Route){
  const previous=route;
  if(route==='carnival'&&next!=='carnival')carnival?.leave();
  if(route==='gold-saucer'&&next!=='gold-saucer')goldSaucer?.leave();
  if(route==='tournament'&&next!=='tournament')tournament?.leave();
  if(route==='replay'&&next!=='replay')replay.cancel();
  if(route==='game'&&next!=='game')match.pause();
  if(next==='decks'&&route!=='decks')deckReturn=route==='prepare'?'prepare':'home';
  route=next;
  $('app').dataset.view=next;
  for(const name of routes)$('view-'+name).hidden=name!==next;
  $('mainNav').hidden=next==='game'||next==='replay';$('backMenu').hidden=next==='home';
  updateBloodRankBadge();
  document.querySelectorAll<HTMLButtonElement>('[data-route]').forEach(node=>{if(node.dataset.route===(next==='prepare'?'home':next))node.setAttribute('aria-current','page');else node.removeAttribute('aria-current');});
  if(next==='home'){challenge.refresh();homeSummary();}if(next==='prepare')library.showHomeDeck(selectedDeck);if(next==='decks')library.showDecks();if(next==='collection')library.showCollection();if(next==='records')renderRecords();if(next==='game')match.resume();if(next==='replay')replay.refresh();
  if(next==='carnival'){
    carnival??=mountCarnival($('view-carnival'),{
      visual:id=>resolveVisual(id),showCard:library.showCard,
      audio:{controller:audio,visible:()=>route==='carnival'&&!document.hidden},
      progress:{get:()=>progress,recordClear:(id,p0,p1)=>updateProgress(cur=>recordCarnivalClear(cur,id,p0,p1))},
    });
    carnival.showList();
  }else if(next==='gold-saucer'){
    goldSaucer??=mountGoldSaucer($('view-gold-saucer'),{
      visual:id=>resolveVisual(id),
      showCard:library.showCard,
      deck:()=>selectedDeck,
      storage,
      editDeck:()=>{navigate('decks');library.editDeck(selectedDeck);},
      audio:{controller:audio,visible:()=>route==='gold-saucer'&&!document.hidden},
      progress:{
        get:()=>progress,
        recordWin:(id,p0,p1)=>updateProgress(cur=>recordGoldSaucerWin(cur,id,p0,p1)),
        recordSurvival:(id,status,score,rounds)=>updateProgress(cur=>recordSurvivalRun(cur,id,status,score,rounds)),
      },
    });
    goldSaucer.showList();
  }else if(next==='tournament'){
    tournament??=mountTournament($('view-tournament'),{
      visual:id=>resolveVisual(id),
      showCard:library.showCard,
      deck:()=>selectedDeck,
      storage,
      editDeck:()=>{navigate('decks');library.editDeck(selectedDeck);},
      audio:{controller:audio,visible:()=>route==='tournament'&&!document.hidden},
      progress:{
        get:()=>progress,
        recordRun:run=>updateProgress(cur=>recordTournamentRun(cur,run)),
      },
    });
    tournament.showLobby();
  }else if(next==='home')challenge.focus();
  else if(next==='prepare'){
    const start=$<HTMLButtonElement>('startGame');
    const target=previous==='decks'?$('changeDeck'):start.disabled?$('prepareDeckBank').querySelector<HTMLElement>('[aria-pressed=true]'):start;
    (target??$('prepOpponent')).focus({preventScroll:true});
  }
  else if(next==='replay'){
    ($('view-replay').querySelector<HTMLElement>('#replayNext:not(:disabled)')??$('replayExit')).focus({preventScroll:true});
  }
  else if(next==='records'&&previous==='replay'&&replayReturnId){
    const opener=$('recordList').querySelector<HTMLElement>(`[data-record-id="${CSS.escape(replayReturnId)}"] [data-open-replay]`);
    (opener??$('view-records').querySelector<HTMLElement>('.view-title'))?.focus();
    return;
  }
  else document.querySelector<HTMLElement>(`#view-${next} .view-title`)?.focus({preventScroll:true});
  window.scrollTo(0,0);
}
function renderRecords(){
  const root=$('recordList');root.replaceChildren();
  for(const [index,record] of history.records.entries()){
    const [a,b]=record.scores,row=element('li','record-row'),rules=history.rulesVersion(record.id);
    row.dataset.recordId=record.id;
    row.dataset.result=a===b?'draw':a>b?'win':'loss';
    const score=element('div','record-score');
    score.append(element('span','record-outcome',a===b?t("draw"):a>b?t("victory"):t("defeat")),element('strong','',`${a} : ${b}`));
    const replayStatus=element('span','muted record-status',rules?t("replayAvailable", rulesLabel(rules)):t("recordSummaryOnly"));
    if(rules)replayStatus.title=rules;
    const deck=recordedDeckLabel(record.deckName,history.startingDeck(record.id));
    const time=element('time','',new Date(record.date).toLocaleString(getLocale()));
    time.dateTime=record.date;
    const info=element('div','record-info'),meta=element('div','record-meta');
    let opponentLabel=t("computer");
    if(rules){
      try{
        const archived=history.replay(record.id);
        if(archived.version===2&&archived.position?.board?.some(tile=>tile.owner===1&&tile.cardId===shadowbloodQueen.rewardCardId)){
          opponentLabel=`${t("bossBattleBanner")} · ${opponentName(shadowbloodQueen.id,shadowbloodQueen.name)}`;
        }
      }catch{}
    }
    info.append(element('h3','',`${opponentLabel} · ${difficultyName(record.difficulty)}`),time,element('p','muted',deck));
    meta.append(replayStatus,element('span','muted',`${seedLabel()} ${record.seed}`));
    const open=button(t("openReplay"),()=>{try{replay.open(history.replay(record.id));replayReturnId=record.id;navigate('replay');}catch{notice(t("replayIntegrityFailed"));}});
    open.disabled=!rules;open.dataset.openReplay='';
    const actions=element('div','record-actions'),secondary=element('div','record-secondary');
    secondary.append(button(rules?t("exportReplayJson"):t("exportSummary"),()=>{try{downloadJson(rules?history.replay(record.id):record,`queens-blood-${record.seed}.json`);}catch{notice(t("replayExportFailed"));}}),button(t("delete"),()=>{
      const content=element('div');
      content.append(element('p','',t("deleteThisResultAndItsCompleteReplay")),button(t("cancel"),closeDialog),button(t("confirmDeletion"),()=>{
        const error=history.remove(record.id);closeDialog();
        if(error){notice(error);return;}
        renderRecords();
        const adjacent=root.children[Math.min(index,history.records.length-1)];
        (adjacent?.querySelector<HTMLElement>('button:not(:disabled)')??$('view-records').querySelector<HTMLElement>('.view-title'))?.focus();
      },'danger'));
      openDialog(t("deleteMatchRecord"),content);
    }));
    actions.append(open,secondary);
    row.append(score,info,meta,actions);
    root.append(row);
  }
  if(!history.records.length)root.append(element('li','empty',t("emptyRecordList")));
}
function applyConfig(){
  document.documentElement.dataset.density=config.density;
  document.documentElement.dataset.textSize=config.textSize;
  document.documentElement.dataset.reduceMotion=String(config.reduceMotion);
  document.documentElement.dataset.classicBanter=String(config.classicBanter);
  document.documentElement.dataset.crt=String(config.crtFilter);
}
document.querySelectorAll<HTMLButtonElement>('[data-route]').forEach(node=>{
  node.onclick=()=>{audio.playSfx('confirm');navigate(node.dataset.route as Route);};
  node.onfocus=()=>{audio.playSfx('cursor');};
});
$('backMenu').onclick=()=>{
  audio.playSfx('cancel');
  if(route==='replay')$('replayExit').click();
  else navigate(route==='decks'?deckReturn:'home');
};
$('changeDeck').onclick=()=>{audio.playSfx('confirm');navigate('decks');library.editDeck(selectedDeck);};
$('resumeGame').onclick=()=>{audio.playSfx('confirm');navigate('game');};
$('deckBack').onclick=()=>{audio.playSfx('cancel');navigate(deckReturn);};
$('dialogClose').addEventListener?.('click',()=>audio.playSfx('cancel'));
const localeSelect=$<HTMLSelectElement>('locale');
function refreshLocalizedPage(){
  document.documentElement.lang=getLocale();
  localizePage(document);
  $('carnivalNav').textContent=carnivalMessages().title;
  options(localeSelect,[['',t('systemLanguage')],...locales.map(value=>[value,localeLabels[value]] as const)]);
  for(const option of Array.from(localeSelect.options))if(isLocale(option.value))option.lang=option.value;
  localeSelect.value=config.locale??'';
  challenge.refresh();
  const preset=$<HTMLSelectElement>('advancedPreset'),selection=preset.value;
  options(preset,deckPresets.map((_,i)=>[String(i),presetName(i)]));
  preset.value=selection||'0';
  library.localize();
  match.refresh();
  if(route==='records')renderRecords();
  if(route==='replay')replay.refresh();
  if(route==='gold-saucer')goldSaucer?.localize();
  if(route==='tournament')tournament?.localize();
  updateBloodRankBadge();
  artImport?.localize();
}
$('bloodRankBadge').onclick=openHunterDossier;
$('startGame').onclick=()=>{
  const input=$<HTMLInputElement>('seed'),seed=input.value.trim()?Number(input.value):Date.now()>>>0;
  const npc=challenge.opponent();
  const settings:MatchSettings={deck:selectedDeck.cards,seed,difficulty:$<HTMLSelectElement>('difficulty').value as MatchSettings['difficulty'],first:$<HTMLSelectElement>('firstPlayer').value as MatchSettings['first']};
  if(npc)settings.opponent={npcId:npc.id,deck:npc.deck};
  try{startMatch(settings);if(match.unfinished()||slotPresent){
    const content=element('div'),failure=element('p','warning');
    failure.setAttribute('role','alert');
    const replace=(start:()=>string|null)=>{
      const error=start();
      if(error){failure.textContent=error;return;}
      closeDialog();navigate('game');notice('');
    };
    content.append(element('p','',t("existingMatchPrompt")));
    if(match.hasMatch()){content.append(button(match.unfinished()?t("continueExistingMatch"):t("viewLastResult"),()=>{closeDialog();navigate('game');}),button(t("restartSameSettings"),()=>replace(match.restart)));}
    content.append(button(t("cancel"),closeDialog),button(t("discardAndStart"),()=>replace(()=>match.start(settings,selectedDeck.name)),'danger'),failure);openDialog(t("existingSave"),content);
  }else {const error=match.start(settings,selectedDeck.name);if(error){notice(error);return;}navigate('game');notice('');}}
  catch(error){notice(error instanceof Error?error.message:t('invalidMove'));}
};
$('applyPreset').onclick=()=>{selectedDeck=presetDeck(Number($<HTMLSelectElement>('advancedPreset').value));library.showHomeDeck(selectedDeck);notice(t("usingDeckPreset", deckLabel(selectedDeck)));};
$<HTMLSelectElement>('density').value=config.density;
$<HTMLSelectElement>('textSize').value=config.textSize;
$<HTMLInputElement>('reduceMotion').checked=config.reduceMotion;
$<HTMLInputElement>('classicBanter').checked=config.classicBanter;
$<HTMLInputElement>('crtFilter').checked=config.crtFilter;
for(const id of ['density','textSize','reduceMotion','classicBanter','crtFilter','locale'])$(id).onchange=()=>{
  const locale=localeSelect.value;
  config={
    version:1,
    ...(isLocale(locale)?{locale}:{}),
    density:$<HTMLSelectElement>('density').value as typeof config.density,
    textSize:$<HTMLSelectElement>('textSize').value as typeof config.textSize,
    reduceMotion:$<HTMLInputElement>('reduceMotion').checked,
    classicBanter:$<HTMLInputElement>('classicBanter').checked,
    crtFilter:$<HTMLInputElement>('crtFilter').checked,
  };
  if(id==='locale'){setLocale(config.locale??browserLocale());refreshLocalizedPage();}
  applyConfig();notice(safeWrite(storage,STORAGE.config,config)?t('settingsStorageError'):t('settingsSaved'));
};
$('exportRecords').onclick=()=>downloadJson({version:1,records:history.records},'queens-blood-records.json');
$('instructionsBtn').onclick=()=>{
  const content=element('div','guide');
  for(const text of [t("helpPlay"),t("helpPattern"),t("helpKeyboard"),t("helpDrawAndPass"),t("helpComputerTurn"),t("helpLocalSaves"),t("helpRecords"),t("helpCardLibrary", libraryRuleSummary(entries))])content.append(element('p','',text));
  openDialog(t("howToPlay"),content);
};
window.addEventListener('pageshow',()=>{if(route==='game')match.resume();});
applyConfig();refreshLocalizedPage();library.load(selectedDeck);navigate('home');
if(stored.error||configRead.error||loaded.issues.length)notice([stored.error??configRead.error,...loaded.issues].filter(Boolean).join('；'));
if(activeSave.error||history.issue)notice([activeSave.error,history.issue].filter(Boolean).join('；'));
void fetch('./catalog.json').then(response=>{if(!response.ok)throw Error(t("couldNotReadTheCardCatalog"));return response.json();}).then(catalog=>{entries=libraryEntries(catalog);library.refresh();}).catch(()=>notice(t("couldNotLoadTheCatalogPlayableCardsAre")));
if(import.meta.env.MODE==='private')void loadVisualPack(async()=>{const response=await fetch('./classic/visual-manifest.json');if(!response.ok)throw Error(t("artPackUnavailable"));return response.json();}).then(applyArtwork);

if(window.location?.pathname.startsWith('/game/')){
  $('desktopLauncherSection').hidden=false;
  $('openDesktopLauncher').addEventListener('click',()=>window.location.assign('/'));
}
