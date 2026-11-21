import {TURN_DRAW_RULES_VERSION, type Player} from './engine.js';
import type {FixedHandPosition, PuzzleDefinition, PuzzleId} from './puzzle-data.js';

type Cell = `${'A' | 'B' | 'C'}${1 | 2 | 3 | 4 | 5}`;
const coords = (cell: Cell) => ({row: 'ABC'.indexOf(cell[0]), col: Number(cell[1]) - 1});
const pawn = (cell: Cell, pawns: number) => ({...coords(cell), owner: 0 as const, pawns});
const card = (cell: Cell, cardId: number, owner: Player = 1) => ({...coords(cell), owner, cardId});

export interface CarnivalPuzzle<Id extends PuzzleId = PuzzleId> extends PuzzleDefinition {
  readonly id: Id;
  readonly englishTitle: string;
  readonly originalRewardCardId: number;
}

function candidate<Id extends PuzzleId>(
  id: Id, englishTitle: string, originalRewardCardId: number, initial: FixedHandPosition, screenshot: string, note: string,
): CarnivalPuzzle<Id> {
  return {
    id, englishTitle, originalRewardCardId, revision: 1, chapter: 6, category: 'easy',
    titleKey: `puzzle.${id}.title` as PuzzleDefinition['titleKey'], rulesVersion: TURN_DRAW_RULES_VERSION,
    actionMode: 'fixed-hand-solo', winCondition: 'score-win', initial: {seed: 1, ...initial},
    evidence: {initial: {status: 'classic-candidate', sources: [screenshot], note}},
  };
}

// Exact P1 fixtures, in menu order. P0 documents the obscured opening cells.
export const puzzleCatalog = [
  candidate('cc-three-card-stud', 'Three-Card Stud', 23, {
    hands: [[15, 23, 14], []],
    board: [pawn('A1', 1), pawn('A3', 1), pawn('C3', 1), card('A5', 1), card('B5', 7), card('C5', 16)],
  }, 'https://cdn.mos.cms.futurecdn.net/SW9d5ZU6kqUctZ5wq6Darn.jpg',
  'B2 is neutral in this candidate. The guide overlay obscures A1, B2 and C3; exact opening ranks still need a clean frame.'),
  candidate('cc-go-for-choco-broke', 'Go for Choco-Broke', 109, {
    hands: [[107, 108, 109], []],
    board: [pawn('C1', 3), card('B2', 111, 0), card('A4', 21), card('A5', 16), card('B4', 2), card('B5', 11), card('C4', 21), card('C5', 16)],
  }, 'https://cdn.mos.cms.futurecdn.net/Cn2XqCDQvJC4uv5vV3BMHH.jpg',
  'C1 is the only starting allied pawn tile in this candidate. Glow and annotations cover A1, A3, C2 and C3 in the guide image.'),
  candidate('cc-mischief-making-moogles', 'Mischief-Making Moogles', 110, {
    hands: [[110, 8, 23], []],
    board: [pawn('B1', 2), pawn('B2', 2), card('A3', 4), card('A4', 12), card('A5', 11), card('B4', 13), card('B5', 14), card('C3', 4), card('C5', 8)],
  }, 'https://cdn.mos.cms.futurecdn.net/TXqjLMmTrapaZeZWHKQQ9H.jpg',
  'B2 starts with two pawns in this candidate. The second pawn is obscured. Mage and Bard are generated during play.'),
] as const;

export type CarnivalPuzzleId = typeof puzzleCatalog[number]['id'];
