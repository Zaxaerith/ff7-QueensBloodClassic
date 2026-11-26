import {expect, test, vi} from 'vitest';
import {byId, starterDeck} from '../src/cards.js';
import * as engine from '../src/engine.js';
import {MatchHistory, readActive, restoreMatch, saveMatch, writeActive} from '../src/match-archive.js';
import {startMatch, type MatchSettings} from '../src/match-flow.js';
import {puzzleCatalog} from '../src/puzzle-catalog.js';
import type {FixedHandPosition, PuzzleDefinition, PuzzleId} from '../src/puzzle-data.js';
import {PuzzleSession} from '../src/puzzle-session.js';
import type {StoragePort} from '../src/ui-data.js';

type Cell = `${'A'|'B'|'C'}${1|2|3|4|5}`;
type Step = readonly [cardId: number, cell: Cell];
const coords = (cell: Cell) => ({row: 'ABC'.indexOf(cell[0]), col: Number(cell[1])-1});
const pawn = (cell: Cell, pawns: number) => ({...coords(cell), owner: 0 as const, pawns});
const card = (cell: Cell, cardId: number, owner: engine.Player = 1) => ({...coords(cell), owner, cardId});

function fixture(id: PuzzleId, initial: FixedHandPosition): PuzzleDefinition {
  return {
    id, revision: 1, chapter: 6, category: 'easy', titleKey: `puzzle.${id}.title`,
    rulesVersion: engine.TURN_DRAW_RULES_VERSION, actionMode: 'fixed-hand-solo', winCondition: 'score-win',
    initial: {seed: 1, ...initial},
    evidence: {initial: {status: 'classic-candidate', sources: ['docs/M9_P0_CARD_CARNIVAL_AUDIT.md']}},
  };
}

const [stud, choco, moogles] = puzzleCatalog;

function playAt(session: PuzzleSession, [cardId, cell]: Step) {
  const {row, col} = coords(cell);
  const move = session.moves().find(move => move.cardId === cardId && move.row === row && move.col === col);
  if (!move) throw Error(`Expected legal puzzle move #${cardId} at ${cell}`);
  return session.play(move);
}

test('imports a fixed opening, applies existing auras and never replays a preplaced card entry', () => {
  const session = new PuzzleSession(fixture('cc-preplaced', {
    hands: [[1, 1, 1], []],
    board: [pawn('B1', 1), card('B2', 111, 0), card('A1', 10, 0), card('C3', 110, 0)],
  }));
  const start = session.snapshot();
  expect(start.phase).toBe('playing');
  expect(start.board).toHaveLength(3);
  expect(start.board.map(row => row.length)).toEqual([5, 5, 5]);
  expect(start.board[0][0].card?.power).toBe(3);
  expect(start.board[2][2].card?.power).toBe(3);
  expect(start.board[2][0]).toEqual({owner: null, pawns: 0, card: null});
  expect(start.hand).toEqual([1, 1, 1]);
  expect(start.events.map(event => event.type)).toEqual(['MatchStarted', 'CardEnhanced', 'CardEnhanced']);
  expect(session.moves()).toEqual([0, 1, 2].map(handIndex => ({handIndex, cardId: 1, ...coords('B1')})));
});

test('an empty imported position performs no dummy 15-card lookups', () => {
  const get = vi.spyOn(byId, 'get');
  try {
    const session = new PuzzleSession(fixture('cc-empty', {hands: [[], []], board: []}));
    expect(session.moves()).toEqual([]);
    expect(get).not.toHaveBeenCalled();
  } finally {
    get.mockRestore();
  }
});

