/* Shinra-8 Cruise Tournament UI: 5-round elimination bracket + Red XIII Overfang bonus exhibition,
   full MatchPresentation animations (Mulligan, turn banners, rival flight, overlays, scoring),
   Hand Focus, Board Peek, Hold-to-PASS, AudioController + PS1 SFX & Legendary Card VFX. */
import type {AudioController, MatchAudioSession} from './audio-controller.js';
import {decideBot} from './bot.js';
import {BotClient} from './bot-client.js';
import {byId, type Card} from './cards.js';
import {createCardView} from './card-view.js';
import {COLS, ROWS, previewEffects, previewInfluence, type Move, type PlacedCard} from './engine.js';
import {displayName} from './i18n/card-names.js';
import {
  deckLabel, difficultyName, tournamentOpponentLabel, tournamentStageLabel,
} from './i18n/game-labels.js';
import {getLocale, t} from './i18n/index.js';
import type {SemanticAction} from './input/input-manager.js';
import {gridStep, legalTarget, smartSnap} from './input/match-cursor.js';
import {batchLegendaryVfx} from './match-effects.js';
import {MatchPresentation, publicMatch} from './match-presentation.js';
import {
  readProgress, recordTournamentRun, writeProgress, type PlayerProgress,
} from './progress.js';
import type {SfxCue} from './sfx.js';
import {
  TOURNAMENT_ROUNDS, TournamentSession, readActiveTournament, writeActiveTournament,
  type TournamentBracketEntry, type TournamentRoundSpec,
} from './tournament-session.js';
import {boardPawns, observeTable, placedCardView} from './ui-board.js';
import {validateDeck, type SavedDeck, type StoragePort} from './ui-data.js';
import {button, element} from './ui-dom.js';
import {PassHold} from './ui-gamepad.js';
import {mountHandFocus} from './ui-hand-focus.js';
import {mountMatchFeedback} from './ui-match-feedback.js';
import type {CardVisual} from './visuals.js';
import '../site/match-presentation.css';
import '../site/tournament.css';

export const TOURNAMENT_ACTION_EVENT = 'qb-tournament-action';

export interface TournamentHooks {
  visual: (id: number) => CardVisual;
  showCard: (id: number) => void;
  deck: () => SavedDeck;
  storage: StoragePort | null;
  editDeck: () => void;
  audio?: {controller: AudioController; visible: () => boolean};
  progress?: {
    get: () => PlayerProgress;
    recordRun: (run: {wins: number; championshipWon: boolean; exhibitionCleared?: boolean}) => void;
  };
}

const nameOf = (id: number) => displayName(id, byId.get(id)!.name);
const cellKey = (row: number, col: number) => `${row}-${col}`;
const scorePair = ([you, opponent]: readonly [number, number]) => `${you} : ${opponent}`;

function laneTable(rows: readonly [number, number][], awards: readonly [number, number][]): HTMLTableElement {
  const table = element('table');
  const header = table.createTHead().insertRow();
  for (const key of ['lane', 'power', 'actualScore'] as const) {
    const col = element('th', '', t(key));
    col.scope = 'col';
    header.append(col);
  }
  const body = table.createTBody();
  for (const [i, row] of rows.entries()) {
    const tr = body.insertRow();
    const lane = element('th', '', t('laneNumber', i + 1));
    lane.scope = 'row';
    tr.append(lane, element('td', '', scorePair(row)), element('td', '', scorePair(awards[i])));
  }
  return table;
}

export function resolveTournamentTheme(spec: TournamentRoundSpec): 'cruise' | 'climax' {
  return spec.stage === 'final' || spec.isExhibition ? 'climax' : 'cruise';
}

