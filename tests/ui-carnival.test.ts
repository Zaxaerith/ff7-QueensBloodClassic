import {afterEach, describe, expect, test, vi} from 'vitest';
import {CARNIVAL_ACTION_EVENT} from '../src/input/input-manager.js';
import {puzzleCatalog} from '../src/puzzle-catalog.js';
import {getCardVisual} from '../src/visuals.js';

class FakeElement extends EventTarget {
  readonly tagName: string;
  id = '';
  className = '';
  hidden = false;
  disabled = false;
  tabIndex = 0;
  lang = '';
  textContent = '';
  title = '';
  scope = '';
  parentElement: FakeElement | null = null;
  children: FakeElement[] = [];
  dataset: Record<string, string> = {};
  attributes = new Map<string, string>();
  onclick: ((event?: unknown) => void) | null = null;
  private doc: FakeDocument;

  constructor(tag: string, doc: FakeDocument) {
    super();
    this.tagName = tag.toUpperCase();
    this.doc = doc;
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
  toggleAttribute(name: string, force?: boolean) {
    const next = force ?? !this.attributes.has(name);
    if (next) this.attributes.set(name, '');
    else this.attributes.delete(name);
    return next;
  }
  set innerHTML(markup: string) {
    this.textContent = markup;
    const child = new FakeElement('article', this.doc);
    const label = markup.match(/aria-label="([^"]*)"/)?.[1];
    if (label) child.setAttribute('aria-label', label);
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
        this.textContent += node.textContent;
      }
    }
  }
  replaceChildren(...nodes: (FakeElement | {textContent?: string})[]) {
    for (const child of this.children) child.parentElement = null;
    this.children = [];
    this.textContent = '';
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
    return selector.split(',').some(part => this.matchesSingle(part.trim()));
  }
  private matchesSingle(sel: string): boolean {
    let rest = sel;
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
      for (const part of parts) {
        current = current.flatMap(node => node.querySelectorAll(part));
      }
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
  createElement(tag: string) { return new FakeElement(tag, this); }
  createTextNode(text: string) { return {textContent: text}; }
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

async function mountFixture() {
  const doc = new FakeDocument();
  vi.stubGlobal('document', doc);
  vi.stubGlobal('window', Object.assign(new EventTarget(), {scrollBy: vi.fn()}));
  vi.stubGlobal('HTMLElement', FakeElement);
  vi.stubGlobal('HTMLButtonElement', FakeElement);
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });

  const {mountCarnival} = await import('../src/ui-carnival.js');
  const root = doc.createElement('section');
  root.id = 'view-carnival';
  const showCard = vi.fn();
  const carnival = mountCarnival(root as unknown as HTMLElement, {visual: getCardVisual, showCard});
  carnival.showList();
  // Open the first puzzle: cc-three-card-stud
  const startBtn = root.querySelector(`[data-puzzle-id="${puzzleCatalog[0].id}"]`)!;
  startBtn.click();
  return {doc, root, showCard, carnival};
}

