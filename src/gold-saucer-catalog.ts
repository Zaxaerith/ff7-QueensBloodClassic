import {shadowbloodQueen,type BossChallengerId} from './boss-challengers.js';
import type {BotDifficulty} from './bot.js';
import type {BotStrategy} from './bot-strategy.js';
import type {PositionTile} from './engine.js';

export type GoldSaucerChallengeId=
  | 'gs-high-ground'
  | 'gs-outflanked'
  | 'gs-mais-here'
  | 'gs-luxury-real-estate'
  | 'gs-behind-enemy-lines'
  | 'gs-chadley-callous';
export type SurvivalChallengeId=
  | 'survival-boot-camp'
  | 'survival-extreme'
  | 'survival-nightmare';

export interface GoldSaucerChallenge {
  readonly id:GoldSaucerChallengeId;
  readonly name:string;
  readonly rewardCardId:number;
  readonly gimmick:'terrain'|'formation'|'support-hand';
  readonly evidenceStatus:'classic-candidate';
  readonly opponentName:string;
  readonly opponentStrategy:BotStrategy;
  readonly defaultDifficulty:BotDifficulty;
  readonly opponentDeck:readonly number[];
  readonly openingBoard:readonly PositionTile[];
  readonly bonusPlayerHand?:readonly number[];
  readonly noTurnDraw?:boolean;
  readonly summary:string;
}

export interface SurvivalRoundSpec {
  readonly round:number;
  readonly opponentName:string;
  readonly opponentStrategy:BotStrategy;
  readonly difficulty:BotDifficulty;
  readonly opponentDeck:readonly number[];
  /** Number of cards drawn from the player's remaining shared deck at round start. */
  readonly drawAtStart:number;
  /** When true, neither player draws on turn handoff during this round. */
  readonly noTurnDraw:boolean;
  /** Optional bonus-draw (treasure) lane: winning this lane grants +1 extra draw when advancing to the next round. */
  readonly bonusDrawRow?:0|1|2;
  readonly bossId?:BossChallengerId|(string&{});
  readonly battleBackgroundId?:'shadowblood-queen'|(string&{});
  readonly openingBoard?:readonly PositionTile[];
}

export interface SurvivalTargets {
  readonly bronze:number;
  readonly silver:number;
  readonly gold:number;
}

export interface SurvivalChallenge {
  readonly id:SurvivalChallengeId;
  readonly name:string;
  readonly rewardCardId:number;
  readonly evidenceStatus:'classic-candidate';
  readonly targets:SurvivalTargets;
  readonly rounds:readonly SurvivalRoundSpec[];
  readonly summary:string;
}

