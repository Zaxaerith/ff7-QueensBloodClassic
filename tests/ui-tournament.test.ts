import {afterEach, describe, expect, test, vi} from 'vitest';
import {starterDeck} from '../src/cards.js';
import type {RuleEvent} from '../src/engine.js';
import {
  bloodRankTitle, tournamentOpponentLabel, tournamentStageLabel,
} from '../src/i18n/game-labels.js';
import {setLocale, t} from '../src/i18n/index.js';
import {locales} from '../src/i18n/locales.js';
import {batchLegendaryVfx, legendaryCardVfx} from '../src/match-effects.js';
import {BLOOD_RANKS, emptyProgress, recordTournamentRun} from '../src/progress.js';
import {
  TOURNAMENT_ROUNDS, TOURNAMENT_STORAGE_KEY, TournamentSession,
  readActiveTournament, writeActiveTournament,
} from '../src/tournament-session.js';
import {resolveTournamentTheme} from '../src/ui-tournament.js';
import {getCardVisual} from '../src/visuals.js';

class FakeElement extends EventTarget {
  readonly tagName: string;
  id = '';
  className = '';
  hidden = false;
  disabled = false;
  checked = false;
  type = '';
  tabIndex = 0;
  scrollTop = 0;
  lang = '';
  private _text = '';
  title = '';
  scope = '';
  parentElement: FakeElement | null = null;
  children: FakeElement[] = [];
  dataset: Record<string, string> = {};
  attributes = new Map<string, string>();
  style = {setProperty: vi.fn()};
  onclick: ((event?: unknown) => void) | null = null;
  onchange: ((event?: unknown) => void) | null = null;
  onmouseenter: (() => void) | null = null;
  onmouseleave: (() => void) | null = null;
  private doc: FakeDocument;

  constructor(tag: string, doc: FakeDocument) {
    super();
    this.tagName = tag.toUpperCase();
    this.doc = doc;
  }

  get textContent(): string {
    return this.children.length ? this.children.map(c => c.textContent).join(' ') : this._text;
  }
  set textContent(value: string) {
    this._text = value;
  }

  get classList() {
    const tokens = () => this.className.split(/\s+/).filter(Boolean);
    return {
      contains: (name: string) => tokens().includes(name),
      add: (name: string) => { if (!tokens().includes(name)) this.className = [...tokens(), name].join(' '); },
      remove: (name: string) => { this.className = tokens().filter(tok => tok !== name).join(' '); },
      toggle: (name: string, force?: boolean) => {
        const has = tokens().includes(name);
        const next = force ?? !has;
        if (next && !has) this.className = [...tokens(), name].join(' ');
        if (!next && has) this.className = tokens().filter(tok => tok !== name).join(' ');
      },
    };
  }

  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  getAttribute(name: string) { return this.attributes.get(name) ?? null; }
  removeAttribute(name: string) { this.attributes.delete(name); }
  toggleAttribute(name: string, force?: boolean) {
    const next = force ?? !this.attributes.has(name);
    if (next) this.attributes.set(name, '');
    else this.attributes.delete(name);
    return next;
  }
  set innerHTML(markup: string) {
    this._text = markup;
    const child = new FakeElement('article', this.doc);
    const label = markup.match(/aria-label="([^"]*)"/)?.[1];
    if (label) child.setAttribute('aria-label', label);
    const dd = new FakeElement('dd', this.doc);
    child.append(dd);
    this.children = [child];
    child.parentElement = this;
  }
  get firstElementChild(): FakeElement | null { return this.children[0] ?? null; }
  get content() { return {firstElementChild: this.firstElementChild}; }

  append(...nodes: (FakeElement | {textContent?: string})[]) {
    for (const node of nodes) {
      if (node instanceof FakeElement) {
        node.parentElement = this;
        this.children.push(node);
      } else if (node?.textContent) {
        this._text += node.textContent;
      }
    }
  }
  prepend(...nodes: (FakeElement | {textContent?: string})[]) {
    for (const node of [...nodes].reverse()) {
      if (node instanceof FakeElement) {
        node.parentElement = this;
        this.children.unshift(node);
      }
    }
  }
  replaceChildren(...nodes: (FakeElement | {textContent?: string})[]) {
    for (const child of this.children) child.parentElement = null;
    this.children = [];
    this._text = '';
    this.append(...nodes);
  }
  contains(node: unknown): boolean {
    if (node === this) return true;
    return this.children.some(child => child.contains(node));
  }
  focus() {
    if (this.disabled || this.hidden) return;
    this.doc.activeElement = this;
    this.dispatchEvent(new Event('focusin', {bubbles: true}));
  }
  click() {
    if (this.disabled || this.hidden) return;
    this.onclick?.();
  }
  scrollIntoView() {}
  createTHead() {
    const thead = new FakeElement('thead', this.doc);
    this.append(thead);
    return thead;
  }
  createTBody() {
    const tbody = new FakeElement('tbody', this.doc);
    this.append(tbody);
    return tbody;
  }
  insertRow() {
    const tr = new FakeElement('tr', this.doc);
    this.append(tr);
    return tr;
  }
  matches(selector: string): boolean {
    if (selector.includes(',')) return selector.split(',').some(part => this.matches(part.trim()));
    if (selector.endsWith(':not(:disabled)')) return !this.disabled && this.matches(selector.slice(0, -15));
    if (selector.startsWith('#')) return this.id === selector.slice(1);
    if (selector.startsWith('.')) return this.classList.contains(selector.slice(1));
    const attr = /^\[([^=\]]+)(?:="([^"]*)")?\]$/.exec(selector);
    if (attr) {
      const [, name, value] = attr;
      const actual = name.startsWith('data-')
        ? this.dataset[name.slice(5).replace(/-([a-z])/g, (_, ch) => ch.toUpperCase())]
        : this.getAttribute(name);
      return value === undefined ? actual !== undefined && actual !== null : actual === value;
    }
    return this.tagName === selector.toUpperCase();
  }
  querySelectorAll(selector: string): FakeElement[] {
    const out: FakeElement[] = [];
    for (const child of this.children) {
      if (child.matches(selector)) out.push(child);
      out.push(...child.querySelectorAll(selector));
    }
    return out;
  }
  querySelector(selector: string): FakeElement | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }
}

