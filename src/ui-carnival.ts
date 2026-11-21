import {createCardView} from './card-view.js';
import {byId} from './cards.js';
import {COLS, ROWS, previewEffects, previewInfluence, type RuleEvent} from './engine.js';
import {displayName, localizedName} from './i18n/card-names.js';
import {carnivalMessages} from './i18n/carnival.js';
import {t} from './i18n/index.js';
import {puzzleCatalog, type CarnivalPuzzle, type CarnivalPuzzleId} from './puzzle-catalog.js';
import {PuzzleSession, type PuzzleMove, type PuzzleResult} from './puzzle-session.js';
import {boardPawns, observeTable, placedCardView} from './ui-board.js';
import {button, element} from './ui-dom.js';
import {replayEventLabel} from './ui-replay.js';
import type {CardVisual} from './visuals.js';
import '../site/card-carnival.css';

interface CarnivalHooks {
  visual: (id: number) => CardVisual;
  showCard: (id: number) => void;
}

const nameOf = (id: number) => displayName(id, byId.get(id)!.name);
const cellKey = (row: number, col: number) => `${row}-${col}`;
const scorePair = ([you, opponent]: [number, number]) => `${you} : ${opponent}`;
const resultLabels = {passed: 'victory', failed: 'defeat', draw: 'draw'} as const;

function scoringTable(result: PuzzleResult): HTMLTableElement {
  const table = element('table');
  const header = table.createTHead().insertRow();
  for (const key of ['lane', 'power', 'actualScore'] as const) {
    const col = element('th', '', t(key));
    col.scope = 'col';
    header.append(col);
  }
  const body = table.createTBody();
  for (const [i, row] of result.rows.entries()) {
    const tr = body.insertRow();
    const lane = element('th', '', t('laneNumber', i + 1));
    lane.scope = 'row';
    tr.append(lane, element('td', '', scorePair(row)), element('td', '', scorePair(result.awards[i])));
  }
  return table;
}

