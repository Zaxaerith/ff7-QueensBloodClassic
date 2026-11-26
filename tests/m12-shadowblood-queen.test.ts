import {expect,test} from 'vitest';
import {
  botOptionsForMatch,decideBot,DEFAULT_BOT_NODES,observeGame,simulateBotAction,
  type BotDifficulty,
} from '../src/bot.js';
import {BOT_STRATEGIES,strategyForOpponent,strategyScore} from '../src/bot-strategy.js';
import {
  bossChallengers,findBossChallenger,SHADOWBLOOD_QUEEN_ID,shadowbloodQueen,
} from '../src/boss-challengers.js';
import {byId,starterDeck} from '../src/cards.js';
import {challengers} from '../src/challengers.js';
import {
  createPosition,exportReplay,legalMoves,mulligan,outcome,pass,play,replayMatch,
  TURN_DRAW_RULES_VERSION,type Game,
} from '../src/engine.js';
import {
  MatchHistory,readActive,ReplayTimeline,restoreMatch,saveMatch,writeActive,
} from '../src/match-archive.js';
import {startMatch,type MatchSettings} from '../src/match-flow.js';
import {validateDeck,type StoragePort} from '../src/ui-data.js';

class MemoryStore implements StoragePort {
  values=new Map<string,string>();
  getItem(key:string){return this.values.get(key)??null;}
  setItem(key:string,value:string){this.values.set(key,value);}
}

const difficulties:BotDifficulty[]=['easy','normal','hard'];
const bossSettings=(overrides:Partial<MatchSettings>={}):MatchSettings=>({
  deck:starterDeck,
  seed:1201,
  difficulty:'hard',
  first:'player',
  opponent:{npcId:SHADOWBLOOD_QUEEN_ID,deck:shadowbloodQueen.deck},
  ...overrides,
});

test('Shadowblood Queen boss definition has a legal 15-card deck, distinct registry and queen BotStrategy mapping',()=>{
  expect(bossChallengers).toEqual([shadowbloodQueen]);
  expect(findBossChallenger(SHADOWBLOOD_QUEEN_ID)).toBe(shadowbloodQueen);
  expect(findBossChallenger('nene')).toBeUndefined();
  expect(challengers.map(c=>c.id)).not.toContain(SHADOWBLOOD_QUEEN_ID);
  expect(validateDeck(shadowbloodQueen.deck)).toBeNull();
  expect(shadowbloodQueen.deck).not.toContain(145);
  expect(shadowbloodQueen.deck.every(id=>id>=1&&id<=145&&byId.get(id)?.rarity!=='token')).toBe(true);
  expect(BOT_STRATEGIES).toContain('queen');
  expect(strategyForOpponent(SHADOWBLOOD_QUEEN_ID)).toBe('queen');
  expect(strategyForOpponent('queen')).toBe('queen');
  expect(strategyForOpponent('Shadowblood-Queen')).toBe('neutral');
});

test('Boss match initializes #145 at B5 (1,4) via Replay v2, stabilizes cleanly and draws on turn handoff',()=>{
  for(const [first,firstPlayer] of [['player',0],['computer',1]] as const){
    const settings=bossSettings({first});
    const game=startMatch(settings);
    expect(game).toEqual(startMatch(settings));
    expect(game.phase).toBe('mulligan');
    expect(game.turn).toBe(firstPlayer);
    expect(game.rulesVersion).toBe(TURN_DRAW_RULES_VERSION);
    expect(game.replay.version).toBe(2);
    expect(game.hands[0]).toHaveLength(5);
    expect(game.hands[1]).toHaveLength(5);
    expect(game.decks[0]).toHaveLength(10);
    expect(game.decks[1]).toHaveLength(10);

    // Pre-placed #145 Shadowblood Queen at B5 (row 1, col 4).
    const queenTile=game.board[1][4];
    expect(queenTile.owner).toBe(1);
    expect(queenTile.pawns).toBe(0);
    expect(queenTile.card).toMatchObject({id:145,owner:1,power:3,dynamicDelta:0});
    expect(game.board[0][4]).toMatchObject({owner:1,pawns:2,card:null});
    expect(game.board[2][4]).toMatchObject({owner:1,pawns:2,card:null});
    expect(game.board[0][3]).toMatchObject({owner:1,pawns:1,card:null});
    expect(game.board[2][3]).toMatchObject({owner:1,pawns:1,card:null});
    expect(game.board[0][0]).toMatchObject({owner:0,pawns:1,card:null});
    expect(game.board[1][0]).toMatchObject({owner:0,pawns:1,card:null});
    expect(game.board[2][0]).toMatchObject({owner:0,pawns:1,card:null});

    mulligan(game,0,[]);mulligan(game,1,[]);
    expect(game.phase).toBe('playing');
    expect(game.turn).toBe(firstPlayer);

    const active=firstPlayer,other=1-firstPlayer;
    const otherHandBefore=game.hands[other].length;
    const otherDeckBefore=game.decks[other].length;
    const move=legalMoves(game,active)[0];
    expect(move).toBeDefined();
    play(game,active,move.handIndex,move.row,move.col);
    expect(game.turn).toBe(other);
    expect(game.hands[other]).toHaveLength(otherHandBefore+1);
    expect(game.decks[other]).toHaveLength(otherDeckBefore-1);
  }
});

