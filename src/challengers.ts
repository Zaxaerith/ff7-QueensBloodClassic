import type {AddedChallengerTactic} from './i18n/challenger-tactics.js';

export type ChallengerRegionId =
  | 'kalm'
  | 'under-junon'
  | 'crows-nest'
  | 'shinra-8'
  | 'costa-del-sol'
  | 'corel'
  | 'gongaga'
  | 'cosmo-canyon'
  | 'nibel';

export interface Challenger {
  readonly id: string;
  readonly name: string;
  readonly regionId: ChallengerRegionId;
  readonly rewardCardId: number;
  readonly tier: 'beginner' | 'intermediate' | 'advanced';
  readonly tactic: ({readonly key: 'neneTactic' | 'zoganTactic' | 'isabelleTactic'}
    | {readonly addedKey: AddedChallengerTactic}) & {readonly cards: readonly number[]};
  readonly challengeGroupId?: 'moore-twins';
  readonly deck: readonly number[];
}

// Names, regions and associated reward cards come from the Rebirth guides
// cited in docs/M8_A1_NPC_REPORT.md and docs/M8_B0_NPC_EVIDENCE_LEDGER.md.
// Tiers, tactics and decks are Classic presets.
export const challengers: readonly Challenger[] = [
  {
    id: 'nene', name: 'Nene', regionId: 'kalm', rewardCardId: 12, tier: 'beginner',
    tactic: {key: 'neneTactic', cards: [12, 13]},
    deck: [1, 1, 7, 7, 8, 8, 10, 12, 12, 13, 13, 18, 4, 11, 14],
  },
  {
    id: 'zogan', name: 'Zogan', regionId: 'under-junon', rewardCardId: 24, tier: 'intermediate',
    tactic: {key: 'zoganTactic', cards: [24, 31, 48]},
    deck: [1, 1, 8, 8, 19, 19, 24, 24, 31, 31, 48, 48, 9, 14, 21],
  },
  {
    id: 'isabelle', name: 'Isabelle', regionId: 'under-junon', rewardCardId: 96, tier: 'advanced',
    tactic: {key: 'isabelleTactic', cards: [98, 96, 1961]},
    deck: [1, 1, 8, 8, 13, 13, 19, 19, 20, 20, 14, 16, 21, 96, 98],
  },
  {
    id: 'ned', name: 'Ned', regionId: 'kalm', rewardCardId: 13, tier: 'beginner',
    tactic: {addedKey: 'ned', cards: [13, 11]},
    deck: [1, 1, 4, 4, 5, 7, 7, 8, 8, 9, 9, 11, 11, 13, 13],
  },
  {
    id: 'zahira', name: 'Zahira', regionId: 'kalm', rewardCardId: 17, tier: 'intermediate',
    tactic: {addedKey: 'zahira', cards: [10, 17]},
    deck: [1, 1, 4, 4, 5, 7, 7, 8, 8, 9, 10, 11, 11, 15, 17],
  },
  {
    id: 'devin-moore', name: 'Devin Moore', regionId: 'under-junon', rewardCardId: 21, tier: 'intermediate',
    challengeGroupId: 'moore-twins', tactic: {addedKey: 'devin', cards: [19, 14, 21]},
    deck: [1, 1, 4, 4, 7, 7, 8, 8, 11, 11, 14, 14, 19, 21, 21],
  },
  {
    id: 'darren-moore', name: 'Darren Moore', regionId: 'under-junon', rewardCardId: 21, tier: 'intermediate',
    challengeGroupId: 'moore-twins', tactic: {addedKey: 'darren', cards: [20, 26, 21]},
    deck: [1, 1, 2, 2, 7, 7, 8, 8, 19, 19, 20, 20, 21, 21, 26],
  },
  {
    id: 'michaela', name: 'Michaela', regionId: 'crows-nest', rewardCardId: 27, tier: 'advanced',
    tactic: {addedKey: 'michaela', cards: [27, 30]},
    deck: [1, 1, 7, 8, 10, 10, 13, 19, 20, 22, 22, 26, 27, 27, 30],
  },
  {
    id: 'neil', name: 'Neil', regionId: 'crows-nest', rewardCardId: 30, tier: 'intermediate',
    tactic: {addedKey: 'neil', cards: [107, 30]},
    deck: [1, 1, 7, 8, 10, 11, 12, 13, 13, 24, 25, 25, 30, 30, 107],
  },
  {
    id: 'cameron', name: 'Cameron', regionId: 'crows-nest', rewardCardId: 113, tier: 'advanced',
    tactic: {addedKey: 'cameron', cards: [20, 113]},
    deck: [1, 1, 2, 2, 15, 15, 17, 17, 20, 20, 22, 22, 26, 26, 113],
  },
  // World Tour expansion (Ch.5 - Ch.11): Shinra-8, Costa del Sol, Corel, Gongaga, Cosmo Canyon, Nibel
  {
    id: 'felix', name: 'Felix', regionId: 'shinra-8', rewardCardId: 31, tier: 'beginner',
    tactic: {addedKey: 'felix', cards: [31, 19, 13]},
    deck: [1, 1, 7, 7, 8, 8, 12, 13, 13, 19, 19, 31, 31, 42, 42],
  },
  {
    id: 'regina', name: 'Regina', regionId: 'shinra-8', rewardCardId: 95, tier: 'advanced',
    tactic: {addedKey: 'regina', cards: [95, 33, 48]},
    deck: [1, 1, 8, 8, 13, 13, 24, 24, 31, 31, 33, 33, 48, 48, 95],
  },
  {
    id: 'maurya', name: 'Maurya', regionId: 'costa-del-sol', rewardCardId: 36, tier: 'intermediate',
    tactic: {addedKey: 'maurya', cards: [36, 10, 56]},
    deck: [1, 1, 7, 7, 10, 10, 13, 13, 32, 32, 36, 36, 51, 56, 56],
  },
  {
    id: 'biff', name: 'Biff', regionId: 'corel', rewardCardId: 41, tier: 'intermediate',
    tactic: {addedKey: 'biff', cards: [41, 35, 51]},
    deck: [1, 1, 7, 8, 20, 20, 30, 30, 35, 35, 39, 41, 41, 51, 51],
  },
  {
    id: 'lidrehl', name: 'Lidrehl', regionId: 'corel', rewardCardId: 76, tier: 'advanced',
    tactic: {addedKey: 'lidrehl', cards: [76, 35, 48]},
    deck: [1, 1, 10, 10, 13, 13, 31, 31, 35, 35, 48, 48, 59, 76, 76],
  },
  {
    id: 'zhijun', name: 'Zhijun', regionId: 'gongaga', rewardCardId: 58, tier: 'intermediate',
    tactic: {addedKey: 'zhijun', cards: [58, 56, 27]},
    deck: [1, 1, 6, 6, 10, 10, 26, 26, 27, 27, 40, 56, 56, 58, 58],
  },
  {
    id: 'regina-rematch', name: 'Regina (Rematch)', regionId: 'gongaga', rewardCardId: 130, tier: 'advanced',
    tactic: {addedKey: 'reginaRematch', cards: [130, 129, 80]},
    deck: [1, 1, 13, 13, 25, 25, 33, 33, 52, 54, 78, 78, 80, 129, 130],
  },
  {
    id: 'bernard', name: 'Bernard', regionId: 'cosmo-canyon', rewardCardId: 123, tier: 'advanced',
    tactic: {addedKey: 'bernard', cards: [123, 65, 114]},
    deck: [1, 1, 11, 11, 13, 13, 21, 21, 65, 65, 69, 69, 76, 114, 123],
  },
  {
    id: 'turner', name: 'Turner', regionId: 'nibel', rewardCardId: 66, tier: 'advanced',
    tactic: {addedKey: 'turner', cards: [66, 75, 136]},
    deck: [1, 1, 13, 13, 26, 26, 28, 28, 66, 66, 72, 72, 75, 75, 136],
  },
  {
    id: 'vincent-gatekeeper', name: 'Vincent', regionId: 'nibel', rewardCardId: 94, tier: 'advanced',
    tactic: {addedKey: 'vincentGatekeeper', cards: [94, 142, 47]},
    deck: [1, 1, 35, 35, 37, 37, 40, 40, 47, 47, 51, 51, 94, 127, 142],
  },
];

export function findChallenger(id: string): Challenger | undefined {
  return challengers.find(challenger => challenger.id === id);
}
