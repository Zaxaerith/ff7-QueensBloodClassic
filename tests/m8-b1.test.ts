import {afterEach,expect,test} from 'vitest';
import {botOptionsForMatch,decideBot,observeGame} from '../src/bot.js';
import {BOT_STRATEGIES,strategyForOpponent} from '../src/bot-strategy.js';
import {byId,starterDeck} from '../src/cards.js';
import {challengers,findChallenger} from '../src/challengers.js';
import {exportReplay,legalMoves,mulligan,play,replayMatch} from '../src/engine.js';
import {localizedName,termRecord} from '../src/i18n/card-names.js';
import {opponentDetails,opponentOptionLabel} from '../src/i18n/game-labels.js';
import {setLocale,t} from '../src/i18n/index.js';
import {locales,type Locale} from '../src/i18n/locales.js';
import {readActive,saveMatch,writeActive} from '../src/match-archive.js';
import {startMatch,type MatchSettings} from '../src/match-flow.js';
import {validateDeck} from '../src/ui-data.js';

const earlyChallengers = [
  {id:'ned',name:'Ned',regionId:'kalm',reward:13,tactics:[13,11],deck:[1,1,4,4,5,7,7,8,8,9,9,11,11,13,13]},
  {id:'zahira',name:'Zahira',regionId:'kalm',reward:17,tactics:[10,17],deck:[1,1,4,4,5,7,7,8,8,9,10,11,11,15,17]},
  {id:'devin-moore',name:'Devin Moore',regionId:'under-junon',reward:21,tactics:[19,14,21],deck:[1,1,4,4,7,7,8,8,11,11,14,14,19,21,21]},
  {id:'darren-moore',name:'Darren Moore',regionId:'under-junon',reward:21,tactics:[20,26,21],deck:[1,1,2,2,7,7,8,8,19,19,20,20,21,21,26]},
];
const crowsNestChallengers = [
  {id:'michaela',name:'Michaela',regionId:'crows-nest',reward:27,tactics:[27,30],deck:[1,1,7,8,10,10,13,19,20,22,22,26,27,27,30]},
  {id:'neil',name:'Neil',regionId:'crows-nest',reward:30,tactics:[107,30],deck:[1,1,7,8,10,11,12,13,13,24,25,25,30,30,107]},
  {id:'cameron',name:'Cameron',regionId:'crows-nest',reward:113,tactics:[20,113],deck:[1,1,2,2,15,15,17,17,20,20,22,22,26,26,113]},
];
const additions = [...earlyChallengers,...crowsNestChallengers];
const englishCrowNames = ['Michaela','Neil','Cameron'] as const;
const crowsNestTerms: Record<Locale, readonly [region:string,michaela:string,neil:string,cameron:string]> = {
  'zh-CN':['侧珠诺','米瑟莉','尼尔','卡玛洛'],
  'zh-TW':['側珠諾','米瑟莉','尼爾','卡瑪洛'],
  en:["Crow's Nest",...englishCrowNames],
  ja:['サイドジュノン','ミザリー','ニール','カマロ'],
  ko:['사이드 주논',...englishCrowNames],
  fr:['Nid-de-pie',...englishCrowNames],
  de:['Krähennest','Mizari','Neil','Cameron'],
  it:['Junon scissa','Mizaly','Niel','Camaro'],
  'es-ES':['Colectivo Junon','Misery','Neal','Camaro'],
  'es-419':['Nido del Cuervo',...englishCrowNames],
  'pt-BR':['Ninho do Corvo',...englishCrowNames],
};

afterEach(() => setLocale('zh-CN'));

const worldTourIds = [
  'felix','regina','maurya','biff','lidrehl',
  'zhijun','regina-rematch','bernard','turner','vincent-gatekeeper',
] as const;

const taskY2NewcomerIds = [
  'rolf','navalan','mary','pietro','dax','wize-3',
  'oscar','robin','kadina','riana','dokaccha','maahir','dale',
] as const;

const keeperIds = [
  'cameron','lidrehl','regina-rematch','vincent-gatekeeper','navalan','wize-3',
] as const;

test('all thirty-three unique challengers preserve the first twenty, mark Keepers, and have legal distinct decks and strategies', () => {
  expect(challengers.slice(0,10).map(({id}) => id)).toEqual(['nene','zogan','isabelle',...additions.map(({id}) => id)]);
  expect(challengers.slice(10,20).map(({id}) => id)).toEqual([...worldTourIds]);
  expect(challengers.slice(20).map(({id}) => id)).toEqual([...taskY2NewcomerIds]);
  expect(challengers).toHaveLength(33);
  expect(challengers.filter(npc => npc.keeper).map(({id}) => id)).toEqual([...keeperIds]);
  const deckKeys = new Set<string>();
  for (const npc of challengers) {
    expect(validateDeck(npc.deck),npc.id).toBeNull();
    expect(npc.deck.every(id => id >= 1 && id <= 145 && byId.get(id)?.rarity !== 'token'),npc.id).toBe(true);
    expect(npc.deck,npc.id).toContain(npc.rewardCardId);
    expect(BOT_STRATEGIES,npc.id).toContain(npc.id);
    expect(strategyForOpponent(npc.id),npc.id).toBe(npc.id);
    const key = [...npc.deck].sort((a,b) => a - b).join(',');
    expect(deckKeys.has(key),npc.id).toBe(false);
    deckKeys.add(key);
  }
  expect(challengers.filter(npc => npc.challengeGroupId === 'moore-twins').map(({id}) => id))
    .toEqual(['devin-moore','darren-moore']);
  expect(findChallenger('devin-moore')?.deck).not.toEqual(findChallenger('darren-moore')?.deck);
  expect(findChallenger('moore-twins')).toBeUndefined();
});