export const goldSaucerChallenges:readonly GoldSaucerChallenge[]=[
  {
    id:'gs-high-ground',
    name:'High Ground',
    rewardCardId:121,
    gimmick:'terrain',
    evidenceStatus:'classic-candidate',
    opponentName:'Gold Saucer Challenger · High Ground',
    opponentStrategy:'darren-moore',
    defaultDifficulty:'normal',
    opponentDeck:[1,1,2,2,7,7,8,8,11,11,20,20,21,21,121],
    openingBoard:[
      {row:0,col:0,owner:0,pawns:1},
      {row:1,col:0,owner:0,pawns:1},
      {row:2,col:0,owner:0,pawns:1},
      {row:0,col:2,owner:null,tileBonus:2},
      {row:1,col:2,owner:null,tileBonus:2},
      {row:2,col:2,owner:null,tileBonus:2},
      {row:0,col:4,owner:1,pawns:1},
      {row:1,col:4,owner:1,pawns:1},
      {row:2,col:4,owner:1,pawns:1},
    ],
    summary:'Center column tiles grant +2 power to any card standing on them.',
  },
  {
    id:'gs-outflanked',
    name:'Outflanked',
    rewardCardId:122,
    gimmick:'formation',
    evidenceStatus:'classic-candidate',
    opponentName:'Gold Saucer Challenger · Outflanked',
    opponentStrategy:'devin-moore',
    defaultDifficulty:'normal',
    opponentDeck:[1,1,4,4,7,7,8,8,14,14,19,19,21,21,122],
    openingBoard:[
      {row:0,col:0,owner:0,pawns:1},
      {row:1,col:1,owner:0,pawns:2},
      {row:1,col:2,owner:0,pawns:1},
      {row:2,col:0,owner:0,pawns:1},
      {row:0,col:3,owner:1,pawns:2},
      {row:0,col:4,owner:1,cardId:7},
      {row:1,col:4,owner:1,pawns:1},
      {row:2,col:3,owner:1,pawns:2},
      {row:2,col:4,owner:1,cardId:8},
    ],
    summary:'Start wedged into the center lane while the opponent flanks both wings.',
  },
  {
    id:'gs-mais-here',
    name:"Don't Fear, MAI's Here",
    rewardCardId:120,
    gimmick:'support-hand',
    evidenceStatus:'classic-candidate',
    opponentName:'Gold Saucer Challenger · MAI Support',
    opponentStrategy:'cameron',
    defaultDifficulty:'hard',
    opponentDeck:[1,1,7,8,20,20,22,22,26,26,35,35,43,43,120],
    openingBoard:[
      {row:0,col:0,owner:0,pawns:1},
      {row:1,col:0,owner:0,pawns:1},
      {row:2,col:0,owner:0,pawns:1},
      {row:0,col:4,owner:1,pawns:1},
      {row:1,col:4,owner:1,pawns:1},
      {row:2,col:4,owner:1,pawns:1},
    ],
    bonusPlayerHand:[1010,1092],
    summary:'Start with two extra support cards (Mandragora Minion & Moogle) against a destroy-synergy deck.',
  },
  {
    id:'gs-luxury-real-estate',
    name:'Luxury Real Estate',
    rewardCardId:114,
    gimmick:'formation',
    evidenceStatus:'classic-candidate',
    opponentName:'Gold Saucer Challenger · Luxury Real Estate',
    opponentStrategy:'zahira',
    defaultDifficulty:'normal',
    opponentDeck:[1,1,2,2,4,4,11,11,14,14,17,17,21,21,114],
    openingBoard:[
      {row:0,col:0,owner:0,pawns:1},
      {row:0,col:1,owner:0,pawns:2},
      {row:1,col:0,owner:0,pawns:2},
      {row:1,col:1,owner:0,pawns:3},
      {row:2,col:0,owner:0,pawns:1},
      {row:0,col:4,owner:1,pawns:1},
      {row:1,col:3,owner:1,pawns:3},
      {row:1,col:4,owner:1,pawns:2},
      {row:2,col:3,owner:1,pawns:2},
      {row:2,col:4,owner:1,pawns:1},
    ],
    summary:'Contested high-rank pawn tiles along the central axis invite immediate rank 2-3 heavyweights.',
  },
  {
    id:'gs-behind-enemy-lines',
    name:'Behind Enemy Lines',
    rewardCardId:117,
    gimmick:'formation',
    evidenceStatus:'classic-candidate',
    opponentName:'Gold Saucer Challenger · Behind Enemy Lines',
    opponentStrategy:'michaela',
    defaultDifficulty:'hard',
    opponentDeck:[1,1,7,7,8,8,19,19,20,20,22,22,26,26,117],
    openingBoard:[
      {row:0,col:0,owner:0,pawns:1},
      {row:1,col:0,owner:0,pawns:1},
      {row:2,col:0,owner:0,pawns:1},
      {row:1,col:3,owner:0,pawns:2},
      {row:0,col:1,owner:1,pawns:1},
      {row:2,col:1,owner:1,pawns:1},
      {row:0,col:4,owner:1,pawns:1},
      {row:1,col:4,owner:1,pawns:1},
      {row:2,col:4,owner:1,pawns:1},
    ],
    summary:'Interlaced footholds behind enemy lines create two-way pincer pressure and wide debuff traps.',
  },
  {
    id:'gs-chadley-callous',
    name:'Chadley the Callous',
    rewardCardId:118,
    gimmick:'support-hand',
    evidenceStatus:'classic-candidate',
    opponentName:'Gold Saucer Challenger · Chadley the Callous',
    opponentStrategy:'cameron',
    defaultDifficulty:'hard',
    opponentDeck:[1,1,7,8,20,20,22,22,35,35,39,39,43,43,118],
    openingBoard:[
      {row:0,col:0,owner:0,pawns:1},
      {row:1,col:0,owner:0,pawns:1},
      {row:2,col:0,owner:0,pawns:1},
      {row:0,col:4,owner:1,pawns:1},
      {row:1,col:4,owner:1,pawns:1},
      {row:2,col:4,owner:1,pawns:1},
    ],
    bonusPlayerHand:[51,2125],
    summary:'Start with replacement and destruction support cards (Insectoid Chimera & Donberry) against a Gigatrice destroy deck.',
  },
];

