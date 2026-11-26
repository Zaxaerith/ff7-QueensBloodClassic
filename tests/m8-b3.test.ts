import {expect,test} from 'vitest';
import {
  assessBotRoot,botOptionsForMatch,decideBot,DEFAULT_BOT_NODES,observeGame,simulateBotAction,
  type BotDifficulty,
} from '../src/bot.js';
import {BOT_STRATEGIES,strategyForOpponent,strategyScore,type BotStrategy} from '../src/bot-strategy.js';
import {starterDeck} from '../src/cards.js';
import {challengers,findChallenger} from '../src/challengers.js';
import {createPosition,mulligan,replayMatch,TURN_DRAW_RULES_VERSION,type Command,type Game} from '../src/engine.js';
import {restoreMatch,saveMatch,type SavedMatch} from '../src/match-archive.js';
import {startMatch,type MatchSettings} from '../src/match-flow.js';

const seed=701;
const difficulties:BotDifficulty[]=['easy','normal','hard'];
const addedStrategies:BotStrategy[]=['ned','zahira','devin-moore','darren-moore','michaela','neil','cameron'];

test.each(challengers)('$id honors first player, the saved ordered decks and independent Bot difficulty',npc=>{
  const opponent={npcId:npc.id,deck:npc.deck};
  expect(strategyForOpponent(npc.id)).toBe(npc.id);
  for(const [first,player] of [['player',0],['computer',1]] as const){
    const settings:MatchSettings={deck:starterDeck,seed,difficulty:'normal',first,opponent};
    const game=startMatch(settings);
    const saved=saveMatch(game,settings,'Classic',npc.id);
    expect(saved.settings).toEqual(settings);
    expect(saved.replay).toMatchObject({seed,decks:[starterDeck,npc.deck],firstPlayer:player,version:1});
    mulligan(game,0,[]);mulligan(game,1,[]);
    expect(game.turn).toBe(player);
    if(player===1){
      const view=observeGame(game,1);
      for(const difficulty of difficulties){
        expect(botOptionsForMatch(view,{...settings,difficulty})).toMatchObject({
          difficulty,strategy:npc.id,
        });
      }
    }
  }
});

// State checks captured by emitting both snapshots with the archived start/save
// modules at 6823df3 (A1) and 0be5520 (B1), using their own ordered NPC decks.
const historical=[
  {id:'nene',first:'player',difficulty:'normal',handIndex:0,before:'eb27b877',after:'82eae527'},
  {id:'zogan',first:'computer',difficulty:'hard',handIndex:1,before:'da9a9a69',after:'a8fb3e71'},
  {id:'isabelle',first:'player',difficulty:'easy',handIndex:0,before:'961feb8f',after:'000462ca'},
  {id:'mirror',first:'computer',difficulty:'normal',handIndex:0,before:'1639f163',after:'17c4bc30'},
  {id:'devin-moore',first:'computer',difficulty:'normal',handIndex:2,before:'55a51c02',after:'5eb6c8af'},
  {id:'darren-moore',first:'player',difficulty:'hard',handIndex:0,before:'61567a16',after:'4c593219'},
] as const;

test.each(historical)('$id historical V1 saves retain both recorded state checks and the rematch opening',row=>{
  const npc=findChallenger(row.id);
  const settings:MatchSettings={
    deck:starterDeck,seed,first:row.first,difficulty:row.difficulty,
    ...(npc?{opponent:{npcId:npc.id,deck:npc.deck}}:{}),
  };
  const firstPlayer=row.first==='computer'?1:0;
  const opening:Command[]=[{type:'mulligan',player:0,indices:[]},{type:'mulligan',player:1,indices:[]}];
  const played:Command={type:'play',player:firstPlayer,handIndex:row.handIndex,row:0,col:firstPlayer===0?0:4};
  for(const [check,commands,next] of [
    [row.before,opening,firstPlayer],[row.after,[...opening,played],1-firstPlayer],
  ] as const){
    const historicalSave:SavedMatch={
      schema:'qbclassic.match',version:1,rulesVersion:TURN_DRAW_RULES_VERSION,
      id:row.id,deckName:'Classic',settings,phase:'playing',check,
      replay:{
        version:1,rulesVersion:TURN_DRAW_RULES_VERSION,seed,firstPlayer,
        decks:[[...starterDeck],[...(npc?.deck??starterDeck)]],commands:[...commands],
      },
    };
    const restored=restoreMatch(historicalSave);
    expect(restored.save).toEqual(historicalSave);
    expect(restored.game.turn).toBe(next);
    expect(restored.game).toEqual(replayMatch(historicalSave.replay));
    expect(startMatch(restored.save.settings).replay).toEqual({...historicalSave.replay,commands:[]});
  }
});

