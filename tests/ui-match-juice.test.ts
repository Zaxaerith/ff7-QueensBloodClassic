import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest';
import {getChallengerBanter} from '../src/challenger-banter.js';
import {createPosition, legalMoves} from '../src/engine.js';
import {setLocale, t} from '../src/i18n/index.js';
import {locales} from '../src/i18n/locales.js';
import type {MatchEffect} from '../src/match-effects.js';
import {simulateMovePreview} from '../src/move-preview.js';
import {defaultConfig, readConfig} from '../src/ui-data.js';
import {
  applyMovePreviewOverlay,
  createResultBanterBlock,
  isBanterEnabled,
  mountClassicBanter,
  mountMatchFeedback,
} from '../src/ui-match-feedback.js';

class StubElement {
  readonly tagName: string;
  id = '';
  className = '';
  hidden = false;
  type = '';
  title = '';
  private _text = '';
  parentElement: StubElement | null = null;
  children: StubElement[] = [];
  dataset: Record<string, string> = {};
  attributes = new Map<string, string>();
  style = {
    props: new Map<string, string>(),
    setProperty(k: string, v: string) { this.props.set(k, v); },
    getPropertyValue(k: string) { return this.props.get(k) ?? ''; },
  };
  onclick: (() => void) | null = null;

  constructor(tag: string) {
    this.tagName = tag.toUpperCase();
  }

  get textContent(): string {
    return this.children.length ? this.children.map(c => c.textContent).join('') : this._text;
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
  append(...nodes: StubElement[]) {
    for (const node of nodes) {
      node.parentElement = this;
      this.children.push(node);
    }
  }
  replaceChildren(...nodes: StubElement[]) {
    for (const child of this.children) child.parentElement = null;
    this.children = [];
    this._text = '';
    this.append(...nodes);
  }
  remove() {
    if (!this.parentElement) return;
    const idx = this.parentElement.children.indexOf(this);
    if (idx >= 0) this.parentElement.children.splice(idx, 1);
    this.parentElement = null;
  }
  click() {
    this.onclick?.();
  }
  matches(selector: string): boolean {
    if (selector.startsWith('.')) return this.classList.contains(selector.slice(1));
    const attr = /^\[([^=\]]+)="([^"]*)"\]$/.exec(selector);
    if (attr) {
      const [, name, value] = attr;
      if (name.startsWith('data-')) {
        const camel = name.slice(5).replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
        return this.dataset[camel] === value;
      }
      return this.getAttribute(name) === value;
    }
    return this.tagName === selector.toUpperCase();
  }
  querySelector(selector: string): StubElement | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }
  querySelectorAll(selector: string): StubElement[] {
    const out: StubElement[] = [];
    for (const child of this.children) {
      if (child.matches(selector)) out.push(child);
      out.push(...child.querySelectorAll(selector));
    }
    return out;
  }
}

function stubDocument() {
  const docEl = {dataset: {classicBanter: 'true', crt: 'false', reduceMotion: 'false'} as Record<string, string>};
  vi.stubGlobal('document', {
    documentElement: docEl,
    createElement: (tag: string) => new StubElement(tag),
    querySelector: () => null,
    getElementById: () => null,
  });
  return docEl;
}

beforeEach(() => {
  stubDocument();
});