export const survivalChallenges:readonly SurvivalChallenge[]=[
  {
    id:'survival-boot-camp',
    name:'Boot Camp',
    rewardCardId:143,
    evidenceStatus:'classic-candidate',
    targets:{bronze:30,silver:45,gold:60},
    rounds:[
      {
        round:1,opponentName:'Round 1 · Ned',opponentStrategy:'ned',difficulty:'easy',
        opponentDeck:[1,1,4,4,5,7,7,8,8,9,9,11,11,13,13],drawAtStart:5,noTurnDraw:false,bonusDrawRow:1,
      },
      {
        round:2,opponentName:'Round 2 · Devin Moore',opponentStrategy:'devin-moore',difficulty:'normal',
        opponentDeck:[1,1,4,4,7,7,8,8,11,11,14,14,19,21,21],drawAtStart:2,noTurnDraw:false,bonusDrawRow:0,
      },
      {
        round:3,opponentName:'Round 3 · Neil',opponentStrategy:'neil',difficulty:'hard',
        opponentDeck:[1,1,7,8,10,11,12,13,13,24,25,25,30,30,107],drawAtStart:2,noTurnDraw:false,
      },
    ],
    summary:'3-round survival gauntlet using one shared 15-card deck, carried-over hands and bonus-draw lanes.',
  },
  {
    id:'survival-extreme',
    name:'Extreme Survival',
    rewardCardId:102,
    evidenceStatus:'classic-candidate',
    targets:{bronze:40,silver:60,gold:80},
    rounds:[
      {
        round:1,opponentName:'Round 1 · Ned',opponentStrategy:'ned',difficulty:'normal',
        opponentDeck:[1,1,4,4,5,7,7,8,8,9,9,11,11,13,13],drawAtStart:5,noTurnDraw:false,bonusDrawRow:1,
      },
      {
        round:2,opponentName:'Round 2 · Zahira',opponentStrategy:'zahira',difficulty:'normal',
        opponentDeck:[1,1,4,4,5,7,7,8,8,9,10,11,11,15,17],drawAtStart:2,noTurnDraw:false,bonusDrawRow:0,
      },
      {
        round:3,opponentName:'Round 3 · Michaela',opponentStrategy:'michaela',difficulty:'hard',
        opponentDeck:[1,1,7,8,10,10,13,19,20,22,22,26,27,27,30],drawAtStart:2,noTurnDraw:false,bonusDrawRow:2,
      },
      {
        round:4,opponentName:'Round 4 · Cameron',opponentStrategy:'cameron',difficulty:'hard',
        opponentDeck:[1,1,2,2,15,15,17,17,20,20,22,22,26,26,113],drawAtStart:0,noTurnDraw:true,
      },
    ],
    summary:'4-round survival gauntlet with bonus-draw lanes in Rounds 1-3 and a no-draw finale in Round 4.',
  },
  {
    id:'survival-nightmare',
    name:'Nightmare Survival',
    rewardCardId:104,
    evidenceStatus:'classic-candidate',
    targets:{bronze:50,silver:75,gold:100},
    rounds:[
      {
        round:1,opponentName:'Round 1 · Zahira',opponentStrategy:'zahira',difficulty:'normal',
        opponentDeck:[1,1,4,4,5,7,7,8,8,9,10,11,11,15,17],drawAtStart:5,noTurnDraw:false,bonusDrawRow:1,
      },
      {
        round:2,opponentName:'Round 2 · Darren Moore',opponentStrategy:'darren-moore',difficulty:'normal',
        opponentDeck:[1,1,2,2,7,7,8,8,19,19,20,20,21,21,26],drawAtStart:2,noTurnDraw:false,bonusDrawRow:0,
      },
      {
        round:3,opponentName:'Round 3 · Michaela',opponentStrategy:'michaela',difficulty:'hard',
        opponentDeck:[1,1,7,8,10,10,13,19,20,22,22,26,27,27,30],drawAtStart:2,noTurnDraw:false,bonusDrawRow:2,
      },
      {
        round:4,opponentName:'Round 4 · Cameron',opponentStrategy:'cameron',difficulty:'hard',
        opponentDeck:[1,1,2,2,15,15,17,17,20,20,22,22,26,26,113],drawAtStart:0,noTurnDraw:true,
      },
      {
        round:5,
        opponentName:'Round 5 · Shadowblood Queen',
        opponentStrategy:shadowbloodQueen.strategy,
        difficulty:'hard',
        opponentDeck:shadowbloodQueen.deck,
        drawAtStart:0,
        noTurnDraw:true,
        bossId:shadowbloodQueen.id,
        battleBackgroundId:shadowbloodQueen.battleBackgroundId,
        openingBoard:shadowbloodQueen.openingBoard,
      },
    ],
    summary:'5-round survival gauntlet. Rounds 4-5 disable deck draws, culminating in a final showdown with the Shadowblood Queen.',
  },
];

export function findGoldSaucerChallenge(id?:string):GoldSaucerChallenge|undefined {
  return goldSaucerChallenges.find(c=>c.id===id);
}

export function findSurvivalChallenge(id?:string):SurvivalChallenge|undefined {
  return survivalChallenges.find(c=>c.id===id);
}
