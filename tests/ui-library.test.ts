import {afterEach, describe, expect, test, vi} from 'vitest';
import {deckPresets, starterDeck} from '../src/cards.js';
import {analyzeDeckCurve, encodeDeckCode} from '../src/deck-code.js';
import {setLocale} from '../src/i18n/index.js';
import {libraryEntries, type DeckStore, type SavedDeck} from '../src/ui-data.js';
import {duplicateDraftName} from '../src/ui-library.js';
import {getCardVisual} from '../src/visuals.js';

type Stub = {
  tag: string; className: string; id: string; value: string; hidden: boolean; disabled: boolean; readOnly: boolean;
  textContent: string; title: string; placeholder: string; autocomplete: string; spellcheck: boolean; type: string;
  dataset: Record<string, string>; options: {value: string; label: string}[];
  attributes: Map<string, string>;
  style: {props: Map<string, string>; setProperty: (k: string, v: string) => void};
  onclick: (() => void) | null; onchange: (() => void) | null; oninput: (() => void) | null;
  onkeydown: ((event: KeyboardEvent) => void) | null;
  children: Stub[];
  setAttribute: (k: string, v: string) => void;
  getAttribute: (k: string) => string | null;
  toggleAttribute: (k: string, force?: boolean) => void;
  append: (...c: Stub[]) => void;
  replaceChildren: (...c: Stub[]) => void;
  contains: (n: unknown) => boolean;
  focus: () => void;
  select: () => void;
  scrollIntoView: () => void;
  addEventListener: (type: string, fn: (...args: unknown[]) => void) => void;
  querySelector: (s: string) => Stub | null;
  querySelectorAll: (s: string) => Stub[];
};

function makeStub(tag = 'div', className = '', text = ''): Stub {
  const attributes = new Map<string, string>();
  const styleProps = new Map<string, string>();
  const node: Stub = {
    tag: tag.toUpperCase(), className, id: '', value: '', hidden: false, disabled: false, readOnly: false,
    textContent: text, title: '', placeholder: '', autocomplete: '', spellcheck: true, type: '',
    dataset: {}, options: [], attributes,
    style: {props: styleProps, setProperty: (k, v) => { styleProps.set(k, v); }},
    onclick: null, onchange: null, oninput: null, onkeydown: null, children: [],
    setAttribute: (k, v) => { attributes.set(k, v); },
    getAttribute: k => attributes.get(k) ?? null,
    toggleAttribute: (k, force) => {
      const next = force ?? !attributes.has(k);
      if (next) attributes.set(k, ''); else attributes.delete(k);
    },
    append: (...c) => { node.children.push(...c); },
    replaceChildren: (...c) => { node.children = [...c]; },
    contains: n => n === node || node.children.some(c => c.contains(n)),
    focus: () => {},
    select: () => {},
    scrollIntoView: () => {},
    addEventListener: () => {},
    querySelector: s => node.querySelectorAll(s)[0] ?? null,
    querySelectorAll: selector => {
      const match = (el: Stub): boolean => {
        if (selector.startsWith('#')) return el.id === selector.slice(1);
        if (selector.startsWith('.')) return el.className.split(/\s+/).includes(selector.slice(1));
        const attr = /^\[([^=\]]+)(?:="([^"]*)")?\]$/.exec(selector);
        if (attr) {
          const [, name, val] = attr;
          const actual = name.startsWith('data-')
            ? el.dataset[name.slice(5).replace(/-([a-z])/g, (_, ch) => ch.toUpperCase())]
            : el.getAttribute(name);
          return val === undefined ? actual !== undefined && actual !== null : actual === val;
        }
        return el.tag === selector.toUpperCase();
      };
      const out: Stub[] = [];
      for (const child of node.children) {
        if (match(child)) out.push(child);
        out.push(...child.querySelectorAll(selector));
      }
      return out;
    },
  };
  return node;
}

afterEach(() => {
  setLocale('zh-CN');
  vi.unstubAllGlobals();
  vi.doUnmock('../src/ui-dom.js');
  vi.doUnmock('../src/ui-deck-view.js');
  vi.doUnmock('../src/card-view.js');
  vi.resetModules();
});

