import {expect, test} from 'vitest';
import {byId} from '../src/cards.js';
import {TURN_DRAW_RULES_VERSION} from '../src/engine.js';
import {carnivalMessages} from '../src/i18n/carnival.js';
import {localizedName} from '../src/i18n/card-names.js';
import {locales} from '../src/i18n/locales.js';
import {puzzleCatalog} from '../src/puzzle-catalog.js';
import {PuzzleSession} from '../src/puzzle-session.js';

test('catalog registers only the three revision-one P1 candidate openings and informational rewards', () => {
  expect(puzzleCatalog.map(puzzle => [puzzle.id, puzzle.originalRewardCardId])).toEqual([
    ['cc-three-card-stud', 23], ['cc-go-for-choco-broke', 109], ['cc-mischief-making-moogles', 110],
  ]);
  const startingScores = [[[0, 1], [0, 2], [0, 4]], [[0, 9], [1, 7], [0, 9]], [[0, 9], [0, 4], [0, 7]]];
  for (const [i, puzzle] of puzzleCatalog.entries()) {
    expect(puzzle).toMatchObject({
      revision: 1, chapter: 6, category: 'easy', rulesVersion: TURN_DRAW_RULES_VERSION,
      evidence: {initial: {status: 'classic-candidate'}},
    });
    expect(puzzle.evidence.initial.note).toBeTruthy();
    const state = new PuzzleSession(puzzle).snapshot();
    expect(state.hand).toEqual(puzzle.initial.hands[0]);
    expect(state.hand.every(id => byId.get(id)?.rarity !== 'token')).toBe(true);
    expect(state.score.rows).toEqual(startingScores[i]);
    expect(state.result).toBeNull();
  }
});

test.each(locales)('locale %s has Carnival controls, hints and resolved puzzle and reward names', locale => {
  const {hints, ...labels} = carnivalMessages(locale);
  expect(Object.keys(hints)).toHaveLength(puzzleCatalog.length);
  for (const text of [...Object.values(labels), ...Object.values(hints)]) {
    expect(text.trim()).toBeTruthy();
    expect(text).not.toMatch(/⟦|^puzzle\./);
  }
  for (const puzzle of puzzleCatalog) {
    expect(localizedName(puzzle.titleKey, puzzle.englishTitle, locale)).toBe(puzzle.englishTitle);
    expect(localizedName(puzzle.originalRewardCardId, byId.get(puzzle.originalRewardCardId)!.name, locale)).toBeTruthy();
  }
});