test('rejects mode inputs that could use a normal start or draw during the handoff', () => {
  for (const invalid of [
    {board: undefined}, {phase: 'mulligan'}, {turn: 1}, {passes: 1}, {decks: [[1], []]},
    {decks: [[], [1]]}, {hands: [[1], [1]]},
  ]) {
    const definition = {...stud, initial: {...stud.initial, ...invalid}} as PuzzleDefinition;
    expect(() => new PuzzleSession(definition)).toThrow('Fixed-hand puzzles');
  }
  const invalidBoard = {...stud.initial, board: [pawn('B1', 1), pawn('B1', 1)]};
  expect(() => new PuzzleSession({...stud, initial: invalidBoard})).toThrow('Duplicate position');
});

test.each([engine.TURN_DRAW_RULES_VERSION, engine.LEGACY_RULES_VERSION] as const)(
  'internal handoff preserves every card state and triggers no abilities or draws under %s',
  rulesVersion => {
    const definition = fixture('cc-pass-probe', {
      hands: [[1, 1], []], decks: [[], []],
      board: [pawn('A1', 1), card('A2', 32, 0), card('A5', 32)],
    });
    const session = new PuzzleSession({...definition, rulesVersion});
    for (const [cell, power] of [['A1', 2], ['B1', 3]] as const) {
      const state = playAt(session, [1, cell]);
      expect(state.phase).toBe('playing');
      expect(state.board[0][1].card?.power).toBe(power);
      expect(state.board[0][4].card?.power).toBe(1);
      const replay = session.debugReplay();
      const placed = engine.replayMatch({...replay, commands: replay.commands.slice(0, -1)});
      const handedOff = engine.replayMatch(replay);
      expect(placed.turn).toBe(1);
      expect(placed.passes).toBe(0);
      expect(handedOff.turn).toBe(0);
      expect(handedOff.passes).toBe(1);
      expect(handedOff.board).toEqual(placed.board);
      expect(handedOff.hands).toEqual(placed.hands);
      expect(handedOff.decks).toEqual([[], []]);
      expect(handedOff.discard).toEqual(placed.discard);
      expect(handedOff.events.slice(placed.events.length)).toMatchObject([{type: 'TurnPassed', player: 1}]);
      expect(handedOff.events.some(event => event.reason === 'draw')).toBe(false);
      expect(state.events.every(event => event.stage !== 'turn')).toBe(true);
    }
    expect(session.moves()).toEqual([]);
    expect(session.snapshot().result).toBeNull();
    expect(session.finish().result?.status).toBe('passed');
  },
);

const puzzleById = (id: PuzzleId) => {
  const found = puzzleCatalog.find(p => p.id === id);
  if (!found) throw Error(`Missing puzzle ${id}`);
  return found;
};

