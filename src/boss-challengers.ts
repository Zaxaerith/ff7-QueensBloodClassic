import {
  createGame,TURN_DRAW_RULES_VERSION,
  type Player,type Position,type PositionTile,type RulesVersion,
} from './engine.js';

export const SHADOWBLOOD_QUEEN_ID='shadowblood-queen' as const;
export type BossChallengerId=typeof SHADOWBLOOD_QUEEN_ID;

export interface BossChallenger {
  readonly id:BossChallengerId;
  readonly name:string;
  readonly rewardCardId:number;
  readonly tier:'boss';
  readonly strategy:'queen';
  readonly deck:readonly number[];
  readonly openingBoard:readonly PositionTile[];
  readonly battleBackgroundId:'shadowblood-queen';
  readonly i18nHintKeys:readonly string[];
}

/** Classic-candidate preset for the Chapter 12 Shadowblood Queen boss encounter.
 * Evidence boundaries and derivations are documented in docs/M12_SHADOWBLOOD_QUEEN_EVIDENCE.md. */
export const shadowbloodQueen:BossChallenger={
  id:SHADOWBLOOD_QUEEN_ID,
  name:'Shadowblood Queen',
  rewardCardId:145,
  tier:'boss',
  strategy:'queen',
  deck:[72,72,83,83,26,26,74,74,27,27,46,62,67,80,115],
  openingBoard:[
    {row:0,col:0,owner:0,pawns:1},
    {row:1,col:0,owner:0,pawns:1},
    {row:2,col:0,owner:0,pawns:1},
    {row:1,col:4,owner:1,cardId:145},
    {row:0,col:4,owner:1,pawns:2},
    {row:2,col:4,owner:1,pawns:2},
    {row:0,col:3,owner:1,pawns:1},
    {row:2,col:3,owner:1,pawns:1},
  ],
  battleBackgroundId:'shadowblood-queen',
  i18nHintKeys:[
    'bossChallengeSection',
    'shadowbloodQueenName',
    'shadowbloodQueenRuleSummary',
    'shadowbloodQueenTactic',
    'bossBattleBanner',
  ],
};

export const bossChallengers:readonly BossChallenger[]=[shadowbloodQueen];

export function findBossChallenger(id?:string):BossChallenger|undefined {
  return bossChallengers.find(boss=>boss.id===id);
}

/** Validate both 15-card decks and deal opening hands deterministically using the standard
 * engine shuffler, then attach the Boss's preset opening board as a Replay v2 Position. */
export function createBossOpeningPosition(
  boss:BossChallenger,
  decks:[readonly number[],readonly number[]],
  seed:number,
  firstPlayer:Player,
  rules:RulesVersion=TURN_DRAW_RULES_VERSION,
):Position {
  const dealt=createGame(decks,seed,firstPlayer,rules);
  return {
    seed,
    phase:'mulligan',
    turn:firstPlayer,
    passes:0,
    hands:[dealt.hands[0],dealt.hands[1]],
    decks:[dealt.decks[0],dealt.decks[1]],
    discard:[[],[]],
    board:structuredClone([...boss.openingBoard]),
  };
}
