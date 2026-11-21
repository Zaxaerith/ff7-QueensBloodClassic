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
    evidence: {initial: {status: 'classic-candidate', sources: ['docs/GAMEPLAY.md']}},
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

const routes: Array<{
  puzzle: PuzzleDefinition;
  steps: Step[];
  scores: [number, number];
  awards: [number, number][];
}> = [
  {puzzle: stud, steps: [[23, 'C3'], [15, 'A1'], [14, 'B2']], scores: [5, 4], awards: [[2, 0], [3, 0], [0, 4]]},
  {puzzle: choco, steps: [[108, 'C1'], [109, 'C3'], [107, 'C2']], scores: [17, 16], awards: [[0, 9], [0, 7], [17, 0]]},
  {puzzle: moogles, steps: [[110, 'B1'], [23, 'B2'], [1110, 'C2'], [2110, 'A1'], [8, 'C1']], scores: [11, 6], awards: [[0, 6], [6, 0], [5, 0]]},
];

test.each(routes)('$puzzle.id follows the P0 candidate route and reconstructs the entire attempt in Replay v2', ({puzzle, steps, scores, awards}) => {
  const session = new PuzzleSession(puzzle);
  const start = session.snapshot(), initialMoves = session.moves(), initialReplay = session.debugReplay();
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