const routes: Array<{
  puzzle: PuzzleDefinition;
  steps: Step[];
  scores: [number, number];
  awards: [number, number][];
}> = [
  // Chapter 6 · Easy (P1 baseline — 100% unchanged scores & routes)
  {puzzle: stud, steps: [[23, 'C3'], [15, 'A1'], [14, 'B2']], scores: [5, 4], awards: [[2, 0], [3, 0], [0, 4]]},
  {puzzle: choco, steps: [[108, 'C1'], [109, 'C3'], [107, 'C2']], scores: [17, 16], awards: [[0, 9], [0, 7], [17, 0]]},
  {puzzle: moogles, steps: [[110, 'B1'], [23, 'B2'], [1110, 'C2'], [2110, 'A1'], [8, 'C1']], scores: [11, 6], awards: [[0, 6], [6, 0], [5, 0]]},
  // Chapter 6 · Advanced & Skill Drill
  {puzzle: puzzleById('cc-spears-and-needles'), steps: [[12, 'A2'], [31, 'B2'], [31, 'B3'], [14, 'C3']], scores: [8, 6], awards: [[0, 6], [0, 0], [8, 0]]},
  {puzzle: puzzleById('cc-sea-devil-by-night'), steps: [[32, 'B2'], [32, 'C1'], [10, 'C2'], [1, 'C3'], [10, 'C2'], [1010, 'C3'], [1010, 'B1']], scores: [14, 8], awards: [[0, 8], [8, 0], [6, 0]]},
  {puzzle: puzzleById('cc-a-kingly-clash'), steps: [[15, 'A2'], [15, 'C2'], [35, 'B3'], [27, 'B1'], [22, 'A1'], [22, 'C1']], scores: [16, 14], awards: [[0, 7], [16, 0], [0, 7]]},
  {puzzle: puzzleById('cc-power-down-practice'), steps: [[20, 'C2'], [20, 'C3'], [14, 'B2']], scores: [9, 4], awards: [[0, 4], [3, 0], [6, 0]]},
  // Chapter 12 · Advanced
  {puzzle: puzzleById('cc-one-shot-one-kill'), steps: [[28, 'C4'], [41, 'A4'], [37, 'C3'], [41, 'B5'], [119, 'B1']], scores: [4, 0], awards: [[0, 0], [4, 0], [0, 0]]},
  {puzzle: puzzleById('cc-curse-of-the-gi'), steps: [[63, 'A2'], [36, 'B1'], [62, 'B2'], [13, 'C2'], [2, 'C1'], [59, 'C1'], [123, 'B2']], scores: [45, 19], awards: [[25, 0], [0, 19], [20, 0]]},
  // Chapter 12 · Party Collector's Cards (9)
  {puzzle: puzzleById('cc-collectors-cloud'), steps: [[1, 'C2'], [86, 'B2'], [143, 'B4']], scores: [18, 12], awards: [[9, 0], [0, 12], [9, 0]]},
  {puzzle: puzzleById('cc-collectors-barret'), steps: [[6, 'A2'], [36, 'C2'], [41, 'B2'], [51, 'B2'], [87, 'B3']], scores: [9, 6], awards: [[0, 3], [9, 0], [0, 3]]},
  {puzzle: puzzleById('cc-collectors-tifa'), steps: [[12, 'A1'], [31, 'B2'], [22, 'C2'], [88, 'B3'], [59, 'C2']], scores: [19, 16], awards: [[0, 16], [13, 0], [6, 0]]},
  {puzzle: puzzleById('cc-collectors-aerith'), steps: [[89, 'A2'], [102, 'A3'], [10, 'C2'], [75, 'C3'], [1010, 'A1']], scores: [21, 20], awards: [[12, 0], [0, 20], [9, 0]]},
  {puzzle: puzzleById('cc-collectors-red-xiii'), steps: [[36, 'B2'], [65, 'B3'], [65, 'A2'], [90, 'C3'], [67, 'B2']], scores: [16, 0], awards: [[7, 0], [9, 0], [0, 0]]},
  {puzzle: puzzleById('cc-collectors-yuffie'), steps: [[13, 'C3'], [31, 'A3'], [41, 'B3'], [58, 'C1'], [58, 'B1'], [91, 'B3']], scores: [9, 4], awards: [[0, 4], [5, 0], [4, 0]]},
  {puzzle: puzzleById('cc-collectors-cait-sith'), steps: [[136, 'C1'], [135, 'A1'], [92, 'A2'], [1092, 'B1'], [141, 'C2'], [139, 'B2']], scores: [38, 27], awards: [[18, 0], [0, 27], [20, 0]]},
  {puzzle: puzzleById('cc-collectors-cid'), steps: [[93, 'C1'], [1093, 'A1'], [138, 'C2'], [41, 'B4'], [51, 'B4']], scores: [6, 4], awards: [[2, 0], [0, 4], [4, 0]]},
  {puzzle: puzzleById('cc-collectors-vincent'), steps: [[94, 'B2'], [72, 'A2'], [72, 'C2'], [74, 'A1'], [1094, 'B2']], scores: [11, 0], awards: [[5, 0], [4, 0], [2, 0]]},
  // Chapter 12 · Skill Drills (4)
  {puzzle: puzzleById('cc-chain-reactions'), steps: [[12, 'A1'], [50, 'A2'], [48, 'C2']], scores: [14, 11], awards: [[8, 0], [0, 11], [6, 0]]},
  {puzzle: puzzleById('cc-major-power-outage'), steps: [[63, 'A2'], [61, 'C2'], [62, 'B2'], [74, 'A1']], scores: [21, 13], awards: [[10, 0], [11, 0], [0, 13]]},
  {puzzle: puzzleById('cc-back-to-replace-ics'), steps: [[54, 'A2'], [14, 'B2'], [52, 'C2']], scores: [21, 10], awards: [[0, 10], [14, 0], [7, 0]]},
  {puzzle: puzzleById('cc-replacement-test'), steps: [[12, 'A1'], [31, 'B2'], [59, 'C2']], scores: [14, 6], awards: [[0, 6], [8, 0], [6, 0]]},
];

