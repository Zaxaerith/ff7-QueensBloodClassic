import {afterEach, describe, expect, test, vi} from 'vitest';
import {shadowbloodQueen} from '../src/boss-challengers.js';
import {starterDeck} from '../src/cards.js';
import {termRecord} from '../src/i18n/card-names.js';
import {bossProfile, opponentName} from '../src/i18n/game-labels.js';
import {setLocale, t} from '../src/i18n/index.js';
import {locales} from '../src/i18n/locales.js';
import {MATCH_KEY, MatchHistory, restoreMatch, saveMatch} from '../src/match-archive.js';
import {startMatch, type MatchSettings} from '../src/match-flow.js';
import {battleBackgrounds, mountBackgroundPicker} from '../src/ui-background.js';
import {mulligan, pass} from '../src/engine.js';

type NodeStub = {
  tag: string; value: string; checked: boolean; hidden: boolean; disabled: boolean;
  textContent: string; title: string; className: string;
  dataset: Record<string, string>;
  options: {value: string; label: string; lang?: string}[];
  attributes: Map<string, string>;
  setAttribute: (name: string, value: string) => void;
  removeAttribute: (name: string) => void;
  onchange: (() => void) | null; onclick: (() => void) | null; onfocus: (() => void) | null;
  children: NodeStub[]; firstElementChild?: NodeStub;
  parentElement: NodeStub | null;
  append: (...children: NodeStub[]) => void;
  replaceChildren: (...children: NodeStub[]) => void;
  classList: {toggle: (name: string, force?: boolean) => void; add: (name: string) => void};
  focus: () => void;
  querySelector: (selector: string) => NodeStub | null;
  querySelectorAll: (selector: string) => NodeStub[];
  closest: (selector: string) => NodeStub | null;
  addEventListener: (type: string, fn: () => void) => void;
};

function makeNode(tag = 'div'): NodeStub {
  const attributes = new Map<string, string>();
  const node: NodeStub = {
    tag, value: '', checked: false, hidden: false, disabled: false,
    textContent: '', title: '', className: '', dataset: {}, options: [],
    attributes,
    setAttribute: (name, value) => { attributes.set(name, value); },
    removeAttribute: name => { attributes.delete(name); },
    onchange: null, onclick: null, onfocus: null, children: [], parentElement: null,
    classList: {toggle: () => {}, add: () => {}},
    focus: () => node.onfocus?.(),
    append: (...children) => {
      for (const child of children) {
        child.parentElement = node;
        node.children.push(child);
      }
    },
    replaceChildren: (...children) => {
      node.children = [];
      node.append(...children);
    },
    querySelector: selector => node.querySelectorAll(selector)[0] ?? null,
    querySelectorAll: selector => node.children.flatMap(child => {
      const matches = selector === child.tag ||
        (selector === 'button[aria-current=true]' && child.tag === 'button' && child.attributes.get('aria-current') === 'true') ||
        (selector === '.window' && child.attributes.get('class') === 'window');
      return [...(matches ? [child] : []), ...child.querySelectorAll(selector)];
    }),
    closest: () => null,
    addEventListener: () => {},
  };
  return node;
}

