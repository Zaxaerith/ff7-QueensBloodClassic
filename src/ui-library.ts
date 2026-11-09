import {deckPresets} from './cards.js';
import {createCardView,createCardDetails} from './card-view.js';
import {getCardEvidence,evidenceDimensions} from './evidence.js';
import type {CardVisual} from './visuals.js';
import {addReason,validateDeck,matchesEntry,emptyFilter,tokenEntries,presetDeck,libraryRuleSummary,sortLibraryEntries,type LibraryEntry,type LibraryFilter,type LibrarySort,type DeckStore,type SavedDeck} from './ui-data.js';
import {$,element,button,options,openDialog,closeDialog,notice,downloadJson} from './ui-dom.js';
import {bindDeckGridKeys,browseCard,cardNumber,mountDeckInspector,renderDeckSlots} from './ui-deck-view.js';
import '../site/deck-editor.css';

export interface LibraryHooks {
  entries:()=>LibraryEntry[];visual:(id:number)=>CardVisual;decks:()=>DeckStore;
  save:(data:DeckStore)=>boolean;choose:(deck:SavedDeck)=>void;
}
const rarity=(value:string|null)=>value==='legendary'?'传奇':value==='token'?'衍生':value==='standard'?'普通':'类别待核实';
const dimensionNames=['编号与稀有度','等级与力量','占格格型','能力格型','技能效果','复杂时序','项目实现'];
const statusNames={verified:'已核对（见范围）',candidate:'候选',conflict:'资料冲突',missing:'缺少资料'};
export function mountLibrary(hooks:LibraryHooks){
  const copyDeck = (deck: SavedDeck): SavedDeck => ({...deck, cards: [...deck.cards]});
  const editor = $('view-decks');
  const mobileEditor = window.matchMedia('(max-width: 1120px)');
  const mobileHome = window.matchMedia('(max-width: 760px)');
  let draft = presetDeck(), baseline = copyDeck(draft), dirty = false;
  let deckPage = 0, collectionPage = 0;
  let homeDeck: SavedDeck | undefined, homeSlot = 0;
  type DeckFocus = {source: 'slots'; slot: number} | {source: 'library'; id: number};
  let deckFocus: DeckFocus | undefined = {source: 'slots', slot: 0};
  type FilterState = LibraryFilter & {sort: LibrarySort};
  const deckFilter: FilterState = {...emptyFilter(), sort: 'id'};
  const collectionFilter: FilterState = {...emptyFilter(), sort: 'id'};
  const tokens = tokenEntries();
  const entryFor = (id: number | undefined) => hooks.entries().find(entry => entry.id === id) ?? tokens.find(entry => entry.id === id);
  const deckPageSize = 8;
  function unavailable(entry:LibraryEntry){
    const root=element('div','unavailable-card'),visual=hooks.visual(entry.id),facts=getCardEvidence(entry.id).knownFacts;
    const hero=element('div','unknown-hero',visual.placeholder.glyph);
    if(visual.portraitPath){const image=element('img');image.src=visual.portraitPath;image.alt=entry.name;image.onerror=()=>image.replaceWith(document.createTextNode(visual.placeholder.glyph));hero.replaceChildren(image);}
    root.append(hero,element('h3','',`#${String(entry.id).padStart(3,'0')} ${entry.name}`),element('p','',facts?`等级 ${facts.cost} · 力量 ${facts.power} · ${rarity(entry.rarity)}`:'牌面资料暂未载入'),element('p','warning','未实现 · 不可加入当前对局'));
    if(facts){const grid=element('div','qb-pattern');grid.setAttribute('aria-label','5乘5母牌占格为空，衍生能力格型未知');
      for(let i=0;i<25;i++)grid.append(element('span','qb-cell'+(i===12?' qb-cell--origin':''),i===12?'◆':''));
      root.append(grid,element('p','muted','母牌无占格；衍生能力格型仍缺资料'),element('p','',facts.effect));}
    return root;
  }
  function showCard(id:number){
    const entry=entryFor(id);if(!entry)return;
    const root=element('div','card-detail'),face=entry.card?createCardView(entry.card,hooks.visual(id)):unavailable(entry);
    const notes=element('div','card-notes');
    if(entry.card)notes.append(createCardDetails(entry.card));
    notes.append(element('p','',`${rarity(entry.rarity)} · ${entry.card?'规则候选，可用于当前版本':'尚未实现'}`));
    if(id<=145){
      const evidence=getCardEvidence(id);notes.append(element('p','muted','证据可靠程度与项目测试分开记录，不代表完整实机核验。'));
      const list=element('dl','evidence-list');
      evidenceDimensions.forEach((key,i)=>{const data=evidence.dimensions[key];list.append(element('dt','',`${dimensionNames[i]} · ${statusNames[data.status]}`),element('dd','',`${data.scope==='project'?'本项目范围：':''}${data.note}`));});
      notes.append(list);for(const issue of evidence.issues)notes.append(element('p','warning',issue));
    }else notes.append(element('p','muted',`衍生卡由对局能力生成，不属于${hooks.entries().length}张编号收藏，不能组入初始牌库。`));
    root.append(face,notes);openDialog(entry.name,root);
  }
  function filters(host:HTMLElement,state:FilterState,refresh:()=>void){
    const search=element('input');search.type='search';search.placeholder='编号 / 名称';search.setAttribute('aria-label','搜索卡牌编号或名称');
    search.oninput=()=>{state.query=search.value;refresh();};
    const fields:readonly [keyof FilterState,string,readonly (readonly [string,string])[]][]=[
      ['rank','等级',[['all','全部等级'],['0','替换'],['1','等级 1'],['2','等级 2'],['3','等级 3']]],
      ['power','力量',[['all','全部力量'],['low','力量 0–2'],['mid','力量 3–5'],['high','力量 6+']]],
      ['rarity','类别',[['all','全部类别'],['standard','普通'],['legendary','传奇']]],
      ['ability','能力',[['all','全部能力'],['none','无能力'],['entry','入场'],['aura','持续 / 动态'],['death','摧毁 / 替换'],['generate','生成'],['condition','首次 / 阈值'],['special','计分 / 占格']]],
      ['sort','排序',[['id','按编号'],['name','按名称'],['rank','等级 ↑'],['power','力量 ↓']]]];
    host.append(search);
    for(const [key,label,rows] of fields){const select=element('select');select.setAttribute('aria-label',label);options(select,rows);select.onchange=()=>{Object.assign(state,{[key]:select.value});refresh();};host.append(select);}
  }
  function pager(host:HTMLElement,page:number,total:number,change:(page:number)=>void,size=16){
    const count=Math.max(1,Math.ceil(total/size)),previous=button('← 上页',()=>change(page-1)),next=button('下页 →',()=>change(page+1));
    const active = document.activeElement;
    const restore = active instanceof HTMLButtonElement && host.contains(active) ? active.dataset.pageDirection : undefined;
    previous.dataset.pageDirection = 'previous'; next.dataset.pageDirection = 'next';
    previous.disabled=page===0;next.disabled=page+1>=count;host.replaceChildren(previous,element('span','',`${page+1} / ${count} · ${total} 张`),next);
    if (restore) {
      const preferred = restore === 'previous' ? previous : next;
      const other = preferred === previous ? next : previous;
      if (!preferred.disabled) preferred.focus({preventScroll: true});
      else if (!other.disabled) other.focus({preventScroll: true});
    }
  }
  function refreshCollection(){
    const showTokens=$<HTMLSelectElement>('collectionKind').value==='tokens',all=showTokens?tokens:hooks.entries();
    const rows=sortLibraryEntries(all.filter(e=>matchesEntry(e,collectionFilter)),collectionFilter.sort);collectionPage=Math.min(collectionPage,Math.max(0,Math.ceil(rows.length/16)-1));
    $('collectionCount').textContent=showTokens?`衍生卡 ${all.length} 种 · 不计入${hooks.entries().length}张编号牌`:libraryRuleSummary(all);
    $<HTMLSelectElement>('collectionKind').querySelector<HTMLOptionElement>('option[value="numbered"]')!.textContent=`${hooks.entries().length} 张编号牌`;
    const grid=$('collectionGrid');grid.replaceChildren();
    for(const entry of rows.slice(collectionPage*16,collectionPage*16+16)){
      const item=button('',()=>showCard(entry.id),'collection-card');item.setAttribute('aria-label',`查看 #${entry.id} ${entry.name}`);
      item.append(entry.card?createCardView(entry.card,hooks.visual(entry.id),{lazy:true}):unavailable(entry));grid.append(item);
    }
    if(!rows.length)grid.append(element('p','empty','没有符合筛选条件的卡牌'));
    pager($('collectionPager'),collectionPage,rows.length,page=>{collectionPage=page;refreshCollection();});
  }
  function refreshMenu(){
    const menu = $<HTMLSelectElement>('savedDecks');
    const saved = hooks.decks().decks;
    options(menu, [['', '新卡组 / 预设'], ...saved.map(d => [d.id, d.name] as const)]);
    menu.value = saved.some(deck => deck.id === draft.id) ? draft.id : '';
  }
  const deckInspector = mountDeckInspector($('deckInfo'), showCard, {add, remove});
  const homeInspector = mountDeckInspector($('homeDeckInfo'), showCard);
  const paneHeadings = {slots: 'deckSlotsTitle', library: 'deckLibraryTitle', info: 'deckInfoTitle'} as const;

  function revealHeading(id: string) {
    const heading = $(id);
    heading.focus({preventScroll: true});
    heading.scrollIntoView({block: 'nearest'});
  }
  function setPane(pane: keyof typeof paneHeadings, reveal = false) {
    editor.dataset.deckPane = pane;
    editor.querySelectorAll<HTMLButtonElement>('[data-deck-tab]').forEach(tab => {
      tab.setAttribute('aria-pressed', String(tab.dataset.deckTab === pane));
    });
    if (reveal && mobileEditor.matches) revealHeading(paneHeadings[pane]);
  }
  function focusedEntry() {
    if (!deckFocus) return undefined;
    return entryFor(deckFocus.source === 'slots' ? draft.cards[deckFocus.slot] : deckFocus.id);
  }
  function updateEditorFocus() {
    $('deckSlots').querySelectorAll<HTMLButtonElement>('.d4-card-button').forEach(node => {
      node.setAttribute('aria-pressed', String(deckFocus?.source === 'slots' && Number(node.dataset.slot) === deckFocus.slot));
    });
    $('deckCards').querySelectorAll<HTMLButtonElement>('.d4-card-button').forEach(node => {
      node.setAttribute('aria-pressed', String(deckFocus?.source === 'library' && Number(node.dataset.cardId) === deckFocus.id));
    });
    deckInspector.update(focusedEntry(), draft.cards);
  }
  function focusEditor(next: DeckFocus, activate: boolean) {
    deckFocus = next;
    updateEditorFocus();
    if (activate && mobileEditor.matches) setPane('info', true);
  }
  function refreshEditorStatus() {
    const name = $<HTMLInputElement>('deckName');
    if (document.activeElement !== name) name.value = draft.name;
    $('deckSummary').textContent = `${draft.cards.length} / 15 张${dirty ? ' · 未保存' : ''}`;
    const error = validateDeck(draft.cards);
    const save = $<HTMLButtonElement>('saveDeck');
    const use = $<HTMLButtonElement>('useDeck');
    const nameError = name.value.trim() ? null : '请填写卡组名称';
    save.disabled = !!error || !!nameError;
    use.disabled = !!error;
    const incomplete = error && draft.cards.length < 15;
    $('deckValidation').textContent = incomplete ? `还需 ${15 - draft.cards.length} 张才可使用`
      : error ? `尚不可用于对局：${error}` : '卡组合法 · 普通最多2张，传奇最多1张';
    save.title = nameError ?? error ?? '保存到此浏览器';
    use.title = error ?? '在主菜单使用这套卡组';
    $<HTMLButtonElement>('revertDeck').disabled = !dirty;
    $<HTMLButtonElement>('deleteDeck').disabled = !hooks.decks().decks.some(d => d.id === draft.id);
  }
  function refreshEditor() {
    refreshEditorStatus();
    const active = document.activeElement;
    const slot = active instanceof HTMLButtonElement && $('deckSlots').contains(active) ? active.dataset.slot : undefined;
    renderDeckSlots($('deckSlots'), draft.cards, hooks.visual, (index, activate) => focusEditor({source: 'slots', slot: index}, activate));
    if (slot !== undefined) $('deckSlots').querySelector<HTMLButtonElement>(`[data-slot="${slot}"]`)?.focus({preventScroll: true});
    updateEditorFocus();
  }
  function updateLibraryAvailability() {
    $('deckCards').querySelectorAll<HTMLElement>('.d4-library-item').forEach(item => {
      const id = Number(item.dataset.cardId);
      const count = draft.cards.filter(cardId => cardId === id).length;
      const reason = addReason(draft.cards, id);
      item.dataset.inDeck = String(count > 0);
      item.dataset.blocked = String(!!reason);
      item.querySelector('.d4-library-status')!.textContent = count ? `已入组 ×${count}` : reason ? '不可加入' : '可加入';
      item.querySelector<HTMLButtonElement>('button')!.title = reason ?? '查看卡牌信息';
    });
  }
  function edited() {
    dirty = true;
    refreshEditor();
    updateLibraryAvailability();
  }
  function add(id: number) {
    const reason = addReason(draft.cards, id);
    if (reason) { notice(reason); return; }
    draft.cards.push(id);
    edited();
  }
  function remove() {
    if (!deckFocus) return;
    const fromSlot = deckFocus.source === 'slots';
    const index = deckFocus.source === 'slots' ? deckFocus.slot : draft.cards.indexOf(deckFocus.id);
    if (index < 0 || index >= draft.cards.length) return;
    const [id] = draft.cards.splice(index, 1);
    if (fromSlot) {
      deckFocus = draft.cards.length
        ? {source: 'slots', slot: Math.min(index, draft.cards.length - 1)}
        : {source: 'library', id};
    }
    edited();
  }
  function refreshDeckCards() {
    const source = $<HTMLSelectElement>('deckKind').value === 'tokens' ? tokens : hooks.entries();
    const rows = sortLibraryEntries(source.filter(entry => matchesEntry(entry, deckFilter)), deckFilter.sort);
    deckPage = Math.min(deckPage, Math.max(0, Math.ceil(rows.length / deckPageSize) - 1));
    const page = rows.slice(deckPage * deckPageSize, (deckPage + 1) * deckPageSize);
    const list = $('deckCards');
    const active = document.activeElement;
    const focusedId = active instanceof HTMLButtonElement && list.contains(active) ? active.dataset.cardId : undefined;
    list.replaceChildren();
    for (const entry of page) {
      const row = element('article', 'd4-library-item');
      row.dataset.cardId = String(entry.id);
      const face = entry.card ? createCardView(entry.card, hooks.visual(entry.id), {variant: 'hand', lazy: true}) : unavailable(entry);
      const focus: DeckFocus = {source: 'library', id: entry.id};
      const control = browseCard(entry, face, () => focusEditor(focus, false), () => focusEditor(focus, true));
      const caption = element('div', 'd4-library-caption');
      caption.append(element('span', 'd4-slot-code', cardNumber(entry.id)), element('span', 'd4-library-status'));
      row.append(control, caption);
      list.append(row);
    }
    const activeId = deckFocus?.source === 'library' ? deckFocus.id : undefined;
    if (!deckFocus || activeId !== undefined && !page.some(entry => entry.id === activeId)) {
      deckFocus = page[0] ? {source: 'library', id: page[0].id} : undefined;
    }
    if (!page.length) list.append(element('p', 'empty', '没有符合条件的卡牌'));
    if (focusedId) list.querySelector<HTMLButtonElement>(`button[data-card-id="${focusedId}"]`)?.focus({preventScroll: true});
    updateLibraryAvailability();
    updateEditorFocus();
    pager($('deckPager'), deckPage, rows.length, next => { deckPage = next; refreshDeckCards(); }, deckPageSize);
  }
  function showDecks() {
    refreshMenu();
    refreshEditor();
    refreshDeckCards();
  }
  function load(deck: SavedDeck) {
    draft = copyDeck(deck);
    baseline = copyDeck(deck);
    dirty = false;
    deckFocus = deck.cards.length ? {source: 'slots', slot: 0} : undefined;
    if (!editor.hidden) showDecks();
  }
  function requestLoad(deck:SavedDeck){
    if(!dirty){load(deck);return;}
    refreshMenu();
    const content=element('div');content.append(element('p','','当前卡组有未保存修改。载入其他卡组会替换草稿。'),button('保留草稿',closeDialog),button('载入其他卡组',()=>{closeDialog();load(deck);}));openDialog('切换卡组',content);
  }
  function showHomeDeck(deck: SavedDeck) {
    if (homeDeck?.id !== deck.id || homeSlot >= deck.cards.length) homeSlot = 0;
    homeDeck = deck;
    const current = $('currentDeck');
    current.textContent = deck.name;
    $('currentDeckCount').textContent = `${deck.cards.length} / 15 张 · 双方同牌组`;
    const menu = $<HTMLSelectElement>('homeDeckSelect');
    const saved = hooks.decks().decks;
    const selected = saved.find(item => item.id === deck.id && item.name === deck.name && item.cards.length === deck.cards.length && item.cards.every((id, i) => id === deck.cards[i]));
    options(menu, [...(selected ? [] : [['', deck.name] as const]), ...saved.map(item => [item.id, item.name] as const)]);
    menu.value = selected?.id ?? '';
    menu.hidden = saved.length === 0;
    current.hidden = !menu.hidden;
    const host = $('homeDeckSlots');
    const active = document.activeElement;
    const focusedSlot = active instanceof HTMLButtonElement && host.contains(active) ? active.dataset.slot : undefined;
    function select(slot: number, activate: boolean) {
      homeSlot = slot;
      homeInspector.update(entryFor(deck.cards[slot]), deck.cards);
      host.querySelectorAll<HTMLButtonElement>('.d4-card-button').forEach(node => node.setAttribute('aria-pressed', String(Number(node.dataset.slot) === slot)));
      if (activate && mobileHome.matches) revealHeading('homeDeckInfoTitle');
    }
    renderDeckSlots(host, deck.cards, hooks.visual, select);
    select(homeSlot, false);
    if (focusedSlot !== undefined) host.querySelector<HTMLButtonElement>(`[data-slot="${focusedSlot}"]`)?.focus({preventScroll: true});
  }
  $('homeDeckSelect').onchange = () => {
    const deck = hooks.decks().decks.find(item => item.id === $<HTMLSelectElement>('homeDeckSelect').value);
    if (!deck) return;
    if (!dirty) load(deck);
    hooks.choose(deck);
  };
  for (const id of ['homeDeckSlots', 'deckSlots', 'deckCards']) bindDeckGridKeys($(id));
  editor.querySelectorAll<HTMLButtonElement>('[data-deck-tab]').forEach(tab => {
    tab.onclick = () => setPane(tab.dataset.deckTab as keyof typeof paneHeadings, true);
  });
  filters($('deckFilters'),deckFilter,()=>{deckPage=0;refreshDeckCards();});
  filters($('collectionFilters'),collectionFilter,()=>{collectionPage=0;refreshCollection();});
  $('deckKind').onchange = () => {
    deckPage = 0;
    deckFilter.rarity = 'all';
    $('deckFilters').querySelector<HTMLSelectElement>('select[aria-label="类别"]')!.value = 'all';
    refreshDeckCards();
  };
  $('collectionKind').onchange=()=>{collectionPage=0;collectionFilter.rarity='all';const rarityMenu=$('collectionFilters').querySelector<HTMLSelectElement>('select[aria-label="类别"]');if(rarityMenu)rarityMenu.value='all';refreshCollection();};
  $('savedDecks').onchange=()=>{const deck=hooks.decks().decks.find(d=>d.id===$<HTMLSelectElement>('savedDecks').value);if(deck)requestLoad(deck);};
  options($<HTMLSelectElement>('deckTemplate'),deckPresets.map((d,i)=>[String(i),d.name]));
  $('loadTemplate').onclick=()=>requestLoad(presetDeck(Number($<HTMLSelectElement>('deckTemplate').value)));
  $('newDeck').onclick=()=>requestLoad({id:'',name:'新卡组',cards:[]});
  $('deckName').oninput=()=>{draft.name=$<HTMLInputElement>('deckName').value;dirty=true;refreshEditorStatus();};
  $('revertDeck').onclick = () => {
    if (!dirty) return;
    const content = element('div');
    content.append(element('p', '', '恢复上次载入或保存的卡组？'), button('保留草稿', closeDialog), button('恢复卡组', () => {
      closeDialog();
      load(baseline);
    }));
    openDialog('撤销草稿', content);
  };
  $('saveDeck').onclick=()=>{
    const error=validateDeck(draft.cards);if(error){notice(error);return;}
    const name=$<HTMLInputElement>('deckName').value.trim();if(!name)return;
    const id=hooks.decks().decks.some(d=>d.id===draft.id)?draft.id:'deck:'+crypto.randomUUID();
    const data:DeckStore={...hooks.decks(),decks:hooks.decks().decks.filter(d=>d.id!==id).concat({id,name,cards:[...draft.cards]})};
    if(hooks.save(data)){draft={id,name,cards:[...draft.cards]};baseline=copyDeck(draft);dirty=false;refreshMenu();refreshEditorStatus();notice(`已保存「${name}」`);}
  };
  $('useDeck').onclick=()=>{if(!validateDeck(draft.cards))hooks.choose({...draft,name:$<HTMLInputElement>('deckName').value.trim()||draft.name,cards:[...draft.cards]});};
  $('deleteDeck').onclick=()=>{
    const content=element('div');content.append(element('p','',`删除本地卡组「${draft.name}」？`),button('取消',closeDialog),button('删除',()=>{
      const data=hooks.decks(),next={...data,selectedId:data.selectedId===draft.id?null:data.selectedId,decks:data.decks.filter(d=>d.id!==draft.id)};
      if(hooks.save(next)){closeDialog();load(presetDeck());notice('卡组已删除；对局中的牌组不受影响');}
    },'danger'));openDialog('删除卡组',content);
  };
  $('exportDecks').onclick=()=>downloadJson(hooks.decks(),'queens-blood-decks-v1.json');
  return {showCard, showDecks, showHomeDeck, showCollection: refreshCollection, load,
    refresh() {
      if (!editor.hidden) showDecks();
      if (!$('view-collection').hidden) refreshCollection();
      if (homeDeck && !$('view-home').hidden) showHomeDeck(homeDeck);
    },
  };
}
