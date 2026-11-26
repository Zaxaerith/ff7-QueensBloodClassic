import {afterEach, describe, expect, test, vi} from 'vitest';
import {byId, starterDeck} from '../src/cards.js';
import {goldSaucerChallenges, survivalChallenges} from '../src/gold-saucer-catalog.js';
import {
  goldSaucerChallengeTitle, survivalChallengeTitle, survivalRoundOpponentLabel,
} from '../src/i18n/game-labels.js';
import {setLocale, t} from '../src/i18n/index.js';
import {locales} from '../src/i18n/locales.js';
import {GOLD_SAUCER_ACTION_EVENT} from '../src/input/input-manager.js';
import {SURVIVAL_KEY, SurvivalSession, writeActiveSurvival} from '../src/survival-session.js';
import {resolveGoldSaucerBackground} from '../src/ui-gold-saucer.js';
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
      remove: (name: string) => { this.className = tokens().filter(t => t !== name).join(' '); },
      toggle: (name: string, force?: boolean) => {
        const has = tokens().includes(name);
        const next = force ?? !has;
        if (next && !has) this.className = [...tokens(), name].join(' ');
        if (!next && has) this.className = tokens().filter(t => t !== name).join(' ');
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
  createTHead() { const el = new FakeElement('thead', this.doc); this.append(el); return el; }
  createTBody() { const el = new FakeElement('tbody', this.doc); this.append(el); return el; }
  insertRow() { const el = new FakeElement('tr', this.doc); this.append(el); return el; }
  matches(selector: string): boolean {
    return selector.split(',').some(part => this.matchesSingle(part.trim()));
  }
  private matchesSingle(sel: string): boolean {
    let rest = sel;
    if (rest.includes(':not(:has(.qb-card))')) {
      if (this.querySelector('.qb-card')) return false;
      rest = rest.replace(':not(:has(.qb-card))', '');
    }
    if (rest.includes(':not(:disabled)')) {
      if (this.disabled) return false;
      rest = rest.replace(':not(:disabled)', '');
    }
    if (rest.includes(':not([hidden])')) {
      if (this.hidden) return false;
      rest = rest.replace(':not([hidden])', '');
    }
    const attrMatches = [...rest.matchAll(/\[([a-z0-9-]+)(?:="([^"]*)")?\]/gi)];
    rest = rest.replace(/\[[^\]]+\]/g, '');
    for (const [, name, expected] of attrMatches) {
      const actual = name.startsWith('data-')
        ? this.dataset[name.slice(5).replace(/-([a-z])/g, (_, ch: string) => ch.toUpperCase())]
        : this.attributes.get(name) ?? (name === 'hidden' && this.hidden ? '' : undefined);
      if (expected === undefined ? actual === undefined : actual !== expected) return false;
    }
    const idMatch = rest.match(/#([a-z0-9_-]+)/i);
    if (idMatch) {
      if (this.id !== idMatch[1]) return false;
      rest = rest.replace(idMatch[0], '');
    }
    const classes = [...rest.matchAll(/\.([a-z0-9_-]+)/gi)].map(m => m[1]);
    rest = rest.replace(/\.[a-z0-9_-]+/gi, '');
    for (const cls of classes) if (!this.classList.contains(cls)) return false;
    if (rest && this.tagName.toLowerCase() !== rest.toLowerCase()) return false;
    return true;
  }
  closest(selector: string): FakeElement | null {
    let cur: FakeElement | null = this;
    while (cur) {
      if (cur.matches(selector)) return cur;
      cur = cur.parentElement;
    }
    return null;
  }
  querySelectorAll(selector: string): FakeElement[] {
    const parts = selector.trim().split(/\s+/);
    if (parts.length > 1) {
      let current: FakeElement[] = [this];
      for (const part of parts) current = current.flatMap(node => node.querySelectorAll(part));
      return [...new Set(current)];
    }
    const result: FakeElement[] = [];
    for (const child of this.children) {
      if (child.matches(selector)) result.push(child);
      result.push(...child.querySelectorAll(selector));
    }
    return result;
  }
  querySelector(selector: string): FakeElement | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }
}

class FakeDocument {
  activeElement: FakeElement | null = null;
  documentElement = {dataset: {reduceMotion: 'true'}};
  createElement(tag: string) { return new FakeElement(tag, this); }
  createTextNode(text: string) { return {textContent: text}; }
}

afterEach(() => {
  setLocale('zh-CN');
  vi.unstubAllGlobals();
  vi.resetModules();
});

async function mountFixture(memory = new Map<string, string>()) {
  const doc = new FakeDocument();
  vi.stubGlobal('document', doc);
  vi.stubGlobal('window', Object.assign(new EventTarget(), {
    scrollBy: vi.fn(),
    matchMedia: () => ({matches: true}),
  }));
  vi.stubGlobal('HTMLElement', FakeElement);
  vi.stubGlobal('HTMLButtonElement', FakeElement);
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('Worker', undefined);

  const storage = {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => { memory.set(key, value); },
  };
  const showCard = vi.fn();
  const editDeck = vi.fn();
  const audioController = {
    hasAudio: true,
    startOrResumeMatch: vi.fn((matchId: string) => ({matchId, generation: 1, source: 'live' as const})),
    enterScoring: vi.fn(),
    revealResult: vi.fn(),
    pauseOrExitMatch: vi.fn(),
  };
  const {mountGoldSaucer} = await import('../src/ui-gold-saucer.js');
  const root = doc.createElement('section');
  root.id = 'view-gold-saucer';
  const view = mountGoldSaucer(root as unknown as HTMLElement, {
    visual: getCardVisual,
    showCard,
    deck: () => ({id: 'preset:0', name: 'Classic Starter', cards: [...starterDeck]}),
    storage,
    editDeck,
    audio: {controller: audioController as never, visible: () => true},
  });
  view.showList();
  return {doc, root, view, storage, memory, showCard, editDeck, audioController};
}

describe('M11 Gold Saucer & Survival UI (Phase 3.5 presentation, hand focus, audio & i18n)', () => {
  test('localizes all 6 challenges, 3 survival gauntlets, Queen boss round and background resolver across all 11 locales', () => {
    for (const locale of locales) {
      setLocale(locale);
      for (const id of [
        'gs-high-ground', 'gs-outflanked', 'gs-mais-here',
        'gs-luxury-real-estate', 'gs-behind-enemy-lines', 'gs-chadley-callous',
      ] as const) {
        const title = goldSaucerChallengeTitle(id);
        expect(title.trim()).not.toBe('');
        expect(title).not.toMatch(/⟦|undefined/);
      }
      for (const id of ['survival-boot-camp', 'survival-extreme', 'survival-nightmare'] as const) {
        const title = survivalChallengeTitle(id);
        expect(title.trim()).not.toBe('');
        expect(title).not.toMatch(/⟦|undefined/);
      }
      const roundLabel = survivalRoundOpponentLabel(1, 'ned');
      const queenRoundLabel = survivalRoundOpponentLabel(5, 'queen', 'shadowblood-queen');
      expect(roundLabel).not.toMatch(/⟦|undefined/);
      expect(queenRoundLabel).toContain(t('shadowbloodQueenName'));
      expect(queenRoundLabel).not.toMatch(/⟦|undefined/);
      if (locale === 'zh-CN') {
        expect(goldSaucerChallengeTitle('gs-high-ground')).toBe('高地争夺');
        expect(goldSaucerChallengeTitle('gs-luxury-real-estate')).toBe('黄金地段');
        expect(goldSaucerChallengeTitle('gs-behind-enemy-lines')).toBe('深入敌后');
        expect(goldSaucerChallengeTitle('gs-chadley-callous')).toBe('冷酷的查德利');
        expect(survivalChallengeTitle('survival-boot-camp')).toBe('生存特训营');
        expect(survivalChallengeTitle('survival-extreme')).toBe('极限生存战');
        expect(roundLabel).toContain('第 1 轮');
        expect(queenRoundLabel).toBe('第 5 轮 · 黑红女王');
      }
    }
    expect(resolveGoldSaucerBackground({opponentStrategy: 'ned'})).toBe('hybrid');
    expect(resolveGoldSaucerBackground({opponentStrategy: 'queen'})).toBe('shadowblood-queen');
    expect(resolveGoldSaucerBackground({bossId: 'shadowblood-queen'})).toBe('shadowblood-queen');
    expect(resolveGoldSaucerBackground({battleBackgroundId: 'shadowblood-queen'})).toBe('shadowblood-queen');
  });

  test('runs High Ground through MatchPresentation with +2 tile badges, hand focus, effects overlay and audio', async () => {
    const {doc, root, audioController} = await mountFixture();
    expect(root.querySelectorAll('[data-gs-challenge]')).toHaveLength(6);
    expect(root.querySelectorAll('[data-gs-survival]')).toHaveLength(3);
    expect(goldSaucerChallenges).toHaveLength(6);
    expect(survivalChallenges).toHaveLength(3);

    // Start High Ground challenge.
    root.querySelector('[data-gs-challenge="gs-high-ground"]')!.click();
    const stage = root.querySelector('#gsStage')!;
    expect(stage.hidden).toBe(false);
    expect(stage.dataset.gsMode).toBe('challenge');
    expect(stage.dataset.presentationPhase).toBe('PlayerSelect');
    expect(audioController.startOrResumeMatch).toHaveBeenCalledOnce();

    // Hand focus panel, match-effects layer, and fast/skip controls are mounted.
    expect(root.querySelector('#gsHandFocus')).not.toBeNull();
    expect(root.querySelector('.match-effects')).not.toBeNull();
    expect(root.querySelector('#gsSkip')).not.toBeNull();
    expect(root.querySelector('#gsFast')).not.toBeNull();

    const tiles = root.querySelectorAll('#gsBoard .tile');
    expect(tiles).toHaveLength(15);
    expect(tiles.every(tile => tile.disabled === false)).toBe(true);

    // Center column (col 2: 0-2, 1-2, 2-2) carries +2 High Ground tileBonus badge & aria-label.
    const bonusTiles = tiles.filter(tile => tile.classList.contains('has-tile-bonus'));
    expect(bonusTiles.map(tile => tile.dataset.cell)).toEqual(['0-2', '1-2', '2-2']);
    for (const tile of bonusTiles) {
      expect(tile.dataset.tileBonus).toBe('2');
      expect(tile.querySelector('.tile-bonus-badge')?.textContent).toBe('+2');
      expect(tile.getAttribute('aria-label')).toContain('+2');
    }

    // Navigate to a rank-1 playable hand card, confirm -> snaps to legal tile -> confirm commits via MatchPresentation.
    const handCards = root.querySelectorAll('#gsHand button');
    const rank1Index = handCards.findIndex(btn => byId.get(Number(btn.dataset.cardId))?.cost === 1);
    expect(rank1Index).toBeGreaterThanOrEqual(0);
    for (let i = 0; i < rank1Index; i++) {
      root.dispatchEvent(new CustomEvent(GOLD_SAUCER_ACTION_EVENT, {detail: {type: 'move', direction: 'right'}}));
    }
    root.dispatchEvent(new CustomEvent(GOLD_SAUCER_ACTION_EVENT, {detail: {type: 'confirm'}}));
    expect(stage.dataset.gsSelected).toBe(String(rank1Index));
    expect(doc.activeElement?.dataset.legal).toBe('true');
    root.dispatchEvent(new CustomEvent(GOLD_SAUCER_ACTION_EVENT, {detail: {type: 'confirm'}}));

    // Wait for async MatchPresentation player + opponent resolution to return to PlayerSelect or Result.
    await vi.waitFor(() => {
      expect(['PlayerSelect', 'Result']).toContain(stage.dataset.presentationPhase);
      expect(root.querySelectorAll('#gsBoard .tile.occupied').length).toBeGreaterThanOrEqual(1);
    });
  });

  test('runs Survival round progression through MatchPresentation, persists to SURVIVAL_KEY, and resumes Nightmare round 4 with no-draw banner', async () => {
    const memory = new Map<string, string>();
    const {root, audioController} = await mountFixture(memory);

    // Start Boot Camp (3 rounds).
    root.querySelector('[data-gs-survival="survival-boot-camp"]')!.click();
    const stage = root.querySelector('#gsStage')!;
    const hud = root.querySelector('#gsSurvivalHud')!;
    expect(hud.hidden).toBe(false);
    expect(hud.textContent).toContain('1 / 3');
    expect(root.querySelector('#gsNoDrawBanner')!.hidden).toBe(true);
    expect(memory.has(SURVIVAL_KEY)).toBe(true);

    // Pass until round 1 reaches Result via MatchPresentation.
    let safety = 0;
    while (stage.dataset.presentationPhase !== 'Result' && safety++ < 25) {
      await vi.waitFor(() => expect(['PlayerSelect', 'Result']).toContain(stage.dataset.presentationPhase));
      if (stage.dataset.presentationPhase === 'Result') break;
      root.querySelector('#gsPass')!.click();
      await vi.waitFor(() => expect(['PlayerSelect', 'Result']).toContain(stage.dataset.presentationPhase));
    }
    expect(stage.dataset.presentationPhase).toBe('Result');
    expect(audioController.enterScoring).toHaveBeenCalled();
    const nextBtn = root.querySelector('#gsNextRound')!;
    expect(nextBtn.hidden).toBe(false);

    // Advance to Round 2.
    nextBtn.click();
    expect(root.querySelector('#gsSurvivalHud')!.textContent).toContain('2 / 3');
    expect(stage.dataset.presentationPhase).toBe('PlayerSelect');

    // Verify restoring a saved Nightmare Survival at Round 4 (noTurnDraw === true).
    const nightmare = SurvivalSession.start('survival-nightmare', starterDeck, 777);
    for (let round = 1; round <= 3; round++) {
      let guard = 0;
      while (nightmare.game.phase !== 'finished' && guard++ < 40) {
        if (nightmare.game.turn === 0) nightmare.pass();
        else nightmare.applyBotAction({type: 'pass', player: 1});
      }
      nightmare.advanceRound();
    }
    const savedMemory = new Map<string, string>();
    const savedStorage = {
      getItem: (key: string) => savedMemory.get(key) ?? null,
      setItem: (key: string, value: string) => { savedMemory.set(key, value); },
    };
    expect(writeActiveSurvival(savedStorage, nightmare.serialize())).toBeNull();

    const resumed = await mountFixture(savedMemory);
    const resumeBtn = resumed.root.querySelector('#gsResumeSurvival')!;
    expect(resumeBtn).not.toBeNull();
    resumeBtn.click();
    expect(resumed.root.querySelector('#gsSurvivalHud')!.textContent).toContain('4 / 5');
    expect(resumed.root.querySelector('#gsNoDrawBanner')!.hidden).toBe(false);
  });

  test('renders real Survival bonusDrawRow HUD & lane badges, bonusDrawEarned notice, and Nightmare Round 5 Shadowblood Queen theme', async () => {
    // 1. Boot Camp Round 1 has bonusDrawRow: 1 (Lane 2). Play a card on Row 1 and win Row 1 to earn bonus draw!
    const bootSession = SurvivalSession.start('survival-boot-camp', starterDeck, 1101);
    const rank1Move = bootSession.moves().find(m => m.row === 1);
    expect(rank1Move).toBeDefined();
    bootSession.play(rank1Move!.handIndex, rank1Move!.row, rank1Move!.col);
    bootSession.applyBotAction({type: 'pass', player: 1});
    bootSession.pass();
    expect(bootSession.snapshot().roundSettled).toBe(true);
    expect(bootSession.snapshot().roundScores[0].bonusDrawEarned).toBe(true);

    // Check bonusDrawRow badge during live Boot Camp Round 1 first.
    const liveBoot = await mountFixture();
    liveBoot.root.querySelector('[data-gs-survival="survival-boot-camp"]')!.click();
    const liveStage = liveBoot.root.querySelector('#gsStage')!;
    expect(liveStage.dataset.background).toBe('hybrid');
    const bonusHint = liveBoot.root.querySelector('.gs-bonus-row-hint')!;
    expect(bonusHint).not.toBeNull();
    expect(bonusHint.dataset.bonusRow).toBe('1');
    expect(bonusHint.textContent).toContain('2');
    expect(liveBoot.root.querySelectorAll('.lane-score.bonus-draw-lane')).toHaveLength(2);
    expect(liveBoot.root.querySelector('.gs-bonus-draw-tag')!.textContent).toBe('★+1抽');

    // Check bonusDrawEarned notice when resuming a settled round that earned the bonus draw.
    const earnedMemory = new Map<string, string>();
    const earnedStorage = {
      getItem: (key: string) => earnedMemory.get(key) ?? null,
      setItem: (key: string, value: string) => { earnedMemory.set(key, value); },
    };
    expect(writeActiveSurvival(earnedStorage, bootSession.serialize())).toBeNull();
    const settledBoot = await mountFixture(earnedMemory);
    settledBoot.root.querySelector('#gsResumeSurvival')!.click();
    expect(settledBoot.root.querySelector('#gsStage')!.dataset.presentationPhase).toBe('Result');
    const earnedNotice = settledBoot.root.querySelector('#gsResult .gs-bonus-earned');
    expect(earnedNotice).not.toBeNull();
    expect(earnedNotice!.dataset.bonusEarned).toBe('true');

    // 2. Advance Nightmare Survival to Round 5 (real Shadowblood Queen Boss showdown!).
    const nightmare = SurvivalSession.start('survival-nightmare', starterDeck, 909);
    for (let round = 1; round <= 4; round++) {
      let guard = 0;
      while (nightmare.game.phase !== 'finished' && guard++ < 40) {
        if (nightmare.game.turn === 0) nightmare.pass();
        else nightmare.applyBotAction({type: 'pass', player: 1});
      }
      nightmare.advanceRound();
    }
    expect(nightmare.currentRound).toBe(5);
    expect(nightmare.roundSpec().bossId).toBe('shadowblood-queen');
    expect(nightmare.roundSpec().battleBackgroundId).toBe('shadowblood-queen');

    const queenMemory = new Map<string, string>();
    const queenStorage = {
      getItem: (key: string) => queenMemory.get(key) ?? null,
      setItem: (key: string, value: string) => { queenMemory.set(key, value); },
    };
    expect(writeActiveSurvival(queenStorage, nightmare.serialize())).toBeNull();

    const queenRun = await mountFixture(queenMemory);
    queenRun.root.querySelector('#gsResumeSurvival')!.click();
    const queenStage = queenRun.root.querySelector('#gsStage')!;
    expect(queenStage.dataset.background).toBe('shadowblood-queen');
    expect(queenRun.root.querySelector('.frame-side--rival strong')!.textContent).toBe('第 5 轮 · 黑红女王');
    expect(queenRun.root.querySelector('#gsNoDrawBanner')!.hidden).toBe(false);
    // #145 Shadowblood Queen is preplaced on B5 (cell 1-4).
    expect(queenRun.root.querySelector('#gsBoard [data-cell="1-4"]')?.dataset.cardId).toBe('145');
  });
});
