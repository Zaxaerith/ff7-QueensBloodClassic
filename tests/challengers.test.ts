import {expect,test} from 'vitest';
import {observeGame} from '../src/bot.js';
import {byId,starterDeck} from '../src/cards.js';
import {challengers} from '../src/challengers.js';
import {exportReplay,mulligan,pass,replayMatch} from '../src/engine.js';
import {MATCH_KEY,MatchHistory,ReplayTimeline,readActive,restoreMatch,saveMatch,writeActive} from '../src/match-archive.js';
import {startMatch,type MatchSettings} from '../src/match-flow.js';

const mirror: MatchSettings = {deck:starterDeck,seed:701,difficulty:'hard',first:'computer'};
const settingsFor = (npc: typeof challengers[number]): MatchSettings => ({
  ...mirror, opponent:{npcId:npc.id,deck:npc.deck},
});
const npcSettings = settingsFor(challengers[2]);

test.each(challengers)('$name opens with a legal, independent 15-card deck', npc => {
  const game = startMatch(settingsFor(npc));
  expect(game.replay.decks).toEqual([starterDeck,npc.deck]);
  expect(game.replay.firstPlayer).toBe(1);
  expect(game.hands.map(hand => hand.length)).toEqual([5,5]);
  expect([...game.hands[1],...game.decks[1]].sort((a,b)=>a-b)).toEqual([...npc.deck].sort((a,b)=>a-b));
  expect(npc.deck).toContain(npc.rewardCardId);
  expect(byId.has(npc.rewardCardId)).toBe(true);
  expect(npc.deck).not.toEqual(starterDeck);
  for (const other of challengers.filter(other => other.id !== npc.id)) {
    expect([...npc.deck].sort((a,b)=>a-b)).not.toEqual([...other.deck].sort((a,b)=>a-b));
  }
});

test('settings without an opponent retain the mirror start and v1 save shape', () => {
  const game = startMatch(mirror);
  expect(game.replay.decks).toEqual([starterDeck,starterDeck]);
  const restored = restoreMatch(JSON.parse(JSON.stringify(saveMatch(game,mirror,'镜像','mirror'))));
  expect(restored.save.settings).not.toHaveProperty('opponent');
  expect(restored.game).toEqual(game);
});

test('Continue and rematch use the saved NPC snapshot even when its preset deck differs', () => {
  const oldDeck = [...starterDeck.slice(0,-1),96];
  const settings = {...npcSettings,opponent:{npcId:'isabelle',deck:oldDeck}};
  const game = startMatch(settings);
  mulligan(game,0,[0,2]);mulligan(game,1,[]);
  const save = saveMatch(game,settings,'旧版配方','npc-1');
  oldDeck.reverse();
  expect(save.settings.opponent?.deck).toEqual(game.replay.decks[1]);
  const restored = restoreMatch(JSON.parse(JSON.stringify(save)));
  expect(restored.game).toEqual(game);
  expect(restored.game.turn).toBe(1);
  expect(restored.save.settings).toMatchObject({difficulty:'hard',opponent:{npcId:'isabelle',deck:game.replay.decks[1]}});
  expect(restored.save.settings.opponent?.deck).not.toEqual(npcSettings.opponent?.deck);
  expect(startMatch(restored.save.settings)).toEqual(replayMatch({...exportReplay(game),commands:[]}));
});

test('v1 restoration rejects inconsistent ordered decks, seed, first player or state', () => {
  const game = startMatch(npcSettings);
  const save = saveMatch(game,npcSettings,'校验','npc-1');
  for (const corrupt of [
    {...save,settings:mirror},
    {...save,settings:{...npcSettings,opponent:{npcId:'isabelle',deck:starterDeck}}},
    {...save,settings:{...npcSettings,opponent:{npcId:'bad id',deck:game.replay.decks[1]}}},
    {...save,replay:{...save.replay,decks:[[...starterDeck].reverse(),game.replay.decks[1]]}},
    {...save,replay:{...save.replay,decks:[game.replay.decks[0],[...game.replay.decks[1]].reverse()]}},
    {...save,replay:{...save.replay,seed:702}},
    {...save,replay:{...save.replay,firstPlayer:0}},
    {...save,check:'00000000'},
  ]) expect(() => restoreMatch(corrupt)).toThrow();
});

test('Bot observation is unchanged by the opposing hand and either remaining draw order', () => {
  const game = startMatch(npcSettings);
  mulligan(game,0,[]);mulligan(game,1,[]);
  const before = observeGame(game,1);
  expect(before.hand).toEqual(game.hands[1]);
  expect(before.enemyHandCount).toBe(5);
  expect(before.deckCounts).toEqual([10,10]);
  for (const hidden of ['hands','decks','replay','opponent','events']) expect(before).not.toHaveProperty(hidden);
  game.hands[0][0] = game.decks[0][0];
  game.decks[0].reverse();game.decks[1].reverse();
  expect(observeGame(game,1)).toEqual(before);
});

test('a failed replacement keeps the previous continue slot; an NPC result archives both decks once', () => {
  const values = new Map<string,string>();
  let blocked = false;
  const store = {getItem:(key:string) => values.get(key)??null,setItem:(key:string,value:string) => {
    if(blocked&&key===MATCH_KEY&&value!=='null')throw Error('quota');
    values.set(key,value);
  }};
  const game = startMatch(npcSettings);
  mulligan(game,0,[]);mulligan(game,1,[]);
  expect(writeActive(store,saveMatch(game,npcSettings,'进行中','npc-1'))).toBeNull();
  const previous = store.getItem(MATCH_KEY);
  const replacement = settingsFor(challengers[0]);
  blocked = true;
  expect(writeActive(store,saveMatch(startMatch(replacement),replacement,'新局','npc-2'))).toBeTruthy();
  expect(store.getItem(MATCH_KEY)).toBe(previous);
  expect(readActive(store).restored?.game).toEqual(game);

  pass(game,1);pass(game,0);
  const result = saveMatch(game,npcSettings,'已结束','npc-1');
  const history = new MatchHistory(store);
  expect(history.add(result)).toBeNull();
  expect(history.add(result)).toBeNull();
  expect(history.records).toHaveLength(1);
  const replay = new ReplayTimeline(history.replay('npc-1'));
  expect(replay.replay.decks).toEqual([starterDeck,npcSettings.opponent?.deck]);
  expect(replay.at(replay.length).game).toEqual(game);
});