test('regression route table covers every puzzle in puzzleCatalog', () => {
  expect(routes.map(r => r.puzzle.id)).toEqual(puzzleCatalog.map(p => p.id));
});

test.each(routes)('$puzzle.id follows the verified route, clears with winner === 0, and reconstructs in Replay v2', ({puzzle, steps, scores, awards}) => {
  const session = new PuzzleSession(puzzle);
  const start = session.snapshot(), initialMoves = session.moves(), initialReplay = session.debugReplay();
  expect(new PuzzleSession(puzzle).finish().result).toMatchObject({status: 'failed', winner: 1});
  for (const step of steps) playAt(session, step);
  expect(session.snapshot()).toMatchObject({phase: 'playing', hand: [], result: null});
  expect(session.moves()).toEqual([]);
  const completed = session.finish();
  expect(completed.result).toMatchObject({status: 'passed', scores, awards, winner: 0});
  expect(completed.events.filter(event => event.type === 'MatchEnded')).toHaveLength(1);
  expect(completed.events.flatMap(event => event.type === 'CardPlayed' ? [event.cardId] : [])).toEqual(steps.map(step => step[0]));
  const replay = session.debugReplay();
  expect(replay.version).toBe(2);
  expect(replay.commands).toHaveLength(steps.length * 2 + 1);
  const rebuilt = engine.replayMatch(JSON.parse(JSON.stringify(replay)));
  expect(rebuilt.phase).toBe('finished');
  expect(rebuilt.board).toEqual(completed.board);
  expect(rebuilt.hands).toEqual([completed.hand, []]);
  expect(rebuilt.events.filter(event => event.stage !== 'turn')).toEqual(completed.events);
  expect(engine.scoreBreakdown(rebuilt)).toMatchObject({scores, awards});
  expect(session.retry()).toEqual(start);
  expect(session.moves()).toEqual(initialMoves);
  expect(session.debugReplay()).toEqual(initialReplay);
  for (const step of steps) playAt(session, step);
  expect(session.finish()).toEqual(completed);
  expect(engine.replayMatch(session.debugReplay())).toEqual(rebuilt);
});

test('Cloud collector puzzle genuinely triggers Desert Sahagin and Cloud threshold 7, and Vincent supports Galian Beast before Rictus', () => {
  const cloud = new PuzzleSession(puzzleById('cc-collectors-cloud'));
  playAt(cloud, [1, 'C2']);
  playAt(cloud, [86, 'B2']);
  const afterSeph = playAt(cloud, [143, 'B4']);
  expect(afterSeph.events).toEqual(expect.arrayContaining([
    expect.objectContaining({type: 'ThresholdReached', cardId: 86, power: 7}),
  ]));
  expect(cloud.finish().result).toMatchObject({status: 'passed', winner: 0, scores: [18, 12]});

  const vincent = new PuzzleSession(puzzleById('cc-collectors-vincent'));
  for (const step of [[94, 'B2'], [72, 'A2'], [72, 'C2'], [1094, 'B2'], [74, 'A1']] as Step[]) {
    playAt(vincent, step);
  }
  expect(vincent.finish().result).toMatchObject({status: 'passed', winner: 0, scores: [11, 0]});
});

