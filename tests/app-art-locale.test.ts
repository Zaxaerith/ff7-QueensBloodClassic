import {afterEach, describe, expect, test, vi} from 'vitest';
import {locales} from '../src/i18n/locales.js';
import type {SavedMatch} from '../src/match-archive.js';
import type {LibraryHooks} from '../src/ui-library.js';
import type {CardVisual, VisualManifest} from '../src/visuals.js';

type Resolver = (id: number) => CardVisual;
type NodeStub = {
  tag: string; value: string; checked: boolean; hidden: boolean; textContent: string; title: string;
  dataset: Record<string, string>; options: {value: string; label: string; lang?: string}[];
  attributes: Map<string, string>;
  setAttribute: (name: string, value: string) => void;
  removeAttribute: (name: string) => void;
  onchange: (() => void) | null; onclick: (() => void) | null; onfocus: (() => void) | null;
  children: NodeStub[]; firstElementChild?: NodeStub;
  append: (...children: NodeStub[]) => void; replaceChildren: (...children: NodeStub[]) => void;
  classList: {toggle: (name: string, force: boolean) => void}; focus: () => void;
  querySelector: (selector: string) => NodeStub | null;
  querySelectorAll: (selector: string) => NodeStub[];
};
function node(tag = 'div'): NodeStub {
  const attributes = new Map<string, string>();
  const value: NodeStub = {
    tag, value:'', checked:false, hidden:false, textContent:'', title:'', dataset:{}, options:[],
    attributes, setAttribute:(name, value) => { attributes.set(name, value); },
    removeAttribute:name => { attributes.delete(name); },
    onchange:null, onclick:null, onfocus:null, children:[], classList:{toggle:() => {}},
    focus:() => value.onfocus?.(),
    append:(...children) => { value.children.push(...children); },
    replaceChildren:(...children) => { value.children = children; },
    querySelector:selector => value.querySelectorAll(selector)[0] ?? null,
    querySelectorAll:selector => value.children.flatMap(child => {
      const matches = selector === child.tag ||
        (selector === 'button[aria-current=true]' && child.tag === 'button' && child.attributes.get('aria-current') === 'true') ||
        (selector === '.window' && child.attributes.get('class') === 'window');
      return [...(matches ? [child] : []), ...child.querySelectorAll(selector)];
    }),
  };
  return value;
}
const mockedModules = ['ui-dom', 'ui-library', 'ui-match', 'ui-replay', 'ui-carnival', 'ui-art-import', 'browser-art'];
afterEach(() => {
  for (const name of mockedModules) vi.doUnmock('../src/' + name + '.js');
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

// Exercise the real app entry, config handler, locale state and pack loader.
// Only DOM/view mounts are doubled: no browser, Worker, gameplay or private art is needed.
async function boot(mode: 'private' | 'development', saved?: SavedMatch) {
  vi.resetModules();
  vi.stubEnv('MODE', mode);
  const nodes = new Map<string, NodeStub>();
  const get = (id: string) => {
    if (!nodes.has(id)) nodes.set(id, node());
    return nodes.get(id)!;
  };
  const menu = new Map(['home', 'config', 'records', 'carnival'].map(route => {
    const item = get(route === 'carnival' ? 'carnivalNav' : 'nav-' + route);
    item.dataset.route = route;
    return [route, item] as const;
  }));
  const {MATCH_KEY} = await import('../src/match-archive.js');
  const configWindow = node();
  configWindow.setAttribute('class', 'window');
  get('view-config').append(configWindow);
  const memory = new Map<string, string>(saved ? [[MATCH_KEY, JSON.stringify(saved)]] : []);
  vi.stubGlobal('window', {
    localStorage:{getItem:(key: string) => memory.get(key) ?? null,
      setItem:(key: string, value: string) => { memory.set(key, value); }},
    addEventListener:vi.fn(), scrollTo:vi.fn(),
  });
  vi.stubGlobal('document', {
    documentElement:{dataset:{}, lang:''}, querySelectorAll:(selector: string) => selector === '[data-route]' ? [...menu.values()] : [],
    getElementById:(id: string) => nodes.get(id) ?? null,
    // The artwork host parses markup in the browser. These tests only need its mounted child.
    createElement:(tag: string) => Object.assign(node(tag), {firstElementChild:node('section')}),
    querySelector:() => null, addEventListener:vi.fn(),
  });
  vi.stubGlobal('navigator', {languages:['en'], language:'en'});
  vi.doMock('../src/ui-dom.js', () => ({
    $:get,
    element:(tag: string, _className?: string, text = '') => Object.assign(node(tag), {textContent:text}),
    button:(text: string, onclick: () => void) => Object.assign(node('button'), {textContent:text, onclick}),
    initDialog:vi.fn(), openDialog:vi.fn(), closeDialog:vi.fn(),
    notice:vi.fn(), downloadJson:vi.fn(),
    options:(select: NodeStub, rows: readonly (readonly [string, string])[]) => {
      select.options = rows.map(([value,label]) => ({value,label}));
    },
  }));
  const views: Resolver[] = [];
  const localize = vi.fn();
  const matchRefresh = vi.fn();
  const matchRestore = vi.fn();
  const matchResume = vi.fn();
  const matchPause = vi.fn();
  const matchStart = vi.fn(() => null);
  vi.doMock('../src/ui-library.js', () => ({mountLibrary:(hooks: LibraryHooks) => {
    views.push(hooks.visual);
    return {localize, showCard:vi.fn(), load:vi.fn(), refresh:vi.fn(),
      showHomeDeck:vi.fn(), showDecks:vi.fn(), showCollection:vi.fn()};
  }}));
  vi.doMock('../src/ui-match.js', () => ({mountMatch:(hooks: {visual: Resolver}) => {
    views.push(hooks.visual);
    return {refresh:matchRefresh, restore:matchRestore, start:matchStart,
      unfinished:() => !!saved && saved.phase !== 'finished', hasMatch:() => !!saved,
      rulesVersion:() => saved?.rulesVersion ?? null, resume:matchResume, pause:matchPause};
  }}));
  vi.doMock('../src/ui-replay.js', () => ({mountReplay:(hooks: {visual: Resolver}) => {
    views.push(hooks.visual);
    return {refresh:vi.fn(), cancel:vi.fn()};
  }}));
  const carnivalShowList = vi.fn(), carnivalLeave = vi.fn();
  const mountCarnival = vi.fn((_root: NodeStub, _hooks: {visual: Resolver}) => ({
    showList:carnivalShowList, leave:carnivalLeave,
  }));
  vi.doMock('../src/ui-carnival.js', () => ({mountCarnival}));
  const mountArtImport = vi.fn(() => ({localize:vi.fn()}));
  const refreshRenderedArtwork = vi.fn();
  vi.doMock('../src/ui-art-import.js', () => ({mountArtImport}));
  vi.doMock('../src/browser-art.js', () => ({refreshRenderedArtwork}));
  const focus = [112, 122, 133];
  const manifest: VisualManifest = {version:1, cards:focus.map(cardId => ({
    cardId, portraitPath:'classic/portraits/fixture-' + cardId + '.png',
  }))};
  let deliver!: () => void;
  const pending = new Promise<Response>(resolve => {
    deliver = () => resolve(new Response(JSON.stringify(manifest)));
  });
  const fetchMock = vi.fn((url: string) => url === './classic/visual-manifest.json'
    ? pending : Promise.resolve(new Response(JSON.stringify({cards:[]}))));
  vi.stubGlobal('fetch', fetchMock);
  await import('../src/app.js');
  const {getLocale} = await import('../src/i18n/index.js');
  const {byId} = await import('../src/cards.js');
  const {renderCardMarkup} = await import('../src/card-view.js');
  return {get, views, focus, deliver, fetchMock, getLocale, byId, renderCardMarkup,
    localize, matchRefresh, mountArtImport, refreshRenderedArtwork,
    matchRestore, matchStart, matchResume, matchPause, menu, mountCarnival, carnivalShowList, carnivalLeave,
    rawSave:() => memory.get(MATCH_KEY)};
}

describe('M8-A2.1 app art-pack lifetime', () => {
  test.each([false, true])('private pack survives locale changes (switch before load: %s)', async switchBeforeLoad => {
    const app = await boot('private');
    expect(app.mountArtImport).not.toHaveBeenCalled();
    expect(app.views).toHaveLength(3);
    if (switchBeforeLoad) {
      app.get('locale').value = 'ko';
      app.get('locale').onchange!();
      expect(app.getLocale()).toBe('ko');
      for (const visual of app.views) expect(visual(112).portraitPath).toBeNull();
    }
    app.deliver();
    await vi.waitFor(() => expect(app.refreshRenderedArtwork).toHaveBeenCalledOnce());
    const initial = app.focus.map(id => app.views[0](id));
    for (const locale of locales) {
      app.get('locale').value = locale;
      app.get('locale').onchange!();
      expect(app.getLocale()).toBe(locale);
      for (const visual of app.views) {
        for (const [index, id] of app.focus.entries()) {
          expect(visual(id)).toBe(initial[index]);
          const markup = app.renderCardMarkup(app.byId.get(id)!, visual(id), 0, {locale});
          expect(markup.match(/<img[^>]+src="([^"]+)"/)?.[1]).toBe(initial[index].portraitPath);
        }
      }
    }
    expect(app.fetchMock.mock.calls.filter(([url]) => url === './classic/visual-manifest.json')).toHaveLength(1);
    expect(app.refreshRenderedArtwork).toHaveBeenCalledOnce();
    expect(app.localize).toHaveBeenCalledTimes(1 + locales.length + Number(switchBeforeLoad));
    expect(app.matchRefresh).toHaveBeenCalledTimes(1 + locales.length + Number(switchBeforeLoad));
  });

  test('public startup remains art-free across locale changes and never fetches a private pack', async () => {
    const app = await boot('development');
    for (const locale of locales) {
      app.get('locale').value = locale;
      app.get('locale').onchange!();
      expect(app.getLocale()).toBe(locale);
      for (const visual of app.views) for (const id of app.focus) expect(visual(id).portraitPath).toBeNull();
    }
    expect(app.mountArtImport).toHaveBeenCalledOnce();
    expect(app.fetchMock.mock.calls.map(([url]) => url)).toEqual(['./catalog.json']);
    expect(app.refreshRenderedArtwork).not.toHaveBeenCalled();
  });
});

test('New Game binds every localized NPC and mirror option while Continue keeps its saved opponent', async () => {
  const {starterDeck} = await import('../src/cards.js');
  const {challengers,findChallenger} = await import('../src/challengers.js');
  const {startMatch} = await import('../src/match-flow.js');
  const {saveMatch} = await import('../src/match-archive.js');
  const original = findChallenger('devin-moore')!;
  const settings = {
    deck:starterDeck,seed:701,difficulty:'hard',first:'computer',opponent:{npcId:original.id,deck:original.deck},
  } as const;
  const game = startMatch(settings);
  const saved = saveMatch(game,settings,'Classic','m8-b3-app');
  const app = await boot('development',saved);
  const {termRecord} = await import('../src/i18n/card-names.js');
  const {t} = await import('../src/i18n/index.js');
  const roster = app.get('opponentRoster');
  const difficulty = app.get('difficulty');
  difficulty.value = 'easy';
  const menuOpponent = 'darren-moore';
  const rosterButtons = () => roster.querySelectorAll('button');
  const focusOpponent = (id: string) => rosterButtons().find(button => button.dataset.opponent === id)!.focus();
  focusOpponent(menuOpponent);
  for (const locale of locales) {
    app.get('locale').value = locale;
    app.get('locale').onchange!();
    expect(roster.querySelector('button[aria-current=true]')?.dataset.opponent).toBe(menuOpponent);
    const buttons = rosterButtons();
    expect(buttons).toHaveLength(challengers.length + 2);
    expect(buttons.find(button => button.dataset.opponent === '')?.textContent).toBe(t('mirrorPractice'));
    expect(buttons.find(button => button.dataset.opponent === 'shadowblood-queen')?.textContent).toBe(t('shadowbloodQueenName'));
    const details = new Set<string>();
    for (const npc of challengers) {
      const name = termRecord('npc:'+npc.id,locale)!;
      const region = termRecord('region:'+npc.regionId,locale)!;
      expect(buttons.find(button => button.dataset.opponent === npc.id)?.textContent).toBe(name.name);
      if (name.status === 'fallback') expect(name.name).toBe(npc.name);
      focusOpponent(npc.id);
      expect(app.get('prepOpponent').textContent).toBe(name.name);
      expect(app.get('prepOpponentRegion').textContent).toContain(region.name);
      expect(app.get('prepReward').hidden).toBe(false);
      const hint = app.get('opponentInfo').textContent;
      for (const id of npc.tactic.cards) expect(hint).toContain(termRecord(id,locale)!.name);
      expect(hint).not.toMatch(/⟦|undefined/);
      expect(difficulty.value).toBe('easy');
      details.add(hint);
    }
    expect(details.size).toBe(challengers.length);
    focusOpponent(menuOpponent);
  }
  app.get('resumeGame').onclick!();
  expect(app.matchRestore).toHaveBeenCalledExactlyOnceWith({save:saved,game});
  expect(app.matchResume).toHaveBeenCalledOnce();
  expect(app.matchStart).not.toHaveBeenCalled();
  expect(app.rawSave()).toBe(JSON.stringify(saved));
});

test('the Carnival route reuses one mount and the live pack resolver without opening or saving a match', async () => {
  const app = await boot('private');
  const {carnivalMessages} = await import('../src/i18n/carnival.js');
  const carnival = app.menu.get('carnival')!;
  expect(app.mountCarnival).not.toHaveBeenCalled();
  expect(app.get('view-carnival').hidden).toBe(true);

  carnival.onclick!();
  expect(app.get('app').dataset.view).toBe('carnival');
  expect(app.get('view-carnival').hidden).toBe(false);
  expect(carnival.attributes.get('aria-current')).toBe('page');
  expect(app.mountCarnival).toHaveBeenCalledOnce();
  expect(app.carnivalShowList).toHaveBeenCalledOnce();
  const [root, hooks] = app.mountCarnival.mock.calls[0];
  expect(root).toBe(app.get('view-carnival'));
  expect(hooks.visual(112).portraitPath).toBeNull();
  app.deliver();
  await vi.waitFor(() => expect(hooks.visual(112).portraitPath).toBe('classic/portraits/fixture-112.png'));

  app.get('backMenu').onclick!();
  expect(app.get('app').dataset.view).toBe('home');
  expect(app.get('view-carnival').hidden).toBe(true);
  expect(carnival.attributes.has('aria-current')).toBe(false);
  expect(app.carnivalLeave).toHaveBeenCalledOnce();

  for (const locale of locales) {
    app.menu.get('config')!.onclick!();
    app.get('locale').value = locale;
    app.get('locale').onchange!();
    expect(carnival.textContent).toEqual(carnivalMessages(locale).title);
    carnival.onclick!();
    expect(app.get('app').dataset.view).toBe('carnival');
  }
  expect(app.mountCarnival).toHaveBeenCalledOnce();
  expect(app.carnivalShowList).toHaveBeenCalledTimes(1 + locales.length);
  expect(app.carnivalLeave).toHaveBeenCalledTimes(locales.length);
  expect(app.matchStart).not.toHaveBeenCalled();
  expect(app.matchResume).not.toHaveBeenCalled();
  expect(app.matchPause).not.toHaveBeenCalled();
  expect(app.rawSave()).toBeUndefined();
});
