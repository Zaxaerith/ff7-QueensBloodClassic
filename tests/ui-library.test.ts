import {afterEach, describe, expect, test, vi} from 'vitest';
import {starterDeck} from '../src/cards.js';
import {setLocale} from '../src/i18n/index.js';
import {libraryEntries, type DeckStore, type SavedDeck} from '../src/ui-data.js';
import {duplicateDraftName} from '../src/ui-library.js';
import {getCardVisual} from '../src/visuals.js';

afterEach(() => {
  setLocale('zh-CN');
  vi.unstubAllGlobals();
  vi.doUnmock('../src/ui-dom.js');
  vi.doUnmock('../src/ui-deck-view.js');
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
    type Stub = {
      tag: string; value: string; hidden: boolean; disabled: boolean; textContent: string; title: string;
      dataset: Record<string, string>; options: {value: string; label: string}[];
      onclick: (() => void) | null; onchange: (() => void) | null; oninput: (() => void) | null;
      children: Stub[];
      setAttribute: (k: string, v: string) => void;
      toggleAttribute: (k: string, force?: boolean) => void;
      append: (...c: Stub[]) => void;
      replaceChildren: (...c: Stub[]) => void;
      contains: (n: unknown) => boolean;
      focus: () => void;
      scrollIntoView: () => void;
      querySelector: (s: string) => Stub | null;
      querySelectorAll: (s: string) => Stub[];
    };
    const make = (tag = 'div'): Stub => {
      const node: Stub = {
        tag, value: '', hidden: false, disabled: false, textContent: '', title: '', dataset: {}, options: [],
        onclick: null, onchange: null, oninput: null, children: [],
        setAttribute: () => {},
        toggleAttribute: () => {},
        append: (...c) => { node.children.push(...c); },
        replaceChildren: (...c) => { node.children = c; },
        contains: n => n === node || node.children.some(c => c.contains(n)),
        focus: () => {},
        scrollIntoView: () => {},
        querySelector: s => node.querySelectorAll(s)[0] ?? null,
        querySelectorAll: () => [],
      };
      return node;
    };
    const nodes = new Map<string, Stub>();
    const get = (id: string) => {
      if (!nodes.has(id)) nodes.set(id, make(id.includes('Name') ? 'input' : 'button'));
      return nodes.get(id)!;
    };

    const notice = vi.fn();
    vi.stubGlobal('window', {matchMedia: () => ({matches: false})});
    vi.stubGlobal('document', {
      activeElement: null,
      createElement: (tag: string) => Object.assign(make(tag), {firstElementChild: make('article')}),
    });
    vi.stubGlobal('HTMLButtonElement', class {});
    vi.doMock('../src/ui-dom.js', () => ({
      $: get,
      element: (tag: string, _cls?: string, text = '') => Object.assign(make(tag), {textContent: text}),
      button: (text: string, onclick: () => void) => Object.assign(make('button'), {textContent: text, onclick}),
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
      browseCard: vi.fn(() => make('button')),
      cardNumber: (id: number) => `#${String(id).padStart(3, '0')}`,
      mountDeckInspector: () => ({update: vi.fn()}),
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

    // 3. Empty deck disables duplicate button.
    library.load({id: '', name: 'Empty', cards: []});
    expect(get('duplicateDeck').disabled).toBe(true);
  });
});
