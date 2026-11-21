import type {Position, PositionTile, RulesVersion} from './engine.js';

export type PuzzleId = `cc-${string}`;
export type PuzzleCategory = 'easy' | 'advanced' | 'collection' | 'skill-drill';

export type FixedHandPosition = Position & {
  board: PositionTile[];
  hands: [number[], []];
  decks?: [[], []];
  phase?: 'playing';
  turn?: 0;
  passes?: 0;
};

export interface PuzzleEvidence {
  readonly status: 'gameplay' | 'guide' | 'classic-candidate' | 'unknown';
  readonly sources: readonly string[];
  readonly note?: string;
}

export interface PuzzleDefinition {
  readonly id: PuzzleId;
  readonly revision: number;
  readonly chapter: 6 | 12;
  readonly category: PuzzleCategory;
  readonly titleKey: `puzzle.${PuzzleId}.title`;
  readonly rulesVersion: RulesVersion;
  readonly actionMode: 'fixed-hand-solo';
  readonly winCondition: 'score-win';
  readonly initial: FixedHandPosition;
  readonly evidence: Readonly<{
    initial: PuzzleEvidence;
    hand?: PuzzleEvidence;
    finish?: PuzzleEvidence;
    unlock?: PuzzleEvidence;
  }>;
}