test('all 7 added NPC strategies respect budgets, terminal PASS priority and BotView information boundary',()=>{
  for(const npc of challengers)expect(BOT_STRATEGIES).toContain(npc.id);
  expect(strategyForOpponent(undefined)).toBe('neutral');
  expect(strategyForOpponent('unknown-npc')).toBe('neutral');

  const board=createPosition({
    turn:1,hands:[[7],[1,10,13,20,27]],decks:[[145],[113]],
    board:[
      {row:0,col:0,owner:0,cardId:11},{row:1,col:1,owner:0,cardId:20},
      {row:0,col:3,owner:1,pawns:1},{row:1,col:3,owner:1,pawns:2},{row:2,col:3,owner:1,pawns:1},
    ],
  });
  const forbidden=()=>{throw Error('hidden state read');};
  const guarded=structuredClone(board);
  guarded.hands[0]=new Proxy([7],{get(t,k,r){if(k!=='length')forbidden();return Reflect.get(t,k,r);}});
  guarded.decks=guarded.decks.map(d=>new Proxy(d,{get(t,k,r){if(k!=='length')forbidden();return Reflect.get(t,k,r);}})) as Game['decks'];
  Object.defineProperty(guarded,'replay',{get:forbidden});
  Object.defineProperty(guarded,'events',{get:forbidden});
  const view=observeGame(guarded,1);

  const closingWin=createPosition({
    turn:1,passes:1,hands:[[],[1,20]],
    board:[{row:0,col:4,owner:1,cardId:21},{row:1,col:4,owner:1,pawns:1}],
  });
  const finished=createPosition({
    turn:1,phase:'finished',passes:2,hands:[[],[17,113]],
    board:[{row:0,col:4,owner:1,cardId:21},{row:1,col:0,owner:0,cardId:1}],
  });

  for(const strategy of addedStrategies){
    expect(strategyScore(finished,1,strategy)).toBe(0);
    for(const difficulty of difficulties){
      const decision=decideBot(view,{strategy,difficulty,seed});
      expect(decision.strategy).toBe(strategy);
      expect(decision.stats.maxNodes).toBe(DEFAULT_BOT_NODES[difficulty]);
      expect(decision.stats.nodes).toBeLessThanOrEqual(DEFAULT_BOT_NODES[difficulty]);
      expect(decision.stats.rejected).toBe(0);
      expect(decision.stats.exhausted).toBe(false);
      expect(()=>simulateBotAction(board,decision.action)).not.toThrow();
      expect(decideBot(observeGame(closingWin),{strategy,difficulty,seed}).action.type).toBe('pass');
    }
  }
});

test('Ned favors vertical aura buff synergy under an ally whereas Nene favors frontier expansion',()=>{
  const game=createPosition({
    turn:1,hands:[[],[1,13]],
    board:[
      {row:0,col:0,owner:0,cardId:114},{row:0,col:3,owner:1,cardId:11},
      {row:1,col:3,owner:1,pawns:1},
    ],
  });
  const view=observeGame(game,1);
  const crabUnderAlly={type:'play',player:1,handIndex:1,row:1,col:3} as const;
  const expandCross={type:'play',player:1,handIndex:0,row:1,col:3} as const;
  const trialCrab=simulateBotAction(game,crabUnderAlly);
  const trialExpand=simulateBotAction(game,expandCross);
  expect(strategyScore(trialCrab,1,'ned')).toBeGreaterThan(strategyScore(trialExpand,1,'ned'));
  expect(strategyScore(trialExpand,1,'nene')).toBeGreaterThan(strategyScore(trialCrab,1,'nene'));
  const nedDecision=decideBot(view,{strategy:'ned',difficulty:'normal',seed});
  const neneDecision=decideBot(view,{strategy:'nene',difficulty:'normal',seed});
  expect(nedDecision.action).toEqual(crabUnderAlly);
  expect(neneDecision.action).toEqual(expandCross);
});