class FakeDocument {
  activeElement: FakeElement | null = null;
  documentElement = {dataset: {reduceMotion: 'true'}, lang: 'zh-CN'};
  createElement(tag: string) { return new FakeElement(tag, this); }
  querySelector() { return null; }
  querySelectorAll() { return []; }
}

afterEach(() => {
  setLocale('zh-CN');
  vi.unstubAllGlobals();
  vi.resetModules();
});

async function setupTournamentDom() {
  const doc = new FakeDocument();
  vi.stubGlobal('document', doc);
  vi.stubGlobal('window', {
    matchMedia: () => ({matches: true}),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
  });
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('Worker', undefined);
  const {mountTournament} = await import('../src/ui-tournament.js');
  const root = doc.createElement('section');
  const memory = new Map<string, string>();
  const storage = {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => { memory.set(key, value); },
  };
  let progress = recordTournamentRun(emptyProgress(), {wins: 6, championshipWon: true, exhibitionCleared: true});
  const showCard = vi.fn();
  const editDeck = vi.fn();
  const tournament = mountTournament(root as unknown as HTMLElement, {
    visual: getCardVisual,
    showCard,
    deck: () => ({id: 'preset:0', name: 'Classic Starter', cards: [...starterDeck]}),
    storage,
    editDeck,
    progress: {
      get: () => progress,
      recordRun: run => { progress = recordTournamentRun(progress, run); },
    },
  });
  return {doc, root, memory, storage, tournament, getProgress: () => progress};
}

