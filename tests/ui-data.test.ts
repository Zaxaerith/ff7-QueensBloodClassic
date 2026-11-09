import {expect,test} from 'vitest';
import {readFileSync} from 'node:fs';
import {byId,starterDeck} from '../src/cards.js';
import {createPosition,legalMoves} from '../src/engine.js';
import {readDecks,validateDeck,addReason,deckCardAvailability,sortLibraryEntries,readConfig,defaultConfig,readRecords,safeRead,safeWrite,libraryEntries,tokenEntries,matchesEntry,emptyFilter,libraryRuleSummary,STORAGE,type StoragePort} from '../src/ui-data.js';
import {boardNextCell,confirmable,publicEventLabel} from '../src/ui-match.js';
const catalog=JSON.parse(readFileSync(new URL('../data/card-catalog.json',import.meta.url),'utf8'));
const rows=libraryEntries(catalog);
test('versioned named decks restore selection and use the existing deck validator',()=>{
  const raw=JSON.stringify({version:1,selectedId:'one',decks:[{id:'one',name:'经典',cards:starterDeck},{id:'two',name:'第二套',cards:starterDeck}]});
  const result=readDecks(raw);expect(result.issues).toEqual([]);expect(result.data.selectedId).toBe('one');expect(result.data.decks).toHaveLength(2);
  expect(validateDeck(result.data.decks[0].cards)).toBeNull();expect(result.data.decks[0]).not.toHaveProperty('game');
  expect(readDecks(JSON.stringify(result.data))).toEqual(result);
});
test('corrupt/old/unsupported/illegal decks are reported without rewriting the input',()=>{
  for(const raw of ['{',JSON.stringify({version:0,decks:[]}),JSON.stringify({version:5,decks:[]})]){expect(readDecks(raw).issues.length).toBeGreaterThan(0);expect(readDecks(raw).data.decks).toEqual([]);}
  const raw=JSON.stringify({version:1,selectedId:'bad',decks:[{id:'bad',name:'未实现',cards:[...starterDeck.slice(0,14),9999]},{id:'short',name:'不足',cards:[7]},{id:'good',name:'可用',cards:starterDeck}]});
  const result=readDecks(raw);expect(result.data.decks.map(d=>d.id)).toEqual(['good']);expect(result.data.selectedId).toBeNull();expect(result.issues).toHaveLength(2);expect(raw).toContain('9999');
});
test('incremental card-add messages agree with standard/legendary/token restrictions and final validation',()=>{
  expect(addReason([7,7],7)).toContain('最多 2');expect(addReason([86],86)).toContain('最多 1');expect(addReason([],9999)).toContain('尚未实现');expect(addReason([],1010)).toContain('衍生');expect(addReason(starterDeck,8)).toContain('已满');
  expect(addReason([],134)).toBeNull();expect(addReason([134],134)).toContain('最多 1');expect(validateDeck([...starterDeck.slice(0,14),134])).toBeNull();
});
test('storage failure preserves the previous payload, while explicit recovery writes keep the raw backup',()=>{
  const values=new Map<string,string>([[STORAGE.decks,'old-corrupt-json']]);
  const storage:StoragePort={getItem:key=>values.get(key)??null,setItem:(key,value)=>{values.set(key,value);}};
  expect(safeWrite(storage,STORAGE.decks,{version:1,decks:[]},'old-corrupt-json')).toBeNull();expect(values.get(STORAGE.decks+'.recovery')).toBe('old-corrupt-json');
  const before=values.get(STORAGE.decks),failed:StoragePort={getItem(){throw Error('denied');},setItem(){throw Error('quota');}};
  expect(safeRead(failed,STORAGE.decks).error).toContain('无法读取');expect(safeWrite(failed,STORAGE.decks,{})).toContain('保存失败');expect(values.get(STORAGE.decks)).toBe(before);expect(safeWrite(null,STORAGE.decks,{})).toContain('不可用');
});
test('settings default safely; stored summaries contain neither hands nor Game state',()=>{
  expect(readConfig('{')).toEqual(defaultConfig);expect(readConfig('{"version":9}')).toEqual(defaultConfig);
  const setting={version:1 as const,density:'compact' as const,textSize:'large' as const,reduceMotion:true};expect(readConfig(JSON.stringify(setting))).toEqual(setting);
  const record={id:'x',date:'2026-10-31T00:00:00Z',deckName:'经典',difficulty:'normal',seed:701,scores:[10,2]};
  expect(readRecords(JSON.stringify({version:1,records:[record]}))).toEqual([record]);expect(readRecords('{')).toEqual([]);
  expect(readRecords(JSON.stringify({version:1,records:[{...record,game:{hands:[[145],[]]}}]}))[0]).not.toHaveProperty('game');
});
test('145 numbered entries include the sourced J-Squad candidate and separate generated tokens',()=>{
  expect(rows).toHaveLength(145);expect(rows.map(r=>r.id)).toEqual(Array.from({length:145},(_,i)=>i+1));
  expect(rows[133]).toMatchObject({id:134,name:'J-Squad',card:byId.get(134),rarity:'legendary'});
  for(const row of rows)if(row.card)expect(row.card).toBe(byId.get(row.id));
  const tokens=tokenEntries();expect(tokens).toHaveLength(21);expect(tokens.every(t=>t.id>=1000)).toBe(true);
});
test('collection and help counts follow current entries instead of a second hard-coded rule count',()=>{
  expect(libraryRuleSummary(rows)).toBe('145 张编号牌 · 145 张可执行候选');
  const subset=[rows[0],{...rows[1],card:null}];
  expect(libraryRuleSummary(subset)).toBe('2 张编号牌 · 1 张可执行候选 · 1 张尚未实现');
  expect(libraryRuleSummary([...rows,...tokenEntries()])).toBe(libraryRuleSummary(rows));
});
test('Hype Johnnys cannot enter initial decks while their parent is available',()=>{
  expect(addReason([],134)).toBeNull();
  for(const id of [1134,2134,3134]){
    expect(addReason([],id)).toContain('衍生');expect(validateDeck([...starterDeck.slice(0,14),id])).not.toBeNull();
  }
});
test('editor availability combines free slots with existing copy limits without editing the draft',()=>{
  const fourteen = starterDeck.slice(0, 14);
  expect(deckCardAvailability(fourteen, 20)).toEqual({count:0,available:1,reason:null});
  expect(deckCardAvailability(fourteen, 1)).toEqual({count:2,available:0,reason:addReason(fourteen,1)});
  expect(deckCardAvailability([134], 134)).toEqual({count:1,available:0,reason:addReason([134],134)});
  expect(deckCardAvailability([], 134).available).toBe(1);
  expect(deckCardAvailability([], 1).available).toBe(2);
  for(const id of [1134,2134,3134]) expect(deckCardAvailability([], id).available).toBe(0);
  expect(deckCardAvailability(starterDeck, 20).reason).toBe(addReason(starterDeck,20));
  expect(fourteen).toEqual(starterDeck.slice(0,14));
});
test('visual card library sorting leaves catalog order intact and keeps tied powers in ID order',()=>{
  const sample = [rows[7],rows[0],rows[6],rows[50],rows[1]];
  expect(sortLibraryEntries(sample,'id').map(e=>e.id)).toEqual([1,2,7,8,51]);
  expect(sortLibraryEntries(sample,'power').map(e=>e.id)).toEqual([2,7,8,51,1]);
  expect(sortLibraryEntries(sample,'rank')[0].id).toBe(51);
  expect(sample.map(e=>e.id)).toEqual([8,1,7,51,2]);
});
test('ID/name, rank, power, rarity and actual ability filters work together',()=>{
  for(const query of ['86','#086','086','cloud'])expect(rows.filter(r=>matchesEntry(r,{...emptyFilter(),query})).some(r=>r.id===86)).toBe(true);
  expect(rows.filter(r=>matchesEntry(r,{...emptyFilter(),query:'#007'})).map(r=>r.id)).toEqual([7]);
  expect(rows.filter(r=>matchesEntry(r,{...emptyFilter(),query:'j-squad'}))).toHaveLength(1);
  expect(rows.filter(r=>matchesEntry(r,{...emptyFilter(),rank:'0'})).every(r=>r.card?.placement==='replace')).toBe(true);
  expect(rows.filter(r=>matchesEntry(r,{...emptyFilter(),power:'high'})).every(r=>r.card&&r.card.power>=6)).toBe(true);
  expect(rows.filter(r=>matchesEntry(r,{...emptyFilter(),rarity:'legendary'})).every(r=>r.rarity==='legendary')).toBe(true);
  expect(matchesEntry(rows[9],{...emptyFilter(),ability:'generate'})).toBe(true);
  expect(matchesEntry(rows[87],{...emptyFilter(),ability:'none'})).toBe(false);expect(matchesEntry(rows[87],{...emptyFilter(),ability:'special'})).toBe(true);
  expect(tokenEntries().filter(r=>matchesEntry(r,{...emptyFilter(),rank:'0'})).every(r=>r.card?.placement==='replace')).toBe(true);
});
test('keyboard grid navigation stays in its row/column and board boundaries',()=>{
  expect(boardNextCell(0,'ArrowLeft')).toBe(0);expect(boardNextCell(0,'ArrowUp')).toBe(0);expect(boardNextCell(4,'ArrowRight')).toBe(4);expect(boardNextCell(14,'ArrowDown')).toBe(14);
  expect(boardNextCell(6,'ArrowRight')).toBe(7);expect(boardNextCell(6,'ArrowDown')).toBe(11);
});
test('staging a placement cannot mutate state; confirmation rechecks the existing engine and busy lock',()=>{
  const game=createPosition({hands:[[7],[]],board:[{owner:0,row:1,col:0,pawns:1}]});const before=structuredClone(game),move=legalMoves(game,0)[0];
  expect(confirmable(game,move)).toBe(true);expect(confirmable(game,move,true)).toBe(false);expect(confirmable(game,null)).toBe(false);expect(confirmable(game,{...move,col:4})).toBe(false);expect(game).toEqual(before);
});
test('battle event UI displays counts, never opponent hand identities including generated cards',()=>{
  for(const reason of ['draw','generated'])expect(publicEventLabel({seq:1,type:'CardAddedToHand',player:1,cardId:145,reason})).not.toContain(byId.get(145)!.name);
  expect(publicEventLabel({seq:1,type:'CardPlayed',player:1,cardId:145})).toContain(byId.get(145)!.name);
});
