import {expect,test} from 'vitest';
import {starterDeck} from '../src/cards.js';
import {createGame,createPosition,mulligan} from '../src/engine.js';
import {simulateMovePreview} from '../src/move-preview.js';

test('returns null safely for non-playing phases, wrong turn, illegal placements and unstable aura without mutating game',()=>{
  const mulliganGame=createGame([starterDeck,starterDeck],701,0);
  const mulliganBefore=structuredClone(mulliganGame);
  expect(simulateMovePreview(mulliganGame,0,0,0,0)).toBeNull();
  expect(mulliganGame).toEqual(mulliganBefore);

  mulligan(mulliganGame,0,[]);
  mulligan(mulliganGame,1,[]);
  // Wrong player turn.
  expect(simulateMovePreview(mulliganGame,1,0,0,4)).toBeNull();
  // Illegal cell (not owned by player 0).
  expect(simulateMovePreview(mulliganGame,0,0,0,2)).toBeNull();
  // Out-of-bounds handIndex.
  expect(simulateMovePreview(mulliganGame,0,99,0,0)).toBeNull();

  // Finished phase.
  const finished=createPosition({phase:'finished',passes:2,hands:[[1],[]],board:[{row:0,col:0,owner:0,pawns:1}]});
  expect(simulateMovePreview(finished,0,0,0,0)).toBeNull();

  // UNSTABLE_AURA is caught cleanly and returns null without throwing or mutating.
  const unstable=createPosition({
    turn:1,hands:[[],[66]],
    board:[
      {owner:0,row:0,col:2,cardId:66,permanentDelta:-1},
      {owner:1,row:2,col:2,cardId:13},
      {owner:1,row:1,col:2,pawns:2},
    ],
  });
  const unstableBefore=structuredClone(unstable);
  expect(simulateMovePreview(unstable,1,0,1,2)).toBeNull();
  expect(unstable).toEqual(unstableBefore);
});

test('previews exact row deltas, score swing and existing-card aura buffs without including the newly placed card',()=>{
  const game=createPosition({
    turn:0,hands:[[13],[]],
    board:[
      {row:0,col:0,owner:0,cardId:7}, // power 2
      {row:0,col:4,owner:1,cardId:20}, // power 3 (enemy currently wins row 0: 3 vs 2)
      {row:1,col:0,owner:0,pawns:1},
    ],
  });
  const before=structuredClone(game);
  const preview=simulateMovePreview(game,0,0,1,0);

  expect(game).toEqual(before); // Original game strictly untouched!
  expect(preview).not.toBeNull();
  // Before: row 0 is [2,3] (scores [0,3]), row 1 is [0,0].
  // After placing #13 Crystalline Crab (power 1, aura +2 up) at (1,0):
  // row 0 becomes [4,3] (P0 flips row 0!), row 1 becomes [1,0] -> scores [5,0]!
  expect(preview!.rowsBefore).toEqual([[2,3],[0,0],[0,0]]);
  expect(preview!.rowsAfter).toEqual([[4,3],[1,0],[0,0]]);
  expect(preview!.rowDeltas).toEqual([[2,0],[1,0],[0,0]]);
  expect(preview!.scoresBefore).toEqual([0,3]);
  expect(preview!.scoresAfter).toEqual([5,0]);
  expect(preview!.scoreDelta).toEqual([5,-3]);
  expect(preview!.destroyedCells).toEqual([]);
  // Only the existing card at (0,0) appears in changedCells — NOT the newly played Crab at (1,0).
  expect(preview!.changedCells).toEqual([
    {row:0,col:0,owner:0,before:2,after:4,delta:2},
  ]);
  expect(preview!.spawnedCount).toBe(0);
});

test('previews direct and chain Bomb destructions plus Tonberry King observer growth',()=>{
  const game=createPosition({
    turn:0,hands:[[20],[]],
    board:[
      {row:1,col:0,owner:0,pawns:1},
      {row:1,col:1,owner:1,cardId:41}, // Bomb (power 2, onDestroy -4 adjacent)
      {row:1,col:2,owner:1,cardId:41}, // Second Bomb -> chained explosion!
      {row:0,col:4,owner:1,cardId:35}, // Tonberry King (+2 per destroyed ally -> +4!)
    ],
  });
  const before=structuredClone(game);
  const preview=simulateMovePreview(game,0,0,1,0);

  expect(game).toEqual(before);
  expect(preview).not.toBeNull();
  // #20 Archdragon at (1,0) kills Bomb@(1,1) -> Bomb@(1,1) kills Archdragon@(1,0) & Bomb@(1,2).
  expect(preview!.destroyedCells).toEqual(expect.arrayContaining([
    {row:1,col:1,owner:1,cardId:41},
    {row:1,col:0,owner:0,cardId:20},
    {row:1,col:2,owner:1,cardId:41},
  ]));
  expect(preview!.destroyedCells).toHaveLength(3);
  // Tonberry King at (0,4) grew from 1 -> 5 (+4) from two destroyed allies.
  expect(preview!.changedCells).toEqual([
    {row:0,col:4,owner:1,before:1,after:5,delta:4},
  ]);
});

test('previews replacement destruction and counts both hand-generated and board-spawned tokens',()=>{
  // Replacement (#51 Insectoid Chimera) destroys old card at (1,0) and is excluded from changedCells.
  const replaceGame=createPosition({
    turn:0,hands:[[51],[]],
    board:[{row:1,col:0,owner:0,cardId:40}], // Heatseeker (onDestroy adds 1040 to hand!)
  });
  const replacePreview=simulateMovePreview(replaceGame,0,0,1,0)!;
  expect(replacePreview.destroyedCells).toEqual([{row:1,col:0,owner:0,cardId:40}]);
  expect(replacePreview.changedCells).toEqual([]);
  expect(replacePreview.spawnedCount).toBe(1);

  // Board spawn (#96 Shiva) spawns Diamond Dust on 2 empty allied tiles.
  const spawnGame=createPosition({
    turn:0,hands:[[96],[]],
    board:[
      {row:0,col:0,owner:0,pawns:2},
      {row:1,col:0,owner:0,pawns:1},
      {row:2,col:0,owner:0,pawns:3},
    ],
  });
  const spawnPreview=simulateMovePreview(spawnGame,0,0,0,0)!;
  expect(spawnPreview.spawnedCount).toBe(2);
  expect(spawnPreview.scoresAfter).toEqual([11,0]); // 3 (Shiva) + 2 (rank-1 Dust) + 6 (rank-3 Dust)

  // Multi-card hand generation (#110 Moogle Trio generates 2 tokens).
  const trioGame=createPosition({
    turn:0,hands:[[110],[]],
    board:[{row:1,col:0,owner:0,pawns:2}],
  });
  expect(simulateMovePreview(trioGame,0,0,1,0)!.spawnedCount).toBe(2);
});
