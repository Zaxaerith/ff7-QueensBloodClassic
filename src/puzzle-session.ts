import {
  createPosition, exportReplay, legalMoves, pass, play, scoreBreakdown,
  type Game, type Move, type Replay, type RuleEvent, type Tile,
} from './engine.js';
import type {PuzzleDefinition, PuzzleId} from './puzzle-data.js';

export type PuzzleMove = Move & {cardId: number};
export type PuzzleResult = ReturnType<typeof scoreBreakdown> & {status: 'passed' | 'failed' | 'draw'};

export interface PuzzleState {
  id: PuzzleId;
  revision: number;
  phase: 'playing' | 'finished';
  board: Tile[][];
  hand: number[];
  events: RuleEvent[];
  score: ReturnType<typeof scoreBreakdown>;
  result: PuzzleResult | null;
}

function validateDefinition(definition: PuzzleDefinition): void {
  if (!/^cc-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(definition.id) ||
      !Number.isSafeInteger(definition.revision) || definition.revision < 1 ||
      definition.titleKey !== `puzzle.${definition.id}.title`) {
    throw new Error('Invalid puzzle identity or revision');
  }
  if (definition.actionMode !== 'fixed-hand-solo' || definition.winCondition !== 'score-win') {
    throw new Error('Unsupported puzzle mode or win condition');
  }

  const initial = definition.initial;
  if (!initial || !Array.isArray(initial.board) ||
      (initial.phase ?? 'playing') !== 'playing' ||
      (initial.turn ?? 0) !== 0 || (initial.passes ?? 0) !== 0 ||
      initial.hands?.[1]?.length !== 0 ||
      (initial.decks !== undefined && (initial.decks?.[0]?.length !== 0 || initial.decks?.[1]?.length !== 0))) {
    throw new Error('Fixed-hand puzzles require an explicit board, player turn, and empty decks and opponent hand');
  }
}

export class PuzzleSession {
  readonly #id: PuzzleId;
  readonly #revision: number;
  readonly #initial: Game;
  #game: Game;

  constructor(definition: PuzzleDefinition) {
    validateDefinition(definition);
    this.#id = definition.id;
    this.#revision = definition.revision;
    this.#initial = createPosition(definition.initial, definition.rulesVersion);
    this.#game = structuredClone(this.#initial);
  }

  snapshot(): PuzzleState {
    const game = this.#game;
    const score = scoreBreakdown(game);
    let result: PuzzleResult | null = null;
    if (game.phase === 'finished') {
      const status = score.winner === null ? 'draw' : score.winner === 0 ? 'passed' : 'failed';
      result = {...score, status};
    }
    return structuredClone({
      id: this.#id,
      revision: this.#revision,
      phase: result ? 'finished' : 'playing',
      board: game.board,
      hand: game.hands[0],
      // Keep the engine sequence numbers while omitting internal turn bookkeeping.
      events: game.events.filter(event => event.type !== 'TurnPassed' && event.type !== 'TurnEnded'),
      score,
      result,
    });
  }

  moves(): PuzzleMove[] {
    return legalMoves(this.#game, 0).map(move => ({...move, cardId: this.#game.hands[0][move.handIndex]}));
  }

  play(move: PuzzleMove): PuzzleState {
    if (this.#game.phase === 'finished') throw new Error('Puzzle is finished');
    if (this.#game.hands[0][move.handIndex] !== move.cardId) throw new Error('Card does not match puzzle hand');

    const next = structuredClone(this.#game);
    play(next, 0, move.handIndex, move.row, move.col);
    // A real placement clears the prior pass. The empty decks make this handoff draw-free.
    pass(next, 1);
    this.#game = next;
    return this.snapshot();
  }

  finish(): PuzzleState {
    if (this.#game.phase !== 'finished') {
      const next = structuredClone(this.#game);
      pass(next, 0);
      if (next.phase !== 'finished') pass(next, 1);
      this.#game = next;
    }
    return this.snapshot();
  }

  retry(): PuzzleState {
    this.#game = structuredClone(this.#initial);
    return this.snapshot();
  }

  /** Raw Replay v2 for diagnostics. Includes the engine's internal handoffs. */
  debugReplay(): Replay {
    return exportReplay(this.#game);
  }
}
