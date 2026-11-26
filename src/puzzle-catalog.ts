import {TURN_DRAW_RULES_VERSION, type Player} from './engine.js';
import type {FixedHandPosition, PuzzleCategory, PuzzleDefinition, PuzzleId} from './puzzle-data.js';

type Cell = `${'A' | 'B' | 'C'}${1 | 2 | 3 | 4 | 5}`;
const coords = (cell: Cell) => ({row: 'ABC'.indexOf(cell[0]), col: Number(cell[1]) - 1});
const pawn = (cell: Cell, pawns: number, owner: Player = 0) => ({...coords(cell), owner, pawns});
const card = (cell: Cell, cardId: number, owner: Player = 1) => ({...coords(cell), owner, cardId});

export interface CarnivalPuzzle<Id extends PuzzleId = PuzzleId> extends PuzzleDefinition {
  readonly id: Id;
  readonly englishTitle: string;
  readonly originalRewardCardId: number | null;
}

function candidate<Id extends PuzzleId>(
  id: Id,
  englishTitle: string,
  chapter: 6 | 12,
  category: PuzzleCategory,
  originalRewardCardId: number | null,
  initial: FixedHandPosition,
  screenshot: string,
  note: string,
): CarnivalPuzzle<Id> {
  return {
    id, englishTitle, originalRewardCardId, revision: 1, chapter, category,
    titleKey: `puzzle.${id}.title` as PuzzleDefinition['titleKey'], rulesVersion: TURN_DRAW_RULES_VERSION,
    actionMode: 'fixed-hand-solo', winCondition: 'score-win', initial: {seed: 1, ...initial},
    evidence: {initial: {status: 'classic-candidate', sources: [screenshot], note}},
  };
}