test('queen strategy respects Easy/Normal/Hard budgets, terminal PASS priority and BotView privacy',()=>{
  const settings=bossSettings({first:'computer'});
  const game=startMatch(settings);
  mulligan(game,0,[]);mulligan(game,1,[]);

  const forbidden=()=>{throw Error('hidden state read');};
  const guarded=structuredClone(game);
  guarded.hands[0]=new Proxy([...game.hands[0]],{get(t,k,r){if(k!=='length')forbidden();return Reflect.get(t,k,r);}});
  guarded.decks=guarded.decks.map(d=>new Proxy([...d],{get(t,k,r){if(k!=='length')forbidden();return Reflect.get(t,k,r);}})) as Game['decks'];
  Object.defineProperty(guarded,'replay',{get:forbidden});
  Object.defineProperty(guarded,'events',{get:forbidden});
  const view=observeGame(guarded,1);

  const closingWin=createPosition({
    turn:1,passes:1,hands:[[],[72,83]],
    board:[{row:1,col:4,owner:1,cardId:145},{row:0,col:4,owner:1,pawns:2}],
  });
  const finished=createPosition({
    turn:1,phase:'finished',passes:2,hands:[[],[72,83]],
    board:[{row:1,col:4,owner:1,cardId:145},{row:0,col:0,owner:0,cardId:11,permanentDelta:-1}],
  });
  expect(strategyScore(finished,1,'queen')).toBe(0);

  for(const difficulty of difficulties){
    const options=botOptionsForMatch(view,{...settings,difficulty});
    expect(options).toMatchObject({difficulty,strategy:'queen'});
    const decision=decideBot(view,options);
    expect(decision.strategy).toBe('queen');
    expect(decision.stats.maxNodes).toBe(DEFAULT_BOT_NODES[difficulty]);
    expect(decision.stats.nodes).toBeLessThanOrEqual(DEFAULT_BOT_NODES[difficulty]);
    expect(decision.stats.rejected).toBe(0);
    expect(decision.stats.exhausted).toBe(false);
    expect(()=>simulateBotAction(game,decision.action)).not.toThrow();
    expect(decideBot(observeGame(closingWin),{strategy:'queen',difficulty,seed:1201}).action.type).toBe('pass');
  }
});

test('queen strategy maximizes living enfeebled cards for #145 and avoids pointless kills of enfeebled fodder',()=>{
  // Row 0 already won by P1 (#62 = 6 vs enfeebled #7 = 1); Row 1 led by #145 (3+3 = 6 vs 0).
  // Playing #72 Black Bat at (0,2) kills P0's enfeebled #7 (losing #145's +3 bonus!),
  // while playing #72 at (2,2) enfeebles P0's full-HP #11 (4 -> 3), boosting #145 from 6 -> 9!
  const game=createPosition({
    turn:1,hands:[[7,8],[72]],
    board:[
      {row:0,col:0,owner:0,pawns:1},
      {row:0,col:1,owner:0,cardId:7,permanentDelta:-1,enfeebledOnce:true},
      {row:0,col:4,owner:1,cardId:62},
      {row:1,col:4,owner:1,cardId:145},
      {row:2,col:0,owner:0,pawns:1},
      {row:2,col:1,owner:0,cardId:11},
      {row:0,col:2,owner:1,pawns:1},
      {row:2,col:2,owner:1,pawns:1},
    ],
  });
  expect(game.board[1][4].card?.power).toBe(6);
  const killFodder={type:'play',player:1,handIndex:0,row:0,col:2} as const;
  const enfeebleFresh={type:'play',player:1,handIndex:0,row:2,col:2} as const;
  const trialKill=simulateBotAction(game,killFodder);
  const trialEnfeeble=simulateBotAction(game,enfeebleFresh);
  expect(trialKill.board[1][4].card?.power).toBe(3);
  expect(trialEnfeeble.board[1][4].card?.power).toBe(9);
  expect(strategyScore(trialEnfeeble,1,'queen')).toBeGreaterThan(strategyScore(trialKill,1,'queen'));
  for(const difficulty of ['normal','hard'] as const){
    expect(decideBot(observeGame(game,1),{strategy:'queen',difficulty,seed:1201}).action).toEqual(enfeebleFresh);
  }
});

