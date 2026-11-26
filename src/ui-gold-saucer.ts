import {decideBot} from './bot.js';
import {BotClient} from './bot-client.js';
import {byId, type Card} from './cards.js';
import {createCardView} from './card-view.js';
import {COLS, ROWS, previewEffects, previewInfluence, type Move, type PlacedCard} from './engine.js';
import {
  goldSaucerChallenges, survivalChallenges,
  type GoldSaucerChallenge, type GoldSaucerChallengeId,
  type SurvivalChallenge, type SurvivalChallengeId, type SurvivalRoundSpec,
} from './gold-saucer-catalog.js';
import {displayName} from './i18n/card-names.js';
import {
  deckLabel, goldSaucerChallengeTitle, goldSaucerOpponentLabel,
  survivalChallengeTitle, survivalRoundOpponentLabel,
} from './i18n/game-labels.js';
import {getLocale, t, type MessageKey} from './i18n/index.js';
import {GOLD_SAUCER_ACTION_EVENT, type SemanticAction} from './input/input-manager.js';
import {gridStep, legalTarget, smartSnap} from './input/match-cursor.js';
import {batchLegendaryVfx} from './match-effects.js';
import {MatchPresentation, publicMatch} from './match-presentation.js';
import {
  GoldSaucerChallengeSession, SurvivalSession,
  readActiveSurvival, writeActiveSurvival,
  type SurvivalRoundRecord, type SurvivalStatus,
} from './survival-session.js';
import type {AudioController, MatchAudioSession} from './audio-controller.js';
import {
  readProgress, recordGoldSaucerWin, recordSurvivalRun, writeProgress,
  type PlayerProgress, type SurvivalRank,
} from './progress.js';
import type {SfxCue} from './sfx.js';
import {boardPawns, observeTable, placedCardView, tileBonusAriaSuffix, tileBonusBadge} from './ui-board.js';
import {validateDeck, type SavedDeck, type StoragePort} from './ui-data.js';
import {button, element} from './ui-dom.js';
import {mountHandFocus} from './ui-hand-focus.js';
import {mountMatchFeedback} from './ui-match-feedback.js';
import type {CardVisual} from './visuals.js';
import '../site/match-presentation.css';
import '../site/gold-saucer.css';

export interface GoldSaucerHooks {
  visual: (id: number) => CardVisual;
  showCard: (id: number) => void;
  deck: () => SavedDeck;
  storage: StoragePort | null;
  editDeck: () => void;
  audio?: {controller: AudioController; visible: () => boolean};
  progress?: {
    get: () => PlayerProgress;
    recordWin: (id: GoldSaucerChallengeId, playerScore: number, opponentScore: number) => void;
    recordSurvival: (id: SurvivalChallengeId, status: SurvivalStatus, cumulativeScore: number, roundsCleared: number) => void;
  };
}

type ExtendedChallenge = GoldSaucerChallenge & {
  readonly battleBackgroundId?: string;
};
type ExtendedRoundSpec = SurvivalRoundSpec & {
  readonly bonusDrawRow?: 0 | 1 | 2;
  readonly bossId?: string;
  readonly battleBackgroundId?: string;
};
type ExtendedRoundRecord = SurvivalRoundRecord & {
  readonly bonusDrawEarned?: boolean;
};

type KnownGoldSaucerId = GoldSaucerChallengeId | 'gs-luxury-real-estate' | 'gs-behind-enemy-lines' | 'gs-chadley-callous';
type KnownSurvivalId = SurvivalChallengeId | 'survival-extreme';

const nameOf = (id: number) => displayName(id, byId.get(id)!.name);
const cellKey = (row: number, col: number) => `${row}-${col}`;
const scorePair = ([you, opponent]: readonly [number, number]) => `${you} : ${opponent}`;

const challengeSummaryKey: Record<KnownGoldSaucerId, MessageKey> = {
  'gs-high-ground': 'gsHighGroundSummary',
  'gs-outflanked': 'gsOutflankedSummary',
  'gs-mais-here': 'gsMaisHereSummary',
  'gs-luxury-real-estate': 'gsLuxuryRealEstateSummary',
  'gs-behind-enemy-lines': 'gsBehindEnemyLinesSummary',
  'gs-chadley-callous': 'gsChadleyCallousSummary',
};

const survivalSummaryKey: Record<KnownSurvivalId, MessageKey> = {
  'survival-boot-camp': 'gsBootCampSummary',
  'survival-extreme': 'gsExtremeSummary',
  'survival-nightmare': 'gsNightmareSummary',
};

export function resolveGoldSaucerBackground(spec?: {
  battleBackgroundId?: string;
  bossId?: string;
  opponentStrategy?: string;
}): string {
  if (!spec) return 'hybrid';
  if (spec.battleBackgroundId) return spec.battleBackgroundId;
  if (spec.bossId === 'shadowblood-queen' || spec.opponentStrategy === 'queen') return 'shadowblood-queen';
  return 'hybrid';
}

const survivalRankKey: Record<Exclude<SurvivalStatus, 'in-progress'>, MessageKey> = {
  'cleared-bronze': 'survivalClearBronze',
  'cleared-silver': 'survivalClearSilver',
  'cleared-gold': 'survivalClearGold',
  failed: 'survivalFailed',
};

const medalLabelKey: Record<SurvivalRank, MessageKey> = {
  bronze: 'medalBronze',
  silver: 'medalSilver',
  gold: 'medalGold',
};

const resultLabels = {won: 'victory', lost: 'defeat', draw: 'draw'} as const;

type ActiveRun =
  | {mode: 'challenge'; session: GoldSaucerChallengeSession; audioId: string}
  | {mode: 'survival'; session: SurvivalSession; audioId: string};

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

