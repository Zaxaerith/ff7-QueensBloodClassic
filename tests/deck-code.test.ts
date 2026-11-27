import {expect,test} from 'vitest';
import {chainDeck,deckPresets,starterDeck,summonDeck,tokenCards} from '../src/cards.js';
import {challengers} from '../src/challengers.js';
import {
  analyzeDeckCurve,decodeDeckCode,derivedTokensForCard,
  encodeDeckCode,parentCardsForToken,
} from '../src/deck-code.js';

test('encodeDeckCode and decodeDeckCode roundtrip all presets and 20 challenger decks compactly and deterministically',()=>{
  for(const preset of deckPresets){
    const code=encodeDeckCode(preset.cards);
    expect(code).toMatch(/^QBC1-[0-9A-Z]{30}-[0-9A-Z]{2}$/);
    expect(code).toHaveLength(38);
    // Order-independent canonical encoding.
    expect(encodeDeckCode([...preset.cards].reverse())).toBe(code);
    const decoded=decodeDeckCode(`  \n${code.toLowerCase()} \t\n`);
    expect(decoded).toEqual({ok:true,cards:[...preset.cards].sort((a,b)=>a-b)});
  }
  for(const npc of challengers){
    const code=encodeDeckCode(npc.deck);
    const decoded=decodeDeckCode(code);
    expect(decoded.ok,npc.id).toBe(true);
    if(decoded.ok)expect(decoded.cards).toEqual([...npc.deck].sort((a,b)=>a-b));
  }
});

test('deck share code rejects tampering, invalid prefixes, bad lengths and illegal deck compositions',()=>{
  const valid=encodeDeckCode(starterDeck);
  const lastChar=valid.at(-1)!;
  const tamperedChecksum=valid.slice(0,-1)+(lastChar==='0'?'1':'0');
  expect(decodeDeckCode(tamperedChecksum)).toEqual({ok:false,reason:'Deck code checksum mismatch'});

  // Flip one payload character -> checksum fails.
  const tamperedBody=valid.slice(0,10)+(valid[10]==='A'?'B':'A')+valid.slice(11);
  expect(decodeDeckCode(tamperedBody).ok).toBe(false);

  // Bad inputs.
  expect(decodeDeckCode('')).toMatchObject({ok:false});
  expect(decodeDeckCode('   ')).toMatchObject({ok:false});
  expect(decodeDeckCode('BAD1-'+valid.slice(5))).toEqual({ok:false,reason:'Invalid prefix: expected QBC1-'});
  expect(decodeDeckCode('QBC1-SHORT-00')).toEqual({ok:false,reason:'Invalid deck code format'});

  // Encoding illegal decks throws.
  expect(()=>encodeDeckCode([1,2,3])).toThrow(/15 cards/);
  expect(()=>encodeDeckCode([...starterDeck.slice(1),1010])).toThrow(/1\.\.145/);
  expect(()=>encodeDeckCode([...starterDeck.slice(2),96,96])).toThrow(/Too many copies/);
  expect(()=>encodeDeckCode([1,1,1,...starterDeck.slice(3)])).toThrow(/Too many copies/);
});

test('analyzeDeckCurve computes accurate rank curve, rarities, power stats and mechanic counts',()=>{
  expect(analyzeDeckCurve([])).toEqual({
    total:0,
    ranks:{rank1:0,rank2:0,rank3:0,replace:0},
    rarities:{standard:0,legendary:0},
    avgPower:0,
    totalPower:0,
    mechanics:{enhance:0,enfeeble:0,destroy:0,spawn:0,replace:0},
  });

  const starter=analyzeDeckCurve(starterDeck);
  expect(starter.total).toBe(15);
  expect(starter.ranks.rank1+starter.ranks.rank2+starter.ranks.rank3+starter.ranks.replace).toBe(15);
  expect(starter.ranks).toEqual({rank1:10,rank2:5,rank3:0,replace:0});
  expect(starter.rarities).toEqual({standard:15,legendary:0});
  expect(starter.mechanics.enhance).toBe(3); // #9 Mu, #12 Cactuar, #13 Crystalline Crab
  expect(starter.mechanics.enfeeble).toBe(0);
  expect(starter.mechanics.destroy).toBe(0);
  expect(starter.mechanics.spawn).toBe(0);
  expect(starter.mechanics.replace).toBe(0);

  const chain=analyzeDeckCurve(chainDeck);
  expect(chain.ranks.replace).toBe(1); // #51 Insectoid Chimera
  expect(chain.mechanics.replace).toBe(1);
  expect(chain.mechanics.destroy).toBeGreaterThanOrEqual(4); // #35, #40, #41, #43
  expect(chain.mechanics.enfeeble).toBeGreaterThanOrEqual(4); // #20, #26, #27, #41
  expect(chain.mechanics.spawn).toBe(3); // #10 x2, #40 x1

  const summon=analyzeDeckCurve(summonDeck);
  expect(summon.rarities).toEqual({standard:13,legendary:2}); // #96 Shiva, #98 Titan
  expect(summon.mechanics.spawn).toBe(4); // #10 x2, #40 x1, #96 x1
});

test('derivedTokensForCard and parentCardsForToken index single-step, board-spawn and multi-generation token chains',()=>{
  // Multi-generation chain: #056 Grangalan -> 1056 Grangalan Junior -> 2056 Baby Grangalan.
  expect(derivedTokensForCard(56)).toEqual([1056,2056]);
  expect(derivedTokensForCard(1056)).toEqual([2056]);
  expect(derivedTokensForCard(2056)).toEqual([]);
  expect(parentCardsForToken(1056)).toEqual([56]);
  expect(parentCardsForToken(2056)).toEqual([56,1056]);

  // Board-spawn families.
  expect(derivedTokensForCard(96)).toEqual([1961,1962,1963]);
  expect(derivedTokensForCard(105)).toEqual([2051,2052,2053]);
  expect(derivedTokensForCard(134)).toEqual([1134,2134,3134]);
  expect(parentCardsForToken(1963)).toEqual([96]);
  expect(parentCardsForToken(3134)).toEqual([134]);

  // Multi-token hand generators and non-token cards.
  expect(derivedTokensForCard(110)).toEqual([1110,2110]);
  expect(derivedTokensForCard(125)).toEqual([1125,2125]);
  expect(derivedTokensForCard(1)).toEqual([]);
  expect(parentCardsForToken(1)).toEqual([]);

  // Every defined token in tokenCards has at least one discoverable parent card.
  for(const token of tokenCards){
    expect(parentCardsForToken(token.id).length,`${token.id} ${token.name}`).toBeGreaterThan(0);
  }
});