// Menu order follows docs/M9_P0_CARD_CARNIVAL_AUDIT.md.
// First three P1 fixtures remain unchanged; puzzles 4–22 are engine-verified classic candidates.
export const puzzleCatalog = [
  // --- Chapter 6 · Easy (3) — P1 baseline unchanged ---
  candidate('cc-three-card-stud', 'Three-Card Stud', 6, 'easy', 23, {
    hands: [[15, 23, 14], []],
    board: [pawn('A1', 1), pawn('A3', 1), pawn('C3', 1), card('A5', 1), card('B5', 7), card('C5', 16)],
  }, 'https://cdn.mos.cms.futurecdn.net/SW9d5ZU6kqUctZ5wq6Darn.jpg',
  'B2 is neutral in this candidate. The guide overlay obscures A1, B2 and C3; exact opening ranks still need a clean frame.'),

  candidate('cc-go-for-choco-broke', 'Go for Choco-Broke', 6, 'easy', 109, {
    hands: [[107, 108, 109], []],
    board: [pawn('C1', 3), card('B2', 111, 0), card('A4', 21), card('A5', 16), card('B4', 2), card('B5', 11), card('C4', 21), card('C5', 16)],
  }, 'https://cdn.mos.cms.futurecdn.net/Cn2XqCDQvJC4uv5vV3BMHH.jpg',
  'C1 is the only starting allied pawn tile in this candidate. Glow and annotations cover A1, A3, C2 and C3 in the guide image.'),

  candidate('cc-mischief-making-moogles', 'Mischief-Making Moogles', 6, 'easy', 110, {
    hands: [[110, 8, 23], []],
    board: [pawn('B1', 2), pawn('B2', 2), card('A3', 4), card('A4', 12), card('A5', 11), card('B4', 13), card('B5', 14), card('C3', 4), card('C5', 8)],
  }, 'https://cdn.mos.cms.futurecdn.net/TXqjLMmTrapaZeZWHKQQ9H.jpg',
  'B2 starts with two pawns in this candidate. The second pawn is obscured. Mage and Bard are generated during play.'),

  // --- Chapter 6 · Advanced (3) ---
  candidate('cc-spears-and-needles', 'Spears and Needles', 6, 'advanced', 31, {
    hands: [[12, 31, 31, 14], []],
    board: [
      pawn('A1', 1), pawn('A2', 1),
      card('A4', 2), card('A5', 2),
      pawn('B4', 2, 1), card('B5', 4),
      card('C1', 1), card('C2', 2), pawn('C3', 2, 1), pawn('C4', 2, 1), card('C5', 2),
    ],
  }, 'https://cdn.mos.cms.futurecdn.net/HLK5Tp7kp9AXU83s3GUUCP.jpg',
  'Confirmed from screenshot: A1 p1, red #002@A4/A5/C2/C5, #004@B5, #001@C1, red p2 at B4/C3/C4, initial rows 0/0/0 : 6/2/7. Reconstructed: obscured A2 set to blue p1 for Cactuar opening.'),

  candidate('cc-sea-devil-by-night', 'Sea Devil by Night', 6, 'advanced', 32, {
    hands: [[1, 10, 10, 32, 32], []],
    board: [
      pawn('B2', 3), pawn('C1', 3),
      card('A1', 7), card('A2', 7), card('A3', 7), card('A4', 7), card('A5', 7),
      card('B3', 27), card('B4', 7), card('B5', 7),
      card('C4', 7), card('C5', 7),
    ],
  }, 'https://cdn.mos.cms.futurecdn.net/6KE3ZqWSLU7iPSNgbHyh4P.jpg',
  'Confirmed from screenshot: red #027@B3, #007@A1–A5/B4/B5/C4/C5, initial rows 0/0/0 : 8/5/4. Reconstructed: obscured B2/C1 pawn ranks set to blue p3 so Sea Devils enter first and Security Officer @ C3 reclaims C2.'),

  candidate('cc-a-kingly-clash', 'A Kingly Clash', 6, 'advanced', 35, {
    hands: [[15, 15, 35, 27, 22, 22], []],
    board: [
      pawn('A2', 2), card('A3', 30, 0), card('A4', 11), card('A5', 14),
      card('B2', 11, 0), card('B4', 21), card('B5', 114),
      pawn('C2', 2), card('C3', 30, 0), card('C4', 11), card('C5', 14),
    ],
  }, 'https://cdn.mos.cms.futurecdn.net/vX7WvN7MRkEgC65sUdVzxN.jpg',
  'Confirmed from screenshot: blue #030@A3/C3, #011@B2, red #011@A4/C4, #014@A5/C5, #021@B4, #114@B5, initial rows 3/4/3 : 7/13/7. Reconstructed: A2/C2 set to blue p2; Mindflayer B1 claims A1/C1 before Deathwheels for 16:14.'),

  // --- Chapter 6 · Skill Drill (1) ---
  candidate('cc-power-down-practice', 'Power-Down Practice', 6, 'skill-drill', null, {
    hands: [[20, 20, 14], []],
    board: [
      pawn('B2', 1), pawn('C2', 1),
      card('A5', 11),
      card('B3', 1), card('B4', 1),
      card('C3', 13), card('C4', 13), card('C5', 11),
    ],
  }, 'https://cdn.mos.cms.futurecdn.net/ZN3u7begsfFL4WYHf4gorN.jpg',
  'Confirmed from screenshot: red slots A5/B3/B4/C3–C5 with #013@C3/C4, initial rows 0/0/0 : 4/6/6. Reconstructed: obscured B2/C2 set to blue p1; unconfirmed red slots fitted with #011@A5/C5 and #001@B3/B4.'),

  // --- Chapter 12 · Advanced (2) ---
  candidate('cc-one-shot-one-kill', 'One Shot, One Kill', 12, 'advanced', 119, {
    hands: [[119, 28, 37, 41, 41], []],
    board: [
      pawn('A4', 1), pawn('B1', 3), card('B2', 7, 0), pawn('B5', 2), pawn('C3', 1), pawn('C4', 1),
      card('A3', 41), card('A5', 114),
      card('B3', 62), card('B4', 111),
      card('C5', 126),
    ],
  }, 'https://gamerpillar.com/wp-content/smush-webp/2024/03/1-13-1024x576.jpg.webp',
  'Confirmed from screenshot: red slots A3/A5/B3/B4/C5, Bomb overlay on B5, blue pawns A4/C4, initial rows 0/2/0 : 14/7/8. Reconstructed: blue #007@B2 + pawns A4/C3/C4 p1, B5 p2, B1 p3; red #041@A3, #114@A5, #062@B3, #111@B4, #126@C5 for Dyne chain-wipe.'),

  candidate('cc-curse-of-the-gi', 'Curse of the Gi', 12, 'advanced', 123, {
    hands: [[2, 13, 63, 36, 59, 62, 123], []],
    board: [
      card('A1', 2, 0), pawn('A2', 2), pawn('B1', 2), pawn('C1', 1),
      card('A3', 114), card('A4', 21), card('A5', 126),
      card('B3', 114), card('B4', 21), card('B5', 126),
      card('C3', 114), card('C4', 21), card('C5', 126),
    ],
  }, 'https://gamerpillar.com/wp-content/smush-webp/2024/03/2-14-1024x576.jpg.webp',
  'Confirmed from screenshot: red occupies A3–A5/B3–B5/C3–C5 with 19/19/19, blue A1 preplaced (3/0/0), A2/B1 >= p2, C1 blue pawn. Reconstructed: blue #002@A1, A2/B1 p2, C1 p1; red columns 3–5 filled with #114/#021/#126 (19 per lane).'),

  // --- Chapter 12 · Party Collector's Cards (9) ---
  candidate('cc-collectors-cloud', "Collector's Card: Cloud", 12, 'collection', 86, {
    hands: [[1, 86, 143], []],
    board: [
      card('A1', 10, 0), card('A2', 63, 0), card('A3', 10, 0),
      pawn('B2', 1), pawn('B4', 3),
      card('C1', 7, 0), pawn('C2', 1),
      card('A4', 37), card('A5', 2),
      card('B1', 144), card('B3', 4), card('B5', 126),
      card('C3', 7), card('C4', 114), card('C5', 1),
    ],
  }, 'https://gamerpillar.com/wp-content/smush-webp/2024/03/3-15-1024x576.jpg.webp',
  'Confirmed from screenshot: blue #010@A1/A3, #063@A2, red slots A4/A5/B1/B3/B5/C3–C5, red rows 4/12/11, blue C=2. Reconstructed: #007@C1, B2/C2 p1, B4 p3, red #037@A4/#144@B1/#114@C4 so Sephiroth triggers Bloatfloat -> Desert Sahagin -> Cloud threshold 7 (blue A opens at 7 vs screenshot 5 due to B1 aura).'),

  candidate('cc-collectors-barret', "Collector's Card: Barret", 12, 'collection', 87, {
    hands: [[6, 36, 41, 51, 87], []],
    board: [
      pawn('A1', 1), pawn('A2', 2), pawn('C1', 1), pawn('C2', 1),
      card('A3', 11), card('A4', 7), card('A5', 1),
      card('B3', 7), card('B4', 2), card('B5', 114),
      card('C3', 11), card('C4', 7), card('C5', 1),
    ],
  }, 'https://gamerpillar.com/wp-content/smush-webp/2024/03/5-7-1024x576.jpg.webp',
  'Confirmed from screenshot: blue A1/C1 p1, A2 >= p2, red cols 3–5 with #114@B5, initial rows 0/0/0 : 7/13/7. Reconstructed: A2 p2, C2 p1; unconfirmed red slots fitted with #011/#007/#001 (A/C) and #007/#002 (B3/B4).'),

  candidate('cc-collectors-tifa', "Collector's Card: Tifa", 12, 'collection', 88, {
    hands: [[12, 22, 31, 88, 59], []],
    board: [
      pawn('A1', 1), pawn('B1', 1), pawn('B2', 1), pawn('C1', 1),
      card('A2', 114), card('A3', 21), card('A4', 89), card('A5', 2),
      card('B5', 53),
      card('C5', 53),
    ],
  }, 'https://gamerpillar.com/wp-content/smush-webp/2024/03/6-5-1024x576.jpg.webp',
  'Confirmed from screenshot: blue B1/C1 p1, red A2–A5/B5/C5 with +10 lane bonuses on B/C (#053@B5/C5), red rows 23/5/5 (screenshot blue 1/0/0 reflects Cactuar hover at A1). Reconstructed: A1/B2 p1; red A2–A5 fitted with #114/#021/#089/#002 (total 23).'),

  candidate('cc-collectors-aerith', "Collector's Card: Aerith", 12, 'collection', 89, {
    hands: [[10, 75, 89, 102], []],
    board: [
      pawn('A2', 2), pawn('A3', 2), pawn('C2', 1),
      card('A1', 2), card('A4', 21), card('A5', 11),
      card('B1', 1), card('B2', 89), card('B3', 1), card('B4', 21), card('B5', 126),
      card('C1', 11), card('C3', 89), card('C4', 11), card('C5', 11),
    ],
  }, 'https://gamerpillar.com/wp-content/smush-webp/2024/03/7-6-1024x576.jpg.webp',
  'Confirmed from screenshot: red occupies A1/A4/A5/B1–B5/C1/C3–C5, red rows 12/20/16 (screenshot blue 1/0/0 reflects Aerith hover at A2). Reconstructed: A2/A3 p2, C2 p1; red slots fitted with exact 12/20/16 powers including #089@B2/C3 for Adjudicator scaling.'),

  candidate('cc-collectors-red-xiii', "Collector's Card: Red XIII", 12, 'collection', 90, {
    hands: [[36, 65, 65, 90, 67], []],
    board: [
      pawn('B2', 1), pawn('C2', 1), pawn('C3', 1),
      card('A1', 7), card('A3', 11), card('A4', 2), card('A5', 53),
      card('B1', 7), card('B4', 66), card('B5', 135),
      card('C1', 7), card('C4', 13), card('C5', 11),
    ],
  }, 'https://gamerpillar.com/wp-content/smush-webp/2024/03/8-4-1024x576.jpg.webp',
  'Confirmed from screenshot: blue B2/C2 pawns, red A1/A3–A5/B1/B4/B5/C1/C4/C5, +10 lane bonuses on A/B, initial rows 0/0/0 : 18/9/11. Reconstructed: B2/C2/C3 p1; red uses #053@A5, #135@B5, #066 Two Face@B4 + #013@C4 to match 18/9/11 and Two Face flip.'),

  candidate('cc-collectors-yuffie', "Collector's Card: Yuffie", 12, 'collection', 91, {
    hands: [[58, 58, 13, 31, 41, 91], []],
    board: [
      pawn('A3', 1), pawn('B1', 1), pawn('C1', 1), pawn('C3', 1),
      card('A2', 114), card('A4', 21), card('A5', 11),
      card('B2', 114), card('B4', 114), card('B5', 2),
      card('C2', 126), card('C4', 126), card('C5', 7),
    ],
  }, 'https://gamerpillar.com/wp-content/smush-webp/2024/03/9-4-1024x576.jpg.webp',
  'Confirmed from screenshot: blue B1 p1, red cols 2/4/5 in all lanes, initial rows 0/0/0 : 17/19/14. Reconstructed: A3/C1/C3 p1; red cols 2/4/5 fitted with exact 17/19/14 powers for the Yuffie + Bomb -10 blast.'),

  candidate('cc-collectors-cait-sith', "Collector's Card: Cait Sith", 12, 'collection', 92, {
    hands: [[92, 135, 136, 141, 139], []],
    board: [
      pawn('A1', 1), pawn('B1', 1), pawn('C1', 1), pawn('C2', 1),
      card('A3', 7), card('A4', 7), card('A5', 7),
      card('B3', 114), card('B4', 114), card('B5', 114),
      card('C3', 114), card('C4', 13), card('C5', 53),
    ],
  }, 'https://gamerpillar.com/wp-content/smush-webp/2024/03/10-4-1024x576.jpg.webp',
  'Confirmed from screenshot: red cols 3–5 with +10 lane bonus on C (#053@C5), initial rows 0/0/0 : 6/26/14. Reconstructed: obscured blue A1/B1/C1/C2 p1; red slots fitted with exact 6/26/14 powers including #013@C4 buffing B4.'),

  candidate('cc-collectors-cid', "Collector's Card: Cid", 12, 'collection', 93, {
    hands: [[93, 41, 138, 51], []],
    board: [
      pawn('A1', 1), pawn('B1', 1), pawn('C1', 1),
      card('A3', 2), pawn('A4', 3, 1), card('A5', 35),
      card('B2', 15), card('B3', 7), pawn('B4', 2, 1), card('B5', 62),
      card('C3', 2), pawn('C4', 3, 1), card('C5', 35),
    ],
  }, 'https://gamerpillar.com/wp-content/smush-webp/2024/03/11-5-1024x576.jpg.webp',
  'Confirmed from screenshot: blue B1 p1, A1/C1 pawns, red A4/C4 p3, red #002@A3/C3, #035@A5/C5, #015@B2, #007@B3, #062@B5, initial rows 0/0/0 : 4/10/4. Reconstructed: A1/C1 blue p1 and B4 red p2 so Skywheel captures B4 at rank 2 for Bomb.'),

  candidate('cc-collectors-vincent', "Collector's Card: Vincent", 12, 'collection', 94, {
    hands: [[74, 72, 72, 94], []],
    board: [
      pawn('B2', 1),
      card('A3', 21), card('A4', 21), card('A5', 2),
      card('B3', 115), card('B4', 41), card('B5', 21),
      card('C3', 126), card('C4', 21), card('C5', 11),
    ],
  }, 'https://gamerpillar.com/wp-content/smush-webp/2024/03/12-3-1024x576.jpg.webp',
  'Confirmed from screenshot: blue B2 pawn, red cols 3–5, initial rows 0/0/0 : 11/8/13. Reconstructed: B2 p1; red includes #115@B3 (allowing first Black Bat to trigger Vincent and both Bats to raise B2 to p2 for Galian Beast) and #041@B4.'),

  // --- Chapter 12 · Skill Drills (4) ---
  candidate('cc-chain-reactions', 'Chain Reactions', 12, 'skill-drill', null, {
    hands: [[12, 50, 48], []],
    board: [
      pawn('A1', 1), pawn('A2', 1),
      card('B1', 1, 0), card('B2', 116, 0),
      card('C1', 1, 0),
      card('A4', 11), card('A5', 11),
      card('B3', 89), card('B4', 21), card('B5', 126),
      card('C3', 13), card('C4', 11), card('C5', 2),
    ],
  }, 'https://gamerpillar.com/wp-content/smush-webp/2024/03/20-3-1024x576.jpg.webp',
  'Confirmed from screenshot: blue preplaced B1/B2/C1, red A4/A5/B3–B5/C3–C5, initial rows 0/6/1 : 8/17/8. Reconstructed: obscured A1/A2 p1, blue #001@B1/C1 + #116@B2 (6/1), red fitted to exact 8/17/8 for the Amphidex -> Gagighandi + Grasptropod chain.'),

  candidate('cc-major-power-outage', 'Major Power Outage', 12, 'skill-drill', null, {
    hands: [[63, 61, 62, 74], []],
    board: [
      pawn('A1', 1), pawn('A2', 1), pawn('C2', 1),
      card('B1', 8, 0), card('C1', 8, 0),
      card('A3', 11), card('A4', 2), card('A5', 2),
      card('B3', 11), card('B4', 2), card('B5', 2),
      card('C3', 21), card('C4', 11), card('C5', 11),
    ],
  }, 'https://gamerpillar.com/wp-content/smush-webp/2024/03/21-4-1024x576.jpg.webp',
  'Confirmed from screenshot: blue #008@B1/C1, red A3–A5/B3–B5/C3–C5, initial rows 0/2/2 : 10/10/13. Reconstructed: A1/A2/C2 blue p1; red cols 3–5 fitted to exact 10/10/13 powers.'),

  candidate('cc-back-to-replace-ics', 'Back to Replace-ics', 12, 'skill-drill', null, {
    hands: [[14, 54, 52], []],
    board: [
      card('A2', 7, 0),
      card('B1', 113, 0), pawn('B2', 1),
      card('C2', 36, 0), card('C3', 1, 0),
      card('A3', 11), card('A4', 2), card('A5', 2),
      card('B3', 21), card('B4', 11), card('B5', 11),
      card('C4', 2), card('C5', 2),
    ],
  }, 'https://gamerpillar.com/wp-content/smush-webp/2024/03/22-4-1024x576.jpg.webp',
  'Confirmed from screenshot: blue #007@A2, B1 preplaced (6), #036@C2, #001@C3, red A3–A5/B3–B5/C4/C5, initial rows 2/6/2 : 10/13/6. Reconstructed: B1 fitted as #113 Midgardsormr (6), B2 blue p1, red fitted to exact 10/13/6.'),

  candidate('cc-replacement-test', 'Replacement Test', 12, 'skill-drill', null, {
    hands: [[12, 31, 59], []],
    board: [
      pawn('A1', 1), pawn('B2', 1),
      card('B3', 10, 0),
      card('C2', 37, 0),
      card('A3', 7), card('A4', 7), card('A5', 7),
      card('B4', 2), card('B5', 7),
      card('C4', 11), card('C5', 2),
    ],
  }, 'https://gamerpillar.com/wp-content/smush-webp/2024/03/23-4-1024x576.jpg.webp',
  'Confirmed from screenshot: blue A1 p1, #010@B3, #037@C2, red A3–A5/B4/B5/C4/C5, initial rows 0/1/1 : 6/5/7. Reconstructed: obscured B2 set to blue p1; red slots fitted to exact 6/5/7 powers.'),
] as const;

export type CarnivalPuzzleId = typeof puzzleCatalog[number]['id'];
