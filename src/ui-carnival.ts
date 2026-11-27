import {createCardView} from './card-view.js';
import {byId, type Card} from './cards.js';
import {COLS, ROWS, previewEffects, previewInfluence, replayMatch, type Game, type PlacedCard, type RuleEvent} from './engine.js';
import {describeAbilities} from './i18n/abilities.js';
import {displayName, localizedName} from './i18n/card-names.js';
import {carnivalMessages, carnivalProgressText} from './i18n/carnival.js';
import {getLocale, t} from './i18n/index.js';
import {CARNIVAL_ACTION_EVENT, type SemanticAction} from './input/input-manager.js';
import {gridStep, legalTarget, smartSnap} from './input/match-cursor.js';
import {simulateMovePreview} from './move-preview.js';
import {puzzleCatalog, type CarnivalPuzzle, type CarnivalPuzzleId} from './puzzle-catalog.js';
import {puzzleCategories, type PuzzleCategory} from './puzzle-data.js';
import {PuzzleSession, type PuzzleMove, type PuzzleResult} from './puzzle-session.js';
import {boardPawns, observeTable, placedCardView} from './ui-board.js';
import {button, element} from './ui-dom.js';
import {applyMovePreviewOverlay} from './ui-match-feedback.js';
import {replayEventLabel} from './ui-replay.js';
import type {AudioController, MatchAudioSession} from './audio-controller.js';
import type {PlayerProgress} from './progress.js';
import type {SfxCue} from './sfx.js';
import type {CardVisual} from './visuals.js';
import '../site/card-carnival.css';

interface CarnivalHooks {
  visual: (id: number) => CardVisual;
  showCard: (id: number) => void;
  audio?: {controller: AudioController; visible: () => boolean};
  progress?: {
    get: () => PlayerProgress;
    recordClear: (puzzleId: string, playerScore: number, opponentScore: number) => void;
  };
}

type CarnivalFilter = 'all' | 'ch6' | 'ch12' | PuzzleCategory;

const nameOf = (id: number) => displayName(id, byId.get(id)!.name);
const cellKey = (row: number, col: number) => `${row}-${col}`;
const scorePair = ([you, opponent]: [number, number]) => `${you} : ${opponent}`;
const resultLabels = {passed: 'victory', failed: 'defeat', draw: 'draw'} as const;

function matchesFilter(puzzle: CarnivalPuzzle<CarnivalPuzzleId>, filter: CarnivalFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'ch6') return puzzle.chapter === 6;
  if (filter === 'ch12') return puzzle.chapter === 12;
  return puzzle.category === filter;
}