afterEach(() => {
  setLocale('zh-CN');
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Task X2 — Match Juice UI overlays, FF7 battle numbers, shatter VFX, banter & CRT config', () => {
  test('applyMovePreviewOverlay renders live lane/score deltas, destroy crosshairs and changed-cell deltas without mutating score digits, and clears cleanly', () => {
    // Card #20 (Archdragon, power 3) onPlay deals -3 to (1,1), destroying enemy #7 (Levrikon, power 2),
    // while enemy #35 (Tonberry King) at (0,4) grows by +2 from the destroyed ally!
    const game = createPosition({
      hands: [[20], []],
      board: [
        {row: 1, col: 0, owner: 0, pawns: 1},
        {row: 1, col: 1, owner: 1, cardId: 7},  // 2 power -> -3 -> destroyed!
        {row: 0, col: 4, owner: 1, cardId: 35}, // 1 power -> +2 -> 3 power!
      ],
    });
    const move = legalMoves(game, 0)[0];
    expect(move).toEqual({handIndex: 0, row: 1, col: 0});
    const preview = simulateMovePreview(game, 0, move.handIndex, move.row, move.col);
    expect(preview).not.toBeNull();
    expect(preview!.destroyedCells.some(d => d.row === 1 && d.col === 1)).toBe(true);
    expect(preview!.changedCells).toEqual([{row: 0, col: 4, owner: 1, before: 1, after: 3, delta: 2}]);
    expect(preview!.rowDeltas[1][0]).toBe(3);
    expect(preview!.rowDeltas[1][1]).toBe(-2);

    const board = new StubElement('div');
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 5; c++) {
        const tile = new StubElement('button');
        tile.className = 'tile';
        tile.dataset.cell = `${r}-${c}`;
        board.append(tile);
      }
    }
    const leftScores = new StubElement('div');
    const rightScores = new StubElement('div');
    for (let r = 0; r < 3; r++) {
      const l = new StubElement('div'); l.className = 'lane-score'; l.textContent = '0'; leftScores.append(l);
      const ri = new StubElement('div'); ri.className = 'lane-score'; ri.textContent = r === 1 ? '2' : r === 0 ? '1' : '0'; rightScores.append(ri);
    }
    const playerSide = new StubElement('div');
    const score0 = new StubElement('b'); score0.textContent = '0'; playerSide.append(score0);
    const rivalSide = new StubElement('div');
    const score1 = new StubElement('b'); score1.textContent = '3'; rivalSide.append(score1);

    applyMovePreviewOverlay({
      board: board as unknown as HTMLElement,
      leftScores: leftScores as unknown as HTMLElement,
      rightScores: rightScores as unknown as HTMLElement,
      playerSide: playerSide as unknown as HTMLElement,
      rivalSide: rivalSide as unknown as HTMLElement,
      preview,
    });

    // Score digits themselves remain pure numbers (zero jitter/text corruption).
    expect(score0.textContent).toBe('0');
    expect(score1.textContent).toBe('3');

    // Lane deltas and total score deltas rendered.
    const leftDelta = leftScores.children[1].querySelector('.preview-lane-delta');
    const rightDelta = rightScores.children[1].querySelector('.preview-lane-delta');
    expect(leftDelta?.textContent).toBe('+3');
    expect(leftDelta?.classList.contains('positive')).toBe(true);
    expect(rightDelta?.textContent).toBe('-2');
    expect(rightDelta?.classList.contains('negative')).toBe(true);
    expect(playerSide.querySelector('.preview-score-delta')?.textContent).toBe('+3');
    expect(rivalSide.querySelector('.preview-score-delta')).toBeNull(); // net rival score delta is 0 (+2 lane 0, -2 lane 1)

    // Destroyed cell crosshair + ✕ badge & changed cell delta badge.
    const destroyedTile = board.querySelector('[data-cell="1-1"]')!;
    expect(destroyedTile.classList.contains('preview-destroy')).toBe(true);
    expect(destroyedTile.querySelector('.preview-destroy-x')?.textContent).toBe('✕');

    const changedTile = board.querySelector('[data-cell="0-4"]')!;
    const cellDelta = changedTile.querySelector('.preview-cell-delta');
    expect(cellDelta?.textContent).toBe('+2');
    expect(cellDelta?.classList.contains('positive')).toBe(true);

    // Clearing removes all preview markers cleanly.
    applyMovePreviewOverlay({
      board: board as unknown as HTMLElement,
      leftScores: leftScores as unknown as HTMLElement,
      rightScores: rightScores as unknown as HTMLElement,
      playerSide: playerSide as unknown as HTMLElement,
      rivalSide: rivalSide as unknown as HTMLElement,
      preview: null,
    });
    expect(board.querySelectorAll('.preview-destroy')).toHaveLength(0);
    expect(board.querySelectorAll('.preview-destroy-fx')).toHaveLength(0);
    expect(board.querySelectorAll('.preview-cell-delta')).toHaveLength(0);
    expect(leftScores.querySelectorAll('.preview-lane-delta')).toHaveLength(0);
    expect(rightScores.querySelectorAll('.preview-lane-delta')).toHaveLength(0);
    expect(playerSide.querySelectorAll('.preview-score-delta')).toHaveLength(0);
    expect(rivalSide.querySelectorAll('.preview-score-delta')).toHaveLength(0);
  });

  test('mountMatchFeedback renders 1997 FF7 floating battle numbers, 6-shard pixel shatter VFX, and scoring lane sweep', () => {
    const table = new StubElement('div');
    const board = new StubElement('div');
    const feedback = new StubElement('div');
    const hand = new StubElement('div');
    const fb = mountMatchFeedback(
      table as unknown as HTMLElement,
      board as unknown as HTMLElement,
      {feedback: feedback as unknown as HTMLElement, hand: hand as unknown as HTMLElement},
    );
    const effectsRoot = table.querySelector('.match-effects')!;

    // 1. Events stage: +3 buff, -2 debuff, and CardDestroyed pixel shatter.
    const eventsEffect: MatchEffect = {
      key: 1, batch: 1, stage: 'events', actor: 0, action: 'play', motion: true,
      placement: {seq: 1, type: 'CardPlayed', player: 0, cardId: 22, row: 1, col: 0},
      events: [
        {seq: 2, type: 'PowerChanged', player: 0, cardId: 7, row: 0, col: 0, amount: 3},
        {seq: 3, type: 'PowerChanged', player: 1, cardId: 1, row: 1, col: 2, amount: -2},
        {seq: 4, type: 'CardDestroyed', player: 1, cardId: 7, row: 1, col: 1},
      ],
      changes: [],
      targets: [],
    };
    fb.update(eventsEffect);
    const popups = effectsRoot.querySelectorAll('.ff7-battle-num');
    expect(popups).toHaveLength(2);
    expect(popups[0].classList.contains('positive')).toBe(true);
    expect(popups[0].textContent).toBe('+3');
    expect(popups[1].classList.contains('negative')).toBe(true);
    expect(popups[1].textContent).toBe('-2');

    const shatter = effectsRoot.querySelector('.match-shatter')!;
    expect(shatter).not.toBeNull();
    expect(shatter.querySelector('.shatter-flash')).not.toBeNull();
    expect(shatter.querySelectorAll('.shatter-shard')).toHaveLength(6);

    // 2. Settle stage: net power change uses FF7 floating battle number.
    fb.update({
      key: 2, batch: 1, stage: 'settle', actor: 0, action: 'play', motion: true,
      placement: undefined, events: [], targets: [],
      changes: [{row: 0, col: 0, kind: 'power', delta: 4, text: '2 → 6 (+4)'}],
    });
    const settlePop = effectsRoot.querySelector('.ff7-battle-num')!;
    expect(settlePop).not.toBeNull();
    expect(settlePop.textContent).toBe('+4');
    expect(settlePop.classList.contains('match-net-change')).toBe(true);

    // 3. Scoring stage: winning lane gets scoring-sweep & data-winner.
    fb.update({
      key: 3, batch: 2, stage: 'scoring', actor: 0, action: 'pass', motion: true,
      placement: undefined, events: [], targets: [], changes: [],
      scoring: {
        result: {rows: [[8, 3], [2, 2], [0, 5]], bonuses: [[0, 0], [0, 0], [0, 0]], awards: [[8, 0], [0, 0], [0, 5]], scores: [8, 5], winner: 0},
        revealed: 1,
        totals: false,
      },
    });
    const sweepRow = effectsRoot.querySelector('.match-score-row')!;
    expect(sweepRow.classList.contains('scoring-sweep')).toBe(true);
    expect(sweepRow.dataset.winner).toBe('0');
  });

  test('classic banter box displays intro dialogue, fades and auto-hides at 3.6s, dismisses on click, and respects classicBanter toggle', () => {
    vi.useFakeTimers();
    const docEl = document.documentElement as unknown as {dataset: Record<string, string>};
    const host = new StubElement('div');
    const banter = mountClassicBanter(host as unknown as HTMLElement);
    const quote = getChallengerBanter('shadowblood-queen', 'zh-CN')!;

    banter.show('暗影血女王', quote.intro);
    expect(banter.element.hidden).toBe(false);
    expect(banter.element.textContent).toContain(quote.intro);

    vi.advanceTimersByTime(3200);
    expect(banter.element.classList.contains('is-fading')).toBe(true);
    vi.advanceTimersByTime(400);
    expect(banter.element.hidden).toBe(true);

    // Clicking dismisses immediately.
    banter.show('暗影血女王', quote.intro);
    expect(banter.element.hidden).toBe(false);
    (banter.element as unknown as StubElement).click();
    expect(banter.element.hidden).toBe(true);

    // Disabled config suppresses banter.
    docEl.dataset.classicBanter = 'false';
    expect(isBanterEnabled()).toBe(false);
    banter.show('暗影血女王', quote.intro);
    expect(banter.element.hidden).toBe(true);

    // Post-match result quote block.
    const resultBlock = createResultBanterBlock('暗影血女王', quote.playerWin);
    expect(resultBlock.classList.contains('classic-banter-result')).toBe(true);
    expect(resultBlock.textContent).toContain(quote.playerWin);
  });

  test('AppConfig defaults and persists classicBanter + crtFilter, with complete 11-language labels', () => {
    expect(defaultConfig.classicBanter).toBe(true);
    expect(defaultConfig.crtFilter).toBe(false);
    expect(readConfig(JSON.stringify({version: 1, density: 'comfortable', textSize: 'normal', reduceMotion: false})))
      .toEqual(defaultConfig);
    expect(readConfig(JSON.stringify({...defaultConfig, classicBanter: false, crtFilter: true})))
      .toEqual({...defaultConfig, classicBanter: false, crtFilter: true});

    for (const locale of locales) {
      setLocale(locale);
      for (const key of ['classicBanter', 'crtFilter', 'crtFilterHelp', 'banterSkipHint'] as const) {
        expect(t(key).trim(), `${locale}.${key}`).not.toBe('');
      }
    }
  });
});
