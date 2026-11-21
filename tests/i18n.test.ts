import {readFileSync} from 'node:fs';
import {afterEach, describe, expect, test} from 'vitest';
import {byId, deckPresets, starterDeck, tokenCards} from '../src/cards.js';
import {challengers} from '../src/challengers.js';
import {renderCardDetailsMarkup, renderCardMarkup} from '../src/card-view.js';
import {exportReplay, mulligan, pass, play, legalMoves} from '../src/engine.js';
import {MATCH_KEY, MatchHistory, ReplayTimeline, saveMatch, writeActive} from '../src/match-archive.js';
import {startMatch, type MatchSettings} from '../src/match-flow.js';
import {defaultConfig, emptyFilter, libraryEntries, matchesEntry, readConfig, safeRead, safeWrite, STORAGE} from '../src/ui-data.js';
import {getCardVisual} from '../src/visuals.js';
import {catalogFor, messageSlots, setLocale, translate, type MessageKey} from '../src/i18n/index.js';
import {locales, localeLabels, resolveLocale, type Locale} from '../src/i18n/locales.js';
import {localizedName, matchesCardName, termRecord} from '../src/i18n/card-names.js';
import {describeAbilities} from '../src/i18n/abilities.js';
import {presetName, recordedDeckLabel, seedLabel} from '../src/i18n/game-labels.js';

afterEach(() => setLocale('zh-CN'));