test('Zahira rewards Mandragora hand generation and rank-3 preparation for held cost-3 cards',()=>{
  const handChoice=createPosition({
    turn:1,hands:[[],[10,7]],
    board:[
      {row:1,col:0,owner:0,cardId:114},
      {row:1,col:3,owner:1,pawns:1},
    ],
  });
  const view=observeGame(handChoice,1);
  const playMandragora={type:'play',player:1,handIndex:0,row:1,col:3} as const;
  const playLevrikon={type:'play',player:1,handIndex:1,row:1,col:3} as const;
  const zahira=decideBot(view,{strategy:'zahira',difficulty:'normal',seed});
  const neutral=decideBot(view,{strategy:'neutral',difficulty:'normal',seed});
  expect(zahira.action).toEqual(playMandragora);
  expect(neutral.action).toEqual(playLevrikon);

  const rank3Ready=createPosition({
    turn:1,hands:[[],[17,1]],
    board:[{row:1,col:3,owner:1,pawns:3},{row:0,col:0,owner:0,cardId:1}],
  });
  expect(strategyScore(rank3Ready,1,'zahira',[17,1]))
    .toBeGreaterThan(strategyScore(rank3Ready,1,'zahira',[1,1]));
});

test('Moore twins diverge on the same board: Devin spreads across wings while Darren enfeebles and dominates a lane',()=>{
  const game=createPosition({
    turn:1,hands:[[],[14,20]],
    board:[
      {row:1,col:2,owner:0,cardId:11},
      {row:1,col:4,owner:1,cardId:21},{row:1,col:3,owner:1,pawns:2},
    ],
  });
  const view=observeGame(game,1);
  const spreadTwoWings={type:'play',player:1,handIndex:0,row:1,col:3} as const;
  const enfeebleDominate={type:'play',player:1,handIndex:1,row:1,col:3} as const;
  const trialTwoWings=simulateBotAction(game,spreadTwoWings);
  const trialFront=simulateBotAction(game,enfeebleDominate);
  expect(strategyScore(trialTwoWings,1,'devin-moore')).toBeGreaterThan(strategyScore(trialFront,1,'devin-moore'));
  expect(strategyScore(trialFront,1,'darren-moore')).toBeGreaterThan(strategyScore(trialTwoWings,1,'darren-moore'));
  const devin=decideBot(view,{strategy:'devin-moore',difficulty:'normal',seed});
  const darren=decideBot(view,{strategy:'darren-moore',difficulty:'normal',seed});
  expect(devin.action).toEqual(spreadTwoWings);
  expect(darren.action).toEqual(enfeebleDominate);
  expect(devin.action).not.toEqual(darren.action);
});

test('Michaela maximizes Mindflayer negative aura coverage on enemies while avoiding friendly fire',()=>{
  const game=createPosition({
    turn:1,hands:[[],[27,4]],
    board:[
      {row:0,col:2,owner:0,cardId:11},{row:2,col:2,owner:0,cardId:11},
      {row:1,col:3,owner:1,pawns:2},{row:0,col:3,owner:1,pawns:2},
    ],
  });
  const view=observeGame(game,1);
  const centerMindflayer={type:'play',player:1,handIndex:0,row:1,col:3} as const;
  const trialCenter=simulateBotAction(game,centerMindflayer);
  expect(assessBotRoot(trialCenter,view,centerMindflayer,'michaela').score)
    .toBeGreaterThan(assessBotRoot(trialCenter,view,centerMindflayer,'neutral').score);
  expect(decideBot(view,{strategy:'michaela',difficulty:'normal',seed}).action).toEqual(centerMindflayer);

  const friendlyFire=structuredClone(trialCenter);
  friendlyFire.board[0][3]={owner:1,pawns:0,card:{id:7,owner:1,instanceId:99,permanentDelta:0,power:1,enhancedOnce:false,enfeebledOnce:true}};
  expect(strategyScore(trialCenter,1,'michaela')).toBeGreaterThan(strategyScore(friendlyFire,1,'michaela'));
});