describe('Card Carnival gamepad and keyboard input loop', () => {
  test('renders all 15 board cells enabled and allows traversing legal and illegal squares before committing', async () => {
    const {doc, root, showCard} = await mountFixture();
    const stage = root.querySelector('#carnivalStage')!;
    expect(stage.hidden).toBe(false);
    expect(stage.dataset.carnivalPhase).toBe('playing');

    const tiles = root.querySelectorAll('#carnivalBoard .tile');
    expect(tiles).toHaveLength(15);
    expect(tiles.every(tile => tile.disabled === false)).toBe(true);

    // Opening a puzzle focuses the first hand card immediately.
    expect(doc.activeElement?.dataset.carnivalFocus).toBe('hand-0');

    // Details opens card modal for focused hand card without selecting it.
    root.dispatchEvent(new CustomEvent(CARNIVAL_ACTION_EVENT, {detail: {type: 'details'}}));
    expect(showCard).toHaveBeenCalledTimes(1);
    expect(showCard).toHaveBeenLastCalledWith(Number(doc.activeElement?.dataset.cardId));

    // Find a hand card that has a legal move on turn 1 (e.g. #23 in Three-Card Stud).
    const handCards = root.querySelectorAll('#carnivalHand button');
    const playableIndex = handCards.findIndex(btn => Number(btn.dataset.cardId) === 23);
    expect(playableIndex).toBeGreaterThanOrEqual(0);
    for (let i = 0; i < playableIndex; i++) {
      root.dispatchEvent(new CustomEvent(CARNIVAL_ACTION_EVENT, {detail: {type: 'move', direction: 'right'}}));
    }
    expect(doc.activeElement?.dataset.carnivalFocus).toBe(`hand-${playableIndex}`);

    // Confirm on the playable hand card selects it and snaps onto a legal board square.
    root.dispatchEvent(new CustomEvent(CARNIVAL_ACTION_EVENT, {detail: {type: 'confirm'}}));
    expect(stage.dataset.carnivalSelected).toBe(String(playableIndex));
    expect(doc.activeElement?.dataset.legal).toBe('true');
    const legalIndex = Number(doc.activeElement?.dataset.index);

    // Move across all 15 cells using directional moves (never blocked by disabled tiles).
    const visited = new Set<number>([legalIndex]);
    for (let i = 0; i < 4; i++) root.dispatchEvent(new CustomEvent(CARNIVAL_ACTION_EVENT, {detail: {type: 'move', direction: 'left'}}));
    for (let i = 0; i < 2; i++) root.dispatchEvent(new CustomEvent(CARNIVAL_ACTION_EVENT, {detail: {type: 'move', direction: 'up'}}));
    expect(Number(doc.activeElement?.dataset.index)).toBe(0);
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 5; col++) {
        visited.add(Number(doc.activeElement?.dataset.index));
        if (col < 4) {
          root.dispatchEvent(new CustomEvent(CARNIVAL_ACTION_EVENT, {detail: {type: 'move', direction: row % 2 ? 'left' : 'right'}}));
        }
      }
      if (row < 2) root.dispatchEvent(new CustomEvent(CARNIVAL_ACTION_EVENT, {detail: {type: 'move', direction: 'down'}}));
    }
    expect(visited.size).toBe(15);

    // Confirming on an illegal square marks blocked-target and does not commit.
    const handCountBefore = root.querySelectorAll('#carnivalHand button').length;
    expect(doc.activeElement?.dataset.legal).toBe('false');
    expect(doc.activeElement?.classList.contains('blocked-target')).toBe(true);
    root.dispatchEvent(new CustomEvent(CARNIVAL_ACTION_EVENT, {detail: {type: 'confirm'}}));
    expect(root.querySelectorAll('#carnivalHand button')).toHaveLength(handCountBefore);
    expect(stage.dataset.carnivalSelected).toBe(String(playableIndex));

    // Switch (LB/RB) cycles selected hand card while remaining on the board, then switches back.
    root.dispatchEvent(new CustomEvent(CARNIVAL_ACTION_EVENT, {detail: {type: 'switch', step: playableIndex > 0 ? -1 : 1}}));
    expect(stage.dataset.carnivalSelected).not.toBe(String(playableIndex));
    root.dispatchEvent(new CustomEvent(CARNIVAL_ACTION_EVENT, {detail: {type: 'switch', step: playableIndex > 0 ? 1 : -1}}));
    expect(stage.dataset.carnivalSelected).toBe(String(playableIndex));

    // Cancel returns focus to the selected hand card; re-confirming snaps to legal square and second confirm commits!
    root.dispatchEvent(new CustomEvent(CARNIVAL_ACTION_EVENT, {detail: {type: 'cancel'}}));
    expect(stage.dataset.carnivalSelected).toBe('');
    expect(doc.activeElement?.dataset.carnivalFocus).toBe(`hand-${playableIndex}`);

    root.dispatchEvent(new CustomEvent(CARNIVAL_ACTION_EVENT, {detail: {type: 'confirm'}}));
    expect(doc.activeElement?.dataset.legal).toBe('true');
    root.dispatchEvent(new CustomEvent(CARNIVAL_ACTION_EVENT, {detail: {type: 'confirm'}}));
    expect(root.querySelectorAll('#carnivalHand button')).toHaveLength(handCountBefore - 1);
    expect(stage.dataset.carnivalSelected).toBe('');
  });

  test('supports board card details, bottom action navigation (finish/retry/back) and cancel to puzzle list', async () => {
    const {doc, root, showCard} = await mountFixture();
    const stage = root.querySelector('#carnivalStage')!;

    // Navigate from hand down to bottom actions and trigger Retry & Finish via confirm.
    root.dispatchEvent(new CustomEvent(CARNIVAL_ACTION_EVENT, {detail: {type: 'move', direction: 'down'}}));
    expect(doc.activeElement?.id).toBe('carnivalFinish');
    root.dispatchEvent(new CustomEvent(CARNIVAL_ACTION_EVENT, {detail: {type: 'move', direction: 'right'}}));
    expect(doc.activeElement?.id).toBe('carnivalRetry');
    root.dispatchEvent(new CustomEvent(CARNIVAL_ACTION_EVENT, {detail: {type: 'move', direction: 'right'}}));
    expect(doc.activeElement?.id).toBe('carnivalBack');

    // Move back up to hand, then up to board to inspect an occupied card with details.
    root.dispatchEvent(new CustomEvent(CARNIVAL_ACTION_EVENT, {detail: {type: 'move', direction: 'up'}}));
    expect(doc.activeElement?.dataset.carnivalFocus).toBe('hand-0');
    const occupied = root.querySelector('#carnivalBoard .tile.occupied')!;
    occupied.focus();
    root.dispatchEvent(new CustomEvent(CARNIVAL_ACTION_EVENT, {detail: {type: 'details'}}));
    expect(showCard).toHaveBeenCalledWith(Number(occupied.dataset.cardId));

    // Finish the puzzle via bottom action button, then Retry restores playing phase.
    root.querySelector('#carnivalFinish')!.focus();
    root.dispatchEvent(new CustomEvent(CARNIVAL_ACTION_EVENT, {detail: {type: 'confirm'}}));
    expect(stage.dataset.carnivalPhase).toBe('finished');

    root.dispatchEvent(new CustomEvent(CARNIVAL_ACTION_EVENT, {detail: {type: 'move', direction: 'down'}}));
    expect(doc.activeElement?.id).toBe('carnivalRetry');
    root.dispatchEvent(new CustomEvent(CARNIVAL_ACTION_EVENT, {detail: {type: 'confirm'}}));
    expect(stage.dataset.carnivalPhase).toBe('playing');

    // Cancel from hand (nothing selected) returns to the puzzle list.
    expect(doc.activeElement?.dataset.carnivalFocus).toBe('hand-0');
    root.dispatchEvent(new CustomEvent(CARNIVAL_ACTION_EVENT, {detail: {type: 'cancel'}}));
    expect(stage.hidden).toBe(true);
    expect(root.querySelector('.carnival-list')!.hidden).toBe(false);
  });

  test('renders category filters, cleared progress stats, skill-drill no-reward items, and live card ability inspector', async () => {
    const {root, showCard, carnival} = await mountFixture();
    carnival.showList();

    const progress = root.querySelector('#carnivalProgress')!;
    expect(progress.dataset.clearedCount).toBe('0');
    expect(progress.dataset.totalCount).toBe('22');
    expect(root.querySelectorAll('.carnival-puzzles li')).toHaveLength(22);

    // Filter by Chapter 6 (7), Chapter 12 (15), Collector's (9), Skill Drills (5)
    root.querySelector('[data-carnival-filter="ch6"]')!.click();
    expect(root.querySelectorAll('.carnival-puzzles li')).toHaveLength(7);

    root.querySelector('[data-carnival-filter="ch12"]')!.click();
    expect(root.querySelectorAll('.carnival-puzzles li')).toHaveLength(15);

    root.querySelector('[data-carnival-filter="collection"]')!.click();
    expect(root.querySelectorAll('.carnival-puzzles li')).toHaveLength(9);

    root.querySelector('[data-carnival-filter="skill-drill"]')!.click();
    expect(root.querySelectorAll('.carnival-puzzles li')).toHaveLength(5);
    expect(root.querySelectorAll('.carnival-reward--none')).toHaveLength(5);

    // Open Collector's Card: Cloud and verify inline ability inspector updates for hand & occupied board tiles.
    root.querySelector('[data-carnival-filter="collection"]')!.click();
    root.querySelector('[data-puzzle-id="cc-collectors-cloud"]')!.click();
    const inspector = root.querySelector('#carnivalInspector')!;
    expect(inspector.dataset.source).toBe('hand');
    expect(inspector.dataset.cardId).toBe('1');

    // Selecting Cloud (#86) updates inspector to Cloud's ability text.
    const cloudBtn = root.querySelectorAll('#carnivalHand button').find(btn => btn.dataset.cardId === '86')!;
    cloudBtn.click();
    expect(inspector.dataset.source).toBe('hand');
    expect(inspector.dataset.cardId).toBe('86');
    expect(inspector.querySelector('h3')?.textContent).toContain('086');

    // Focusing/clicking an occupied board tile inspects that board card and opens full details modal.
    cloudBtn.click(); // deselect hand card
    const occupied = root.querySelector('#carnivalBoard .tile.occupied')!;
    occupied.focus();
    expect(inspector.dataset.source).toBe('board');
    expect(inspector.dataset.cardId).toBe(occupied.dataset.cardId);
    occupied.click();
    expect(showCard).toHaveBeenCalledWith(Number(occupied.dataset.cardId));

    // Solving Three-Card Stud updates the list progress badge to 1 / 22.
    carnival.showList();
    root.querySelector('[data-carnival-filter="all"]')!.click();
    root.querySelector('[data-puzzle-id="cc-three-card-stud"]')!.click();
    const playStep = (cardId: number, cell: string) => {
      const btn = root.querySelectorAll('#carnivalHand button').find(b => Number(b.dataset.cardId) === cardId)!;
      btn.click();
      root.querySelector(`#carnivalBoard [data-cell="${cell}"]`)!.click();
      root.querySelector('#carnivalConfirm')!.click();
    };
    playStep(23, '2-2');
    playStep(15, '0-0');
    playStep(14, '1-1');
    root.querySelector('#carnivalFinish')!.click();
    expect(root.dataset.result).toBe('passed');

    carnival.showList();
    expect(root.querySelector('#carnivalProgress')?.dataset.clearedCount).toBe('1');
  });
});
