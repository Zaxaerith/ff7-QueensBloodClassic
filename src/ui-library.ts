import {getLocale,t} from './i18n/index.js';
import {localizeEvidenceNote} from './i18n/research-text.js';
import {displayName,termRecord} from './i18n/card-names.js';
import {deckLabel,presetName} from './i18n/game-labels.js';
import {byId,deckPresets} from './cards.js';
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
const rarity=(value:string|null)=>value==='legendary'?t("legendary"):value==='token'?t("token"):value==='standard'?t("normal"):t("rarityPendingReview");
const dimensionNames=()=>[t("numberAndRarity"),t("rankAndBasePower"),t("territoryPattern"),t("abilityPattern"),t("abilityEffects"),t("triggerOrder"),t("projectImplementation")];
const statusNames=()=>({verified:t("checkedSeeScope"),candidate:t("candidate"),conflict:t("conflictingSources"),missing:t("evidenceMissing")});
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
    if(visual.portraitPath){const image=element('img');image.src=visual.portraitPath;image.alt=displayName(entry.id,entry.name);image.onerror=()=>image.replaceWith(document.createTextNode(visual.placeholder.glyph));hero.replaceChildren(image);}
    root.append(hero,element('h3','',`#${String(entry.id).padStart(3,'0')} ${displayName(entry.id,entry.name)}`),element('p','',facts?t("knownCardFacts", facts.cost, facts.power, rarity(entry.rarity)):t("cardDataUnavailable")),element('p','warning',t("unavailableForPlay")));
    if(facts){const grid=element('div','qb-pattern');grid.setAttribute('aria-label',t("emptyTerritoryPatternTheGeneratedCardsAbilityPattern"));
      for(let i=0;i<25;i++)grid.append(element('span','qb-cell'+(i===12?' qb-cell--origin':''),i===12?'◆':''));
      root.append(grid,element('p','muted',t("theParentCardClaimsNoTilesEvidenceFor")),element('p','',localizeEvidenceNote(facts.effect)));}
    return root;
  }
  function showCard(id:number){
    const entry=entryFor(id);if(!entry)return;
    const readingView=['collection','replay','carnival'].includes($('app').dataset.view??'');
    const root=element('div',readingView?'card-detail frame-card-detail':'card-detail');
    const face=entry.card?createCardView(entry.card,hooks.visual(id)):unavailable(entry);
    const notes=element('div','card-notes');
    if(entry.card)notes.append(createCardDetails(entry.card));
    notes.append(element('p','',`${rarity(entry.rarity)} · ${entry.card?t("playableRulesCandidate"):t("notImplemented")}`));
    if(id<=145){
      const evidence=getCardEvidence(id);notes.append(element('p','muted',t("ruleEvidenceScope")));
      const list=element('dl','evidence-list');
      evidenceDimensions.forEach((key,i)=>{const data=evidence.dimensions[key];list.append(element('dt','',`${dimensionNames()[i]} · ${statusNames()[data.status]}`),element('dd','',`${data.scope==='project'?t("projectEvidence"):''}${localizeEvidenceNote(data.note)}`));});
      notes.append(list);for(const issue of evidence.issues)notes.append(element('p','warning',localizeEvidenceNote(issue)));
    }else notes.append(element('p','muted',t("tokenCollectionHelp", hooks.entries().length)));
    const source=termRecord(id,getLocale());
    if(source){
      const link=element('a','',t('reference'));link.href=source.sourceUrl;link.target='_blank';link.rel='noopener noreferrer';
      const status=t(source.status==='guide'?'guideNameStatus':source.status==='official'?'officialNameStatus':source.status==='fallback'?'fallbackNameStatus':'provisionalNameStatus');
      const label=element('p','muted',status+' · ');label.append(link);notes.append(label);
    }
    root.append(face,notes);openDialog(displayName(id,entry.name),root);
  }
  function filters(host:HTMLElement,state:FilterState,refresh:()=>void,searchHost=host){
    host.replaceChildren();
    const search=element('input');search.value=state.query;search.type='search';search.placeholder=t("numberOrName");search.setAttribute('aria-label',t("searchByCardNumberOrName"));
    search.oninput=()=>{state.query=search.value;refresh();};
    const fields:readonly [keyof FilterState,string,readonly (readonly [string,string])[]][]=[
      ['rank',t("rank"),[['all',t("allRanks")],['0',t("replace")],['1',t("rank1")],['2',t("rank2")],['3',t("rank3")]]],
      ['power',t("power"),[['all',t("anyPower")],['low',t("power02")],['mid',t("power35")],['high',t("power6")]]],
      ['rarity',t("rarity"),[['all',t("allRarities")],['standard',t("normal")],['legendary',t("legendary")]]],
      ['ability',t("ability"),[['all',t("allAbilities")],['none',t("noAbility2")],['entry',t("onPlay")],['aura',t("continuousDynamic")],['death',t("destroyReplace")],['generate',t("generate")],['condition',t("firstTriggerThreshold")],['special',t("scoringTerritory")]]],
      ['sort',t("sort"),[['id',t("cardNumber")],['name',t("name")],['rank',t("rank4")],['power',t("power2")]]]];
    searchHost.replaceChildren(search);
    for(const [key,label,rows] of fields){const select=element('select');select.dataset.filter=key;select.setAttribute('aria-label',label);options(select,rows);select.value=String(state[key as keyof typeof state]);select.onchange=()=>{Object.assign(state,{[key]:select.value});refresh();};host.append(select);}
  }
  function pager(host:HTMLElement,page:number,total:number,change:(page:number)=>void,size=16){
    const count=Math.max(1,Math.ceil(total/size)),previous=button(t("previous"),()=>change(page-1)),next=button(t("next"),()=>change(page+1));
    const active = document.activeElement;
    const restore = active instanceof HTMLButtonElement && host.contains(active) ? active.dataset.pageDirection : undefined;
    previous.dataset.pageDirection = 'previous'; next.dataset.pageDirection = 'next';
    previous.disabled=page===0;next.disabled=page+1>=count;host.replaceChildren(previous,element('span','',t("pagination", page+1, count, total)),next);
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
    $('collectionCount').textContent=showTokens?t("tokenCollectionCount", all.length, hooks.entries().length):libraryRuleSummary(all);
    $<HTMLSelectElement>('collectionKind').querySelector<HTMLOptionElement>('option[value="numbered"]')!.textContent=t("numberedCardCount", hooks.entries().length);
    const grid=$('collectionGrid'),active=document.activeElement;
    const focusedId=active instanceof HTMLButtonElement&&grid.contains(active)?active.dataset.collectionId:undefined;
    grid.replaceChildren();
    for(const entry of rows.slice(collectionPage*16,collectionPage*16+16)){
      const item=button('',()=>showCard(entry.id),'collection-card');item.setAttribute('aria-label',t("viewCardById", entry.id, displayName(entry.id,entry.name)));
      item.dataset.collectionId=String(entry.id);
      item.append(entry.card?createCardView(entry.card,hooks.visual(entry.id),{lazy:true}):unavailable(entry));
      if(entry.card)item.append(element('span','frame-card-number',cardNumber(entry.id)));
      grid.append(item);
      if(item.dataset.collectionId===focusedId)item.focus({preventScroll:true});
    }
    if(!rows.length)grid.append(element('p','empty',t("noCardsMatchYourFilters")));
    pager($('collectionPager'),collectionPage,rows.length,page=>{collectionPage=page;refreshCollection();});
  }
  function refreshMenu(){
    const menu = $<HTMLSelectElement>('savedDecks');
    const saved = hooks.decks().decks;
    options(menu, [['', t("newDeckPreset")], ...saved.map(d => [d.id, d.name] as const)]);
    menu.value = saved.some(deck => deck.id === draft.id) ? draft.id : '';
    renderBank($('editorDeckBank'),draft,requestLoad);
  }
  const deckInspector = mountDeckInspector($('deckInfo'), showCard, {add, remove});
  const homeInspector = mountDeckInspector($('homeDeckInfo'), showCard);
  const paneHeadings = {slots: 'deckSlotsTitle', library: 'deckLibraryTitle', info: 'deckInfoTitle'} as const;

  function reveal(target: HTMLElement) {
    target.focus({preventScroll: true});
    target.scrollIntoView({block: 'nearest'});
  }
  function setPane(pane: keyof typeof paneHeadings, focusPanel = false) {
    editor.dataset.deckPane = pane;
    editor.querySelectorAll<HTMLButtonElement>('[data-deck-tab]').forEach(tab => {
      tab.setAttribute('aria-pressed', String(tab.dataset.deckTab === pane));
    });
    if (focusPanel && mobileEditor.matches) {
      const panel=editor.querySelector<HTMLElement>(`[data-deck-panel="${pane}"]`)!;
      const target=panel.querySelector<HTMLElement>('.d4-card-button[aria-pressed=true]')
        ?? panel.querySelector<HTMLElement>('.d4-card-button, .d4-inspector-actions button:not(:disabled)')
        ?? $(paneHeadings[pane]);
      reveal(target);
    }
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
    if (document.activeElement !== name) name.value = deckLabel(draft);
    $('deckSummary').textContent = t("draftCardCount", draft.cards.length, dirty ? t("unsavedSuffix") : '');
    const error = validateDeck(draft.cards);
    $('deckSummary').dataset.valid=String(!error);
    const save = $<HTMLButtonElement>('saveDeck');
    const use = $<HTMLButtonElement>('useDeck');
    const nameError = name.value.trim() ? null : t("enterADeckName");
    save.disabled = !!error || !!nameError;
    use.disabled = !!error;
    const incomplete = error && draft.cards.length < 15;
    $('deckValidation').textContent = incomplete ? t("cardsNeeded", 15 - draft.cards.length)
      : error ? t("invalidDeckReason", error) : t("validDeckUpToTwoCopiesPerStandard");
    save.title = nameError ?? error ?? t("saveInThisBrowser");
    use.title = error ?? t("useThisDeckInTheMainMenu");
    $<HTMLButtonElement>('revertDeck').disabled = !dirty;
    $<HTMLButtonElement>('deleteDeck').disabled = !hooks.decks().decks.some(d => d.id === draft.id);
  }
  function refreshEditor() {
    refreshEditorStatus();
    const active = document.activeElement;
    const slot = active instanceof HTMLButtonElement && $('deckSlots').contains(active) ? active.dataset.slot : undefined;
    renderDeckSlots($('deckSlots'), draft.cards, hooks.visual, (index, activate) => focusEditor({source: 'slots', slot: index}, activate));
    if (slot !== undefined) {
      const next=Math.min(Number(slot),draft.cards.length-1);
      const targets=[
        $('deckSlots').querySelector<HTMLElement>(`[data-slot="${next}"]`),
        $('deckCards').querySelector<HTMLElement>('.d4-card-button'),
        editor.querySelector<HTMLElement>('[data-deck-tab=library]'),
      ];
      targets.find(target=>target?.getClientRects().length)?.focus({preventScroll:true});
    }
    updateEditorFocus();
  }
  function updateLibraryAvailability() {
    $('deckCards').querySelectorAll<HTMLElement>('.d4-library-item').forEach(item => {
      const id = Number(item.dataset.cardId);
      const count = draft.cards.filter(cardId => cardId === id).length;
      const reason = addReason(draft.cards, id);
      item.dataset.inDeck = String(count > 0);
      item.dataset.blocked = String(!!reason);
      item.querySelector('.d4-library-status')!.textContent = count ? t("copiesInDeckBadge", count) : reason ? t("unavailable") : t("available");
      item.querySelector<HTMLButtonElement>('button')!.title = reason ?? t("viewCardInformation");
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
    if (!page.length) list.append(element('p', 'empty', t("noCardsMatchYourFilters2")));
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
    const content=element('div');content.append(element('p','',t("thisDeckHasUnsavedChangesLoadingAnotherDeck")),button(t("keepDraft"),closeDialog),button(t("loadAnotherDeck"),()=>{closeDialog();load(deck);}));openDialog(t("switchDecks"),content);
  }
  function renderBank(host:HTMLElement,selected:SavedDeck,choose:(deck:SavedDeck)=>void) {
    const bank=[...hooks.decks().decks,...deckPresets.map((_,index)=>presetDeck(index))].slice(0,6);
    const focused=host.contains(document.activeElement)?(document.activeElement as HTMLElement).dataset.deckSlot:undefined;
    host.replaceChildren(...Array.from({length:6},(_,index)=>{
      const deck=bank[index],number=String(index+1);
      const option=deck??{id:`quick-empty:${number}`,name:t('newDeck'),cards:[]};
      const slot=button(number,()=>choose(option),'frame-deck-slot');
      slot.dataset.deckSlot=number;
      slot.toggleAttribute('data-empty',!deck);
      slot.title=deck?deckLabel(deck):t('empty2');
      slot.setAttribute('aria-label',number+' · '+slot.title);
      slot.setAttribute('aria-pressed',String(option.id===selected.id));
      return slot;
    }));
    if(focused)host.querySelector<HTMLElement>(`[data-deck-slot="${focused}"]:not(:disabled)`)?.focus({preventScroll:true});
  }
  function showSavedDecks(choose:(deck:SavedDeck)=>void) {
    const rows=element('div','frame-option-list');
    const saved=hooks.decks().decks;
    if(!saved.length)rows.append(element('p','muted',t('empty2')));
    for(const deck of saved)rows.append(button(deckLabel(deck),()=>{closeDialog();choose(deck);}));
    openDialog(t('savedDecks'),rows);
    rows.querySelector('button')?.focus({preventScroll:true});
  }
  function showHomeDeck(deck: SavedDeck) {
    if (homeDeck?.id !== deck.id || homeSlot >= deck.cards.length) homeSlot = 0;
    homeDeck = deck;
    const current = $('currentDeck');
    current.textContent = deckLabel(deck);
    $('currentDeckCount').textContent = t("deckCardCount", deck.cards.length);
    const start=$<HTMLButtonElement>('startGame'),problem=validateDeck(deck.cards);
    const status=$('currentDeckStatus');
    status.textContent=problem??'';
    status.hidden=!problem;
    $('currentDeckCount').dataset.valid=String(!problem);
    const starting=document.activeElement===start;
    start.disabled=Boolean(problem);
    start.title=problem??'';
    const menu = $<HTMLSelectElement>('homeDeckSelect');
    const saved = hooks.decks().decks;
    const selected = saved.find(item => item.id === deck.id && item.name === deck.name && item.cards.length === deck.cards.length && item.cards.every((id, i) => id === deck.cards[i]));
    options(menu, [...(selected ? [] : [['', deckLabel(deck)] as const]), ...saved.map(item => [item.id, item.name] as const)]);
    menu.value = selected?.id ?? '';
    menu.hidden = saved.length === 0;
    current.hidden = false;
    renderBank($('prepareDeckBank'),deck,hooks.choose);
    if(problem&&starting)$('prepareDeckBank').querySelector<HTMLElement>('[aria-pressed=true]')?.focus({preventScroll:true});
    const host = $('homeDeckSlots');
    const active = document.activeElement;
    const focusedSlot = active instanceof HTMLButtonElement && host.contains(active) ? active.dataset.slot : undefined;
    function select(slot: number, activate: boolean) {
      homeSlot = slot;
      homeInspector.update(entryFor(deck.cards[slot]), deck.cards);
      host.querySelectorAll<HTMLButtonElement>('.d4-card-button').forEach(node => node.setAttribute('aria-pressed', String(Number(node.dataset.slot) === slot)));
      if (activate && mobileHome.matches) reveal($('homeDeckInfoTitle'));
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
  $('prepareSavedDecks').onclick=()=>showSavedDecks(hooks.choose);
  $('editorSavedDecks').onclick=()=>showSavedDecks(requestLoad);
  for (const id of ['homeDeckSlots', 'deckSlots', 'deckCards']) bindDeckGridKeys($(id));
  editor.querySelectorAll<HTMLButtonElement>('[data-deck-tab]').forEach(tab => {
    tab.onclick = () => setPane(tab.dataset.deckTab as keyof typeof paneHeadings, true);
  });
  function localize(){
    filters($('deckFilters'),deckFilter,()=>{deckPage=0;refreshDeckCards();},$('deckSearch'));
    filters($('collectionFilters'),collectionFilter,()=>{collectionPage=0;refreshCollection();});
    const template=$<HTMLSelectElement>('deckTemplate'),selection=template.value;
    options(template,deckPresets.map((_,i)=>[String(i),presetName(i)]));
    template.value=selection||'0';
    if(homeDeck)showHomeDeck(homeDeck);
    if(!editor.hidden)showDecks();
    if(!$('view-collection').hidden)refreshCollection();
  }
  $('deckKind').onchange = () => {
    deckPage = 0;
    deckFilter.rarity = 'all';
    $('deckFilters').querySelector<HTMLSelectElement>('select[data-filter="rarity"]')!.value = 'all';
    refreshDeckCards();
  };
  $('collectionKind').onchange=()=>{collectionPage=0;collectionFilter.rarity='all';const rarityMenu=$('collectionFilters').querySelector<HTMLSelectElement>('select[data-filter="rarity"]');if(rarityMenu)rarityMenu.value='all';refreshCollection();};
  $('savedDecks').onchange=()=>{const deck=hooks.decks().decks.find(d=>d.id===$<HTMLSelectElement>('savedDecks').value);if(deck)requestLoad(deck);};
  $('loadTemplate').onclick=()=>{
    const content=element('div','frame-preset-preview'), choices=element('div','frame-option-list');
    const preview=element('div','d4-deck-grid'),apply=button(t('loadPreset'),()=>{closeDialog();requestLoad(selected);},'primary');
    let selected=presetDeck(Number($<HTMLSelectElement>('deckTemplate').value));
    function choose(index:number) {
      selected=presetDeck(index);
      $<HTMLSelectElement>('deckTemplate').value=String(index);
      choices.querySelectorAll('button').forEach((node,i)=>node.setAttribute('aria-pressed',String(i===index)));
      preview.replaceChildren(...selected.cards.flatMap(id=>{
        const card=byId.get(id);
        return card?[createCardView(card,hooks.visual(id),{variant:'hand',lazy:true})]:[];
      }));
    }
    deckPresets.forEach((_,i)=>choices.append(button(presetName(i),()=>choose(i))));
    content.append(choices,preview,apply);
    choose(Number($<HTMLSelectElement>('deckTemplate').value));
    openDialog(t('deckPreset2'),content);
    choices.querySelector<HTMLButtonElement>('[aria-pressed=true]')?.focus({preventScroll:true});
  };
  $('newDeck').onclick=()=>requestLoad({id:'',name:t("newDeck"),cards:[]});
  $('deckName').oninput=()=>{draft.name=$<HTMLInputElement>('deckName').value;dirty=true;refreshEditorStatus();};
  $('revertDeck').onclick = () => {
    if (!dirty) return;
    const content = element('div');
    content.append(element('p', '', t("restoreTheLastLoadedOrSavedVersionOf")), button(t("keepDraft"), closeDialog), button(t("restoreDeck"), () => {
      closeDialog();
      load(baseline);
    }));
    openDialog(t("revertDraft"), content);
  };
  $('saveDeck').onclick=()=>{
    const error=validateDeck(draft.cards);if(error){notice(error);return;}
    const name=$<HTMLInputElement>('deckName').value.trim();if(!name)return;
    const id=hooks.decks().decks.some(d=>d.id===draft.id)?draft.id:'deck:'+crypto.randomUUID();
    const updated={id,name,cards:[...draft.cards]},saved=hooks.decks().decks;
    const data:DeckStore={...hooks.decks(),decks:saved.some(d=>d.id===id)?saved.map(d=>d.id===id?updated:d):[...saved,updated]};
    if(hooks.save(data)){draft={id,name,cards:[...draft.cards]};baseline=copyDeck(draft);dirty=false;refreshMenu();refreshEditorStatus();notice(t("deckSaved", name));}
  };
  $('useDeck').onclick=()=>{if(!validateDeck(draft.cards))hooks.choose({...draft,name:draft.name.trim()||draft.name,cards:[...draft.cards]});};
  $('deleteDeck').onclick=()=>{
    const content=element('div');content.append(element('p','',t("deleteDeckPrompt", draft.name)),button(t("cancel"),closeDialog),button(t("delete"),()=>{
      const data=hooks.decks(),next={...data,selectedId:data.selectedId===draft.id?null:data.selectedId,decks:data.decks.filter(d=>d.id!==draft.id)};
      if(hooks.save(next)){closeDialog();load(presetDeck());notice(t("deckDeletedAnyMatchInProgressStillUses"));}
    },'danger'));openDialog(t("deleteDeck"),content);
  };
  $('exportDecks').onclick=()=>downloadJson(hooks.decks(),'queens-blood-decks-v1.json');
  return {showCard, showDecks, showHomeDeck, showCollection: refreshCollection, load, localize,
    editDeck(deck:SavedDeck){if(deck.id!==draft.id||deck.name!==baseline.name)requestLoad(deck);},
    refresh() {
      if (!editor.hidden) showDecks();
      if (!$('view-collection').hidden) refreshCollection();
      if (homeDeck && !$('view-prepare').hidden) showHomeDeck(homeDeck);
    },
  };
}