test('queen strategy protects #145 from self-replacement and leverages wide enfeeblement',()=>{
  const replaceChoice=createPosition({
    turn:1,hands:[[7,8],[80]],
    board:[
      {row:0,col:0,owner:0,pawns:1},
      {row:0,col:2,owner:0,cardId:11,permanentDelta:-1,enfeebledOnce:true},
      {row:1,col:0,owner:0,pawns:1},
      {row:2,col:2,owner:0,cardId:11,permanentDelta:-1,enfeebledOnce:true},
      {row:0,col:4,owner:1,cardId:83},
      {row:1,col:4,owner:1,cardId:145},
    ],
  });
  const replaceQueen={type:'play',player:1,handIndex:0,row:1,col:4} as const;
  const replaceFodder={type:'play',player:1,handIndex:0,row:0,col:4} as const;
  expect(strategyScore(simulateBotAction(replaceChoice,replaceFodder),1,'queen'))
    .toBeGreaterThan(strategyScore(simulateBotAction(replaceChoice,replaceQueen),1,'queen'));
  expect(decideBot(observeGame(replaceChoice,1),{strategy:'queen',difficulty:'hard',seed:1201}).action)
    .toEqual(replaceFodder);
});

test('Boss match supports mid-match save/restore, tamper rejection, MatchHistory archiving and ReplayTimeline playback',()=>{
  const settings=bossSettings({first:'player'});
  const game=startMatch(settings);
  const store=new MemoryStore();

  // Save during mulligan and restore identically.
  const openingSave=saveMatch(game,settings,'BossDeck','boss-1');
  expect(openingSave.replay.version).toBe(2);
  expect(writeActive(store,openingSave)).toBeNull();
  expect(readActive(store).restored?.game).toEqual(game);

  // Complete mulligan, play one player turn and one Queen Bot turn, then save/restore.
  mulligan(game,0,[0]);mulligan(game,1,[]);
  const p0Move=legalMoves(game,0)[0];
  play(game,0,p0Move.handIndex,p0Move.row,p0Move.col);
  const view=observeGame(game,1);
  const botDecision=decideBot(view,botOptionsForMatch(view,settings));
  if(botDecision.action.type==='play'){
    play(game,1,botDecision.action.handIndex,botDecision.action.row,botDecision.action.col);
  } else {
    pass(game,1);
  }

  const midSave=saveMatch(game,settings,'BossDeck','boss-1');
  const midRestored=restoreMatch(JSON.parse(JSON.stringify(midSave)));
  expect(midRestored.game).toEqual(game);
  expect(midRestored.save).toEqual(midSave);

  // Tampering with the Boss opening board, replay version, or settings must be rejected.
  const tamperedBoard=structuredClone(midSave);
  if(tamperedBoard.replay.version===2&&tamperedBoard.replay.position.board){
    tamperedBoard.replay.position.board=tamperedBoard.replay.position.board.filter(t=>t.cardId!==145);
  }
  expect(()=>restoreMatch(tamperedBoard)).toThrow();
  expect(()=>restoreMatch({...midSave,settings:{...settings,seed:9999}})).toThrow();

  // Regular NPC saves still strictly reject replay.version === 2.
  const regularNpc=challengers[0];
  expect(()=>restoreMatch({
    ...midSave,
    settings:{...settings,opponent:{npcId:regularNpc.id,deck:regularNpc.deck}},
  })).toThrow();

  // Finish the match via consecutive passes, archive to MatchHistory and step through ReplayTimeline.
  pass(game,game.turn);
  pass(game,game.turn);
  expect(game.phase).toBe('finished');
  const finalSave=saveMatch(game,settings,'BossDeck','boss-1');
  const history=new MatchHistory(store);
  expect(history.add(finalSave)).toBeNull();
  expect(history.available('boss-1')).toBe(true);

  const archivedReplay=history.replay('boss-1');
  expect(archivedReplay.version).toBe(2);
  expect(replayMatch(archivedReplay)).toEqual(game);

  const timeline=new ReplayTimeline(archivedReplay);
  expect(timeline.length).toBe(game.replay.commands.length);
  const frame0=timeline.at(0);
  expect(frame0.command).toBeNull();
  expect(frame0.game.board[1][4].card).toMatchObject({id:145,owner:1,power:3});
  const finalFrame=timeline.at(timeline.length);
  expect(finalFrame.game).toEqual(game);
  expect(outcome(finalFrame.game)).toEqual(outcome(game));
});