test('Moogles generates both hand cards once, resolves weakening and destruction, and allows an alternate route', () => {
  const session = new PuzzleSession(moogles);
  const first = playAt(session, [110, 'B1']);
  expect(first.hand).toEqual([8, 23, 1110, 2110]);
  expect(first.events.filter(event => event.type === 'CardAddedToHand')).toMatchObject([
    {cardId: 1110, reason: 'generated'}, {cardId: 2110, reason: 'generated'},
  ]);
  const mage = playAt(session, [1110, 'C2']);
  expect(mage.events).toEqual(expect.arrayContaining([
    expect.objectContaining({type: 'PowerChanged', cardId: 12, amount: -4}),
    expect.objectContaining({type: 'CardDestroyed', cardId: 12}),
  ]));
  expect(mage.board[0][3].card).toBeNull();
  expect(mage.board[2][2].card?.power).toBe(2);
  playAt(session, [23, 'B2']);
  const bard = playAt(session, [2110, 'A1']);
  expect(bard.board[1][1].card?.power).toBe(5);
  expect(bard.board[2][1].card?.power).toBe(3);
  playAt(session, [8, 'C1']);
  expect(session.finish().result?.scores).toEqual([11, 6]);
});

test('a real replacement fires destruction and adds the matching token', () => {
  const session = new PuzzleSession(fixture('cc-replacement', {
    hands: [[59], []], board: [card('B2', 94, 0)],
  }));
  const after = playAt(session, [59, 'B2']);
  expect(after.board[1][1].card).toMatchObject({id: 59, owner: 0});
  expect(after.hand).toEqual([1094]);
  expect(after.events.slice(1)).toMatchObject([
    {type: 'CardReplaced', cardId: 94},
    {type: 'CardPlayed', cardId: 59},
    {type: 'CardDestroyed', cardId: 94, reason: 'replaced'},
    {type: 'CardAddedToHand', cardId: 1094, reason: 'generated'},
    {type: 'PawnsClaimed', ...coords('A2')},
    {type: 'PawnsClaimed', ...coords('B3')},
  ]);
  expect(engine.replayMatch(session.debugReplay()).discard[0]).toEqual([94]);
});

test('rejects wrong card identity, illegal placement, and a real ability failure atomically', () => {
  const session = new PuzzleSession(fixture('cc-aura-failure', {
    hands: [[66], []],
    board: [{...card('A3', 66), permanentDelta: -1}, card('C3', 13, 0), pawn('B3', 2)],
  }));
  const before = session.snapshot(), replay = session.debugReplay(), [move] = session.moves();
  expect(() => session.play({...move, cardId: 7})).toThrow('Card does not match');
  expect(() => session.play({...move, col: 5})).toThrow('Illegal move');
  expect(() => session.play(move)).toThrow('UNSTABLE_AURA');
  expect(session.snapshot()).toEqual(before);
  expect(session.debugReplay()).toEqual(replay);
  expect(session.moves()).toEqual([move]);
  expect(session.finish().phase).toBe('finished');
});

test('rolls back a resolved placement if the internal PASS fails after mutating its draft', () => {
  const session = new PuzzleSession(stud);
  const before = session.snapshot(), replay = session.debugReplay();
  const pass = engine.pass;
  const injected = vi.spyOn(engine, 'pass').mockImplementationOnce((draft, player) => {
    expect(draft.board[2][2].card?.id).toBe(23);
    pass(draft, player);
    throw Error('Injected handoff failure');
  });
  try {
    expect(() => playAt(session, [23, 'C3'])).toThrow('Injected handoff failure');
    expect(session.snapshot()).toEqual(before);
    expect(session.debugReplay()).toEqual(replay);
  } finally {
    injected.mockRestore();
  }
  expect(playAt(session, [23, 'C3']).board[2][2].card?.id).toBe(23);
});