describe('M8-A2 locale coverage', () => {
  test('matches the 11 Steam interface languages and negotiates browser preferences', () => {
    expect(locales).toEqual(['zh-CN','zh-TW','en','ja','ko','fr','de','it','es-ES','es-419','pt-BR']);
    expect(Object.keys(localeLabels)).toEqual([...locales]);
    expect(resolveLocale(['ru-RU','fr-CA','en-US'])).toBe('fr');
    expect(resolveLocale(['zh-HK'])).toBe('zh-TW');
    expect(resolveLocale(['zh-Hant-CN'])).toBe('zh-TW');
    expect(resolveLocale(['zh-Hans-SG'])).toBe('zh-CN');
    expect(resolveLocale(['es-MX'])).toBe('es-419');
    expect(resolveLocale(['es-ES'])).toBe('es-ES');
    expect(resolveLocale(['pt-PT'])).toBe('pt-BR');
    expect(resolveLocale(['*','nl-NL'])).toBe('zh-CN');
  });

  const numbered = Array.from({length:145}, (_, index) => index + 1);
  const namesToCheck = [
    ...numbered,
    ...tokenCards.map(card => card.id),
    ...challengers.map(npc => 'npc:' + npc.id),
    'region:kalm',
    'region:under-junon',
    'region:crows-nest',
  ];
  const canonical = catalogFor('zh-CN');
  const slots = (text: string) => [...text.matchAll(messageSlots)].map(match => match[1]).sort();

  test.each(locales)('%s has complete terms, attribution, messages and placeholders', locale => {
    const messages = catalogFor(locale);
    expect(Object.keys(messages).sort()).toEqual(Object.keys(canonical).sort());
    for (const [key, text] of Object.entries(messages)) {
      expect(text.trim(), key).not.toBe('');
      expect(slots(text), key).toEqual(slots(canonical[key as MessageKey]));
    }
    for (const id of namesToCheck) {
      const term = termRecord(id,locale);
      if (!term) throw Error('Missing term: ' + locale + ' / ' + id);
      expect(term.name.trim()).not.toBe('');
      expect(term.sourceUrl).toMatch(/^https:\/\//);
      if (term.status === 'official') expect(term.sourceType).toBe('official-gameplay');
      if (term.status === 'provisional') expect(term.sourceType).toBe('provisional-translation');
    }
  });

  test('static text and accessibility bindings reference valid keys', () => {
    const html = readFileSync(new URL('../site/index.html',import.meta.url),'utf8');
    const bindings = [...html.matchAll(/\bdata-i18n(?:-[a-z-]+)?="([^"]+)"/g)];
    expect(bindings.length).toBeGreaterThan(70);
    for (const [,key] of bindings) {
      expect(Object.hasOwn(canonical,key), key).toBe(true);
      expect(slots(canonical[key as MessageKey]), key).toEqual([]);
    }
  });
});

test('card search accepts localized and English names, accents and zero-padded numbers', () => {
  const rows = libraryEntries(null);
  const original = byId.get(1)!.name;
  for (const locale of locales) {
    setLocale(locale);
    const local = localizedName(1,original);
    expect(matchesEntry(rows[0],{...emptyFilter(),query:local})).toBe(true);
    expect(matchesEntry(rows[0],{...emptyFilter(),query:original.toUpperCase()})).toBe(true);
    expect(matchesEntry(rows[0],{...emptyFilter(),query:'#001'})).toBe(true);
    expect(matchesEntry(rows[1],{...emptyFilter(),query:'#001'})).toBe(false);
  }
  expect(matchesCardName(10,'Mandragora','mandragora','es-ES')).toBe(true);
  expect(matchesCardName(1,original,'＃００１','ja')).toBe(true);
});

test('missing or empty messages fall back without exposing a key or interrupting rendering', () => {
  const catalog = catalogFor('fr');
  const original = catalog.replayPass;
  try {
    delete (catalog as Partial<typeof catalog>).replayPass;
    expect(translate('fr','replayPass',2)).toBe(translate('zh-CN','replayPass',2));
    catalog.replayPass = '   ';
    expect(translate('fr','replayPass',2)).toBe(translate('zh-CN','replayPass',2));
  } finally {
    catalog.replayPass = original;
  }
  for (const key of ['missingKey','constructor']) {
    expect(translate('fr',key as MessageKey)).toBe('Texte indisponible');
  }
});

test.each([
  [14,'zh-TW','魁札爾科亞特爾','guide'],
  [1010,'zh-TW','曼德拉草的夥伴','official'],
  [49,'ko','플라워 프롱','official'],
  [7,'es-419','Levikron','official'],
  [13,'es-419','Cangrejo cristalino','official'],
  [13,'es-ES','Castañeteador','guide'],
  [26,'pt-BR','Caulespinho','official'],
  [145,'pt-BR','Rainha Sanguetreva','guide'],
  [2051,'ja','エレメント（ランク1）','provisional'],
  [1110,'de','Mogry-Magier','provisional'],
] as const)('audit keeps card %i mapped to its %s name and evidence', (id,locale,name,status) => {
  const original = byId.get(id)!.name;
  expect(termRecord(id,locale)).toMatchObject({id,locale,name,status});
  expect(matchesCardName(id,original,name,locale)).toBe(true);
  expect(matchesCardName(id,original,original,locale)).toBe(true);
  expect(matchesCardName(id,original,'#'+id,locale)).toBe(true);
});

test('explicit locale changes card display and ability text without changing Card data or grid', () => {
  const card = byId.get(10)!, original = structuredClone(card), visual = getCardVisual(card.id);
  const tables = (html: string) => [...html.matchAll(/data-cell="([^"]+)"/g)].map(match => match[1]);
  const english = renderCardMarkup(card,visual,0,{locale:'en'});
  for (const locale of ['zh-CN','zh-TW','ja','ko','fr','de'] as const) {
    const markup = renderCardMarkup(card,visual,0,{locale});
    expect(markup).toContain('lang="' + locale + '"');
    expect(tables(markup)).toEqual(tables(english));
    expect(renderCardDetailsMarkup(card,0,locale)).toContain(localizedName(1010,byId.get(1010)!.name,locale));
    expect(describeAbilities(card,locale).join(' ')).not.toBe(describeAbilities(card,'en').join(' '));
  }
  expect(card).toEqual(original);
});

test.each(['fr','de'] as const)('long %s names carry a size hint and keep their full title', locale => {
  const card = [...byId.values()].find(card => localizedName(card.id,card.name,locale).length > 24)!;
  expect(card).toBeDefined();
  const options = {locale,variant:'board'} as const;
  const face = renderCardMarkup(card,getCardVisual(card.id),0,options);
  expect(face).toMatch(/class="qb-name" lang="(?:fr|de)" title="[^"]+" data-long-name/);
  expect(face.match(/data-cell=/g)).toHaveLength(25);
});

test('upgrading settings and switching locale preserves saved deck and replay bytes', () => {
  expect(readConfig(JSON.stringify(defaultConfig))).toEqual(defaultConfig);
  expect(readConfig(JSON.stringify({...defaultConfig,locale:'ru'}))).toEqual(defaultConfig);
  const settings: MatchSettings = {deck:starterDeck,seed:701,first:'player',difficulty:'normal'};
  const game = startMatch(settings);
  mulligan(game,0,[]);
  mulligan(game,1,[]);
  const move = legalMoves(game,0)[0];
  play(game,0,move.handIndex,move.row,move.col);
  const replay = exportReplay(game);
  const completed = structuredClone(game);
  pass(completed,completed.turn);
  pass(completed,completed.turn);
  const archivedReplay = exportReplay(completed);
  const before = new ReplayTimeline(archivedReplay).at(3);
  const map = new Map<string,string>();
  const storage = {getItem:(key: string) => map.get(key) ?? null, setItem:(key: string,value: string) => void map.set(key,value)};
  safeWrite(storage,STORAGE.decks,{version:1,selectedId:'local',decks:[{id:'local',name:'My deck',cards:starterDeck}]});
  writeActive(storage,saveMatch(game,settings,'My deck','fixture'));
  const history = new MatchHistory(storage), preset = deckPresets[0];
  expect(history.add(saveMatch(completed,settings,preset.name,'preset-fixture'))).toBeNull();
  const storedRecords = map.get(STORAGE.records);
  const decks = map.get(STORAGE.decks), save = map.get(MATCH_KEY);
  for (const locale of ['fr','ja','es-419','pt-BR'] satisfies Locale[]) {
    setLocale(locale);
    const config = {...defaultConfig,locale};
    expect(safeWrite(storage,STORAGE.config,config)).toBeNull();
    expect(readConfig(safeRead(storage,STORAGE.config).raw)).toEqual(config);
    expect(translate(locale,'language').length).toBeGreaterThan(0);
    expect(map.get(STORAGE.decks)).toBe(decks);
    expect(map.get(MATCH_KEY)).toBe(save);
    expect(map.get(STORAGE.records)).toBe(storedRecords);
    expect(history.records[0].deckName).toBe(preset.name);
    expect(recordedDeckLabel(history.records[0].deckName,history.startingDeck('preset-fixture'))).toBe(presetName(0));
    expect(recordedDeckLabel(preset.name,deckPresets[1].cards)).toBe(preset.name);
    expect(recordedDeckLabel(preset.name,history.startingDeck('summary-only'))).toBe(preset.name);
    expect(recordedDeckLabel('My deck',starterDeck)).toBe('My deck');
    expect(exportReplay(game)).toEqual(replay);
    expect(new ReplayTimeline(archivedReplay).at(3)).toEqual(before);
  }
  expect(seedLabel()).toBe('Semente');
});