const mockedModules = ['ui-dom', 'ui-library', 'ui-match', 'ui-replay', 'ui-carnival', 'ui-art-import', 'browser-art'];
afterEach(() => {
  setLocale('zh-CN');
  for (const name of mockedModules) vi.doUnmock('../src/' + name + '.js');
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('M12 Shadowblood Queen UI, localization and tabletop theme', () => {
  test('registers the shadowblood-queen tabletop theme and localizes boss profile across all 11 languages', () => {
    expect(battleBackgrounds.some(bg => bg.id === 'shadowblood-queen')).toBe(true);
    for (const locale of locales) {
      setLocale(locale);
      const profile = bossProfile(shadowbloodQueen);
      expect(opponentName(shadowbloodQueen.id, shadowbloodQueen.name)).toBe(t('shadowbloodQueenName'));
      expect(profile.name).toBe(termRecord(145, locale)!.name);
      expect(profile.ruleSummary).toContain(termRecord(145, locale)!.name);
      expect(profile.ruleSummary).toContain('B5');
      expect(profile.tactic).toContain(termRecord(145, locale)!.name);
      expect(profile.tactic).toContain(termRecord(74, locale)!.name);
      expect(profile.tactic).toContain(termRecord(46, locale)!.name);
      expect(profile.description).not.toMatch(/⟦|undefined/);
      expect(t('themeShadowbloodQueen').trim()).not.toBe('');
    }
  });

  test('selects Shadowblood Queen in challenge roster, prepares match, starts with boss settings, and preserves boss identity on Continue and Records', async () => {
    vi.resetModules();
    vi.stubEnv('MODE', 'development');
    const nodes = new Map<string, NodeStub>();
    const get = (id: string) => {
      if (!nodes.has(id)) nodes.set(id, makeNode());
      return nodes.get(id)!;
    };
    const menu = new Map(['home', 'config', 'records', 'carnival'].map(route => {
      const item = get(route === 'carnival' ? 'carnivalNav' : 'nav-' + route);
      item.dataset.route = route;
      return [route, item] as const;
    }));
    const configWindow = makeNode();
    configWindow.setAttribute('class', 'window');
    get('view-config').append(configWindow);

    // Prepare a saved in-progress Boss match and a completed Boss match in storage.
    const bossSettings: MatchSettings = {
      deck: starterDeck,
      seed: 1212,
      difficulty: 'hard',
      first: 'player',
      opponent: {npcId: shadowbloodQueen.id, deck: shadowbloodQueen.deck},
    };
    const activeGame = startMatch(bossSettings);
    expect(activeGame.board[1][4].card?.id).toBe(145);
    const activeSaved = saveMatch(activeGame, bossSettings, 'Starter', 'm12-active');

    const completedGame = structuredClone(activeGame);
    mulligan(completedGame, 0, []);
    mulligan(completedGame, 1, []);
    pass(completedGame, 0);
    pass(completedGame, 1);
    const completedSaved = saveMatch(completedGame, bossSettings, 'Starter', 'm12-finished');

    const memory = new Map<string, string>([[MATCH_KEY, JSON.stringify(activeSaved)]]);
    const storage = {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => { memory.set(key, value); },
    };
    expect(new MatchHistory(storage).add(completedSaved)).toBeNull();

    vi.stubGlobal('window', {
      localStorage: storage,
      addEventListener: vi.fn(),
      scrollTo: vi.fn(),
    });
    vi.stubGlobal('document', {
      documentElement: {dataset: {}, lang: ''},
      querySelectorAll: (selector: string) => selector === '[data-route]' ? [...menu.values()] : [],
      getElementById: (id: string) => nodes.get(id) ?? null,
      createElement: (tag: string) => Object.assign(makeNode(tag), {firstElementChild: makeNode('section')}),
      querySelector: () => null,
      addEventListener: vi.fn(),
    });
    vi.stubGlobal('navigator', {languages: ['zh-CN'], language: 'zh-CN'});
    vi.doMock('../src/ui-dom.js', () => ({
      $: get,
      element: (tag: string, className = '', text = '') => Object.assign(makeNode(tag), {className, textContent: text}),
      button: (text: string, onclick: () => void, className = '') => Object.assign(makeNode('button'), {textContent: text, onclick, className}),
      initDialog: vi.fn(), openDialog: vi.fn(), closeDialog: vi.fn(),
      notice: vi.fn(), downloadJson: vi.fn(),
      options: (select: NodeStub, rows: readonly (readonly [string, string])[]) => {
        select.options = rows.map(([value, label]) => ({value, label}));
      },
    }));
    vi.doMock('../src/ui-library.js', () => ({mountLibrary: () => ({
      localize: vi.fn(), showCard: vi.fn(), load: vi.fn(), refresh: vi.fn(),
      showHomeDeck: vi.fn(), showDecks: vi.fn(), showCollection: vi.fn(),
    })}));
    const matchStart = vi.fn(() => null);
    const matchRestore = vi.fn();
    vi.doMock('../src/ui-match.js', () => ({mountMatch: () => ({
      refresh: vi.fn(), restore: matchRestore, start: matchStart,
      unfinished: () => false, hasMatch: () => true,
      rulesVersion: () => activeSaved.rulesVersion, resume: vi.fn(), pause: vi.fn(),
    })}));
    vi.doMock('../src/ui-replay.js', () => ({mountReplay: () => ({refresh: vi.fn(), cancel: vi.fn()})}));
    vi.doMock('../src/ui-carnival.js', () => ({mountCarnival: vi.fn(() => ({showList: vi.fn(), leave: vi.fn()}))}));
    vi.doMock('../src/ui-art-import.js', () => ({mountArtImport: vi.fn(() => ({localize: vi.fn()}))}));
    vi.doMock('../src/browser-art.js', () => ({refreshRenderedArtwork: vi.fn()}));
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify({cards: []})))));

    await import('../src/app.js');
    const {t: liveT} = await import('../src/i18n/index.js');

    // Continue restored the saved Boss match on startup.
    expect(matchRestore).toHaveBeenCalledOnce();
    expect(matchRestore.mock.calls[0][0].save.settings.opponent?.npcId).toBe(shadowbloodQueen.id);

    // Selecting Shadowblood Queen in roster navigates to prepare and displays boss metadata.
    const roster = get('opponentRoster');
    const bossButton = roster.querySelectorAll('button').find(btn => btn.dataset.opponent === shadowbloodQueen.id)!;
    expect(bossButton).toBeDefined();
    for (const locale of locales) {
      get('locale').value = locale;
      get('locale').onchange!();
      const btn = roster.querySelectorAll('button').find(b => b.dataset.opponent === shadowbloodQueen.id)!;
      btn.focus();
      expect(btn.textContent).toBe(liveT('shadowbloodQueenName'));
      expect(get('prepOpponent').textContent).toBe(liveT('shadowbloodQueenName'));
      expect(get('prepOpponentRegion').textContent).toContain(liveT('bossChallengeSection'));
      expect(get('opponentInfo').textContent).toContain(termRecord(145, locale)!.name);
      expect(get('prepReward').hidden).toBe(false);
    }

    // Clicking boss button enters prepare; Records displays localized Boss banner and name.
    get('locale').value = 'en';
    get('locale').onchange!();
    const enBossButton = roster.querySelectorAll('button').find(b => b.dataset.opponent === shadowbloodQueen.id)!;
    enBossButton.onclick!();
    expect(get('app').dataset.view).toBe('prepare');
    menu.get('records')!.onclick!();
    const recordHeadings = get('recordList').querySelectorAll('h3').map(h => h.textContent);
    expect(recordHeadings[0]).toContain(liveT('bossBattleBanner'));
    expect(recordHeadings[0]).toContain(liveT('shadowbloodQueenName'));
    expect(restoreMatch(activeSaved).save.settings.opponent?.npcId).toBe('shadowblood-queen');
  });

  test('mountBackgroundPicker includes shadowblood-queen theme and switches host dataset cleanly', () => {
    vi.stubGlobal('Option', class { constructor(public text: string, public value: string) {} });
    const listeners = new Map<string, () => void>();
    const host = makeNode('div');
    const select = Object.assign(makeNode('select'), {
      addEventListener: (type: string, fn: () => void) => { listeners.set(type, fn); },
    });
    const localize = mountBackgroundPicker(host as unknown as HTMLElement, select as unknown as HTMLSelectElement);
    expect(select.value).toBe('hybrid');
    expect(host.dataset.background).toBe('hybrid');
    expect(select.children.some(opt => (opt as unknown as {value: string}).value === 'shadowblood-queen')).toBe(true);

    select.value = 'shadowblood-queen';
    listeners.get('change')?.();
    expect(host.dataset.background).toBe('shadowblood-queen');

    setLocale('ja');
    localize();
    expect(select.value).toBe('shadowblood-queen');
    const jaOption = select.children.find(opt => (opt as unknown as {value: string}).value === 'shadowblood-queen') as unknown as {text: string};
    expect(jaOption.text).toBe(t('themeShadowbloodQueen'));
  });
});
