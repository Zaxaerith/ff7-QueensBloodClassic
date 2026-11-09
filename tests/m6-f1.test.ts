import {expect,test} from 'vitest';
import {starterDeck} from '../src/cards.js';
import {observeGame,recommendBot} from '../src/bot.js';
import {createGame,createPosition,exportReplay,legalMoves,LEGACY_RULES_VERSION,mulligan,outcome,pass,play,replayMatch,TURN_DRAW_RULES_VERSION,type Player,type Position} from '../src/engine.js';
import {checkedReplay,MatchHistory,ReplayTimeline,restoreMatch,saveMatch,writeActive,MATCH_KEY} from '../src/match-archive.js';
import {actionFeedback} from '../src/match-flow.js';

const position:Position={seed:66,turn:1,hands:[[1],[2,95,134,96,53]],decks:[[7],[5,1,2,4,6,7,8,9,11,13]],board:[
  {row:0,col:0,owner:0,cardId:11},{row:2,col:4,owner:0,cardId:11},
  {row:0,col:4,owner:1,pawns:1},{row:1,col:0,owner:0,pawns:1}
]};

for(const first of [0,1] as const)test(`opening P${first+1} starts at five; the second side draws before its first action`,()=>{
  const game=createGame([starterDeck,starterDeck],66,first);
  const second:Player=first===0?1:0;
  mulligan(game,0,[]);mulligan(game,1,[]);
  expect(game.hands.map(hand=>hand.length)).toEqual([5,5]);
  expect(game.decks.map(deck=>deck.length)).toEqual([10,10]);
  expect(game.events.filter(event=>event.reason==='draw')).toEqual([]);
  pass(game,first);
  expect(game.turn).toBe(second);
  expect(game.hands[first]).toHaveLength(5);expect(game.decks[first]).toHaveLength(10);
  expect(game.hands[second]).toHaveLength(6);expect(game.decks[second]).toHaveLength(9);
  expect(game.events.slice(-2)).toMatchObject([{type:'TurnPassed',player:first},{type:'CardAddedToHand',reason:'draw',player:second}]);
  const move=legalMoves(game,second)[0];
  play(game,second,move.handIndex,move.row,move.col);
  expect(game.passes).toBe(0);
  expect(game.hands[first]).toHaveLength(6);expect(game.decks[first]).toHaveLength(9);
  expect(game.hands[second]).toHaveLength(5);expect(game.decks[second]).toHaveLength(9);
  expect(game.events.slice(-2)).toMatchObject([{type:'TurnEnded',player:second},{type:'CardAddedToHand',reason:'draw',player:first}]);
  expect(replayMatch(checkedReplay(exportReplay(game)))).toEqual(game);
});

test('after passing without a legal card, the trailing Bot draws into a legal Rank 1 move',()=>{
  const game=createPosition(position),legacy=createPosition(position,LEGACY_RULES_VERSION);
  const difficulties=['easy','normal','hard'] as const;
  expect(outcome(game).scores).toEqual([8,0]);expect(legalMoves(game,1)).toEqual([]);
  for(const difficulty of difficulties)expect(recommendBot(game,1,{difficulty,seed:1})).toMatchObject({action:{type:'pass'},reason:'当前手牌无合法出牌，PASS'});
  for(const state of [game,legacy]){pass(state,1);play(state,0,0,1,0);}
  expect(legacy.hands[1]).toHaveLength(5);expect(legacy.decks[1]).toHaveLength(10);
  expect(legalMoves(legacy,1)).toEqual([]);
  expect(observeGame(game,1)).toMatchObject({deckCounts:[0,9],enemyHandCount:1});
  expect(game.hands[1]).toHaveLength(6);
  expect(legalMoves(game,1)).toEqual([{handIndex:5,row:0,col:4}]);
  for(const difficulty of difficulties)expect(recommendBot(game,1,{difficulty,seed:1})).toMatchObject({action:{type:'play',handIndex:5,row:0,col:4}});
  const playerAction=game.events.slice(game.events.findIndex(event=>event.type==='CardPlayed'));
  expect(actionFeedback(playerAction)).toContain('电脑补牌 1 张');
});

test('a turn draw can unlock an allied replacement on a full board; the second PASS ends without a draw',()=>{
  const board:NonNullable<Position['board']>=Array.from({length:15},(_,i)=>({
    row:Math.floor(i/5),col:i%5,owner:i===4?1:0,cardId:7
  }));
  const game=createPosition({hands:[[],[]],decks:[[1],[51]],board});
  pass(game,0);
  expect(legalMoves(game,1)).toEqual([{handIndex:0,row:0,col:4}]);
  const terminal=structuredClone(game);
  pass(terminal,1);
  expect(terminal.phase).toBe('finished');expect(terminal.decks).toEqual(game.decks);
  expect(terminal.events.slice(-2).map(event=>event.type)).toEqual(['TurnPassed','MatchEnded']);
  play(game,1,0,0,4);
  expect(game.board[0][4].card?.id).toBe(51);expect(game.hands[0]).toEqual([1]);
  expect(game.passes).toBe(0);expect(legalMoves(game,0)).toEqual([]);
});

test('tagged v2 active save and finished archive coexist with legacy rules; malformed tags preserve the active slot',()=>{
  const rows=new Map<string,string>(),storage={getItem:(key:string)=>rows.get(key)??null,setItem:(key:string,value:string)=>rows.set(key,value)};
  const settings={deck:starterDeck,seed:66,difficulty:'normal' as const,first:'computer' as const};
  const history=new MatchHistory(storage);
  for(const rules of [LEGACY_RULES_VERSION,TURN_DRAW_RULES_VERSION] as const){
    const game=createPosition(position,rules);
    pass(game,1);
    const save=saveMatch(game,settings,'F1',rules);
    expect(writeActive(storage,save)).toBeNull();
    const raw=rows.get(MATCH_KEY);
    const copy=restoreMatch(JSON.parse(raw!)).game;
    expect(copy).toEqual(game);
    expect(writeActive(storage,{...save,rulesVersion:rules===LEGACY_RULES_VERSION?TURN_DRAW_RULES_VERSION:LEGACY_RULES_VERSION})).toBeTruthy();
    expect(rows.get(MATCH_KEY)).toBe(raw);
    expect(()=>checkedReplay({...save.replay,rulesVersion:'future'})).toThrow();
    pass(copy,0);
    expect(history.add(saveMatch(copy,settings,'F1',rules))).toBeNull();
    const replay=history.replay(rules);
    const frame=new ReplayTimeline(replay).at(1);
    expect(frame.game).toEqual(game);
    expect(frame.events.map(event=>event.type)).toEqual(rules===LEGACY_RULES_VERSION?['TurnPassed']:['TurnPassed','CardAddedToHand']);
  }
  expect(history.records).toHaveLength(2);
});