describe('Shinra-8 Cruise Tournament UI, Blood Hunter Rank & Legendary VFX', () => {
  test('renders bracket lobby across all 11 languages without missing placeholders', () => {
    for (const locale of locales) {
      setLocale(locale);
      expect(t('tournamentTab').trim()).not.toBe('');
      expect(t('tournamentTitle').trim()).not.toBe('');
      expect(t('bloodRankDossier').trim()).not.toBe('');
      for (const spec of TOURNAMENT_ROUNDS) {
        const stageText = tournamentStageLabel(spec.stage);
        const oppText = tournamentOpponentLabel(spec.opponentId, spec.opponentName);
        expect(stageText.trim()).not.toBe('');
        expect(oppText.trim()).not.toBe('');
        expect(stageText).not.toMatch(/⟦|undefined/);
        expect(oppText).not.toMatch(/⟦|undefined/);
      }
      for (const rank of BLOOD_RANKS) {
        const title = bloodRankTitle(rank.key);
        expect(title.trim()).not.toBe('');
        expect(title).not.toMatch(/⟦|undefined/);
        const label = t('bloodRankLabel', rank.rank, title);
        expect(label).toContain(String(rank.rank));
        expect(label).not.toMatch(/⟦|undefined/);
      }
    }
    expect(resolveTournamentTheme(TOURNAMENT_ROUNDS[0])).toBe('cruise');
    expect(resolveTournamentTheme(TOURNAMENT_ROUNDS[3])).toBe('cruise');
    expect(resolveTournamentTheme(TOURNAMENT_ROUNDS[4])).toBe('climax');
    expect(resolveTournamentTheme(TOURNAMENT_ROUNDS[5])).toBe('climax');
  });

  test('displays 5-round bracket + bonus exhibition, starts Round 1 Mulligan, commits to live play, and persists save', async () => {
    const {root, storage, tournament} = await setupTournamentDom();
    tournament.showLobby();

    const nodes = root.querySelectorAll('.tourney-node');
    expect(nodes).toHaveLength(6);
    expect(nodes.map(n => n.dataset.stage)).toEqual([
      'round-1', 'round-2', 'round-3', 'semifinal', 'final', 'exhibition',
    ]);
    // Honor badges from progress appear in lobby header.
    expect(root.querySelector('#tourneyLobby')!.textContent).toContain(t('tournamentExhibitionBadge'));

    // Enter tournament -> opens Round 1 in Mulligan phase.
    root.querySelector('#tourneyStart')!.click();
    const stage = root.querySelector('#tourneyStage')!;
    expect(stage.hidden).toBe(false);
    expect(stage.dataset.tourneyTier).toBe('cruise');
    expect(stage.dataset.tournamentPhase).toBe('mulligan');
    expect(root.querySelector('#tourneyConfirmMulligan')!.hidden).toBe(false);
    expect(root.querySelectorAll('.hand-card')).toHaveLength(5);

    // Commit Mulligan -> transitions to live playing phase and persists save.
    root.querySelector('#tourneyConfirmMulligan')!.click();
    expect(stage.dataset.tournamentPhase).toBe('playing');
    expect(root.querySelector('#tourneyConfirmMulligan')!.hidden).toBe(true);
    expect(readActiveTournament(storage).session?.currentRound).toBe(1);
  });

  test('restores saved tournament run via Continue banner and advances rounds cleanly', async () => {
    const {root, storage, tournament} = await setupTournamentDom();

    // Seed a saved tournament sitting in Round 1 already won and ready to advance.
    const session = TournamentSession.start(starterDeck, 777);
    session.mulligan([]);
    // Play a card or pass until settled; force a deterministic Round 1 win by playing a card then passing.
    const legal = session.moves();
    session.play(legal[0].handIndex, legal[0].row, legal[0].col);
    while (session.game.phase !== 'finished') {
      if (session.game.turn === 0) session.pass();
      else session.applyBotAction({type: 'pass', player: 1});
    }
    expect(session.snapshot().roundWon).toBe(true);
    expect(writeActiveTournament(storage, session.serialize())).toBeNull();
    expect(storage.getItem(TOURNAMENT_STORAGE_KEY)).toBeTruthy();

    tournament.showLobby();
    const resumeBtn = root.querySelector('#tourneyResume');
    expect(resumeBtn).not.toBeNull();
    resumeBtn!.click();

    const advanceBtn = root.querySelector('#tourneyAdvance')!;
    expect(advanceBtn.hidden).toBe(false);
    advanceBtn.click();

    // Now in Round 2 (Aerith) with fresh Mulligan and updated save.
    const restored = readActiveTournament(storage);
    expect(restored.session?.currentRound).toBe(2);
    expect(restored.session?.roundSpec().opponentId).toBe('aerith-cruise');
    expect(root.querySelector('#tourneyStage')!.dataset.tournamentPhase).toBe('mulligan');
  });

  test('classifies iconic legendary cards and multi-destroy chains for 260ms PS1 VFX bursts', () => {
    expect(legendaryCardVfx(86)).toBe('mako'); // Cloud
    expect(legendaryCardVfx(95)).toBe('mako'); // Ifrit
    expect(legendaryCardVfx(144)).toBe('mako'); // Emerald Witch
    expect(legendaryCardVfx(143)).toBe('abyss'); // Sephiroth
    expect(legendaryCardVfx(145)).toBe('abyss'); // Shadowblood Queen
    expect(legendaryCardVfx(1)).toBeNull(); // Security Officer

    const sephPlacement = {type: 'CardPlayed', cardId: 143, row: 1, col: 2, seq: 1} as unknown as RuleEvent;
    expect(batchLegendaryVfx([sephPlacement], sephPlacement)).toEqual({kind: 'abyss', row: 1, col: 2});

    const normalPlacement = {type: 'CardPlayed', cardId: 1, row: 0, col: 0, seq: 1} as unknown as RuleEvent;
    const destroys = [
      {type: 'CardDestroyed', cardId: 2, row: 0, col: 1, seq: 2},
      {type: 'CardDestroyed', cardId: 3, row: 1, col: 1, seq: 3},
    ] as unknown as RuleEvent[];
    expect(batchLegendaryVfx([normalPlacement, ...destroys], normalPlacement)).toEqual({kind: 'chain', row: 1, col: 1});
    expect(batchLegendaryVfx([normalPlacement, destroys[0]], normalPlacement)).toBeNull();
  });
});