test.each(locales)('%s shows each new name, region, associated card and tactic, plus the mirror fallback', locale => {
  setLocale(locale);
  const resolveCard = (id: number) => localizedName(id,byId.get(id)!.name);
  const isabelle = opponentDetails(findChallenger('isabelle'));
  const newDetails = new Set<string>();
  const [crowRegion,...crowNames] = crowsNestTerms[locale];
  const regionTerm = termRecord('region:crows-nest',locale);
  expect(regionTerm).toMatchObject({name:crowRegion,status:['es-419','pt-BR'].includes(locale) ? 'provisional' : 'guide'});
  for (const {id,name,regionId,reward,tactics} of additions) {
    const npc = findChallenger(id)!;
    const crowIndex = crowsNestChallengers.findIndex(challenger => challenger.id === id);
    const region = crowIndex >= 0 ? crowRegion : termRecord('region:'+regionId,locale)!.name;
    const localName = crowIndex >= 0 ? crowNames[crowIndex] : name;
    const fallback = crowIndex >= 0 ? ['ko','es-419','pt-BR'].includes(locale) : locale !== 'en';
    expect(npc.name).toBe(name);
    expect(opponentOptionLabel(npc)).toBe(`${localName} · ${region}`);
    expect(termRecord('npc:'+id,locale)).toMatchObject({name:localName,status:fallback ? 'fallback' : 'guide'});
    const details = opponentDetails(npc);
    expect(details).toContain(`#${String(reward).padStart(3,'0')} ${resolveCard(reward)}`);
    for (const id of tactics) expect(details).toContain(resolveCard(id));
    expect(details).not.toMatch(/⟦|undefined/);
    expect(details).not.toBe(isabelle);
    newDetails.add(details);
  }
  expect(newDetails.size).toBe(additions.length);
  const allDetails = new Set<string>();
  for (const npc of challengers) {
    expect(termRecord('npc:'+npc.id,locale)?.name,npc.id).toBeTruthy();
    const details = opponentDetails(npc);
    expect(details,npc.id).toContain(`#${String(npc.rewardCardId).padStart(3,'0')} ${resolveCard(npc.rewardCardId)}`);
    expect(details,npc.id).not.toMatch(/⟦|undefined/);
    allDetails.add(details);
  }
  expect(allDetails.size).toBe(challengers.length);
  expect(opponentDetails(findChallenger('unregistered'))).toBe(t('theComputerUsesTheSameDeckAsYou'));
});

test.each(additions)('$id restores the exact snapshot and settles a legal Normal move', ({id,deck,regionId,reward}) => {
  const npc = findChallenger(id)!;
  expect(npc).toMatchObject({regionId,rewardCardId:reward,deck});
  const sessionDeck = [...npc.deck];
  const settings: MatchSettings = {
    deck:starterDeck,difficulty:'normal',seed:701,first:'computer',opponent:{npcId:id,deck:sessionDeck},
  };
  const game = startMatch(settings);
  const initial = structuredClone(game);
  expect(startMatch(settings)).toEqual(initial);
  expect(exportReplay(initial).decks).toEqual([starterDeck,deck]);
  mulligan(game,0,[]);
  mulligan(game,1,[]);

  const values = new Map<string,string>();
  const storage = {getItem:(key: string) => values.get(key) ?? null,setItem:(key: string,value: string) => void values.set(key,value)};
  expect(writeActive(storage,saveMatch(game,settings,'Classic',id))).toBeNull();
  sessionDeck.reverse();
  const original = readActive(storage);
  expect(original.error).toBeNull();
  const restored = original.restored!;
  expect(restored.game).toEqual(game);
  expect(restored.save.settings).toMatchObject({difficulty:'normal',seed:701,first:'computer',opponent:{npcId:id,deck}});
  expect(startMatch(restored.save.settings)).toEqual(initial);

  const view = observeGame(restored.game,1);
  const options = botOptionsForMatch(view,restored.save.settings);
  expect(options).toMatchObject({difficulty:'normal',strategy:id});
  const {action} = decideBot(view,options);
  if (action.type !== 'play') throw Error(`${id} did not play in the fixed Normal opening`);
  const {handIndex,row,col,player} = action;
  expect(player).toBe(1);
  expect(legalMoves(restored.game,1)).toContainEqual({handIndex,row,col});
  play(restored.game,player,handIndex,row,col);
  const replay = exportReplay(restored.game);
  expect(replay.commands).toEqual([...game.replay.commands,action]);
  expect(replayMatch(replay)).toEqual(restored.game);
});