describe('Deck Builder duplicate / save as new', () => {
  test('duplicateDraftName appends copy suffix when unchanged and preserves unique renamed input', () => {
    const format = (base: string) => `${base} (Copy)`;
    expect(duplicateDraftName('Starter', 'Starter', ['Starter'], format)).toBe('Starter (Copy)');
    expect(duplicateDraftName('Starter', 'Starter', ['Starter', 'Starter (Copy)'], format)).toBe('Starter (Copy) 2');
    expect(duplicateDraftName('My Variant', 'Starter', ['Starter'], format)).toBe('My Variant');
    expect(duplicateDraftName('   ', 'Starter', ['Starter'], format)).toBe('Starter (Copy)');
    expect(duplicateDraftName('Existing', 'Starter', ['Starter', 'Existing'], format)).toBe('Existing (Copy)');
    const longName = 'A'.repeat(40);
    expect(duplicateDraftName(longName, longName, [longName], format).length).toBeLessThanOrEqual(40);
  });

  test('duplicating a saved deck clears draft identity so saving creates a separate deck without overwriting original', async () => {
    const nodes = new Map<string, Stub>();
    const get = (id: string) => {
      if (!nodes.has(id)) nodes.set(id, makeStub(id.includes('Name') ? 'input' : 'button'));
      return nodes.get(id)!;
    };

    const notice = vi.fn();
    vi.stubGlobal('window', {matchMedia: () => ({matches: false})});
    vi.stubGlobal('document', {
      activeElement: null,
      createElement: (tag: string) => Object.assign(makeStub(tag), {firstElementChild: makeStub('article')}),
    });
    vi.stubGlobal('HTMLButtonElement', class {});
    vi.doMock('../src/ui-dom.js', () => ({
      $: get,
      element: (tag: string, cls = '', text = '') => makeStub(tag, cls, text),
      button: (text: string, onclick: () => void, cls = '') => Object.assign(makeStub('button', cls, text), {onclick}),
      options: (select: Stub, rows: readonly (readonly [string, string])[]) => {
        select.options = rows.map(([value, label]) => ({value, label}));
      },
      openDialog: vi.fn(),
      closeDialog: vi.fn(),
      notice,
      downloadJson: vi.fn(),
    }));
    vi.doMock('../src/ui-deck-view.js', () => ({
      bindDeckGridKeys: vi.fn(),
      browseCard: vi.fn(() => makeStub('button')),
      cardNumber: (id: number) => `#${String(id).padStart(3, '0')}`,
      mountDeckInspector: () => ({update: vi.fn()}),
      renderDeckCurve: vi.fn(),
      renderDeckSlots: vi.fn(),
    }));

    const {mountLibrary} = await import('../src/ui-library.js');
    const original: SavedDeck = {id: 'deck:orig', name: 'Original Deck', cards: [...starterDeck]};
    let store: DeckStore = {version: 1, selectedId: original.id, decks: [original]};
    const save = vi.fn((next: DeckStore) => { store = next; return true; });
    const library = mountLibrary({
      entries: () => libraryEntries(null),
      visual: getCardVisual,
      decks: () => store,
      save,
      choose: vi.fn(),
    });

    // 1. Load saved deck, duplicate without editing name -> creates copy draft, saving keeps original intact.
    library.load(original);
    expect(get('duplicateDeck').disabled).toBe(false);
    expect(get('deleteDeck').disabled).toBe(false);
    get('duplicateDeck').onclick!();
    expect(get('deckName').value).toBe('Original Deck（副本）');
    expect(get('deleteDeck').disabled).toBe(true);
    expect(get('saveDeck').disabled).toBe(false);
    expect(get('savedDecks').value).toBe('');
    get('saveDeck').onclick!();
    expect(store.decks).toHaveLength(2);
    expect(store.decks[0]).toEqual(original);
    expect(store.decks[1].id).not.toBe(original.id);
    expect(store.decks[1].name).toBe('Original Deck（副本）');
    expect(store.decks[1].cards).toEqual(starterDeck);

    // 2. Load original again, type a new custom name, click Duplicate -> preserves custom name and saves as 3rd deck.
    library.load(original);
    get('deckName').value = 'Custom Variant';
    get('deckName').oninput!();
    get('duplicateDeck').onclick!();
    expect(get('deckName').value).toBe('Custom Variant');
    expect(get('deleteDeck').disabled).toBe(true);
    get('saveDeck').onclick!();
    expect(store.decks).toHaveLength(3);
    expect(store.decks[0]).toEqual(original);
    expect(store.decks[2].name).toBe('Custom Variant');
    expect(store.decks[2].id).not.toBe(original.id);

    // 3. Empty deck disables duplicate & share-code copy buttons.
    library.load({id: '', name: 'Empty', cards: []});
    expect(get('duplicateDeck').disabled).toBe(true);
    expect(get('copyDeckCode').disabled).toBe(true);
  });
});