test('Neil prioritizes enhanced ally count for Chocobo & Moogle and avoids Flametrooper backline friendly fire',()=>{
  const buffBreadth=createPosition({
    turn:1,hands:[[],[13,107]],
    board:[
      {row:0,col:0,owner:0,cardId:114},
      {row:0,col:3,owner:1,cardId:7,permanentDelta:2,enhancedOnce:true},
      {row:1,col:4,owner:1,cardId:8},
      {row:1,col:3,owner:1,pawns:1},{row:2,col:4,owner:1,pawns:1},
    ],
  });
  const stackExisting={type:'play',player:1,handIndex:0,row:1,col:3} as const;
  const buffSecondAlly={type:'play',player:1,handIndex:0,row:2,col:4} as const;
  expect(strategyScore(simulateBotAction(buffBreadth,buffSecondAlly),1,'neil',[107]))
    .toBeGreaterThan(strategyScore(simulateBotAction(buffBreadth,stackExisting),1,'neil',[107]));

  const safeBlast=createPosition({
    turn:1,hands:[[],[30]],
    board:[
      {row:0,col:0,owner:0,cardId:11},
      {row:1,col:4,owner:1,cardId:11},
      {row:1,col:3,owner:1,pawns:1},{row:2,col:4,owner:1,pawns:1},
    ],
  });
  const riskyFront={type:'play',player:1,handIndex:0,row:1,col:3} as const;
  const safeBack={type:'play',player:1,handIndex:0,row:2,col:4} as const;
  expect(strategyScore(simulateBotAction(safeBlast,safeBack),1,'neil'))
    .toBeGreaterThan(strategyScore(simulateBotAction(safeBlast,riskyFront),1,'neil'));
});

test('Cameron rewards destroy-watcher growth (#113/#035/#043), lethal kills and Bomb deathrattle positioning',()=>{
  const killHunt=createPosition({
    turn:1,hands:[[],[20]],
    board:[
      {row:0,col:2,owner:0,cardId:20},{row:2,col:2,owner:0,cardId:21},
      {row:1,col:4,owner:1,cardId:113},
      {row:0,col:3,owner:1,pawns:1},{row:2,col:3,owner:1,pawns:1},
    ],
  });
  const lethalKill={type:'play',player:1,handIndex:0,row:0,col:3} as const;
  const nonLethalChip={type:'play',player:1,handIndex:0,row:2,col:3} as const;
  const trialKill=simulateBotAction(killHunt,lethalKill);
  const trialChip=simulateBotAction(killHunt,nonLethalChip);
  expect(trialKill.board[1][4].card?.permanentDelta).toBe(1);
  expect(strategyScore(trialKill,1,'cameron')).toBeGreaterThan(strategyScore(trialChip,1,'cameron'));
  expect(decideBot(observeGame(killHunt,1),{strategy:'cameron',difficulty:'normal',seed}).action).toEqual(lethalKill);

  // Generic onCardDestroyed watcher & deathrattle detection without hardcoded card IDs.
  const watcherWithBomb=createPosition({
    turn:1,hands:[[],[113]],
    board:[
      {row:1,col:2,owner:0,cardId:11},{row:1,col:3,owner:1,cardId:41},
      {row:2,col:4,owner:1,cardId:35,permanentDelta:2},{row:0,col:4,owner:1,cardId:43,permanentDelta:1},
      {row:2,col:3,owner:1,pawns:3},
    ],
  });
  const plainBoard=createPosition({
    turn:1,hands:[[],[1]],
    board:[
      {row:1,col:2,owner:0,cardId:11},{row:1,col:3,owner:1,cardId:7},
      {row:2,col:4,owner:1,cardId:1},{row:0,col:4,owner:1,cardId:7},
      {row:2,col:3,owner:1,pawns:3},
    ],
  });
  expect(strategyScore(watcherWithBomb,1,'cameron',[113]))
    .toBeGreaterThan(strategyScore(plainBoard,1,'cameron',[1]));
});