test.each([
  {board: [card('A1', 1, 0)], status: 'passed', scores: [1, 0]},
  {board: [card('A5', 1)], status: 'failed', scores: [0, 1]},
  {board: [card('A1', 1, 0), card('A5', 1)], status: 'draw', scores: [0, 0]},
])('finishes without a move as $status, including when a card remains unplayable', ({board, status, scores}) => {
  const session = new PuzzleSession(fixture('cc-no-moves', {hands: [[23], []], board}));
  expect(session.moves()).toEqual([]);
  expect(session.snapshot().phase).toBe('playing');
  const finished = session.finish();
  expect(finished).toMatchObject({phase: 'finished', hand: [23], result: {status, scores}});
  const replay = session.debugReplay();
  expect(replay.commands).toEqual([{type: 'pass', player: 0}, {type: 'pass', player: 1}]);
  expect(finished.events.map(event => event.type)).toEqual(['MatchStarted', 'MatchEnded']);
  expect(session.moves()).toEqual([]);
  expect(() => session.play({handIndex: 0, cardId: 23, row: 0, col: 0})).toThrow('Puzzle is finished');
  expect(session.finish()).toEqual(finished);
  expect(session.debugReplay()).toEqual(replay);
});

test('allows early finish with legal placements and owns snapshots, replays and retry state', () => {
  const definition = structuredClone(stud);
  const session = new PuzzleSession(definition);
  const start = session.snapshot(), initialMoves = session.moves();
  definition.initial.hands[0].splice(0);
  definition.initial.board.splice(0);
  const copy = session.snapshot();
  copy.board[0][0].pawns = 3;
  copy.hand.splice(0);
  copy.events.splice(0);
  session.debugReplay().commands.push({type: 'pass', player: 0});
  expect(session.snapshot()).toEqual(start);
  expect(session.moves()).toEqual(initialMoves);
  expect(session.finish().result).toMatchObject({status: 'failed', scores: [0, 7]});
  expect(session.retry()).toEqual(start);
});

test('a puzzle cannot launch a Worker or write the ordinary Continue and Records slots', () => {
  const data = new Map<string, string>();
  const store: StoragePort = {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => { data.set(key, value); },
  };
  const settings: MatchSettings = {
    deck: starterDeck, seed: 701, difficulty: 'normal', first: 'computer',
    opponent: {npcId: 'nene', deck: starterDeck},
  };
  const live = startMatch(settings);
  engine.mulligan(live, 0, []);
  engine.mulligan(live, 1, []);
  const archived = structuredClone(live);
  engine.pass(archived, 1);
  engine.pass(archived, 0);
  expect(writeActive(store, saveMatch(live, settings, 'Starter', 'live'))).toBeNull();
  expect(new MatchHistory(store).add(saveMatch(archived, settings, 'Starter', 'completed'))).toBeNull();
  const saved = new Map(data);
  const worker = vi.fn(() => { throw Error('Unexpected puzzle Worker'); });
  vi.stubGlobal('Worker', worker);
  vi.stubGlobal('localStorage', store);
  try {
    const session = new PuzzleSession(moogles);
    const initial = session.snapshot();
    playAt(session, [110, 'B1']);
    session.finish();
    expect(session.retry()).toEqual(initial);
    expect(worker).not.toHaveBeenCalled();
    expect(data).toEqual(saved);
    expect(readActive(store).restored?.game).toEqual(live);
    const history = new MatchHistory(store);
    expect(history.records.map(record => record.id)).toEqual(['completed']);
    expect(engine.replayMatch(history.replay('completed'))).toEqual(archived);
    expect(restoreMatch(readActive(store).restored?.save).save.settings.opponent).toEqual(settings.opponent);
  } finally {
    vi.unstubAllGlobals();
  }
});
