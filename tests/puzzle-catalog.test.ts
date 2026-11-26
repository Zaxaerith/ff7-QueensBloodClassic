import {expect, test} from 'vitest';
import {byId} from '../src/cards.js';
import {TURN_DRAW_RULES_VERSION} from '../src/engine.js';
import {carnivalMessages, carnivalProgressText} from '../src/i18n/carnival.js';
import {localizedName} from '../src/i18n/card-names.js';
import {locales} from '../src/i18n/locales.js';
import {puzzleCatalog} from '../src/puzzle-catalog.js';
import {puzzleCategories} from '../src/puzzle-data.js';
import {PuzzleSession} from '../src/puzzle-session.js';

const expectedCatalogMeta = [
  ['cc-three-card-stud', 6, 'easy', 23, [[0, 1], [0, 2], [0, 4]]],
  ['cc-go-for-choco-broke', 6, 'easy', 109, [[0, 9], [1, 7], [0, 9]]],
  ['cc-mischief-making-moogles', 6, 'easy', 110, [[0, 9], [0, 4], [0, 7]]],
  ['cc-spears-and-needles', 6, 'advanced', 31, [[0, 6], [0, 2], [0, 7]]],
  ['cc-sea-devil-by-night', 6, 'advanced', 32, [[0, 8], [0, 5], [0, 4]]],
  ['cc-a-kingly-clash', 6, 'advanced', 35, [[3, 7], [4, 13], [3, 7]]],
  ['cc-power-down-practice', 6, 'skill-drill', null, [[0, 4], [0, 6], [0, 6]]],
  ['cc-one-shot-one-kill', 12, 'advanced', 119, [[0, 14], [2, 7], [0, 8]]],
  ['cc-curse-of-the-gi', 12, 'advanced', 123, [[3, 19], [0, 19], [0, 19]]],
  ['cc-collectors-cloud', 12, 'collection', 86, [[7, 4], [0, 12], [2, 11]]],
  ['cc-collectors-barret', 12, 'collection', 87, [[0, 7], [0, 13], [0, 7]]],
  ['cc-collectors-tifa', 12, 'collection', 88, [[0, 23], [0, 5], [0, 5]]],
  ['cc-collectors-aerith', 12, 'collection', 89, [[0, 12], [0, 20], [0, 16]]],
  ['cc-collectors-red-xiii', 12, 'collection', 90, [[0, 18], [0, 9], [0, 11]]],
  ['cc-collectors-yuffie', 12, 'collection', 91, [[0, 17], [0, 19], [0, 14]]],
  ['cc-collectors-cait-sith', 12, 'collection', 92, [[0, 6], [0, 26], [0, 14]]],
  ['cc-collectors-cid', 12, 'collection', 93, [[0, 4], [0, 10], [0, 4]]],
  ['cc-collectors-vincent', 12, 'collection', 94, [[0, 11], [0, 8], [0, 13]]],
  ['cc-chain-reactions', 12, 'skill-drill', null, [[0, 8], [6, 17], [1, 8]]],
  ['cc-major-power-outage', 12, 'skill-drill', null, [[0, 10], [2, 10], [2, 13]]],
  ['cc-back-to-replace-ics', 12, 'skill-drill', null, [[2, 10], [6, 13], [2, 6]]],
  ['cc-replacement-test', 12, 'skill-drill', null, [[0, 6], [1, 5], [1, 7]]],
] as const;

test('catalog registers all 22 Ch.6 + Ch.12 puzzles with intact P1 baseline, valid openings and no free wins', () => {
  expect(puzzleCatalog).toHaveLength(22);
  expect(puzzleCatalog.map(p => [p.id, p.chapter, p.category, p.originalRewardCardId])).toEqual(
    expectedCatalogMeta.map(([id, chapter, category, reward]) => [id, chapter, category, reward]),
  );

  for (const [i, puzzle] of puzzleCatalog.entries()) {
    const [, expectedChapter, expectedCategory, expectedReward, expectedRows] = expectedCatalogMeta[i];
    expect(puzzle).toMatchObject({
      revision: 1,
      chapter: expectedChapter,
      category: expectedCategory,
      originalRewardCardId: expectedReward,
      rulesVersion: TURN_DRAW_RULES_VERSION,
      evidence: {initial: {status: 'classic-candidate'}},
    });
    expect(puzzle.evidence.initial.note).toBeTruthy();

    const session = new PuzzleSession(puzzle);
    const state = session.snapshot();
    expect(state.hand).toEqual(puzzle.initial.hands[0]);
    expect(state.hand.every(id => byId.get(id)?.rarity !== 'token')).toBe(true);
    expect(state.score.rows).toEqual(expectedRows);
    expect(state.result).toBeNull();

    // Every puzzle must fail if finished immediately without playing (no free wins).
    const immediate = session.finish();
    expect(immediate.result?.status).toBe('failed');
    expect(immediate.result?.winner).toBe(1);
  }
});

test.each(locales)('locale %s has complete Carnival controls, categories, progress, hints and resolved names', locale => {
  const {hints, categories, ...labels} = carnivalMessages(locale);
  expect(Object.keys(hints)).toHaveLength(puzzleCatalog.length);
  expect(Object.keys(categories).sort()).toEqual([...puzzleCategories].sort());
  for (const text of [...Object.values(labels), ...Object.values(categories), ...Object.values(hints)]) {
    expect(text.trim()).toBeTruthy();
    expect(text).not.toMatch(/⟦|^puzzle\./);
  }
  const progress = carnivalProgressText(3, puzzleCatalog.length, locale);
  expect(progress).toContain('3');
  expect(progress).toContain(String(puzzleCatalog.length));
  expect(progress).not.toMatch(/\{cleared\}|\{total\}/);

  for (const puzzle of puzzleCatalog) {
    expect(localizedName(puzzle.titleKey, puzzle.englishTitle, locale)).toBe(puzzle.englishTitle);
    if (puzzle.originalRewardCardId !== null) {
      expect(localizedName(puzzle.originalRewardCardId, byId.get(puzzle.originalRewardCardId)!.name, locale)).toBeTruthy();
    }
  }
});
