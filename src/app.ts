import {getCardVisual} from './visuals.js';
import {loadVisualPack} from './visual-pack.js';
import {mountArtImport} from './ui-art-import.js';
import {refreshRenderedArtwork} from './browser-art.js';
import {deckPresets} from './cards.js';
import {mountMatch} from './ui-match.js';
import {mountLibrary} from './ui-library.js';
import {mountReplay} from './ui-replay.js';
import {MatchHistory,readActive,writeActive} from './match-archive.js';
import {STORAGE,readDecks,readConfig,safeRead,safeWrite,libraryEntries,presetDeck,libraryRuleSummary,type StoragePort,type DeckStore,type SavedDeck} from './ui-data.js';
import {$,element,button,options,initDialog,openDialog,closeDialog,notice,downloadJson} from './ui-dom.js';
import {startMatch,rulesLabel,type MatchSettings} from './match-flow.js';

type Route='home'|'game'|'decks'|'collection'|'records'|'config'|'replay';
const routes:Route[]=['home','game','decks','collection','records','config','replay'];
let route:Route='home',resolveVisual=getCardVisual,entries=libraryEntries(null),storage:StoragePort|null=null;
try{storage=window.localStorage;}catch{}
const stored=safeRead(storage,STORAGE.decks),loaded=readDecks(stored.raw);
let decks=loaded.data,recoveryRaw=loaded.issues.length?stored.raw:null;
const configRead=safeRead(storage,STORAGE.config);let config=readConfig(configRead.raw);
const history=new MatchHistory(storage),activeSave=readActive(storage);let slotPresent=activeSave.present;
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
  library.showHomeDeck(selectedDeck);
  $('resumeGame').hidden=!match.hasMatch()||!match.unfinished()&&!slotPresent;
  const rules=match.rulesVersion();
  $('continueInfo').textContent=activeSave.error&&!rules?activeSave.error:rules&&!$('resumeGame').hidden?`继续对局 · ${rulesLabel(rules)}。`:'新对局从第二个回合起，在行动方回合开始时抽牌。';
  $('continueInfo').title=rules&&!$('resumeGame').hidden?rules:'';
}
function chooseDeck(deck:SavedDeck){
  const savedDeck=decks.decks.find(d=>d.id===deck.id&&d.name===deck.name&&JSON.stringify(d.cards)===JSON.stringify(deck.cards));
  selectedDeck=savedDeck??{...deck,cards:[...deck.cards]};
  const selectedId=savedDeck?.id??null;
  const saved=saveDecks({...decks,selectedId});navigate('home');
  if(saved)notice(`已选择「${deck.name}」${selectedId?'':'；如需下次恢复，请在卡组页保存'}`);
}
const library=mountLibrary({entries:()=>entries,visual:id=>resolveVisual(id),decks:()=>decks,save:saveDecks,choose:chooseDeck});
const match=mountMatch({visual:id=>resolveVisual(id),showCard:library.showCard,menu:()=>navigate('home'),checkpoint:save=>{
  const error=writeActive(storage,save);if(!error)slotPresent=true;return error;
},completed:save=>{
  const error=history.add(save);if(error)return error;
  const clearError=writeActive(storage,null);if(!clearError)slotPresent=false;return clearError;
}});
if(activeSave.restored)match.restore(activeSave.restored);
const replay=mountReplay({visual:id=>resolveVisual(id),showCard:library.showCard,exit:()=>navigate('records')});
function applyArtwork(resolve:typeof getCardVisual){
  resolveVisual=resolve;
  refreshRenderedArtwork(document,resolveVisual);
}
if(import.meta.env.MODE!=='private')mountArtImport($('view-config').querySelector<HTMLElement>('.window')!,applyArtwork);
function navigate(next:Route){
  if(route==='replay'&&next!=='replay')replay.cancel();
  if(route==='game'&&next!=='game')match.pause();route=next;
  $('app').dataset.view=next;
  for(const name of routes)$('view-'+name).hidden=name!==next;
  $('mainNav').hidden=next==='game'||next==='replay';$('backMenu').hidden=next==='home';
  document.querySelectorAll<HTMLButtonElement>('[data-route]').forEach(node=>{if(node.dataset.route===next)node.setAttribute('aria-current','page');else node.removeAttribute('aria-current');});
  if(next==='home')homeSummary();if(next==='decks')library.showDecks();if(next==='collection')library.showCollection();if(next==='records')renderRecords();if(next==='game')match.resume();
  document.querySelector<HTMLElement>(`#view-${next} .view-title`)?.focus({preventScroll:true});
  window.scrollTo(0,0);
}
function renderRecords(){
  const root=$('recordList');root.replaceChildren();
  for(const record of history.records){const [a,b]=record.scores,row=element('li','record-row'),rules=history.rulesVersion(record.id),actions=element('div','button-row');
    row.dataset.recordId=record.id;
    const replayStatus=element('span','muted',rules?`可回放 · ${rulesLabel(rules)}`:'仅摘要，无法回放：没有兼容的完整行动记录');
    if(rules)replayStatus.title=rules;
    row.append(element('strong','',`${a===b?'平局':a>b?'胜利':'败北'} · ${a} : ${b}`),element('span','',`${record.deckName} · ${record.difficulty.toUpperCase()}`),element('span','muted',`${new Date(record.date).toLocaleString()} · Seed ${record.seed}`),replayStatus);
    const open=button('打开回放',()=>{try{replay.open(history.replay(record.id));navigate('replay');}catch{notice('该回放无法通过完整性或规则校验；结果摘要仍保留');}});open.disabled=!rules;
    actions.append(open,button(rules?'导出 JSON 回放':'导出摘要',()=>{try{downloadJson(rules?history.replay(record.id):record,`queens-blood-${record.seed}.json`);}catch{notice('回放校验失败，无法导出；摘要仍保留');}}),button('删除',()=>{
      const content=element('div');content.append(element('p','','删除这条结果及其完整回放？'),button('取消',closeDialog),button('确认删除',()=>{const error=history.remove(record.id);closeDialog();if(error)notice(error);renderRecords();},'danger'));openDialog('RECORDS / 删除',content);
    }));row.append(actions);root.append(row);}
  if(!history.records.length)root.append(element('li','empty','尚无对局记录。完成一局后自动记录结果和回放。'));
}
function applyConfig(){
  document.documentElement.dataset.density=config.density;document.documentElement.dataset.textSize=config.textSize;document.documentElement.dataset.reduceMotion=String(config.reduceMotion);
}
document.querySelectorAll<HTMLButtonElement>('[data-route]').forEach(node=>{node.onclick=()=>navigate(node.dataset.route as Route);});
$('backMenu').onclick=()=>navigate('home');$('changeDeck').onclick=()=>navigate('decks');$('resumeGame').onclick=()=>navigate('game');
$('deckBack').onclick=()=>navigate('home');
$('startGame').onclick=()=>{
  const input=$<HTMLInputElement>('seed'),seed=input.value.trim()?Number(input.value):Date.now()>>>0;
  const settings:MatchSettings={deck:selectedDeck.cards,seed,difficulty:$<HTMLSelectElement>('difficulty').value as MatchSettings['difficulty'],first:$<HTMLSelectElement>('firstPlayer').value as MatchSettings['first']};
  const launch=()=>{match.start(settings,selectedDeck.name);input.value=String(seed);navigate('game');notice('');};
  const discardThen=(run:()=>void)=>{const error=storage?writeActive(storage,null):null;if(error){notice(error);return;}slotPresent=false;closeDialog();run();};
  try{startMatch(settings);if(match.unfinished()||slotPresent){
    const content=element('div');content.append(element('p','','本机已有对局存档，新局不能静默覆盖。可以继续、从原设置重开，或舍弃并使用当前菜单设置。'));
    if(match.hasMatch()){content.append(button('继续现有对局',()=>{closeDialog();navigate('game');}),button('从原设置重开',()=>discardThen(()=>{match.restart();navigate('game');})));}
    content.append(button('取消',closeDialog),button('舍弃存档并开始新局',()=>discardThen(launch),'danger'));openDialog('CONTINUE / 已有存档',content);
  }else launch();}
  catch(error){notice(String(error));}
};
options($<HTMLSelectElement>('advancedPreset'),deckPresets.map((d,i)=>[String(i),d.name]));
$('applyPreset').onclick=()=>{selectedDeck=presetDeck(Number($<HTMLSelectElement>('advancedPreset').value));library.load(selectedDeck);homeSummary();notice(`本页使用模板「${selectedDeck.name}」；可在卡组页命名保存`);};
$<HTMLSelectElement>('density').value=config.density;$<HTMLSelectElement>('textSize').value=config.textSize;$<HTMLInputElement>('reduceMotion').checked=config.reduceMotion;
for(const id of ['density','textSize','reduceMotion'])$(id).onchange=()=>{
  config={version:1,density:$<HTMLSelectElement>('density').value as typeof config.density,textSize:$<HTMLSelectElement>('textSize').value as typeof config.textSize,reduceMotion:$<HTMLInputElement>('reduceMotion').checked};
  applyConfig();notice(safeWrite(storage,STORAGE.config,config)??'设置已保存');
};
$('exportRecords').onclick=()=>downloadJson({version:1,records:history.records},'queens-blood-records.json');
$('instructionsBtn').onclick=()=>{
  const content=element('div','guide');
  for(const text of ['选中手牌，再选择金框落点，最后按“确认出牌”。触屏不会单击格子直接出牌。','黄底表示占格范围，红框表示能力影响格型。这是候选预览，力量尚未改变；实际效果由共享规则结算。','Tab 切换控件，Enter/Space 激活。棋盘方向键移动焦点，手牌左右键切换焦点。Escape 依次关闭窗口、取消落点/选牌、返回菜单。','新对局从第二个回合起，行动方先从牌库抽一张，再检查合法出牌。PASS 保留当前手牌，对方接手时照常抽牌；双方连续 PASS 后直接结算。旧存档和回放沿用出牌后补牌。','电脑思考时操作锁定，返回菜单会取消搜索，继续时只恢复一次行动。','对局在有效行动后自动保存在本机；刷新后使用 Continue Game。存储失败会提示，仍可导出 JSON 回放。未保存的卡组草稿不会恢复。先手设置是本原型自定义设置。','已完成的新对局可在 Records 逐步回放；旧摘要未记录行动，无法补造回放。所有存档仅保存在此浏览器。',`${libraryRuleSummary(entries)}。衍生卡不能组入初始牌库。卡牌资料中的证据状态不等于完整实机核验。`])content.append(element('p','',text));
  openDialog('操作说明',content);
};
document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&route!=='game'&&!$<HTMLDialogElement>('infoDialog').open){event.preventDefault();navigate(route==='replay'?'records':'home');}
  const node=event.target as HTMLElement;
  if(node.closest('#mainNav')&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){
    event.preventDefault();const buttons=Array.from($('mainNav').querySelectorAll<HTMLButtonElement>('button')),index=buttons.indexOf(node as HTMLButtonElement),step=event.key==='ArrowLeft'||event.key==='ArrowUp'?-1:1;
    buttons[(index+step+buttons.length)%buttons.length]?.focus();
  }
});
window.addEventListener('pageshow',()=>{if(route==='game')match.resume();});
applyConfig();library.load(selectedDeck);navigate('home');
if(stored.error||loaded.issues.length)notice([stored.error,...loaded.issues].filter(Boolean).join('；'));
if(activeSave.error||history.issue)notice([activeSave.error,history.issue].filter(Boolean).join('；'));
void fetch('./catalog.json').then(response=>{if(!response.ok)throw Error('目录读取失败');return response.json();}).then(catalog=>{entries=libraryEntries(catalog);library.refresh();}).catch(()=>notice('目录未载入：已实现牌仍可用，未实现编号暂用占位名称；刷新可重试'));
if(import.meta.env.MODE==='private')void loadVisualPack(async()=>{const response=await fetch('./classic/visual-manifest.json');if(!response.ok)throw Error('资源包不可用');return response.json();}).then(applyArtwork);