export function mountTournament(root: HTMLElement, hooks: TournamentHooks) {
  const lobby = element('section', 'window tourney-lobby');
  lobby.id = 'tourneyLobby';
  const stage = element('section', 'battle-window frame-battle tourney-stage');
  stage.id = 'tourneyStage';
  stage.dataset.background = 'hybrid';
  stage.dataset.tourneyTier = 'cruise';
  stage.hidden = true;

  // Top dual-faction bar (parity with #view-game .match-top).
  const matchTop = element('div', 'match-top');
  const playerSide = element('div', 'frame-side frame-side--player');
  const playerMeta = element('div');
  const playerLabel = element('strong', 'player-label', t('player'));
  const playerCount = element('span');
  playerMeta.append(playerLabel, playerCount);
  const score0 = element('b', '', '0');
  playerSide.append(playerMeta, score0);

  const title = element('h2', 'view-title');
  title.id = 'tourneyWho';
  title.tabIndex = -1;

  const rivalSide = element('div', 'frame-side frame-side--rival');
  const score1 = element('b', '', '0');
  const rivalMeta = element('div');
  const enemyName = element('strong');
  const enemyCount = element('span');
  rivalMeta.append(enemyName, enemyCount);
  rivalSide.append(score1, rivalMeta);
  matchTop.append(playerSide, title, rivalSide);

  // Tournament round & bracket status strip above the board.
  const tourneyHud = element('div', 'tourney-hud');
  tourneyHud.id = 'tourneyHud';

  // Board container (inherits Midgar Mako-Slate obsidian tabletop from frameui-tabletop.css).
  const table = element('div', 'board-layout frame-table tourney-table');
  const scores = [element('div', 'lane-scores'), element('div', 'lane-scores')] as const;
  const board = element('div', 'board');
  board.id = 'tourneyBoard';
  board.setAttribute('role', 'group');
  const mulliganPrompt = element('p', 'frame-mulligan-prompt', t('selectCardsToReplaceThenConfirm'));
  table.append(scores[0], board, scores[1], mulliganPrompt);

  // Ghost aim preview layer.
  const aimLayer = element('div', 'match-aim-layer');
  const ghost = element('div', 'match-player-preview');
  aimLayer.setAttribute('aria-hidden', 'true');
  aimLayer.append(ghost);
  table.append(aimLayer);
  ghost.hidden = true;

  // Board card peek tooltip.
  const peek = element('aside', 'board-peek');
  peek.id = 'tourneyBoardPeek';
  peek.setAttribute('role', 'tooltip');
  peek.hidden = true;

  // Feedback rail.
  const feedbackBar = element('div', 'battle-feedback tourney-feedback');
  const statusLine = element('p');
  statusLine.setAttribute('role', 'status');
  const feedbackLine = element('p');
  feedbackLine.setAttribute('aria-live', 'polite');
  feedbackBar.append(statusLine, feedbackLine);

  // Hand area + Hand Focus detail panel.
  const handArea = element('div', 'hand-area tourney-hand-area');
  const handHeading = element('div', 'hand-heading');
  const handHeadingTitle = element('strong', '', t('hand'));
  const handHelp = element('span');
  handHeading.append(handHeadingTitle, handHelp);
  const hand = element('div', 'battle-hand tourney-hand');
  hand.id = 'tourneyHand';
  hand.setAttribute('role', 'group');
  handArea.append(handHeading, hand);
  const handFocus = mountHandFocus(handArea, hooks.showCard, 'tourneyHandFocus');

  // Action bar with Mulligan confirm, Play confirm, Hold-to-PASS, Advance/Retry/Exhibition controls.
  const commands = element('div', 'battle-actions tourney-actions');
  const confirmMulliganBtn = button('', commitMulligan, 'primary');
  confirmMulliganBtn.id = 'tourneyConfirmMulligan';
  confirmMulliganBtn.hidden = true;
  const confirmPlayBtn = button('', confirmPlay, 'primary');
  confirmPlayBtn.id = 'tourneyConfirmPlay';
  confirmPlayBtn.hidden = true;
  const passBtn = button('', () => passTurn());
  passBtn.id = 'tourneyPass';
  const advanceBtn = button('', advanceToNextRound, 'primary');
  advanceBtn.id = 'tourneyAdvance';
  advanceBtn.hidden = true;
  const exhibitionBtn = button('', enterExhibition, 'primary');
  exhibitionBtn.id = 'tourneyExhibition';
  exhibitionBtn.hidden = true;
  const retryRoundBtn = button('', retryCurrentRound, 'primary');
  retryRoundBtn.id = 'tourneyRetry';
  retryRoundBtn.hidden = true;
  const concedeBtn = button('', concedeRun, 'danger');
  concedeBtn.id = 'tourneyConcede';
  concedeBtn.hidden = true;
  const skipBtn = button('', () => presentation.skip());
  skipBtn.id = 'tourneySkip';
  skipBtn.hidden = true;
  const detailsBtn = button('', () => {
    const id = activeCardId();
    if (id !== undefined) hooks.showCard(id);
  });
  detailsBtn.id = 'tourneyDetails';
  const backBtn = button('', () => { playSfx('cancel'); showLobby(); });
  backBtn.id = 'tourneyBack';
  const speedLabel = element('label', 'presentation-tools tourney-fast-toggle');
  const fastCheck = element('input');
  fastCheck.type = 'checkbox';
  fastCheck.id = 'tourneyFast';
  fastCheck.onchange = () => presentation.setFast(fastCheck.checked);
  const fastText = element('span', '', t('fastAnimationsThisSession'));
  speedLabel.append(fastCheck, fastText);
  commands.append(
    confirmMulliganBtn, confirmPlayBtn, passBtn,
    advanceBtn, exhibitionBtn, retryRoundBtn, concedeBtn,
    skipBtn, detailsBtn, backBtn, speedLabel,
  );

  const hints = element('p', 'gamepad-hints tourney-gamepad-hints');
  hints.id = 'tournamentHints';
  hints.hidden = true;
  const result = element('div', 'match-result tourney-result');
  result.id = 'tourneyResult';
  result.setAttribute('aria-live', 'polite');

  stage.append(matchTop, tourneyHud, table, peek, feedbackBar, handArea, commands, hints, result);
  root.append(lobby, stage);
  observeTable(table);

  const effects = mountMatchFeedback(table, board, {feedback: feedbackBar, hand});
  const botClient = new BotClient();
  const passHold = new PassHold();
  let passPointerId: number | null = null;
  let passFrame: number | null = null;

  let session: TournamentSession | null = null;
  let audioSession: MatchAudioSession | undefined;
  let lastSfxEffect: unknown = null;
  let vfxTimer: ReturnType<typeof setTimeout> | null = null;
  let recordedChampionship = false;
  let recordedFinalOutcome = false;
  const selectedMulligan = new Set<number>();
  let selected: number | null = null;
  let pending: Move | null = null;
  let aimed: number | null = null;
  let lastBoard: number | null = null;
  let focusedHand = 0;
  let ghostCard: Card | undefined;
  let ghostLocale = getLocale();

  function playSfx(cue: SfxCue, options?: {skipIfVictoryTrack?: boolean}) {
    try { hooks.audio?.controller.playSfx?.(cue, options); }
    catch { /* Audio is optional. */ }
  }

  function currentProgress(): PlayerProgress {
    return hooks.progress ? hooks.progress.get() : readProgress(hooks.storage).data;
  }

  function saveTournamentRunProgress(run: {wins: number; championshipWon: boolean; exhibitionCleared?: boolean}) {
    if (hooks.progress) {
      hooks.progress.recordRun(run);
    } else {
      const read = readProgress(hooks.storage);
      writeProgress(hooks.storage, recordTournamentRun(read.data, run), read.corrupted ? read.raw : null);
    }
  }

  function syncProgressOnSettlement() {
    if (!session) return;
    const snap = session.snapshot();
    if (snap.championshipWon && !recordedChampionship) {
      recordedChampionship = true;
      saveTournamentRunProgress({wins: snap.wins, championshipWon: true, exhibitionCleared: snap.exhibitionCleared});
    }
    if (snap.status === 'exhibition-cleared' && !recordedFinalOutcome) {
      recordedFinalOutcome = true;
      saveTournamentRunProgress({wins: snap.wins, championshipWon: !recordedChampionship, exhibitionCleared: true});
      recordedChampionship = true;
    } else if (snap.status === 'eliminated' && !recordedFinalOutcome) {
      recordedFinalOutcome = true;
      saveTournamentRunProgress({wins: snap.wins, championshipWon: false, exhibitionCleared: false});
    }
  }

  function persistTournament() {
    if (!session) return;
    const snap = session.snapshot();
    const keepSave = snap.status === 'in-progress' || snap.canStartExhibition;
    writeActiveTournament(hooks.storage, keepSave ? session.serialize() : null);
  }

  function audioIdFor(s: TournamentSession): string {
    const snap = s.snapshot();
    return `tournament-${snap.seed}-r${snap.currentRound}-a${snap.attempt}`;
  }

  function resumeAudio() {
    if (!session || !hooks.audio?.visible()) return;
    const spec = session.roundSpec();
    const trackHint = spec.stage === 'final' || spec.isExhibition ? 'bossLoop' : 'challengeLoop';
    try {
      audioSession = hooks.audio.controller.startOrResumeMatch(audioIdFor(session), session.game.phase, 'live', trackHint);
    } catch { /* Audio is optional. */ }
  }

  function pauseAudio(immediate = false) {
    const activeAudio = audioSession;
    audioSession = undefined;
    if (!hooks.audio || (!activeAudio && !immediate)) return;
    try { hooks.audio.controller.pauseOrExitMatch(activeAudio, immediate); }
    catch { /* Audio is optional. */ }
  }

  function triggerLegendaryVfx(kind: 'mako' | 'abyss' | 'chain', row?: number, col?: number) {
    const reduced = document.documentElement?.dataset?.reduceMotion === 'true'
      || Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
    if (reduced) return;
    if (vfxTimer !== null) clearTimeout(vfxTimer);
    table.dataset.vfx = kind;
    board.querySelectorAll('.vfx-legendary-burst').forEach(node => node.classList.remove('vfx-legendary-burst'));
    if (row !== undefined && col !== undefined) {
      const tile = board.querySelector<HTMLElement>(`[data-cell="${row}-${col}"]`);
      if (tile) {
        tile.dataset.vfxKind = kind;
        tile.classList.add('vfx-legendary-burst');
      }
    }
    vfxTimer = setTimeout(() => {
      vfxTimer = null;
      delete table.dataset.vfx;
      board.querySelectorAll('.vfx-legendary-burst').forEach(node => node.classList.remove('vfx-legendary-burst'));
    }, 280);
  }

  const presentation = new MatchPresentation({
    game: () => session?.game ?? null,
    choose: () => {
      if (!session) return Promise.resolve(null);
      const view = session.botView(), opts = session.botOptions();
      if (typeof Worker === 'function') return botClient.choose(view, opts);
      return Promise.resolve(decideBot(view, opts));
    },
    cancelBot: () => botClient.cancel(),
    passPlayer: () => { session?.pass(); },
    playOpponent: (_g, hi, r, c) => { session?.applyBotAction({type: 'play', player: 1, handIndex: hi, row: r, col: c}); },
    passOpponent: () => { session?.applyBotAction({type: 'pass', player: 1}); },
    checkpoint: () => { persistTournament(); return null; },
    completed: () => { persistTournament(); syncProgressOnSettlement(); return null; },
    changed: () => {
      const eff = presentation.effect;
      if (eff && eff !== lastSfxEffect) {
        lastSfxEffect = eff;
        if (eff.stage === 'commit' && eff.actor === 1 && eff.action === 'play') playSfx('cardPlace');
        else if (eff.stage === 'events' && eff.events.length) {
          try { hooks.audio?.controller.playSfxForEvents?.(eff.events); } catch { /* Audio is optional. */ }
          const vfx = batchLegendaryVfx(eff.events, eff.placement);
          if (vfx) triggerLegendaryVfx(vfx.kind, vfx.row, vfx.col);
        } else if (eff.stage === 'scoring' && eff.scoring && !eff.scoring.totals) playSfx('scoreTick');
      } else if (!eff) {
        lastSfxEffect = null;
      }
      renderStage();
    },
    result: () => {
      syncProgressOnSettlement();
      persistTournament();
      renderStage();
      const snap = session?.snapshot();
      if (snap?.canAdvance) advanceBtn.focus({preventScroll: true});
      else if (snap?.canStartExhibition) exhibitionBtn.focus({preventScroll: true});
      else if (snap?.canRetry) retryRoundBtn.focus({preventScroll: true});
      else backBtn.focus({preventScroll: true});
    },
    paused: () => pauseAudio(),
    matchEnded: (sequence, winner) => {
      if (audioSession && hooks.audio?.visible()) hooks.audio.controller.enterScoring(audioSession, sequence, winner);
    },
    totalsRevealed: sequence => {
      if (audioSession && hooks.audio?.visible()) hooks.audio.controller.revealResult(audioSession, sequence);
      if (session?.snapshot().roundWon) playSfx('fanfareLite', {skipIfVictoryTrack: true});
    },
  }, () => document.documentElement?.dataset?.reduceMotion === 'true' || Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches));

  // Long-press PASS pointer mechanics (with keyboard click fallback).
  function clearPassHold() {
    passPointerId = null;
    passHold.cancel();
    passBtn.style?.setProperty?.('--pass-progress', '0');
    if (passFrame !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(passFrame);
      passFrame = null;
    }
  }
  function tickPassHold() {
    if (passPointerId === null || !presentation.canPlay) { clearPassHold(); return; }
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const p = passHold.progress(-3, now, presentation.canPlay);
    passBtn.style?.setProperty?.('--pass-progress', String(p === 1 ? 0 : p));
    if (p === 1) {
      clearPassHold();
      passTurn();
      return;
    }
    if (typeof requestAnimationFrame === 'function') passFrame = requestAnimationFrame(tickPassHold);
  }
  passBtn.addEventListener?.('pointerdown', (ev: Event) => {
    const e = ev as PointerEvent;
    if (!e.isPrimary || e.button !== 0 || passBtn.disabled || !presentation.canPlay) return;
    e.preventDefault();
    passPointerId = e.pointerId;
    try { passBtn.setPointerCapture?.(e.pointerId); } catch {}
    passHold.begin(-3, typeof performance !== 'undefined' ? performance.now() : Date.now());
    tickPassHold();
  });
  for (const evName of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
    passBtn.addEventListener?.(evName, (ev: Event) => {
      const e = ev as PointerEvent;
      if (passPointerId !== e.pointerId) return;
      clearPassHold();
    });
  }
  passBtn.addEventListener?.('click', (ev: Event) => {
    const me = ev as MouseEvent;
    if (me.detail > 0) ev.stopImmediatePropagation();
  }, {capture: true});

  function clearSelection() {
    selected = null;
    pending = null;
    aimed = null;
  }

  function playerMoves(): Move[] {
    if (!session || !presentation.canPlay) return [];
    return session.moves();
  }

  function activeCardId(): number | undefined {
    if (!session) return undefined;
    const view = presentation.frame ?? publicMatch(session.game);
    const active = document.activeElement as HTMLElement | null;
    if (board.contains(active) && active?.dataset.index !== undefined) {
      const index = Number(active.dataset.index);
      const tile = view.board[Math.floor(index / COLS)]?.[index % COLS];
      if (tile?.card) return tile.card.id;
    }
    if (hand.contains(active) && active?.dataset.handIndex !== undefined) {
      return view.hand[Number(active.dataset.handIndex)];
    }
    if (selected !== null && view.hand[selected] !== undefined) return view.hand[selected];
    if (aimed !== null) {
      const tile = view.board[Math.floor(aimed / COLS)]?.[aimed % COLS];
      if (tile?.card) return tile.card.id;
    }
    return view.hand[focusedHand];
  }

  function updatePeek(placed: PlacedCard | null) {
    peek.hidden = !placed;
    if (placed) {
      const card = byId.get(placed.id)!;
      peek.replaceChildren(
        element('p', 'peek-power', t('currentAndBasePower', placed.power, card.power)),
        createCardView(card, hooks.visual(placed.id)),
      );
    }
  }

  function updateGhostPreview(card: Card | undefined, index: number | null, valid: boolean) {
    ghost.hidden = !card || index === null;
    if (!card || index === null) {
      ghost.replaceChildren();
      ghostCard = undefined;
      return;
    }
    if (card !== ghostCard || ghostLocale !== getLocale()) {
      ghost.replaceChildren(createCardView(card, hooks.visual(card.id), {variant: 'board'}));
      ghostCard = card;
      ghostLocale = getLocale();
    }
    ghost.style.setProperty('--effect-row', String(Math.floor(index / COLS)));
    ghost.style.setProperty('--effect-col', String(index % COLS));
    ghost.toggleAttribute('data-invalid', !valid);
  }

  function renderBracketNode(entry: TournamentBracketEntry, exhibitionHistoricallyCleared: boolean): HTMLElement {
    const spec = TOURNAMENT_ROUNDS[entry.round - 1];
    const node = element('li', `tourney-node${entry.isExhibition ? ' tourney-node--exhibition' : ''}`);
    node.dataset.round = String(entry.round);
    node.dataset.stage = entry.stage;
    const effectiveStatus = entry.isExhibition && entry.status === 'locked' && exhibitionHistoricallyCleared
      ? 'unlocked'
      : entry.status;
    node.dataset.status = effectiveStatus;

    const head = element('div', 'tourney-node-head');
    head.append(
      element('span', 'tourney-stage-pill', tournamentStageLabel(entry.stage)),
      element('span', 'tourney-diff-pill', difficultyName(spec.difficulty)),
    );
    const opponent = element('strong', 'tourney-node-name', tournamentOpponentLabel(entry.opponentId, entry.opponentName));
    const metaText = entry.playerScore !== undefined && entry.opponentScore !== undefined
      ? `${entry.playerScore} : ${entry.opponentScore}`
      : entry.status === 'locked'
        ? (exhibitionHistoricallyCleared ? `★ ${t('tournamentExhibitionBadge')}` : t('tournamentLocked'))
        : entry.status === 'active'
          ? t('yourTurn')
          : '';
    const meta = element('span', 'tourney-node-meta', metaText);
    node.append(head, opponent, meta);
    return node;
  }

  function renderLobby() {
    const progress = currentProgress();
    const tProg = progress.tournament;
    const saved = readActiveTournament(hooks.storage);
    const savedSnap = saved.session?.snapshot() ?? null;

    const heading = element('h2', 'view-title', t('tournamentTitle'));
    heading.tabIndex = -1;
    const header = element('div', 'frame-library-heading tourney-lobby-head');
    header.append(heading, element('p', 'muted', t('tournamentIntro')));
    if (tProg.championships > 0 || tProg.exhibitionCleared) {
      const honor = element('div', 'honor-badge-row');
      if (tProg.championships > 0) {
        honor.append(element('span', 'honor-badge honor-badge--cleared', `★ ${t('tournamentChampionshipCount', tProg.championships)}`));
      }
      if (tProg.exhibitionCleared) {
        honor.append(element('span', 'honor-badge tourney-exhibition-badge', `★ ${t('tournamentExhibitionBadge')}`));
      }
      header.append(honor);
    }

    const blocks: HTMLElement[] = [header];

    // Active saved tournament resume banner.
    if (saved.session && savedSnap) {
      const resumeBox = element('div', 'tourney-resume');
      const resumeInfo = element('div');
      const opponent = tournamentOpponentLabel(savedSnap.roundSpec.opponentId, savedSnap.roundSpec.opponentName);
      resumeInfo.append(
        element('strong', '', `${t('tournamentContinue')} · ${tournamentStageLabel(savedSnap.roundSpec.stage)} — ${opponent}`),
        element('p', 'muted', t('tournamentRoundMeta', savedSnap.currentRound, savedSnap.mainRounds, savedSnap.retriesRemaining)),
      );
      const resumeActions = element('div', 'button-row');
      const resumeBtn = button(t('tournamentContinue'), () => {
        playSfx('confirm');
        openSession(saved.session!);
      }, 'primary');
      resumeBtn.id = 'tourneyResume';
      const abandonBtn = button(t('tournamentAbandon'), () => {
        playSfx('cancel');
        writeActiveTournament(hooks.storage, null);
        renderLobby();
      });
      abandonBtn.id = 'tourneyAbandon';
      resumeActions.append(resumeBtn, abandonBtn);
      resumeBox.append(resumeInfo, resumeActions);
      blocks.push(resumeBox);
    }

    // Selected deck bar + Enter Tournament CTA.
    const deck = hooks.deck();
    const deckError = validateDeck(deck.cards);
    const deckBar = element('div', 'tourney-deck-bar');
    const deckInfo = element('div');
    deckInfo.append(
      element('strong', '', `${t('startingDeck')} · ${deckLabel(deck)}`),
      element('p', deckError ? 'warning' : 'muted', deckError ?? t('deckCardCount', deck.cards.length)),
    );
    const deckActions = element('div', 'button-row');
    const editDeckBtn = button(t('chooseOrEditDeck'), () => { playSfx('confirm'); hooks.editDeck(); });
    editDeckBtn.id = 'tourneyEditDeck';
    const startBtn = button(t('tournamentStart'), () => { playSfx('confirm'); startNewTournament(); }, 'primary');
    startBtn.id = 'tourneyStart';
    startBtn.disabled = Boolean(deckError);
    deckActions.append(editDeckBtn, startBtn);
    deckBar.append(deckInfo, deckActions);
    blocks.push(deckBar);

    // 5-round Single-Elimination Visual Bracket Tree + Bonus Exhibition Seat.
    const bracketTitle = element('h3', 'tourney-section-title', t('tournamentBracket'));
    const bracketEntries: readonly TournamentBracketEntry[] = savedSnap
      ? savedSnap.bracket
      : TOURNAMENT_ROUNDS.map(r => ({
        round: r.round,
        stage: r.stage,
        isExhibition: r.isExhibition,
        opponentId: r.opponentId,
        opponentName: r.opponentName,
        status: r.isExhibition ? 'locked' : r.round === 1 ? 'active' : 'pending',
      }));

    const mainBracket = element('ol', 'tourney-bracket');
    const mainEntries = bracketEntries.filter(e => !e.isExhibition);
    for (const [i, entry] of mainEntries.entries()) {
      mainBracket.append(renderBracketNode(entry, tProg.exhibitionCleared));
      if (i < mainEntries.length - 1) {
        const connector = element('li', 'tourney-connector');
        connector.setAttribute('aria-hidden', 'true');
        connector.dataset.lit = String(entry.status === 'won');
        mainBracket.append(connector);
      }
    }

    const exhibitionEntry = bracketEntries.find(e => e.isExhibition);
    const bracketWrap = element('div', 'tourney-bracket-wrap');
    bracketWrap.append(mainBracket);
    if (exhibitionEntry) {
      const bonusSection = element('div', 'tourney-exhibition-slot');
      const bonusList = element('ul', 'tourney-exhibition-list');
      bonusList.append(renderBracketNode(exhibitionEntry, tProg.exhibitionCleared));
      bonusSection.append(bonusList);
      bracketWrap.append(bonusSection);
    }

    blocks.push(bracketTitle, bracketWrap);
    lobby.replaceChildren(...blocks);
  }

  function showLobby() {
    leave();
    renderLobby();
    lobby.hidden = false;
    (lobby.querySelector<HTMLElement>('#tourneyResume, #tourneyStart') ?? lobby.querySelector<HTMLElement>('h2'))?.focus({preventScroll: true});
  }

  function startNewTournament() {
    const deck = hooks.deck();
    if (validateDeck(deck.cards)) return;
    const fresh = TournamentSession.start(deck.cards, Date.now() >>> 0);
    recordedChampionship = false;
    recordedFinalOutcome = false;
    openSession(fresh);
  }

  function openSession(next: TournamentSession) {
    session = next;
    const snap = next.snapshot();
    recordedChampionship = snap.championshipWon;
    recordedFinalOutcome = snap.status === 'exhibition-cleared' || snap.status === 'eliminated';
    persistTournament();
    openStage();
  }

  function openStage() {
    if (!session) return;
    clearPassHold();
    presentation.reset();
    lastSfxEffect = null;
    selectedMulligan.clear();
    clearSelection();
    lastBoard = null;
    focusedHand = 0;
    const spec = session.roundSpec();
    stage.dataset.tourneyTier = resolveTournamentTheme(spec);
    stage.dataset.background = 'hybrid';
    lobby.hidden = true;
    stage.hidden = false;
    resumeAudio();
    presentation.resume();
    renderStage();
    (hand.querySelector<HTMLElement>('button:not(:disabled)') ?? title).focus({preventScroll: true});
  }

  function leave() {
    clearPassHold();
    if (vfxTimer !== null) { clearTimeout(vfxTimer); vfxTimer = null; }
    delete table.dataset.vfx;
    presentation.pause();
    pauseAudio();
    session = null;
    selectedMulligan.clear();
    clearSelection();
    lastBoard = null;
    focusedHand = 0;
    stage.hidden = true;
    peek.hidden = true;
    ghost.hidden = true;
    delete stage.dataset.tournamentPhase;
    delete stage.dataset.tourneySelected;
    delete stage.dataset.tourneyPending;
    delete stage.dataset.presentationPhase;
    board.replaceChildren();
    hand.replaceChildren();
    result.replaceChildren();
  }

  function renderStage(nextFocus?: string) {
    if (!session) return;
    const snap = session.snapshot();
    const spec = snap.roundSpec;
    const game = session.game;
    const view = presentation.frame ?? publicMatch(game);
    const opening = presentation.canMulligan;
    const locked = !presentation.canPlay && !opening;
    if (!presentation.canPlay) {
      selected = null;
      pending = null;
      aimed = null;
    }
    const scoring = presentation.effect?.scoring;
    const visibleScores = scoring && !scoring.totals
      ? scoring.result.awards.slice(0, scoring.revealed).reduce<[number, number]>(([a, b], [x, y]) => [a + x, b + y], [0, 0])
      : view.result.scores;
    const finished = presentation.phase === 'Result';
    const moves = playerMoves();
    const active = document.activeElement as HTMLElement | null;
    const focus = nextFocus ?? (root.contains(active) ? active?.dataset.tourneyFocus : undefined);
    const available = new Map(moves.filter(m => m.handIndex === selected).map(m => [cellKey(m.row, m.col), m]));
    const picked = selected === null ? undefined : byId.get(view.hand[selected]);
    const previewPos = pending ?? (picked && aimed !== null ? {row: Math.floor(aimed / COLS), col: aimed % COLS} : null);
    const previewIndex = previewPos ? previewPos.row * COLS + previewPos.col : null;
    const pawn = new Set(picked && previewPos ? previewInfluence(picked, previewPos.row, previewPos.col, 0).map(([r, c]) => cellKey(r, c)) : []);
    const effect = new Set(picked && previewPos ? previewEffects(picked, previewPos.row, previewPos.col, 0).map(([r, c]) => cellKey(r, c)) : []);
    const blockedAim = Boolean(picked && aimed !== null && !pending);

    stage.dataset.tourneyTier = resolveTournamentTheme(spec);
    stage.dataset.presentationPhase = presentation.phase;
    stage.dataset.turn = String(presentation.effect?.actor ?? view.turn);
    stage.dataset.tournamentPhase = finished ? 'finished' : opening ? 'mulligan' : 'playing';
    stage.dataset.tourneySelected = selected === null ? '' : String(selected);
    stage.dataset.tourneyPending = pending ? String(pending.row * COLS + pending.col) : '';

    const phaseLabels: Record<string, string> = {
      Suspended: t('paused'), Mulligan: t('mulligan'), PlayerSelect: t('yourTurn'), Preview: t('placementPreview'),
      PlayerCommit: t('confirmPlay'), PlayerResolve: t('resolvingYourMove'), OpponentTurn: t('computersTurn'),
      OpponentCommit: t('computerIsPlaying'), OpponentResolve: t('resolvingComputersMove'),
      MatchEnd: t('finalScoring'), Result: t('matchOver'),
    };
    title.textContent = phaseLabels[presentation.phase] ?? tournamentStageLabel(spec.stage);
    playerLabel.textContent = t('player');
    playerCount.textContent = t('handAndDeckCounts', view.hand.length, view.deckCounts[0]);
    enemyName.textContent = tournamentOpponentLabel(spec.opponentId, spec.opponentName);
    enemyCount.textContent = `${difficultyName(spec.difficulty)} · ${t('handAndDeckCounts', view.enemyHandCount, view.deckCounts[1])}`;
    score0.textContent = String(visibleScores[0]);
    score1.textContent = String(visibleScores[1]);

    // Tournament HUD strip with mini progression pips.
    const pips = element('span', 'tourney-pips');
    for (const entry of snap.bracket) {
      const pip = element('i', 'tourney-pip');
      pip.dataset.status = entry.status;
      pip.dataset.exhibition = String(entry.isExhibition);
      pip.title = `${tournamentStageLabel(entry.stage)} · ${tournamentOpponentLabel(entry.opponentId, entry.opponentName)}`;
      pips.append(pip);
    }
    const stagePill = element('strong', 'tourney-hud-stage', `${tournamentStageLabel(spec.stage)} · ${tournamentOpponentLabel(spec.opponentId, spec.opponentName)}`);
    const metaPill = element('span', '', t('tournamentRoundMeta', Math.min(snap.currentRound, snap.mainRounds), snap.mainRounds, snap.retriesRemaining));
    tourneyHud.replaceChildren(stagePill, metaPill, pips);

    mulliganPrompt.textContent = t('selectCardsToReplaceThenConfirm');
    handHeadingTitle.textContent = t('hand');
    handHelp.textContent = opening
      ? t('selectCardsToReplaceThenConfirm')
      : presentation.busy
        ? t('resolvingTheMove2')
        : picked
          ? t('legalPlacementCount', displayName(picked.id, picked.name), available.size)
          : t('selectCardSelectTileConfirm');

    statusLine.textContent = presentation.busy
      ? t('presentationLocked', phaseLabels[presentation.phase] ?? '')
      : opening
        ? t('mulliganHint')
        : finished
          ? t('matchOver')
          : !moves.length
            ? t('noLegalPlaysYouCanPass')
            : pending
              ? t('pendingPatternHint')
              : view.passes
                ? t('theComputerPassedPassingEndsTheMatch')
                : t('legalPlacementHint');
    feedbackLine.textContent = presentation.message || (blockedAim ? t('inputPlacementBlocked') : '');

    // Lane scores.
    for (const side of [0, 1] as const) {
      scores[side].replaceChildren(...view.result.rows.map((pair, row) => {
        const lane = element('div', `lane-score${pair[side] > pair[1 - side] ? ' winning' : ''}`, String(pair[side]));
        if (side === 0) lane.prepend(element('span', 'tourney-lane', ['A', 'B', 'C'][row]));
        return lane;
      }));
    }

    // 3x5 Board.
    const activeCell = aimed ?? lastBoard ?? 0;
    const batch = presentation.batch;
    board.replaceChildren(...view.board.flatMap((line, row) => line.map((tile, col) => {
      const index = row * COLS + col;
      const key = cellKey(row, col);
      const move = available.get(key);
      const isPending = pending?.row === row && pending.col === col;
      const isBlocked = aimed === index && selected !== null && !move;
      const occupation = tile.card ? `occupied owner-${tile.card.owner}` : tile.owner === null ? '' : `pawn-${tile.owner}`;
      const classes = [
        'tile', occupation,
        move ? 'legal' : '',
        isPending ? 'pending' : '',
        isBlocked ? 'blocked-target' : '',
        pawn.has(key) ? 'preview-pawn' : '',
        effect.has(key) ? 'preview-effect' : '',
      ].filter(Boolean).join(' ');
      const node = button('', () => {
        if (!presentation.canPlay) return;
        aimed = index;
        lastBoard = index;
        if (move) {
          playSfx('cursor');
          pending = move;
          presentation.preview(true);
          renderStage('cell-' + key);
        } else if (tile.card) {
          playSfx('confirm');
          hooks.showCard(tile.card.id);
        } else if (selected !== null) {
          playSfx('cancel');
          pending = null;
          presentation.preview(false);
          renderStage('cell-' + key);
        }
      }, classes);
      node.disabled = locked || opening;
      node.tabIndex = index === activeCell ? 0 : -1;
      node.dataset.cell = key;
      node.dataset.index = String(index);
      node.dataset.tourneyFocus = 'cell-' + key;
      node.dataset.legal = String(Boolean(move));
      if (tile.card) node.dataset.cardId = String(tile.card.id);
      if (move) node.setAttribute('aria-pressed', String(isPending));
      node.onmouseenter = () => {
        if (presentation.canPlay && selected === null && tile.card) updatePeek(tile.card);
      };
      node.onmouseleave = () => updatePeek(null);
      if (tile.card) {
        node.append(placedCardView(tile.card, hooks.visual(tile.card.id)));
        if (batch && view === batch.after && presentation.effect?.motion &&
          batch.before.board[row][col].card?.instanceId !== tile.card.instanceId) {
          node.classList.add('match-card-arrival');
        }
      } else {
        node.append(boardPawns(tile.owner, tile.pawns));
      }
      if (pawn.has(key) || effect.has(key)) {
        const range = element('span', 'range-overlay');
        range.setAttribute('aria-hidden', 'true');
        node.append(range);
      }
      return node;
    })));

    // Player Hand (Mulligan selection OR normal play selection).
    if (view.hand.length) focusedHand = Math.max(0, Math.min(focusedHand, view.hand.length - 1));
    else focusedHand = 0;
    const activeHand = selected ?? focusedHand;
    hand.replaceChildren(...view.hand.map((id, index) => {
      const isMarkedMulligan = opening && selectedMulligan.has(index);
      const isSelected = !opening && selected === index;
      const node = button('', () => {
        if (locked) return;
        focusedHand = index;
        if (opening) {
          if (selectedMulligan.has(index)) { selectedMulligan.delete(index); playSfx('cancel'); }
          else { selectedMulligan.add(index); playSfx('cardLift'); }
          renderStage('hand-' + index);
          return;
        }
        if (selected === index) {
          clearSelection();
          playSfx('cancel');
          presentation.preview(false);
          renderStage('hand-' + index);
        } else {
          selected = index;
          pending = null;
          aimed = null;
          playSfx('cardLift');
          presentation.preview(false);
          renderStage('hand-' + index);
        }
      }, 'hand-card' + (isSelected || isMarkedMulligan ? ' selected' : '') + (index === focusedHand ? ' browsing' : ''));
      node.dataset.handIndex = String(index);
      node.dataset.cardId = String(id);
      node.dataset.tourneyFocus = 'hand-' + index;
      node.tabIndex = index === activeHand ? 0 : -1;
      node.setAttribute('aria-pressed', String(isSelected || isMarkedMulligan));
      node.disabled = locked;
      const face = createCardView(byId.get(id)!, hooks.visual(id), {variant: 'hand'});
      node.setAttribute('aria-label', face.getAttribute('aria-label') ?? nameOf(id));
      node.append(face);
      if (isMarkedMulligan) node.append(element('span', 'check', t('replace')));
      return node;
    }));
    hand.hidden = !view.hand.length;

    // Feedback overlays, rival flight face, ghost preview, hand focus & peek.
    effects.update(presentation.effect);
    const rivalFlight = table.querySelector<HTMLElement>('.match-rival-flight:not(:has(.qb-card))');
    const revealed = byId.get(presentation.effect?.placement?.cardId ?? -1);
    if (rivalFlight && revealed) rivalFlight.append(createCardView(revealed, hooks.visual(revealed.id), {variant: 'board'}));

    updateGhostPreview(picked, previewIndex, Boolean(pending));
    const browsingCard = view.hand[focusedHand] !== undefined ? byId.get(view.hand[focusedHand]) : picked;
    handFocus.update(browsingCard, picked, locked);
    const peeked = !picked && aimed !== null ? view.board[Math.floor(aimed / COLS)]?.[aimed % COLS]?.card ?? null : null;
    updatePeek(peeked);

    // Command bar button states.
    confirmMulliganBtn.textContent = t('confirmMulliganCount', selectedMulligan.size);
    confirmMulliganBtn.hidden = !opening;
    confirmMulliganBtn.disabled = !opening;

    confirmPlayBtn.textContent = t('confirmPlay');
    confirmPlayBtn.disabled = pending === null || !presentation.canPlay;
    confirmPlayBtn.hidden = !presentation.canPlay || !pending;

    passBtn.textContent = t('gamepadHoldPass');
    passBtn.disabled = !presentation.canPlay;
    passBtn.hidden = finished || opening;

    skipBtn.textContent = t('skipAnimation');
    skipBtn.hidden = !presentation.busy;
    skipBtn.disabled = !presentation.skippable;
    fastText.textContent = t('fastAnimationsThisSession');

    advanceBtn.textContent = t('tournamentAdvance');
    advanceBtn.hidden = !(finished && snap.canAdvance);
    advanceBtn.disabled = !(finished && snap.canAdvance);

    exhibitionBtn.textContent = t('tournamentStartExhibition');
    exhibitionBtn.hidden = !(finished && snap.canStartExhibition);
    exhibitionBtn.disabled = !(finished && snap.canStartExhibition);

    retryRoundBtn.textContent = t('tournamentRetryRound', snap.retriesRemaining);
    retryRoundBtn.hidden = !(finished && snap.canRetry);
    retryRoundBtn.disabled = !(finished && snap.canRetry);

    concedeBtn.textContent = t('tournamentConcede');
    concedeBtn.hidden = !(finished && snap.canRetry);
    concedeBtn.disabled = !(finished && snap.canRetry);

    detailsBtn.textContent = t('cardDetails2');
    detailsBtn.disabled = activeCardId() === undefined;
    backBtn.textContent = t('back');

    // Post-round settlement sheet.
    if (finished && snap.roundSettled) {
      const outcomeKey = snap.roundWon ? 'victory' : view.result.winner === null ? 'draw' : 'defeat';
      const heading = element('h3', '', `${t(outcomeKey)} · ${scorePair(view.result.scores)}`);
      heading.tabIndex = -1;
      const children: HTMLElement[] = [heading];
      if (snap.status === 'exhibition-cleared') {
        children.push(element('p', 'tourney-banner tourney-banner--exhibition', `★ ${t('tournamentExhibitionCleared')}`));
      } else if (snap.championshipWon && snap.roundWon) {
        children.push(element('p', 'tourney-banner tourney-banner--champion', `★ ${t('tournamentChampionBanner')}`));
      } else if (snap.status === 'eliminated') {
        children.push(element('p', 'tourney-banner tourney-banner--eliminated', t('tournamentEliminated')));
      }
      children.push(laneTable(view.result.rows, view.result.awards));
      result.replaceChildren(...children);
    } else {
      result.replaceChildren();
    }

    if (focus) root.querySelector<HTMLElement>(`[data-tourney-focus="${focus}"]:not(:disabled)`)?.focus({preventScroll: true});
  }

  function commitMulligan() {
    if (!session || !presentation.canMulligan) return;
    const indices = [...selectedMulligan].sort((a, b) => a - b);
    if (presentation.commitPlayer(() => { session!.mulligan(indices); }, true)) {
      playSfx('confirm');
      selectedMulligan.clear();
      clearSelection();
      renderStage();
    }
  }

  function confirmPlay() {
    if (!session || !pending || !presentation.canPlay) return;
    const move = pending;
    if (presentation.commitPlayer(() => { session!.play(move.handIndex, move.row, move.col); })) {
      playSfx('cardPlace');
      clearSelection();
      renderStage();
    }
  }

  function passTurn() {
    if (!session || !presentation.canPlay) return;
    if (presentation.commitPlayer(() => { session!.pass(); })) {
      playSfx('confirm');
      clearSelection();
      renderStage();
    }
  }

  function advanceToNextRound() {
    if (!session || !session.snapshot().canAdvance) return;
    playSfx('confirm');
    session.advanceRound();
    persistTournament();
    openStage();
  }

  function enterExhibition() {
    if (!session || !session.snapshot().canStartExhibition) return;
    playSfx('confirm');
    session.startExhibition();
    persistTournament();
    openStage();
  }

  function retryCurrentRound() {
    if (!session || !session.snapshot().canRetry) return;
    playSfx('cancel');
    session.retryRound();
    persistTournament();
    openStage();
  }

  function concedeRun() {
    if (!session || !session.snapshot().canRetry) return;
    playSfx('cancel');
    session.concede();
    syncProgressOnSettlement();
    persistTournament();
    renderStage();
  }

  // Keyboard & Gamepad action handler forwarded from match-input.ts.
  function focusBoardCell(index: number) {
    if (!session || !presentation.canPlay) return;
    const clamped = Math.max(0, Math.min(ROWS * COLS - 1, index));
    aimed = clamped;
    lastBoard = clamped;
    const legal = selected === null ? [] : playerMoves().filter(m => m.handIndex === selected);
    pending = selected === null ? null : legalTarget(legal, clamped);
    playSfx('cursor');
    presentation.preview(Boolean(pending));
    renderStage('cell-' + cellKey(Math.floor(clamped / COLS), clamped % COLS));
  }

  function focusHandCard(index: number): boolean {
    if (!session || (!presentation.canPlay && !presentation.canMulligan)) return false;
    const view = presentation.frame ?? publicMatch(session.game);
    if (!view.hand.length) return false;
    const clamped = Math.max(0, Math.min(view.hand.length - 1, index));
    focusedHand = clamped;
    aimed = null;
    if (selected === null) pending = null;
    playSfx('cursor');
    renderStage('hand-' + clamped);
    return true;
  }

  function handleAction(action: SemanticAction) {
    if (!session || stage.hidden) return;
    if (presentation.busy) {
      if (action.type === 'confirm' && presentation.skippable) presentation.skip();
      return;
    }
    const active = document.activeElement as HTMLElement | null;
    const inBoard = board.contains(active);
    const inHand = hand.contains(active);

    if (action.type === 'details') {
      const id = activeCardId();
      if (id !== undefined) hooks.showCard(id);
      return;
    }
    if (action.type === 'cancel') {
      if (selected !== null || pending !== null) {
        const prev = selected ?? focusedHand;
        clearSelection();
        playSfx('cancel');
        presentation.preview(false);
        renderStage('hand-' + prev);
      } else {
        playSfx('cancel');
        showLobby();
      }
      return;
    }
    if (action.type === 'move') {
      if (presentation.canMulligan) {
        const delta = action.direction === 'left' || action.direction === 'up' ? -1 : 1;
        focusHandCard(focusedHand + delta);
        return;
      }
      if (inBoard) {
        const cur = Number(active?.dataset.index ?? aimed ?? 0);
        if (action.direction === 'down' && Math.floor(cur / COLS) === ROWS - 1 && selected === null) {
          focusHandCard(focusedHand);
          return;
        }
        focusBoardCell(gridStep(cur, action.direction));
      } else if (inHand) {
        if (action.direction === 'left') focusHandCard(focusedHand - 1);
        else if (action.direction === 'right') focusHandCard(focusedHand + 1);
        else if (action.direction === 'up') focusBoardCell(lastBoard ?? 0);
      } else if (selected !== null) {
        focusBoardCell(lastBoard ?? 0);
      } else {
        focusHandCard(focusedHand);
      }
      return;
    }
    if (action.type === 'confirm') {
      if (presentation.canMulligan) {
        if (inHand) {
          const idx = Number(active?.dataset.handIndex ?? focusedHand);
          if (selectedMulligan.has(idx)) selectedMulligan.delete(idx);
          else selectedMulligan.add(idx);
          playSfx('cardLift');
          renderStage('hand-' + idx);
        } else {
          commitMulligan();
        }
        return;
      }
      if (inHand) {
        const idx = Number(active?.dataset.handIndex ?? focusedHand);
        selected = idx;
        focusedHand = idx;
        const legal = playerMoves().filter(m => m.handIndex === idx).map(m => m.row * COLS + m.col);
        playSfx('cardLift');
        focusBoardCell(smartSnap(legal, lastBoard));
        return;
      }
      if (inBoard) {
        if (pending) confirmPlay();
        else {
          const id = activeCardId();
          if (id !== undefined) hooks.showCard(id);
        }
        return;
      }
      const snap = session.snapshot();
      if (snap.canAdvance) advanceToNextRound();
      else if (snap.canStartExhibition) enterExhibition();
      else if (snap.canRetry) retryCurrentRound();
    }
  }

  root.addEventListener(TOURNAMENT_ACTION_EVENT, event => {
    handleAction((event as CustomEvent<SemanticAction>).detail);
  });

  function localize() {
    if (stage.hidden) renderLobby();
    else renderStage();
  }

  return {showLobby, leave, localize};
}