export function mountCarnival(root: HTMLElement, hooks: CarnivalHooks) {
  const list = element('section', 'window carnival-list');
  const stage = element('section', 'window carnival-stage');
  stage.hidden = true;
  const title = element('h2', 'view-title');
  title.tabIndex = -1;
  const table = element('div', 'board-layout frame-table carnival-table');
  const scores = [element('div', 'lane-scores'), element('div', 'lane-scores')] as const;
  const board = element('div', 'board');
  board.id = 'carnivalBoard';
  board.setAttribute('role', 'group');
  table.append(scores[0], board, scores[1]);
  const legend = element('p', 'carnival-legend');
  const help = element('p', 'muted');
  const feedback = element('ul', 'carnival-feedback');
  feedback.setAttribute('aria-live', 'polite');
  const hand = element('div', 'battle-hand carnival-hand');
  hand.id = 'carnivalHand';
  hand.setAttribute('role', 'group');
  const result = element('div', 'match-result carnival-result');
  result.setAttribute('aria-live', 'polite');
  const commands = element('div', 'button-row carnival-actions');
  const confirm = button('', confirmPlay, 'primary');
  confirm.id = 'carnivalConfirm';
  const finish = button('', finishPuzzle);
  finish.id = 'carnivalFinish';
  const retry = button('', retryPuzzle);
  retry.id = 'carnivalRetry';
  const back = button('', () => showList(attempt?.puzzle.id));
  back.id = 'carnivalBack';
  const details = button('', () => {
    const id = selected === null ? undefined : attempt?.session.snapshot().hand[selected];
    if (id !== undefined) hooks.showCard(id);
  });
  commands.append(confirm, finish, retry, back, details);
  stage.append(title, legend, table, hand, commands, help, feedback, result);
  root.append(list, stage);
  observeTable(table);

  const cleared = new Set<CarnivalPuzzleId>();
  let attempt: {puzzle: CarnivalPuzzle<CarnivalPuzzleId>; session: PuzzleSession} | null = null;
  let selected: number | null = null;
  let pending: PuzzleMove | null = null;

  function clearSelection() {
    selected = null;
    pending = null;
  }

  function renderList() {
    const messages = carnivalMessages();
    const heading = element('h2', 'view-title', messages.title);
    heading.tabIndex = -1;
    const header = element('div', 'frame-library-heading');
    header.append(heading, element('p', 'muted', messages.intro));
    const items = element('ul', 'carnival-puzzles');
    for (const puzzle of puzzleCatalog) {
      const translated = localizedName(puzzle.titleKey, puzzle.englishTitle);
      const label = element('h3', '', translated);
      if (translated === puzzle.englishTitle) label.lang = 'en';
      const info = element('div', 'carnival-puzzle-info');
      const reward = `#${String(puzzle.originalRewardCardId).padStart(3, '0')} ${nameOf(puzzle.originalRewardCardId)}`;
      const status = element('p', 'carnival-puzzle-status', messages.candidate);
      if (cleared.has(puzzle.id)) status.append(element('strong', 'carnival-cleared', messages.cleared));
      info.append(label, status, element('p', '', messages.hints[puzzle.id]));
      const start = button(messages.start, () => open(puzzle), 'carnival-start');
      start.dataset.puzzleId = puzzle.id;
      start.setAttribute('aria-label', `${messages.start} · ${translated}`);
      const item = element('li');
      const card=byId.get(puzzle.originalRewardCardId);
      const rewardBlock=element('div','carnival-reward');
      const rewardFace=element('div','carnival-reward-face');
      if(card)rewardFace.append(createCardView(card,hooks.visual(card.id),{variant:'hand',lazy:true}));
      rewardFace.setAttribute('aria-hidden','true');
      const rewardLabel=element('div','carnival-reward-label');
      rewardLabel.append(element('span','muted',messages.reward),element('strong','',reward));
      rewardBlock.append(rewardFace,rewardLabel);
      item.append(info,rewardBlock,start);
      items.append(item);
    }
    list.replaceChildren(header, items);
  }

  function showList(focus?: CarnivalPuzzleId) {
    leave();
    renderList();
    list.hidden = false;
    (focus ? list.querySelector<HTMLElement>(`[data-puzzle-id="${focus}"]`) : list.querySelector<HTMLElement>('h2'))?.focus();
  }

  function open(puzzle: CarnivalPuzzle<CarnivalPuzzleId>) {
    attempt = {puzzle, session: new PuzzleSession(puzzle)};
    clearSelection();
    feedback.replaceChildren();
    list.hidden = true;
    stage.hidden = false;
    renderAttempt();
    title.focus();
  }

  function leave() {
    attempt = null;
    clearSelection();
    stage.hidden = true;
    board.replaceChildren();
    hand.replaceChildren();
    feedback.replaceChildren();
    result.replaceChildren();
    delete root.dataset.puzzleId;
    delete root.dataset.result;
  }

  function renderAttempt() {
    if (!attempt) return;
    const {puzzle, session} = attempt;
    const snapshot = session.snapshot(), moves = session.moves();
    const messages = carnivalMessages();
    const active = document.activeElement as HTMLElement | null;
    const focus = root.contains(active) ? active?.dataset.carnivalFocus : undefined;
    const available = new Map(moves.filter(move => move.handIndex === selected).map(move => [cellKey(move.row, move.col), move]));
    const picked = selected === null ? undefined : byId.get(snapshot.hand[selected]);
    const pawn = new Set(picked && pending ? previewInfluence(picked, pending.row, pending.col, 0).map(([r, c]) => cellKey(r, c)) : []);
    const effect = new Set(picked && pending ? previewEffects(picked, pending.row, pending.col, 0).map(([r, c]) => cellKey(r, c)) : []);
    const finished = snapshot.phase === 'finished';

    root.dataset.puzzleId = puzzle.id;
    root.dataset.result = snapshot.result?.status ?? '';
    title.textContent = localizedName(puzzle.titleKey, puzzle.englishTitle);
    title.lang = title.textContent === puzzle.englishTitle ? 'en' : '';
    legend.textContent = `${t('you')} ${scorePair(snapshot.score.scores)} ${t('opponent')}`;
    help.textContent = finished ? '' : !moves.length ? messages.noMoves : pending ? t('helpPattern') :
      picked ? available.size ? t('selectedCardHint', nameOf(picked.id)) : t('inputPlacementBlocked') : t('selectCardSelectTileConfirm');
    board.setAttribute('aria-label', t('boardWith3RowsAnd5ColumnsUse'));
    hand.setAttribute('aria-label', t('hand'));
    for (const side of [0, 1] as const) scores[side].replaceChildren(...snapshot.score.rows.map((row, r) => {
      const node = element('div', 'lane-score' + (row[side] > row[1 - side] ? ' winning' : ''));
      if (side === 0) node.append(element('small', 'carnival-lane', 'ABC'[r]));
      node.append(document.createTextNode(String(row[side])));
      node.setAttribute('aria-label', t('replayLanePower', r + 1, side + 1, row[side]));
      return node;
    }));
    board.replaceChildren(...snapshot.board.flatMap((line, row) => line.map((tile, col) => {
      const key = cellKey(row, col), move = available.get(key), target = pending?.row === row && pending.col === col;
      const occupation = tile.card ? `occupied owner-${tile.card.owner}` : tile.owner === null ? '' : `pawn-${tile.owner}`;
      const classes = ['tile', occupation, move ? 'legal' : '', target ? 'pending' : '',
        pawn.has(key) ? 'preview-pawn' : '', effect.has(key) ? 'preview-effect' : ''].filter(Boolean).join(' ');
      const node = button('', () => {
        if (move) { pending = move; renderAttempt(); }
        else if (tile.card) hooks.showCard(tile.card.id);
      }, classes);
      node.disabled = !move && !tile.card;
      node.dataset.cell = key;
      node.dataset.carnivalFocus = 'cell-' + key;
      if (move) node.setAttribute('aria-pressed', String(target));
      const description = tile.card ? t('replayTileCard', nameOf(tile.card.id), tile.card.power) :
        tile.owner === null ? t('empty2') : t('replayPawnCount', tile.owner + 1, tile.pawns);
      node.setAttribute('aria-label', t('matchTileLabel', row + 1, col + 1, description,
        move ? t('legalPlacementSuffix') : '', target ? t('pendingPlacementSuffix') : ''));
      node.append(tile.card ? placedCardView(tile.card, hooks.visual(tile.card.id)) :
        boardPawns(tile.owner,tile.pawns));
      if (pawn.has(key) || effect.has(key)) {
        const range = element('span', 'carnival-range');
        range.setAttribute('aria-hidden', 'true');
        node.append(range);
      }
      return node;
    })));
    hand.replaceChildren(...snapshot.hand.map((id, index) => {
      const node = button('', () => {
        selected = selected === index ? null : index;
        pending = null;
        renderAttempt();
      }, 'hand-card' + (selected === index ? ' selected' : ''));
      node.dataset.carnivalFocus = 'hand-' + index;
      node.setAttribute('aria-pressed', String(selected === index));
      node.disabled = finished;
      const face = createCardView(byId.get(id)!, hooks.visual(id), {variant: 'hand'});
      node.setAttribute('aria-label', face.getAttribute('aria-label') ?? nameOf(id));
      node.append(face);
      return node;
    }));
    hand.hidden = !snapshot.hand.length;
    confirm.textContent = t('confirmPlay');
    confirm.disabled = pending === null;
    confirm.hidden = finish.hidden = finished;
    finish.textContent = messages.finish;
    retry.textContent = messages.retry;
    back.textContent = messages.list;
    details.textContent = t('details');
    details.hidden = !picked;
    if (snapshot.result) {
      const final = snapshot.result;
      const heading = element('h3', '', `${t(resultLabels[final.status])} · ${scorePair(final.scores)}`);
      heading.tabIndex = -1;
      result.replaceChildren(heading, scoringTable(final));
    } else result.replaceChildren();
    if (focus) root.querySelector<HTMLElement>(`[data-carnival-focus="${focus}"]:not(:disabled)`)?.focus({preventScroll: true});
  }

  function showFeedback(events: RuleEvent[]) {
    feedback.replaceChildren(...events.filter(event => event.type !== 'PawnsClaimed')
      .map(event => element('li', '', replayEventLabel(event))));
  }

  function confirmPlay() {
    if (!attempt || !pending) return;
    const session = attempt.session;
    const eventCount = session.snapshot().events.length;
    let state;
    try { state = session.play(pending); }
    catch { feedback.replaceChildren(element('li', 'warning', t('invalidMove'))); return; }
    clearSelection();
    renderAttempt();
    showFeedback(state.events.slice(eventCount));
    (hand.querySelector<HTMLButtonElement>('button') ?? finish).focus({preventScroll: true});
  }

  function finishPuzzle() {
    if (!attempt) return;
    const state = attempt.session.finish();
    if (state.result?.status === 'passed') cleared.add(attempt.puzzle.id);
    clearSelection();
    renderAttempt();
    result.querySelector<HTMLElement>('h3')?.focus();
    result.scrollIntoView({block: 'nearest'});
  }

  function retryPuzzle() {
    if (!attempt) return;
    attempt.session.retry();
    clearSelection();
    feedback.replaceChildren();
    renderAttempt();
    (hand.querySelector<HTMLButtonElement>('button') ?? title).focus({preventScroll: true});
  }

  const directions: Record<string, [number, number]> = {
    ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0],
  };
  board.addEventListener('keydown', event => {
    const offset = directions[event.key], key = (event.target as HTMLElement).closest<HTMLElement>('[data-cell]')?.dataset.cell;
    if (!offset || !key) return;
    event.preventDefault();
    const [dr, dc] = offset;
    let [row, col] = key.split('-').map(Number);
    for (row += dr, col += dc; row >= 0 && row < ROWS && col >= 0 && col < COLS; row += dr, col += dc) {
      const cell = board.querySelector<HTMLButtonElement>(`[data-cell="${cellKey(row, col)}"]:not(:disabled)`);
      if (cell) { cell.focus(); break; }
    }
  });
  root.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !attempt) return;
    event.preventDefault();
    event.stopPropagation();
    if (pending) { pending = null; renderAttempt(); }
    else if (selected !== null) { clearSelection(); renderAttempt(); title.focus(); }
    else showList(attempt.puzzle.id);
  });

  return {showList, leave};
}