function cardPlacementLabel(card: Card): string {
  if (card.placement === 'replace') return t('replace');
  if (card.rarity === 'token' && card.cost === 0) return t('generated');
  return t('rankValue', card.cost);
}

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
  stage.id = 'carnivalStage';
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
  const hints = element('p', 'gamepad-hints carnival-gamepad-hints');
  hints.id = 'carnivalHints';
  hints.hidden = true;
  const help = element('p', 'muted');
  const feedback = element('ul', 'carnival-feedback');
  feedback.setAttribute('aria-live', 'polite');
  const hand = element('div', 'battle-hand carnival-hand');
  hand.id = 'carnivalHand';
  hand.setAttribute('role', 'group');
  const inspector = element('aside', 'qb-details carnival-inspector');
  inspector.id = 'carnivalInspector';
  inspector.setAttribute('aria-live', 'polite');
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
    const id = activeCardId();
    if (id !== undefined) hooks.showCard(id);
  });
  details.id = 'carnivalDetails';
  commands.append(confirm, finish, retry, back, details);
  stage.append(title, legend, table, hand, inspector, commands, hints, help, feedback, result);
  root.append(list, stage);
  observeTable(table);

  const cleared = new Set<CarnivalPuzzleId>();
  let activeFilter: CarnivalFilter = 'all';
  let attempt: {puzzle: CarnivalPuzzle<CarnivalPuzzleId>; session: PuzzleSession} | null = null;
  let audioSession: MatchAudioSession | undefined;
  let audioSeq = 0;
  let selected: number | null = null;
  let pending: PuzzleMove | null = null;
  let aimed: number | null = null;
  let lastBoard: number | null = null;
  let focusedHand = 0;
  let inspectedBoard: number | null = null;
  let lastInspectorKey = '';
  let previewGameKey = '';
  let previewGame: Game | null = null;

  function currentPreviewGame(): Game | null {
    if (!attempt) return null;
    const snap = attempt.session.snapshot();
    if (snap.phase !== 'playing') return null;
    const key = `${attempt.puzzle.id}:${snap.revision}:${snap.events.length}`;
    if (key !== previewGameKey || !previewGame) {
      previewGameKey = key;
      try { previewGame = replayMatch(attempt.session.debugReplay()); }
      catch { previewGame = null; }
    }
    return previewGame;
  }

  function applyLivePreview(move: PuzzleMove | null) {
    const g = move ? currentPreviewGame() : null;
    const preview = g && move ? simulateMovePreview(g, 0, move.handIndex, move.row, move.col) : null;
    applyMovePreviewOverlay({
      board,
      leftScores: scores[0],
      rightScores: scores[1],
      legendDeltaHost: legend,
      preview,
    });
  }

  function playSfx(cue: SfxCue, options?: {skipIfVictoryTrack?: boolean}) {
    try { hooks.audio?.controller.playSfx?.(cue, options); }
    catch { /* Audio is optional. */ }
  }

  function resumeAudio() {
    if (!attempt || !hooks.audio?.visible()) return;
    try { audioSession = hooks.audio.controller.startOrResumeMatch('carnival-' + attempt.puzzle.id, attempt.session.snapshot().phase); }
    catch { /* Audio is optional. */ }
  }
  function pauseAudio(immediate = false) {
    const session = audioSession;
    audioSession = undefined;
    if (!hooks.audio || (!session && !immediate)) return;
    try { hooks.audio.controller.pauseOrExitMatch(session, immediate); }
    catch { /* Audio is optional. */ }
  }

  function clearSelection() {
    selected = null;
    pending = null;
    aimed = null;
  }

  function isPuzzleCleared(id: CarnivalPuzzleId, progress: PlayerProgress | undefined): boolean {
    return cleared.has(id) || Boolean(progress?.carnival[id]?.cleared);
  }

  function activeCardTarget(): {cardId: number; placed?: PlacedCard} | undefined {
    if (!attempt) return undefined;
    const snapshot = attempt.session.snapshot();
    const active = document.activeElement as HTMLElement | null;
    if (board.contains(active) && active?.dataset.index !== undefined) {
      const index = Number(active.dataset.index);
      const tile = snapshot.board[Math.floor(index / COLS)]?.[index % COLS];
      if (tile?.card) return {cardId: tile.card.id, placed: tile.card};
    }
    if (hand.contains(active) && active?.dataset.handIndex !== undefined) {
      const id = snapshot.hand[Number(active.dataset.handIndex)];
      if (id !== undefined) return {cardId: id};
    }
    if (selected !== null && snapshot.hand[selected] !== undefined) {
      return {cardId: snapshot.hand[selected]};
    }
    if (inspectedBoard !== null) {
      const tile = snapshot.board[Math.floor(inspectedBoard / COLS)]?.[inspectedBoard % COLS];
      if (tile?.card) return {cardId: tile.card.id, placed: tile.card};
    }
    if (aimed !== null) {
      const tile = snapshot.board[Math.floor(aimed / COLS)]?.[aimed % COLS];
      if (tile?.card) return {cardId: tile.card.id, placed: tile.card};
    }
    const fallback = snapshot.hand[focusedHand];
    return fallback !== undefined ? {cardId: fallback} : undefined;
  }

  function activeCardId(): number | undefined {
    return activeCardTarget()?.cardId;
  }

  function renderInspector(force = false) {
    if (!attempt) {
      if (lastInspectorKey !== '') {
        lastInspectorKey = '';
        inspector.replaceChildren();
        delete inspector.dataset.cardId;
        delete inspector.dataset.source;
      }
      return;
    }
    const messages = carnivalMessages();
    const locale = getLocale();
    const target = activeCardTarget();
    const card = target ? byId.get(target.cardId) : undefined;
    const key = card
      ? `${locale}:${card.id}:${target?.placed ? `b:${target.placed.power}` : 'h'}`
      : `${locale}:empty`;
    if (!force && key === lastInspectorKey) return;
    lastInspectorKey = key;

    inspector.setAttribute('aria-label', t('cardDetails'));
    if (!card) {
      delete inspector.dataset.cardId;
      inspector.dataset.source = 'empty';
      inspector.replaceChildren(element('p', 'muted carnival-inspector-empty', messages.inspectHint));
      return;
    }

    inspector.dataset.cardId = String(card.id);
    inspector.dataset.source = target?.placed ? 'board' : 'hand';
    const code = card.rarity === 'token'
      ? `${t('token')} #${card.id}`
      : `No. ${String(card.id).padStart(3, '0')}`;
    const header = element('div', 'carnival-inspector-head');
    const heading = element('h3', '', `${code} · ${nameOf(card.id)}`);
    const facts = element('p', 'carnival-inspector-facts',
      `${cardPlacementLabel(card)} · ${target?.placed ? t('currentAndBasePower', target.placed.power, card.power) : t('basePowerValue', card.power)}`);
    header.append(heading, facts);

    const abilities = describeAbilities(card, locale);
    const body = element('div', 'qb-description carnival-inspector-body');
    for (const line of abilities) body.append(element('p', '', line));
    inspector.replaceChildren(header, body);
  }

  function renderList(focusFilter?: CarnivalFilter) {
    const messages = carnivalMessages();
    const progress = hooks.progress?.get();
    const clearedTotal = puzzleCatalog.filter(puzzle => isPuzzleCleared(puzzle.id, progress)).length;

    const heading = element('h2', 'view-title', messages.title);
    heading.tabIndex = -1;
    const header = element('div', 'frame-library-heading');
    const summaryRow = element('div', 'carnival-summary-row');
    const progressBadge = element('p', 'carnival-progress honor-badge', carnivalProgressText(clearedTotal, puzzleCatalog.length));
    progressBadge.id = 'carnivalProgress';
    progressBadge.dataset.clearedCount = String(clearedTotal);
    progressBadge.dataset.totalCount = String(puzzleCatalog.length);
    summaryRow.append(heading, progressBadge);
    header.append(summaryRow, element('p', 'muted', messages.intro));

    const filterBar = element('div', 'button-row carnival-filters');
    filterBar.id = 'carnivalFilters';
    filterBar.setAttribute('role', 'group');
    filterBar.setAttribute('aria-label', messages.title);
    const filterDefs: Array<{id: CarnivalFilter; label: string}> = [
      {id: 'all', label: messages.filterAll},
      {id: 'ch6', label: messages.chapter6},
      {id: 'ch12', label: messages.chapter12},
      ...puzzleCategories.map(cat => ({id: cat as CarnivalFilter, label: messages.categories[cat]})),
    ];
    for (const def of filterDefs) {
      const count = puzzleCatalog.filter(puzzle => matchesFilter(puzzle, def.id)).length;
      const btn = button(`${def.label} (${count})`, () => {
        if (activeFilter === def.id) return;
        activeFilter = def.id;
        playSfx('cursor');
        renderList(def.id);
      }, 'carnival-filter' + (activeFilter === def.id ? ' primary is-active' : ''));
      btn.dataset.carnivalFilter = def.id;
      btn.setAttribute('aria-pressed', String(activeFilter === def.id));
      filterBar.append(btn);
    }

    const items = element('ul', 'carnival-puzzles');
    const visible = puzzleCatalog.filter(puzzle => matchesFilter(puzzle, activeFilter));
    for (const puzzle of visible) {
      const translated = localizedName(puzzle.titleKey, puzzle.englishTitle);
      const label = element('h3', '', translated);
      if (translated === puzzle.englishTitle) label.lang = 'en';
      const info = element('div', 'carnival-puzzle-info');
      const chapterTag = puzzle.chapter === 6 ? messages.chapter6 : messages.chapter12;
      const meta = element('p', 'carnival-puzzle-meta');
      meta.append(
        element('span', 'carnival-tag carnival-tag--chapter', chapterTag),
        element('span', `carnival-tag carnival-tag--${puzzle.category}`, messages.categories[puzzle.category]),
      );
      const status = element('p', 'carnival-puzzle-status', messages.candidate);
      const record = progress?.carnival[puzzle.id];
      const isCleared = isPuzzleCleared(puzzle.id, progress);
      if (isCleared) {
        status.append(element('strong', 'carnival-cleared honor-badge honor-badge--cleared', t('progressCleared')));
        if (record) status.append(element('span', 'honor-meta', t('progressBestScore', record.bestScore)));
      }
      info.append(label, meta, status, element('p', '', messages.hints[puzzle.id]));
      const start = button(messages.start, () => { playSfx('confirm'); open(puzzle); }, 'carnival-start');
      start.dataset.puzzleId = puzzle.id;
      start.setAttribute('aria-label', `${messages.start} · ${translated}`);
      const item = element('li');
      item.dataset.chapter = String(puzzle.chapter);
      item.dataset.category = puzzle.category;
      if (isCleared) item.dataset.cleared = 'true';
      const rewardBlock = element('div', 'carnival-reward');
      if (puzzle.originalRewardCardId !== null) {
        const reward = `#${String(puzzle.originalRewardCardId).padStart(3, '0')} ${nameOf(puzzle.originalRewardCardId)}`;
        const card = byId.get(puzzle.originalRewardCardId);
        const rewardFace = element('div', 'carnival-reward-face');
        if (card) rewardFace.append(createCardView(card, hooks.visual(card.id), {variant: 'hand', lazy: true}));
        rewardFace.setAttribute('aria-hidden', 'true');
        const rewardLabel = element('div', 'carnival-reward-label');
        rewardLabel.append(element('span', 'muted', messages.reward), element('strong', '', reward));
        rewardBlock.append(rewardFace, rewardLabel);
      } else {
        rewardBlock.classList.add('carnival-reward--none');
        const rewardLabel = element('div', 'carnival-reward-label');
        rewardLabel.append(element('span', 'muted', messages.noReward));
        rewardBlock.append(rewardLabel);
      }
      item.append(info, rewardBlock, start);
      items.append(item);
    }
    list.replaceChildren(header, filterBar, items);
    if (focusFilter) {
      list.querySelector<HTMLElement>(`[data-carnival-filter="${focusFilter}"]`)?.focus({preventScroll: true});
    }
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
    lastBoard = null;
    focusedHand = 0;
    inspectedBoard = null;
    lastInspectorKey = '';
    previewGameKey = '';
    previewGame = null;
    feedback.replaceChildren();
    list.hidden = true;
    stage.hidden = false;
    resumeAudio();
    renderAttempt();
    (hand.querySelector<HTMLElement>('button:not(:disabled)') ?? finish ?? title).focus({preventScroll: true});
  }

  function leave() {
    pauseAudio();
    attempt = null;
    clearSelection();
    lastBoard = null;
    focusedHand = 0;
    inspectedBoard = null;
    lastInspectorKey = '';
    previewGameKey = '';
    previewGame = null;
    applyLivePreview(null);
    stage.hidden = true;
    delete stage.dataset.carnivalPhase;
    delete stage.dataset.carnivalSelected;
    delete stage.dataset.carnivalPending;
    board.replaceChildren();
    hand.replaceChildren();
    inspector.replaceChildren();
    delete inspector.dataset.cardId;
    delete inspector.dataset.source;
    feedback.replaceChildren();
    result.replaceChildren();
    delete root.dataset.puzzleId;
    delete root.dataset.result;
  }

  function renderAttempt(nextFocus?: string) {
    if (!attempt) return;
    const {puzzle, session} = attempt;
    const snapshot = session.snapshot(), moves = session.moves();
    const messages = carnivalMessages();
    const active = document.activeElement as HTMLElement | null;
    const focus = nextFocus ?? (root.contains(active) ? active?.dataset.carnivalFocus : undefined);
    const available = new Map(moves.filter(move => move.handIndex === selected).map(move => [cellKey(move.row, move.col), move]));
    const picked = selected === null ? undefined : byId.get(snapshot.hand[selected]);
    const previewPos = pending ?? (picked && aimed !== null ? {row: Math.floor(aimed / COLS), col: aimed % COLS} : null);
    const pawn = new Set(picked && previewPos ? previewInfluence(picked, previewPos.row, previewPos.col, 0).map(([r, c]) => cellKey(r, c)) : []);
    const effect = new Set(picked && previewPos ? previewEffects(picked, previewPos.row, previewPos.col, 0).map(([r, c]) => cellKey(r, c)) : []);
    const finished = snapshot.phase === 'finished';
    const blockedAim = Boolean(picked && aimed !== null && !pending);

    root.dataset.puzzleId = puzzle.id;
    root.dataset.result = snapshot.result?.status ?? '';
    stage.dataset.carnivalPhase = snapshot.phase;
    stage.dataset.carnivalSelected = selected === null ? '' : String(selected);
    stage.dataset.carnivalPending = pending ? String(pending.row * COLS + pending.col) : '';
    title.textContent = localizedName(puzzle.titleKey, puzzle.englishTitle);
    title.lang = title.textContent === puzzle.englishTitle ? 'en' : '';
    legend.textContent = `${t('you')} ${scorePair(snapshot.score.scores)} ${t('opponent')}`;
    help.textContent = finished ? '' : !moves.length ? messages.noMoves
      : blockedAim ? t('inputPlacementBlocked')
      : pending ? t('helpPattern')
      : picked ? available.size ? t('selectedCardHint', nameOf(picked.id)) : t('inputPlacementBlocked')
      : t('selectCardSelectTileConfirm');
    board.setAttribute('aria-label', t('boardWith3RowsAnd5ColumnsUse'));
    hand.setAttribute('aria-label', t('hand'));
    for (const side of [0, 1] as const) scores[side].replaceChildren(...snapshot.score.rows.map((row, r) => {
      const node = element('div', 'lane-score' + (row[side] > row[1 - side] ? ' winning' : ''));
      if (side === 0) node.append(element('small', 'carnival-lane', 'ABC'[r]));
      node.append(document.createTextNode(String(row[side])));
      node.setAttribute('aria-label', t('replayLanePower', r + 1, side + 1, row[side]));
      return node;
    }));
    const activeCell = aimed ?? lastBoard ?? 0;
    board.replaceChildren(...snapshot.board.flatMap((line, row) => line.map((tile, col) => {
      const index = row * COLS + col;
      const key = cellKey(row, col), move = available.get(key), target = pending?.row === row && pending.col === col;
      const isAimed = aimed === index, blocked = isAimed && selected !== null && !move;
      const occupation = tile.card ? `occupied owner-${tile.card.owner}` : tile.owner === null ? '' : `pawn-${tile.owner}`;
      const classes = ['tile', occupation, move ? 'legal' : '', target ? 'pending' : '',
        blocked ? 'blocked-target' : '',
        pawn.has(key) ? 'preview-pawn' : '', effect.has(key) ? 'preview-effect' : ''].filter(Boolean).join(' ');
      const node = button('', () => {
        aimed = index;
        lastBoard = index;
        if (move) { inspectedBoard = null; playSfx('cursor'); pending = move; renderAttempt('cell-' + key); }
        else if (tile.card) { inspectedBoard = index; playSfx('confirm'); renderInspector(true); hooks.showCard(tile.card.id); }
        else if (selected !== null) { inspectedBoard = null; playSfx('cancel'); pending = null; renderAttempt('cell-' + key); }
      }, classes);
      node.disabled = false;
      node.tabIndex = index === activeCell ? 0 : -1;
      node.dataset.cell = key;
      node.dataset.index = String(index);
      node.dataset.carnivalFocus = 'cell-' + key;
      node.dataset.legal = String(Boolean(move));
      node.addEventListener('focusin', () => { renderInspector(); });
      if (tile.card) node.dataset.cardId = String(tile.card.id);
      if (move) node.setAttribute('aria-pressed', String(target));
      const description = tile.card ? t('replayTileCard', nameOf(tile.card.id), tile.card.power) :
        tile.owner === null ? t('empty2') : t('replayPawnCount', tile.owner + 1, tile.pawns);
      node.setAttribute('aria-label', t('matchTileLabel', row + 1, col + 1, description,
        move ? t('legalPlacementSuffix') : '',
        target ? t('pendingPlacementSuffix') : blocked ? ' · ' + t('inputPlacementBlocked') : ''));
      node.append(tile.card ? placedCardView(tile.card, hooks.visual(tile.card.id)) :
        boardPawns(tile.owner,tile.pawns));
      if (pawn.has(key) || effect.has(key)) {
        const range = element('span', 'carnival-range');
        range.setAttribute('aria-hidden', 'true');
        node.append(range);
      }
      return node;
    })));
    if (snapshot.hand.length) focusedHand = Math.max(0, Math.min(focusedHand, snapshot.hand.length - 1));
    else focusedHand = 0;
    const activeHand = selected ?? focusedHand;
    hand.replaceChildren(...snapshot.hand.map((id, index) => {
      const node = button('', () => {
        focusedHand = index;
        inspectedBoard = null;
        if (selected === index) {
          clearSelection();
          playSfx('cancel');
          renderAttempt('hand-' + index);
        } else {
          selected = index;
          pending = null;
          aimed = null;
          playSfx('cardLift');
          renderAttempt('hand-' + index);
        }
      }, 'hand-card' + (selected === index ? ' selected' : ''));
      node.dataset.handIndex = String(index);
      node.dataset.cardId = String(id);
      node.dataset.carnivalFocus = 'hand-' + index;
      node.tabIndex = index === activeHand ? 0 : -1;
      node.setAttribute('aria-pressed', String(selected === index));
      node.disabled = finished;
      node.addEventListener('focusin', () => {
        focusedHand = index;
        inspectedBoard = null;
        renderInspector();
      });
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
    details.hidden = activeCardId() === undefined;
    if (snapshot.result) {
      const final = snapshot.result;
      const heading = element('h3', '', `${t(resultLabels[final.status])} · ${scorePair(final.scores)}`);
      heading.tabIndex = -1;
      result.replaceChildren(heading, scoringTable(final));
    } else result.replaceChildren();
    if (focus) root.querySelector<HTMLElement>(`[data-carnival-focus="${focus}"]:not(:disabled)`)?.focus({preventScroll: true});
    applyLivePreview(pending);
    renderInspector();
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
    catch { playSfx('cancel'); feedback.replaceChildren(element('li', 'warning', t('invalidMove'))); return; }
    const newEvents = state.events.slice(eventCount);
    playSfx('cardPlace');
    try { hooks.audio?.controller.playSfxForEvents?.(newEvents); } catch { /* Audio is optional. */ }
    clearSelection();
    inspectedBoard = null;
    renderAttempt();
    showFeedback(newEvents);
    (hand.querySelector<HTMLButtonElement>('button') ?? finish).focus({preventScroll: true});
  }

  function finishPuzzle() {
    if (!attempt) return;
    const state = attempt.session.finish();
    if (state.result?.status === 'passed') {
      cleared.add(attempt.puzzle.id);
      hooks.progress?.recordClear(attempt.puzzle.id, state.result.scores[0], state.result.scores[1]);
    }
    if (audioSession && hooks.audio?.visible() && state.result) {
      const seq = ++audioSeq;
      try {
        hooks.audio.controller.enterScoring(audioSession, seq, state.result.winner);
        hooks.audio.controller.revealResult(audioSession, seq);
      } catch { /* Audio is optional. */ }
    }
    if (state.result?.status === 'passed') playSfx('fanfareLite', {skipIfVictoryTrack: true});
    else playSfx('scoreTick');
    clearSelection();
    inspectedBoard = null;
    renderAttempt();
    result.querySelector<HTMLElement>('h3')?.focus();
    result.scrollIntoView({block: 'nearest'});
  }

  function retryPuzzle() {
    if (!attempt) return;
    playSfx('cancel');
    attempt.session.retry();
    clearSelection();
    lastBoard = null;
    focusedHand = 0;
    inspectedBoard = null;
    lastInspectorKey = '';
    previewGameKey = '';
    previewGame = null;
    feedback.replaceChildren();
    resumeAudio();
    renderAttempt();
    (hand.querySelector<HTMLButtonElement>('button:not(:disabled)') ?? title).focus({preventScroll: true});
  }

  function usableActions() {
    return Array.from(commands.querySelectorAll<HTMLButtonElement>('button')).filter(node => !node.hidden && !node.disabled);
  }

  function focusBoardCell(index: number) {
    if (!attempt) return;
    const clamped = Math.max(0, Math.min(ROWS * COLS - 1, index));
    aimed = clamped;
    lastBoard = clamped;
    const legal = selected === null ? [] : attempt.session.moves().filter(move => move.handIndex === selected);
    pending = selected === null ? null : legalTarget(legal, clamped);
    renderAttempt('cell-' + cellKey(Math.floor(clamped / COLS), clamped % COLS));
  }

  function focusHandCard(index: number): boolean {
    if (!attempt) return false;
    const snapshot = attempt.session.snapshot();
    if (snapshot.phase === 'finished' || !snapshot.hand.length) return false;
    const clamped = Math.max(0, Math.min(snapshot.hand.length - 1, index));
    focusedHand = clamped;
    inspectedBoard = null;
    aimed = null;
    if (selected === null) pending = null;
    renderAttempt('hand-' + clamped);
    return true;
  }

  function focusCommand(preferred?: HTMLButtonElement): boolean {
    const list = usableActions();
    const target = preferred && list.includes(preferred) ? preferred : list[0];
    if (!target) return false;
    target.focus({preventScroll: true});
    return true;
  }

  function handleAction(action: SemanticAction): boolean {
    if (!attempt || stage.hidden) return false;
    const snapshot = attempt.session.snapshot();
    const finished = snapshot.phase === 'finished';
    const focused = document.activeElement as HTMLElement | null;

    if (action.type === 'details') {
      const id = activeCardId();
      if (id !== undefined) { hooks.showCard(id); return true; }
      return false;
    }
    if (action.type === 'switch') {
      if (finished || !snapshot.hand.length) return false;
      const base = selected ?? focusedHand;
      const next = Math.max(0, Math.min(snapshot.hand.length - 1, base + action.step));
      if (selected !== null) {
        selected = next;
        focusedHand = next;
        inspectedBoard = null;
        focusBoardCell(aimed ?? lastBoard ?? 0);
      } else {
        focusHandCard(next);
      }
      return true;
    }
    if (action.type === 'cancel') {
      if (selected !== null) {
        const returnTo = selected;
        clearSelection();
        renderAttempt('hand-' + Math.min(returnTo, Math.max(0, snapshot.hand.length - 1)));
        return true;
      }
      if (board.contains(focused)) {
        aimed = null;
        inspectedBoard = null;
        if (!finished && snapshot.hand.length) {
          renderAttempt('hand-' + focusedHand);
          return true;
        }
      }
      showList(attempt.puzzle.id);
      return true;
    }
    if (action.type === 'menu') {
      return focusCommand(finished ? retry : finish);
    }
    if (action.type === 'scroll') {
      window.scrollBy(0, 120 * action.step);
      return true;
    }
    if (action.type === 'confirm') {
      if (hand.contains(focused) && focused?.dataset.handIndex !== undefined) {
        const hi = Number(focused.dataset.handIndex);
        if (finished || snapshot.hand[hi] === undefined) return false;
        selected = hi;
        focusedHand = hi;
        inspectedBoard = null;
        const legal = attempt.session.moves().filter(move => move.handIndex === hi);
        focusBoardCell(smartSnap(legal.map(move => move.row * COLS + move.col), lastBoard));
        return true;
      }
      if (board.contains(focused) && focused?.dataset.index !== undefined) {
        const index = Number(focused.dataset.index);
        if (selected !== null) {
          const legal = attempt.session.moves().filter(move => move.handIndex === selected);
          const move = legalTarget(legal, index);
          if (move) { pending = move; confirmPlay(); return true; }
          focusBoardCell(index);
          return true;
        }
        const tile = snapshot.board[Math.floor(index / COLS)]?.[index % COLS];
        if (tile?.card) { inspectedBoard = index; renderInspector(true); hooks.showCard(tile.card.id); return true; }
        return false;
      }
      if (commands.contains(focused) && focused instanceof HTMLButtonElement && !focused.disabled && !focused.hidden) {
        focused.click();
        return true;
      }
      if (!finished && snapshot.hand.length) return focusHandCard(focusedHand);
      return focusCommand(finished ? retry : finish);
    }
    if (action.type === 'move') {
      const dir = action.direction;
      if (hand.contains(focused) && focused?.dataset.handIndex !== undefined) {
        const hi = Number(focused.dataset.handIndex);
        if (dir === 'left' || dir === 'right') return focusHandCard(hi + (dir === 'left' ? -1 : 1));
        if (dir === 'up') { focusBoardCell(lastBoard ?? ((ROWS - 1) * COLS + Math.min(COLS - 1, hi))); return true; }
        if (dir === 'down') return focusCommand(pending ? confirm : finish);
        return false;
      }
      if (board.contains(focused) && focused?.dataset.index !== undefined) {
        const index = Number(focused.dataset.index);
        if (dir === 'down' && index >= (ROWS - 1) * COLS && selected === null) {
          aimed = null;
          inspectedBoard = null;
          renderAttempt();
          if (!finished && snapshot.hand.length) return focusHandCard(focusedHand);
          return focusCommand(finished ? retry : finish);
        }
        focusBoardCell(gridStep(index, dir));
        return true;
      }
      if (commands.contains(focused)) {
        const list = usableActions();
        const currentIndex = focused instanceof HTMLButtonElement ? list.indexOf(focused) : -1;
        if (dir === 'left' || dir === 'right') {
          if (!list.length) return false;
          const next = currentIndex < 0 ? 0 : Math.max(0, Math.min(list.length - 1, currentIndex + (dir === 'left' ? -1 : 1)));
          list[next]?.focus({preventScroll: true});
          return true;
        }
        if (dir === 'up') {
          if (selected !== null) { focusBoardCell(aimed ?? lastBoard ?? (ROWS - 1) * COLS); return true; }
          if (!finished && snapshot.hand.length) return focusHandCard(focusedHand);
          focusBoardCell(lastBoard ?? (ROWS - 1) * COLS);
          return true;
        }
        return false;
      }
      if (dir === 'up') { focusBoardCell(lastBoard ?? (ROWS - 1) * COLS); return true; }
      if (!finished && snapshot.hand.length) return focusHandCard(focusedHand);
      return focusCommand(finished ? retry : finish);
    }
    return false;
  }

  hand.addEventListener('focusin', event => {
    const node = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-hand-index]');
    if (node?.dataset.handIndex !== undefined) {
      focusedHand = Number(node.dataset.handIndex);
      inspectedBoard = null;
      renderInspector();
    }
  });
  board.addEventListener('focusin', event => {
    const node = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-index]');
    if (node?.dataset.index !== undefined) {
      renderInspector();
    }
  });
  board.addEventListener('pointerover', event => {
    if (!attempt || selected === null) return;
    const node = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-index]');
    if (!node?.dataset.index) return;
    const idx = Number(node.dataset.index);
    const legal = attempt.session.moves().filter(move => move.handIndex === selected);
    applyLivePreview(legalTarget(legal, idx));
  });
  board.addEventListener('pointerleave', () => {
    applyLivePreview(pending);
  });
  root.addEventListener(CARNIVAL_ACTION_EVENT, event => {
    const action = (event as CustomEvent<SemanticAction>).detail;
    if (action) handleAction(action);
  });

  return {showList, leave, handleAction};
}
