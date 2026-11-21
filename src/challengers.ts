import type {AddedChallengerTactic} from './i18n/challenger-tactics.js';

export interface Challenger {
  readonly id: string;
  readonly name: string;
  readonly regionId: 'kalm' | 'under-junon' | 'crows-nest';
  readonly rewardCardId: number;
  readonly tier: 'beginner' | 'intermediate' | 'advanced';
  readonly tactic: ({readonly key: 'neneTactic' | 'zoganTactic' | 'isabelleTactic'}
    | {readonly addedKey: AddedChallengerTactic}) & {readonly cards: readonly number[]};
  readonly challengeGroupId?: 'moore-twins';
  readonly deck: readonly number[];
}

// Names, regions and reward-card references are summarized in THIRD_PARTY_NOTICES.md.
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
];

export function findChallenger(id: string): Challenger | undefined {
  return challengers.find(challenger => challenger.id === id);
}