describe('Deck Builder Pro (Task X3): Rank Curve, Share Codes & Parent-Token Links', () => {
  test('renderDeckCurve renders 4 rank bars, Avg Power, Legendary count and mechanic pills', async () => {
    vi.doMock('../src/ui-dom.js', () => ({
      $: vi.fn(),
      element: (tag: string, cls = '', text = '') => makeStub(tag, cls, text),
      button: (text: string, onclick: () => void, cls = '') => Object.assign(makeStub('button', cls, text), {onclick}),
    }));
    const {renderDeckCurve} = await import('../src/ui-deck-view.js');
    const host = makeStub('div', 'deck-curve');
    const sampleDeck = deckPresets[1].cards;
    const expected = analyzeDeckCurve(sampleDeck);

    renderDeckCurve(host as unknown as HTMLElement, sampleDeck);
    expect(host.dataset.total).toBe('15');
    expect(host.querySelectorAll('.deck-curve-col')).toHaveLength(4);
    expect(host.querySelector('[data-rank="rank1"]')!.querySelector('.deck-curve-count')!.textContent).toBe(String(expected.ranks.rank1));
    expect(host.querySelector('[data-rank="rank2"]')!.querySelector('.deck-curve-count')!.textContent).toBe(String(expected.ranks.rank2));
    expect(host.querySelector('[data-rank="rank3"]')!.querySelector('.deck-curve-count')!.textContent).toBe(String(expected.ranks.rank3));
    expect(host.querySelector('[data-rank="replace"]')!.querySelector('.deck-curve-count')!.textContent).toBe(String(expected.ranks.replace));
    expect(host.querySelector('[data-stat="avg-power"]')!.textContent).toContain(expected.avgPower.toFixed(1));
    expect(host.querySelector('[data-stat="legendary"]')!.textContent).toContain(String(expected.rarities.legendary));
    expect(host.querySelectorAll('.deck-curve-pill').length).toBeGreaterThan(0);

    // Empty deck omits mechanic pills cleanly.
    renderDeckCurve(host as unknown as HTMLElement, []);
    expect(host.dataset.total).toBe('0');
    expect(host.querySelectorAll('.deck-curve-pill')).toHaveLength(0);
  });

  test('share code copy/import modals encode, reject invalid codes, and load valid QBC1 decks; showCard links parents and derived tokens bidirectionally', async () => {
    const nodes = new Map<string, Stub>();
    const get = (id: string) => {
      if (!nodes.has(id)) nodes.set(id, makeStub(id.includes('Name') ? 'input' : 'div'));
      return nodes.get(id)!;
    };

    const openedDialogs: Array<{title: string; content: Stub}> = [];
    const closeDialog = vi.fn();
    const notice = vi.fn();
    const writeText = vi.fn(() => Promise.resolve());

    vi.stubGlobal('window', {matchMedia: () => ({matches: false})});
    vi.stubGlobal('navigator', {clipboard: {writeText}});
    vi.stubGlobal('document', {
      activeElement: null,
      createElement: (tag: string) => Object.assign(makeStub(tag), {firstElementChild: makeStub('article')}),
    });
    vi.stubGlobal('HTMLButtonElement', class {});
    vi.doMock('../src/ui-dom.js', () => ({
      $: get,
      element: (tag: string, cls = '', text = '') => makeStub(tag, cls, text),
      button: (text: string, onclick: () => void, cls = '') => Object.assign(makeStub('button', cls, text), {onclick}),
      options: (select: Stub, rows: readonly (readonly [string, string])[]) => {
        select.options = rows.map(([value, label]) => ({value, label}));
      },
      openDialog: (title: string, content: Stub) => { openedDialogs.push({title, content}); },
      closeDialog,
      notice,
      downloadJson: vi.fn(),
    }));
    vi.doMock('../src/card-view.js', () => ({
      createCardView: (card: {id: number; name: string}) => makeStub('article', 'qb-card', card.name),
      createCardDetails: (card: {id: number; name: string}) => makeStub('div', 'qb-details', card.name),
    }));

    const {mountLibrary} = await import('../src/ui-library.js');
    const store: DeckStore = {version: 1, selectedId: null, decks: []};
    const library = mountLibrary({
      entries: () => libraryEntries(null),
      visual: getCardVisual,
      decks: () => store,
      save: vi.fn(() => true),
      choose: vi.fn(),
    });

    // 1. Copy share code for valid starterDeck.
    library.load({id: '', name: 'Starter', cards: [...starterDeck]});
    expect(get('copyDeckCode').disabled).toBe(false);
    get('copyDeckCode').onclick!();
    const copyDialog = openedDialogs.at(-1)!;
    const expectedCode = encodeDeckCode(starterDeck);
    expect(copyDialog.content.querySelector('.deck-code-input')!.value).toBe(expectedCode);
    expect(writeText).toHaveBeenCalledWith(expectedCode);

    // 2. Import share code: invalid code shows error inline; valid code loads 15 cards & refreshes #deckCurve.
    const altDeck = deckPresets[2].cards;
    const altCode = encodeDeckCode(altDeck);
    get('importDeckCode').onclick!();
    const importDialog = openedDialogs.at(-1)!;
    const importInput = importDialog.content.querySelector('#deckCodeImportInput')!;
    const importError = importDialog.content.querySelector('.deck-code-error')!;
    const applyBtn = importDialog.content.querySelector('.primary')!;

    importInput.value = 'QBC1-BROKEN';
    applyBtn.onclick!();
    expect(importError.hidden).toBe(false);
    expect(closeDialog).not.toHaveBeenCalled();

    importInput.value = altCode;
    applyBtn.onclick!();
    expect(importError.hidden).toBe(true);
    expect(closeDialog).toHaveBeenCalledTimes(1);
    expect(get('deckCurve').dataset.total).toBe('15');
    expect(notice).toHaveBeenCalled();

    // 3. Parent -> Generated Token link (#010 Mandragora -> #1010 Mandragora Minion) and back!
    library.showCard(10);
    const parentDialog = openedDialogs.at(-1)!;
    const tokenBtn = parentDialog.content.querySelector('[data-related-card-id="1010"]');
    expect(tokenBtn).not.toBeNull();
    tokenBtn!.onclick!();

    const tokenDialog = openedDialogs.at(-1)!;
    const backToParentBtn = tokenDialog.content.querySelector('[data-related-card-id="10"]');
    expect(backToParentBtn).not.toBeNull();
    backToParentBtn!.onclick!();
    expect(openedDialogs.at(-1)!.content.querySelector('[data-related-card-id="1010"]')).not.toBeNull();

    // 4. Multi-generation token (#1056) links to both parent (#056) and derived token (#2056).
    library.showCard(1056);
    const midDialog = openedDialogs.at(-1)!;
    expect(midDialog.content.querySelector('[data-related-card-id="56"]')).not.toBeNull();
    expect(midDialog.content.querySelector('[data-related-card-id="2056"]')).not.toBeNull();
  });
});