export function mountGoldSaucer(root: HTMLElement, hooks: GoldSaucerHooks) {
  const list = element('section', 'window gs-list');
  const stage = element('section', 'battle-window frame-battle gs-stage');
  stage.id = 'gsStage';
  stage.dataset.background = 'hybrid';
  stage.hidden = true;

  // Top match bar (parity with #view-game .match-top).
  const matchTop = element('div', 'match-top');
  const playerSide = element('div', 'frame-side frame-side--player');
  const playerMeta = element('div');
  const playerLabel = element('strong', 'player-label', t('player'));
  const playerCount = element('span');
  playerMeta.append(playerLabel, playerCount);
  const score0 = element('b', '', '0');
  playerSide.append(playerMeta, score0);

  const title = element('h2', 'view-title');
  title.tabIndex = -1;

  const rivalSide = element('div', 'frame-side frame-side--rival');
  const score1 = element('b', '', '0');
  const rivalMeta = element('div');
  const enemyName = element('strong');
  const enemyCount = element('span');
  rivalMeta.append(enemyName, enemyCount);
  rivalSide.append(score1, rivalMeta);
  matchTop.append(playerSide, title, rivalSide);

  const survivalHud = element('div', 'gs-survival-hud');
  survivalHud.id = 'gsSurvivalHud';
  survivalHud.hidden = true;
  const noDrawBanner = element('p', 'gs-no-draw-banner');
  noDrawBanner.id = 'gsNoDrawBanner';
  noDrawBanner.hidden = true;

  const table = element('div', 'board-layout frame-table gs-table');
  const scores = [element('div', 'lane-scores'), element('div', 'lane-scores')] as const;
  const board = element('div', 'board');
  board.id = 'gsBoard';
  board.setAttribute('role', 'group');
  table.append(scores[0], board, scores[1]);

  // Ghost card aim preview layer (parity with ui-match.ts).
  const aimLayer = element('div', 'match-aim-layer');
  const ghost = element('div', 'match-player-preview');
  aimLayer.setAttribute('aria-hidden', 'true');
  aimLayer.append(ghost);
  table.append(aimLayer);
  ghost.hidden = true;

  // Board card peek tooltip (parity with ui-match.ts #boardPeek).
  const peek = element('aside', 'board-peek');
  peek.id = 'gsBoardPeek';
  peek.setAttribute('role', 'tooltip');
  peek.hidden = true;

  // Feedback bar (used by mountMatchFeedback).
  const feedbackBar = element('div', 'battle-feedback gs-battle-feedback');
  const statusLine = element('p');
  statusLine.setAttribute('role', 'status');
  const feedbackLine = element('p');
  feedbackLine.setAttribute('aria-live', 'polite');
  feedbackBar.append(statusLine, feedbackLine);

  // Hand area + Hand Focus detail panel (parity with ui-match.ts).
  const handArea = element('div', 'hand-area gs-hand-area');
  const handHeading = element('div', 'hand-heading');
  const handHeadingTitle = element('strong', '', t('hand'));
  const handHelp = element('span');
  handHeading.append(handHeadingTitle, handHelp);
  const hand = element('div', 'battle-hand gs-hand');
  hand.id = 'gsHand';
  hand.setAttribute('role', 'group');
  handArea.append(handHeading, hand);
  const handFocus = mountHandFocus(handArea, hooks.showCard, 'gsHandFocus');

  // Action bar with Skip Animation & Fast Animation controls.
  const commands = element('div', 'battle-actions gs-actions');
  const confirm = button('', confirmPlay, 'primary');
  confirm.id = 'gsConfirm';
  const passBtn = button('', passTurn);
  passBtn.id = 'gsPass';
  const nextRound = button('', advanceSurvivalRound, 'primary');
  nextRound.id = 'gsNextRound';
  nextRound.hidden = true;
  const skipBtn = button('', () => presentation.skip());
  skipBtn.id = 'gsSkip';
  skipBtn.hidden = true;
  const details = button('', () => {
    const id = activeCardId();
    if (id !== undefined) hooks.showCard(id);
  });
  details.id = 'gsDetails';
  const retry = button('', retryRun);
  retry.id = 'gsRetry';
  const back = button('', () => showList());
  back.id = 'gsBack';
  const speedLabel = element('label', 'presentation-tools gs-fast-toggle');
  const fastCheck = element('input');
  fastCheck.type = 'checkbox';
  fastCheck.id = 'gsFast';
  fastCheck.onchange = () => presentation.setFast(fastCheck.checked);
  const fastText = element('span', '', t('fastAnimationsThisSession'));
  speedLabel.append(fastCheck, fastText);
  commands.append(confirm, passBtn, nextRound, skipBtn, details, retry, back, speedLabel);

  const hints = element('p', 'gamepad-hints gs-gamepad-hints');
  hints.id = 'gsHints';
  hints.hidden = true;
  const result = element('div', 'match-result gs-result');
  result.id = 'gsResult';
  result.setAttribute('aria-live', 'polite');

  stage.append(matchTop, survivalHud, noDrawBanner, table, peek, feedbackBar, handArea, commands, hints, result);
  root.append(list, stage);
  observeTable(table);

  const effects = mountMatchFeedback(table, board, {feedback: feedbackBar, hand});
  const botClient = new BotClient();

  let run: ActiveRun | null = null;
  let audioSession: MatchAudioSession | undefined;
  let lastSfxEffect: unknown = null;
  let vfxTimer: ReturnType<typeof setTimeout> | null = null;
  let recordedRun = false;
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

  function currentProgress(): PlayerProgress {
    return hooks.progress ? hooks.progress.get() : readProgress(hooks.storage).data;
  }

  function recordCompletedRun() {
    if (!run || recordedRun) return;
    if (run.mode === 'challenge') {
      const final = run.session.result();
      if (!final) return;
      recordedRun = true;
      if (final.status === 'won') {
        if (hooks.progress) hooks.progress.recordWin(run.session.challenge.id, final.scores[0], final.scores[1]);
        else {
          const read = readProgress(hooks.storage);
          writeProgress(hooks.storage, recordGoldSaucerWin(read.data, run.session.challenge.id, final.scores[0], final.scores[1]), read.corrupted ? read.raw : null);
        }
      }
      return;
    }
    const snap = run.session.snapshot();
    if (snap.status === 'in-progress') return;
    recordedRun = true;
    if (hooks.progress) {
      hooks.progress.recordSurvival(snap.challengeId, snap.status, snap.cumulativePlayerScore, snap.roundScores.length);
    } else {
      const read = readProgress(hooks.storage);
      writeProgress(hooks.storage, recordSurvivalRun(read.data, snap.challengeId, snap.status, snap.cumulativePlayerScore, snap.roundScores.length), read.corrupted ? read.raw : null);
    }
  }

  function resumeAudio() {
    if (!run || !hooks.audio?.visible()) return;
    try { audioSession = hooks.audio.controller.startOrResumeMatch(run.audioId, run.session.game.phase); }
    catch { /* Audio is optional. */ }
  }

  function pauseAudio(immediate = false) {
    const session = audioSession;
    audioSession = undefined;
    if (!hooks.audio || (!session && !immediate)) return;
    try { hooks.audio.controller.pauseOrExitMatch(session, immediate); }
    catch { /* Audio is optional. */ }
  }

  function persistSurvival() {
    if (run?.mode !== 'survival') return;
    const snap = run.session.snapshot();
    if (snap.status === 'in-progress') writeActiveSurvival(hooks.storage, run.session.serialize());
    else writeActiveSurvival(hooks.storage, null);
  }

  const presentation = new MatchPresentation({
    game: () => run?.session.game ?? null,
    choose: () => {
      if (!run) return Promise.resolve(null);
      const view = run.session.botView(), opts = run.session.botOptions();
      if (typeof Worker === 'function') return botClient.choose(view, opts);
      return Promise.resolve(decideBot(view, opts));
    },
    cancelBot: () => botClient.cancel(),
    passPlayer: () => { run?.session.pass(); },
    playOpponent: (_g, hi, r, c) => { run?.session.applyBotAction({type: 'play', player: 1, handIndex: hi, row: r, col: c}); },
    passOpponent: () => { run?.session.applyBotAction({type: 'pass', player: 1}); },
    checkpoint: () => { persistSurvival(); return null; },
    completed: () => { persistSurvival(); recordCompletedRun(); return null; },
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
      recordCompletedRun();
      renderStage();
      if (run?.mode === 'survival' && run.session.snapshot().canAdvance) nextRound.focus({preventScroll: true});
      else retry.focus({preventScroll: true});
    },
    paused: () => pauseAudio(),
    matchEnded: (sequence, winner) => {
      if (audioSession && hooks.audio?.visible()) hooks.audio.controller.enterScoring(audioSession, sequence, winner);
    },
    totalsRevealed: sequence => {
      if (audioSession && hooks.audio?.visible()) hooks.audio.controller.revealResult(audioSession, sequence);
      if (run?.mode === 'challenge' && run.session.result()?.status === 'won') {
        playSfx('fanfareLite', {skipIfVictoryTrack: true});
      } else if (run?.mode === 'survival') {
        const st = run.session.snapshot().status;
        if (st === 'cleared-bronze' || st === 'cleared-silver' || st === 'cleared-gold') {
          playSfx('fanfareLite', {skipIfVictoryTrack: true});
        }
      }
    },
  }, () => document.documentElement?.dataset?.reduceMotion === 'true' || Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches));

  function clearSelection() {
    selected = null;
    pending = null;
    aimed = null;
  }

  function currentGame() {
    return run?.session.game ?? null;
  }

  function playerMoves(): Move[] {
    if (!run || !presentation.canPlay) return [];
    return run.session.moves();
  }

  function activeCardId(): number | undefined {
    const game = currentGame();
    if (!game) return undefined;
    const view = presentation.frame ?? publicMatch(game);
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

  function rewardBlock(cardId: number): HTMLElement {
    const card = byId.get(cardId);
    const wrap = element('div', 'gs-reward');
    const face = element('div', 'gs-reward-face');
    if (card) face.append(createCardView(card, hooks.visual(card.id), {variant: 'hand', lazy: true}));
    face.setAttribute('aria-hidden', 'true');
    const label = element('div', 'gs-reward-label');
    label.append(element('strong', '', `#${String(cardId).padStart(3, '0')} ${nameOf(cardId)}`));
    wrap.append(face, label);
    return wrap;
  }

  function renderList() {
    const heading = element('h2', 'view-title', t('goldSaucerTab'));
    heading.tabIndex = -1;
    const header = element('div', 'frame-library-heading');
    header.append(heading, element('p', 'muted', t('goldSaucerIntro')));

    const deck = hooks.deck();
    const deckError = validateDeck(deck.cards);
    const deckBar = element('div', 'gs-deck-bar');
    const deckInfo = element('div');
    deckInfo.append(
      element('strong', '', `${t('startingDeck')} · ${deckLabel(deck)}`),
      element('p', deckError ? 'warning' : 'muted', deckError ?? t('deckCardCount', deck.cards.length)),
    );
    const editDeckBtn = button(t('chooseOrEditDeck'), hooks.editDeck);
    editDeckBtn.id = 'gsEditDeck';
    deckBar.append(deckInfo, editDeckBtn);

    const blocks: HTMLElement[] = [header];

    // Active Survival resume banner (if saved in storage).
    const saved = readActiveSurvival(hooks.storage);
    if (saved.session) {
      const snap = saved.session.snapshot();
      const resumeBox = element('div', 'gs-resume');
      const resumeInfo = element('div');
      resumeInfo.append(
        element('strong', '', `${t('survivalContinue')} · ${survivalChallengeTitle(snap.challengeId)}`),
        element('p', 'muted', `${t('survivalRoundProgress', snap.currentRound, snap.totalRounds)} · ${t('survivalCumulativeScore', snap.cumulativePlayerScore)} · ${t('survivalRemainingDeck', snap.remainingPlayerDeck.length)}`),
      );
      const resumeBtn = button(t('survivalContinue'), () => openSurvivalSession(saved.session!), 'primary');
      resumeBtn.id = 'gsResumeSurvival';
      resumeBox.append(resumeInfo, resumeBtn);
      blocks.push(resumeBox);
    }

    blocks.push(deckBar);

    // Special Challenges (single-match challenges).
    const progress = currentProgress();
    const specialHeading = element('h3', 'gs-section-title', t('goldSaucerSpecialChallenges'));
    const specialList = element('ul', 'gs-cards');
    for (const challenge of goldSaucerChallenges) {
      const item = element('li');
      const info = element('div', 'gs-info');
      const summaryKey = (challengeSummaryKey as Record<string, MessageKey | undefined>)[challenge.id];
      const rec = progress.goldSaucer[challenge.id];
      const children: HTMLElement[] = [element('h4', '', goldSaucerChallengeTitle(challenge.id))];
      if (rec && rec.wins > 0) {
        item.dataset.cleared = 'true';
        const row = element('div', 'honor-badge-row');
        row.append(
          element('span', 'honor-badge honor-badge--cleared', `★ ${t('progressCleared')}`),
          element('span', 'honor-meta', `${t('progressWins', rec.wins)} · ${t('progressBestScore', rec.bestScore)}`),
        );
        children.push(row);
      }
      children.push(element('p', '', summaryKey ? t(summaryKey) : challenge.summary));
      info.append(...children);
      const startBtn = button(t('newGame'), () => { playSfx('confirm'); startChallenge(challenge); });
      startBtn.dataset.gsChallenge = challenge.id;
      startBtn.disabled = Boolean(deckError);
      item.append(info, rewardBlock(challenge.rewardCardId), startBtn);
      specialList.append(item);
    }
    blocks.push(specialHeading, specialList);

    // Multi-round Survival Challenges (gauntlets).
    const survivalHeading = element('h3', 'gs-section-title', t('goldSaucerSurvival'));
    const survivalList = element('ul', 'gs-cards');
    for (const survival of survivalChallenges) {
      const item = element('li', 'gs-survival-item');
      const info = element('div', 'gs-info');
      const summaryKey = (survivalSummaryKey as Record<string, MessageKey | undefined>)[survival.id];
      const rec = progress.survival[survival.id];
      const children: HTMLElement[] = [element('h4', '', survivalChallengeTitle(survival.id))];
      if (rec && (rec.bestRank || rec.bestCumulativeScore > 0)) {
        const row = element('div', 'honor-badge-row');
        if (rec.bestRank) {
          item.dataset.cleared = 'true';
          item.dataset.medal = rec.bestRank;
          const medal = element('span', 'survival-medal', `★ ${t(medalLabelKey[rec.bestRank])}`);
          medal.dataset.rank = rec.bestRank;
          row.append(medal);
        }
        row.append(element('span', 'honor-meta', t('progressBestCumulative', rec.bestCumulativeScore)));
        children.push(row);
      }
      children.push(
        element('p', 'gs-targets', t('survivalTargetScores', survival.targets.bronze, survival.targets.silver, survival.targets.gold)),
        element('p', '', summaryKey ? t(summaryKey) : survival.summary),
      );
      info.append(...children);
      const startBtn = button(t('newGame'), () => { playSfx('confirm'); startSurvival(survival); }, 'primary');
      startBtn.dataset.gsSurvival = survival.id;
      startBtn.disabled = Boolean(deckError);
      item.append(info, rewardBlock(survival.rewardCardId), startBtn);
      survivalList.append(item);
    }
    blocks.push(survivalHeading, survivalList);

    list.replaceChildren(...blocks);
  }

  function showList() {
    leave();
    renderList();
    list.hidden = false;
    (list.querySelector<HTMLElement>('#gsResumeSurvival, [data-gs-challenge]') ?? list.querySelector<HTMLElement>('h2'))?.focus({preventScroll: true});
  }

  function startChallenge(challenge: GoldSaucerChallenge) {
    const deck = hooks.deck();
    if (validateDeck(deck.cards)) return;
    run = {
      mode: 'challenge',
      session: new GoldSaucerChallengeSession(challenge, deck.cards, {seed: Date.now() >>> 0}),
      audioId: `gs-${challenge.id}-${Date.now()}`,
    };
    openStage();
  }

  function startSurvival(challenge: SurvivalChallenge) {
    const deck = hooks.deck();
    if (validateDeck(deck.cards)) return;
    const session = SurvivalSession.start(challenge, deck.cards, Date.now() >>> 0);
    openSurvivalSession(session);
  }

  function openSurvivalSession(session: SurvivalSession) {
    run = {mode: 'survival', session, audioId: `survival-${session.challenge.id}-r${session.currentRound}`};
    persistSurvival();
    openStage();
  }

  function currentBackgroundId(): string {
    if (!run) return 'hybrid';
    if (run.mode === 'survival') return resolveGoldSaucerBackground(run.session.snapshot().roundSpec as ExtendedRoundSpec);
    return resolveGoldSaucerBackground(run.session.challenge as ExtendedChallenge);
  }

  function openStage() {
    presentation.reset();
    recordedRun = false;
    lastSfxEffect = null;
    clearSelection();
    lastBoard = null;
    focusedHand = 0;
    stage.dataset.background = currentBackgroundId();
    list.hidden = true;
    stage.hidden = false;
    resumeAudio();
    presentation.resume();
    renderStage();
    (hand.querySelector<HTMLElement>('button:not(:disabled)') ?? (nextRound.hidden ? passBtn : nextRound) ?? title).focus({preventScroll: true});
  }

  function leave() {
    presentation.pause();
    pauseAudio();
    run = null;
    clearSelection();
    lastBoard = null;
    focusedHand = 0;
    stage.hidden = true;
    peek.hidden = true;
    ghost.hidden = true;
    delete stage.dataset.gsPhase;
    delete stage.dataset.gsMode;
    delete stage.dataset.gsSelected;
    delete stage.dataset.gsPending;
    delete stage.dataset.presentationPhase;
    board.replaceChildren();
    hand.replaceChildren();
    result.replaceChildren();
  }

  function renderStage(nextFocus?: string) {
    if (!run) return;
    const game = run.session.game;
    const view = presentation.frame ?? publicMatch(game);
    const locked = !presentation.canPlay;
    if (locked) {
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
    const focus = nextFocus ?? (root.contains(active) ? active?.dataset.gsFocus : undefined);
    const available = new Map(moves.filter(move => move.handIndex === selected).map(move => [cellKey(move.row, move.col), move]));
    const picked = selected === null ? undefined : byId.get(view.hand[selected]);
    const previewPos = pending ?? (picked && aimed !== null ? {row: Math.floor(aimed / COLS), col: aimed % COLS} : null);
    const previewIndex = previewPos ? previewPos.row * COLS + previewPos.col : null;
    const pawn = new Set(picked && previewPos ? previewInfluence(picked, previewPos.row, previewPos.col, 0).map(([r, c]) => cellKey(r, c)) : []);
    const effect = new Set(picked && previewPos ? previewEffects(picked, previewPos.row, previewPos.col, 0).map(([r, c]) => cellKey(r, c)) : []);
    const blockedAim = Boolean(picked && aimed !== null && !pending);

    stage.dataset.background = currentBackgroundId();
    stage.dataset.presentationPhase = presentation.phase;
    stage.dataset.turn = String(presentation.effect?.actor ?? view.turn);
    stage.dataset.gsPhase = finished ? 'finished' : 'playing';
    stage.dataset.gsMode = run.mode;
    stage.dataset.gsSelected = selected === null ? '' : String(selected);
    stage.dataset.gsPending = pending ? String(pending.row * COLS + pending.col) : '';

    const phaseLabels: Record<string, string> = {
      Suspended: t('paused'), Mulligan: t('mulligan'), PlayerSelect: t('yourTurn'), Preview: t('placementPreview'),
      PlayerCommit: t('confirmPlay'), PlayerResolve: t('resolvingYourMove'), OpponentTurn: t('computersTurn'),
      OpponentCommit: t('computerIsPlaying'), OpponentResolve: t('resolvingComputersMove'),
      MatchEnd: t('finalScoring'), Result: t('matchOver'),
    };

    playerLabel.textContent = t('player');
    playerCount.textContent = t('handAndDeckCounts', view.hand.length, view.deckCounts[0]);
    score0.textContent = String(visibleScores[0]);
    score1.textContent = String(visibleScores[1]);
    title.textContent = phaseLabels[presentation.phase] ?? t('yourTurn');

    let bonusDrawRow: 0 | 1 | 2 | undefined;
    if (run.mode === 'survival') {
      const snap = run.session.snapshot();
      const spec = snap.roundSpec as ExtendedRoundSpec;
      bonusDrawRow = spec.bonusDrawRow;
      enemyName.textContent = survivalRoundOpponentLabel(snap.currentRound, spec.opponentStrategy, spec.bossId);
      enemyCount.textContent = t('handAndDeckCounts', view.enemyHandCount, view.deckCounts[1]);
      survivalHud.hidden = false;
      const hudItems: HTMLElement[] = [
        element('strong', '', `${survivalChallengeTitle(snap.challengeId)} · ${t('survivalRoundProgress', snap.currentRound, snap.totalRounds)}`),
        element('span', '', t('survivalCumulativeScore', snap.cumulativePlayerScore)),
        element('span', '', t('survivalTargetScores', snap.targets.bronze, snap.targets.silver, snap.targets.gold)),
        element('span', '', t('survivalRemainingDeck', snap.remainingPlayerDeck.length)),
      ];
      if (bonusDrawRow !== undefined) {
        const bonusHint = element('span', 'gs-bonus-row-hint', t('survivalBonusDrawRowHud', bonusDrawRow + 1));
        bonusHint.dataset.bonusRow = String(bonusDrawRow);
        hudItems.push(bonusHint);
      }
      survivalHud.replaceChildren(...hudItems);
      const noDraw = Boolean(spec.noTurnDraw || game.noTurnDraw);
      noDrawBanner.hidden = !noDraw;
      noDrawBanner.textContent = noDraw ? t('survivalNoDrawNotice') : '';
    } else {
      enemyName.textContent = goldSaucerOpponentLabel(run.session.challenge.id);
      enemyCount.textContent = t('handAndDeckCounts', view.enemyHandCount, view.deckCounts[1]);
      survivalHud.hidden = true;
      const noDraw = Boolean(game.noTurnDraw);
      noDrawBanner.hidden = !noDraw;
      noDrawBanner.textContent = noDraw ? t('survivalNoDrawNotice') : '';
    }

    handHeadingTitle.textContent = t('hand');
    handHelp.textContent = presentation.busy ? t('resolvingTheMove2')
      : picked ? t('legalPlacementCount', nameOf(picked.id), available.size)
      : t('selectCardSelectTileConfirm');
    statusLine.textContent = presentation.busy
      ? t('presentationLocked', phaseLabels[presentation.phase] ?? '')
      : finished ? t('passEnding')
      : !moves.length ? t('noLegalPlaysYouCanPass')
      : blockedAim ? t('inputPlacementBlocked')
      : pending ? t('pendingPatternHint')
      : t('legalPlacementHint');
    feedbackLine.textContent = presentation.message;

    board.setAttribute('aria-label', t('boardWith3RowsAnd5ColumnsUse'));
    hand.setAttribute('aria-label', t('hand'));

    for (const side of [0, 1] as const) {
      scores[side].replaceChildren(...view.result.rows.map((row, r) => {
        const isBonusLane = bonusDrawRow === r;
        const node = element('div', 'lane-score' + (row[side] > row[1 - side] ? ' winning' : '') + (isBonusLane ? ' bonus-draw-lane' : ''));
        if (side === 0) node.append(element('small', 'gs-lane', 'ABC'[r]));
        node.append(document.createTextNode(String(row[side])));
        if (isBonusLane) {
          node.dataset.bonusDrawRow = 'true';
          if (side === 0) {
            const tag = element('span', 'gs-bonus-draw-tag', t('survivalBonusDrawBadge'));
            tag.setAttribute('aria-hidden', 'true');
            node.append(tag);
          }
        }
        node.setAttribute('aria-label', t('replayLanePower', r + 1, side + 1, row[side]) +
          (isBonusLane ? ' · ' + t('survivalBonusDrawRowHud', r + 1) : ''));
        return node;
      }));
    }

    const activeCell = aimed ?? lastBoard ?? 0;
    const batch = presentation.batch;
    board.replaceChildren(...view.board.flatMap((line, row) => line.map((tile, col) => {
      const index = row * COLS + col;
      const key = cellKey(row, col), move = available.get(key), target = pending?.row === row && pending.col === col;
      const isAimed = aimed === index, blocked = isAimed && selected !== null && !move;
      const occupation = tile.card ? `occupied owner-${tile.card.owner}` : tile.owner === null ? '' : `pawn-${tile.owner}`;
      const classes = [
        'tile', occupation, move ? 'legal' : '', target ? 'pending' : '',
        blocked ? 'blocked-target' : '',
        tile.tileBonus ? 'has-tile-bonus' : '',
        pawn.has(key) ? 'preview-pawn' : '', effect.has(key) ? 'preview-effect' : '',
      ].filter(Boolean).join(' ');
      const node = button('', () => {
        if (locked) return;
        aimed = index;
        lastBoard = index;
        if (move) {
          pending = move;
          presentation.preview(true);
          renderStage('cell-' + key);
        } else if (tile.card) {
          hooks.showCard(tile.card.id);
        } else if (selected !== null) {
          pending = null;
          presentation.preview(false);
          renderStage('cell-' + key);
        }
      }, classes);
      node.disabled = false;
      node.tabIndex = index === activeCell ? 0 : -1;
      node.dataset.cell = key;
      node.dataset.index = String(index);
      node.dataset.gsFocus = 'cell-' + key;
      node.dataset.legal = String(Boolean(move));
      if (tile.tileBonus) node.dataset.tileBonus = String(tile.tileBonus);
      if (tile.card) {
        node.dataset.cardId = String(tile.card.id);
        node.setAttribute('aria-describedby', 'gsBoardPeek');
      }
      if (move) node.setAttribute('aria-pressed', String(target));
      const description = tile.card ? t('replayTileCard', nameOf(tile.card.id), tile.card.power) :
        tile.owner === null ? t('empty2') : t('replayPawnCount', tile.owner + 1, tile.pawns);
      node.setAttribute('aria-label', t('matchTileLabel', row + 1, col + 1, description,
        move ? t('legalPlacementSuffix') : '',
        target ? t('pendingPlacementSuffix') : blocked ? ' · ' + t('inputPlacementBlocked') : '') + tileBonusAriaSuffix(tile.tileBonus));
      if (tile.card) {
        node.append(placedCardView(tile.card, hooks.visual(tile.card.id)));
        if (batch && view === batch.after && presentation.effect?.motion &&
          batch.before.board[row][col].card?.instanceId !== tile.card.instanceId) {
          node.classList.add('match-card-arrival');
        }
      } else {
        node.append(boardPawns(tile.owner, tile.pawns));
      }
      const badge = tileBonusBadge(tile.tileBonus);
      if (badge) node.append(badge);
      if (pawn.has(key) || effect.has(key)) {
        const range = element('span', 'gs-range');
        range.setAttribute('aria-hidden', 'true');
        node.append(range);
      }
      return node;
    })));

    if (view.hand.length) focusedHand = Math.max(0, Math.min(focusedHand, view.hand.length - 1));
    else focusedHand = 0;
    const activeHand = selected ?? focusedHand;
    hand.replaceChildren(...view.hand.map((id, index) => {
      const node = button('', () => {
        if (locked) return;
        focusedHand = index;
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
      }, 'hand-card' + (selected === index ? ' selected' : '') + (index === focusedHand ? ' browsing' : ''));
      node.dataset.handIndex = String(index);
      node.dataset.cardId = String(id);
      node.dataset.gsFocus = 'hand-' + index;
      node.tabIndex = index === activeHand ? 0 : -1;
      node.setAttribute('aria-pressed', String(selected === index));
      node.disabled = locked;
      const face = createCardView(byId.get(id)!, hooks.visual(id), {variant: 'hand'});
      node.setAttribute('aria-label', face.getAttribute('aria-label') ?? nameOf(id));
      node.append(face);
      return node;
    }));
    hand.hidden = !view.hand.length;

    // Update feedback overlays, rival flight card face, ghost preview, hand focus, and board peek!
    effects.update(presentation.effect);
    const rivalFlight = table.querySelector<HTMLElement>('.match-rival-flight:not(:has(.qb-card))');
    const revealed = byId.get(presentation.effect?.placement?.cardId ?? -1);
    if (rivalFlight && revealed) rivalFlight.append(createCardView(revealed, hooks.visual(revealed.id), {variant: 'board'}));

    updateGhostPreview(picked, previewIndex, Boolean(pending));
    const browsingCard = view.hand[focusedHand] !== undefined ? byId.get(view.hand[focusedHand]) : picked;
    handFocus.update(browsingCard, picked, locked);
    const peeked = !picked && aimed !== null ? view.board[Math.floor(aimed / COLS)]?.[aimed % COLS]?.card ?? null : null;
    updatePeek(peeked);

    const survivalSnap = run.mode === 'survival' ? run.session.snapshot() : null;
    confirm.textContent = t('confirmPlay');
    confirm.disabled = pending === null || locked;
    confirm.hidden = finished || !pending;
    passBtn.textContent = t('pass');
    passBtn.disabled = locked;
    passBtn.hidden = finished;
    skipBtn.textContent = t('skipAnimation');
    skipBtn.hidden = !presentation.busy;
    skipBtn.disabled = !presentation.skippable;
    fastText.textContent = t('fastAnimationsThisSession');
    const showNextRound = Boolean(finished && survivalSnap?.canAdvance);
    nextRound.textContent = t('survivalNextRound');
    nextRound.hidden = !showNextRound;
    nextRound.disabled = !showNextRound;
    retry.textContent = t('restartSameSettings');
    back.textContent = t('back');
    details.textContent = t('cardDetails2');
    details.disabled = activeCardId() === undefined;

    // Result / inter-round summary panel (shown once MatchPresentation reaches Result).
    if (finished && run.mode === 'survival' && survivalSnap?.roundSettled) {
      const last = survivalSnap.roundScores[survivalSnap.roundScores.length - 1] as ExtendedRoundRecord;
      const heading = element('h3', '', t('survivalRoundSummary', last.round, last.playerScore, last.opponentScore));
      heading.tabIndex = -1;
      const summary = element('p', '', `${t('survivalCumulativeScore', survivalSnap.cumulativePlayerScore)} · ${t('survivalCarriedHand', survivalSnap.carriedPlayerHand.length)} · ${t('survivalRemainingDeck', survivalSnap.remainingPlayerDeck.length)}`);
      const children: HTMLElement[] = [heading, summary];
      if (last.bonusDrawEarned) {
        const earned = element('p', 'gs-bonus-earned', t('survivalBonusDrawEarned'));
        earned.dataset.bonusEarned = 'true';
        children.push(earned);
      }
      if (survivalSnap.status !== 'in-progress') {
        const rank = element('p', 'gs-result-rank', t(survivalRankKey[survivalSnap.status]));
        rank.dataset.status = survivalSnap.status;
        children.push(rank);
        const tableEl = element('table');
        const head = tableEl.createTHead().insertRow();
        for (const label of [t('survivalRoundProgress', survivalSnap.currentRound, survivalSnap.totalRounds), t('opponent'), t('actualScore')]) {
          const th = element('th', '', label);
          th.scope = 'col';
          head.append(th);
        }
        const tbody = tableEl.createTBody();
        for (const rec of survivalSnap.roundScores) {
          const spec = run.session.roundSpec(rec.round) as ExtendedRoundSpec;
          const tr = tbody.insertRow();
          tr.append(
            element('td', '', t('survivalRoundNumber', rec.round)),
            element('td', '', survivalRoundOpponentLabel(rec.round, spec.opponentStrategy, spec.bossId)),
            element('td', '', `${rec.playerScore} : ${rec.opponentScore}`),
          );
        }
        children.push(tableEl);
      } else {
        children.push(laneTable(view.result.rows, view.result.awards));
      }
      result.replaceChildren(...children);
    } else if (finished && run.mode === 'challenge') {
      const final = run.session.result();
      if (final) {
        const heading = element('h3', '', `${t(resultLabels[final.status])} · ${scorePair(final.scores)}`);
        heading.tabIndex = -1;
        result.replaceChildren(heading, laneTable(final.rows, final.awards));
      } else result.replaceChildren();
    } else {
      result.replaceChildren();
    }

    if (focus) root.querySelector<HTMLElement>(`[data-gs-focus="${focus}"]:not(:disabled)`)?.focus({preventScroll: true});
  }

  function confirmPlay() {
    if (!run || !pending || !presentation.canPlay) return;
    const move = pending;
    if (presentation.commitPlayer(() => { run!.session.play(move.handIndex, move.row, move.col); })) {
      playSfx('cardPlace');
      clearSelection();
      renderStage();
    }
  }

  function passTurn() {
    if (!run || !presentation.canPlay) return;
    if (presentation.commitPlayer(() => { run!.session.pass(); })) {
      playSfx('confirm');
      clearSelection();
      renderStage();
    }
  }

  function advanceSurvivalRound() {
    if (run?.mode !== 'survival' || !run.session.snapshot().canAdvance) return;
    playSfx('confirm');
    run.session.advanceRound();
    run = {mode: 'survival', session: run.session, audioId: `survival-${run.session.challenge.id}-r${run.session.currentRound}`};
    persistSurvival();
    openStage();
  }

  function retryRun() {
    if (!run) return;
    if (run.mode === 'challenge') {
      run.session.retry();
      run = {mode: 'challenge', session: run.session, audioId: `gs-${run.session.challenge.id}-${Date.now()}`};
    } else {
      const challenge = run.session.challenge;
      const session = SurvivalSession.start(challenge, hooks.deck().cards, Date.now() >>> 0);
      run = {mode: 'survival', session, audioId: `survival-${challenge.id}-r1`};
      persistSurvival();
    }
    openStage();
  }

  function usableActions() {
    return Array.from(commands.querySelectorAll<HTMLButtonElement>('button')).filter(node => !node.hidden && !node.disabled);
  }

  function focusBoardCell(index: number) {
    if (!run) return;
    const clamped = Math.max(0, Math.min(ROWS * COLS - 1, index));
    aimed = clamped;
    lastBoard = clamped;
    const legal = selected === null ? [] : playerMoves().filter(move => move.handIndex === selected);
    pending = selected === null ? null : legalTarget(legal, clamped);
    if (selected !== null) presentation.preview(Boolean(pending));
    renderStage('cell-' + cellKey(Math.floor(clamped / COLS), clamped % COLS));
  }

  function focusHandCard(index: number): boolean {
    const game = currentGame();
    if (!game || !presentation.canPlay) return false;
    const view = presentation.frame ?? publicMatch(game);
    if (!view.hand.length) return false;
    const clamped = Math.max(0, Math.min(view.hand.length - 1, index));
    focusedHand = clamped;
    aimed = null;
    if (selected === null) pending = null;
    renderStage('hand-' + clamped);
    return true;
  }

  function focusCommand(preferred?: HTMLButtonElement): boolean {
    const btns = usableActions();
    const target = preferred && btns.includes(preferred) ? preferred : btns[0];
    if (!target) return false;
    target.focus({preventScroll: true});
    return true;
  }

  function handleAction(action: SemanticAction): boolean {
    if (!run || stage.hidden) return false;
    if (presentation.busy) {
      if (action.type === 'confirm' && presentation.skippable) { presentation.skip(); return true; }
      return false;
    }
    const game = run.session.game;
    const view = presentation.frame ?? publicMatch(game);
    const finished = presentation.phase === 'Result';
    const focused = document.activeElement as HTMLElement | null;

    if (action.type === 'details') {
      const id = activeCardId();
      if (id !== undefined) { hooks.showCard(id); return true; }
      return false;
    }
    if (action.type === 'switch') {
      if (finished || !view.hand.length) return false;
      const base = selected ?? focusedHand;
      const next = Math.max(0, Math.min(view.hand.length - 1, base + action.step));
      if (selected !== null) {
        selected = next;
        focusedHand = next;
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
        presentation.preview(false);
        renderStage('hand-' + Math.min(returnTo, Math.max(0, view.hand.length - 1)));
        return true;
      }
      if (board.contains(focused)) {
        aimed = null;
        if (!finished && view.hand.length) { renderStage('hand-' + focusedHand); return true; }
      }
      showList();
      return true;
    }
    if (action.type === 'menu') {
      return focusCommand(nextRound.hidden ? (finished ? retry : passBtn) : nextRound);
    }
    if (action.type === 'scroll') {
      window.scrollBy(0, 120 * action.step);
      return true;
    }
    if (action.type === 'confirm') {
      if (hand.contains(focused) && focused?.dataset.handIndex !== undefined) {
        const hi = Number(focused.dataset.handIndex);
        if (finished || view.hand[hi] === undefined) return false;
        selected = hi;
        focusedHand = hi;
        const legal = playerMoves().filter(move => move.handIndex === hi);
        focusBoardCell(smartSnap(legal.map(move => move.row * COLS + move.col), lastBoard));
        return true;
      }
      if (board.contains(focused) && focused?.dataset.index !== undefined) {
        const index = Number(focused.dataset.index);
        if (selected !== null) {
          const legal = playerMoves().filter(move => move.handIndex === selected);
          const move = legalTarget(legal, index);
          if (move) { pending = move; confirmPlay(); return true; }
          focusBoardCell(index);
          return true;
        }
        const tile = view.board[Math.floor(index / COLS)]?.[index % COLS];
        if (tile?.card) { hooks.showCard(tile.card.id); return true; }
        return false;
      }
      if (commands.contains(focused) && focused instanceof HTMLButtonElement && !focused.disabled && !focused.hidden) {
        focused.click();
        return true;
      }
      if (!finished && view.hand.length) return focusHandCard(focusedHand);
      return focusCommand(nextRound.hidden ? retry : nextRound);
    }
    if (action.type === 'move') {
      const dir = action.direction;
      if (hand.contains(focused) && focused?.dataset.handIndex !== undefined) {
        const hi = Number(focused.dataset.handIndex);
        if (dir === 'left' || dir === 'right') return focusHandCard(hi + (dir === 'left' ? -1 : 1));
        if (dir === 'up') { focusBoardCell(lastBoard ?? ((ROWS - 1) * COLS + Math.min(COLS - 1, hi))); return true; }
        if (dir === 'down') return focusCommand(pending ? confirm : passBtn);
        return false;
      }
      if (board.contains(focused) && focused?.dataset.index !== undefined) {
        const index = Number(focused.dataset.index);
        if (dir === 'down' && index >= (ROWS - 1) * COLS && selected === null) {
          aimed = null;
          renderStage();
          if (!finished && view.hand.length) return focusHandCard(focusedHand);
          return focusCommand(nextRound.hidden ? retry : nextRound);
        }
        focusBoardCell(gridStep(index, dir));
        return true;
      }
      if (commands.contains(focused)) {
        const btns = usableActions();
        const idx = focused instanceof HTMLButtonElement ? btns.indexOf(focused) : -1;
        if (dir === 'left' || dir === 'right') {
          if (!btns.length) return false;
          const next = idx < 0 ? 0 : Math.max(0, Math.min(btns.length - 1, idx + (dir === 'left' ? -1 : 1)));
          btns[next]?.focus({preventScroll: true});
          return true;
        }
        if (dir === 'up') {
          if (selected !== null) { focusBoardCell(aimed ?? lastBoard ?? (ROWS - 1) * COLS); return true; }
          if (!finished && view.hand.length) return focusHandCard(focusedHand);
          focusBoardCell(lastBoard ?? (ROWS - 1) * COLS);
          return true;
        }
        return false;
      }
      if (dir === 'up') { focusBoardCell(lastBoard ?? (ROWS - 1) * COLS); return true; }
      if (!finished && view.hand.length) return focusHandCard(focusedHand);
      return focusCommand(nextRound.hidden ? retry : nextRound);
    }
    return false;
  }

  hand.addEventListener('focusin', event => {
    const node = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-hand-index]');
    if (node?.dataset.handIndex !== undefined) {
      focusedHand = Number(node.dataset.handIndex);
      if (run) {
        const view = presentation.frame ?? publicMatch(run.session.game);
        const picked = selected === null ? undefined : byId.get(view.hand[selected]);
        handFocus.update(byId.get(view.hand[focusedHand]), picked, !presentation.canPlay);
      }
    }
  });
  board.addEventListener('pointerover', event => {
    if (!run || !presentation.canPlay) return;
    const node = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-index]');
    if (!node?.dataset.index) return;
    const idx = Number(node.dataset.index);
    const view = presentation.frame ?? publicMatch(run.session.game);
    if (selected === null) {
      updatePeek(view.board[Math.floor(idx / COLS)]?.[idx % COLS]?.card ?? null);
    } else {
      const picked = byId.get(view.hand[selected]);
      const legal = playerMoves().filter(m => m.handIndex === selected);
      updateGhostPreview(picked, idx, Boolean(legalTarget(legal, idx)));
    }
  });
  board.addEventListener('pointerleave', () => {
    if (selected === null) updatePeek(null);
    else if (!pending) updateGhostPreview(undefined, null, false);
  });
  root.addEventListener(GOLD_SAUCER_ACTION_EVENT, event => {
    const action = (event as CustomEvent<SemanticAction>).detail;
    if (action) handleAction(action);
  });

  return {
    showList,
    leave,
    handleAction,
    localize() {
      if (!list.hidden) renderList();
      if (!stage.hidden) renderStage();
    },
  };
}
