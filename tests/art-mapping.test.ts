import {expect,test} from 'vitest';
import {readFileSync} from 'node:fs';
import {compileArtMapping} from '../tools/art-mapping.mjs';
const baseline=()=>JSON.parse(readFileSync(new URL('../data/classic-art-mapping.json',import.meta.url),'utf8'));
const fragment=(name:string,id:number,status:string)=>({name,value:{schema:'qb-classic-art-fragment',version:1,batch:name,cards:[{cardId:id,changes:{productionStatus:status}}]}});

test('independent per-batch fragments merge deterministically without mutating the research baseline',()=>{
  const base=baseline(),saved=structuredClone(base),a=fragment('art-03.json',7,'candidate-a'),b=fragment('art-04.json',10,'candidate-b');
  const first=compileArtMapping(base,[b,a]),second=compileArtMapping(base,[a,b]);
  expect(JSON.stringify(first)).toBe(JSON.stringify(second));expect(base).toEqual(saved);
  expect(first.cards).toHaveLength(145);expect(first.cards[6].productionStatus).toBe('candidate-a');
  expect(first.cards[9].productionStatus).toBe('candidate-b');expect(first.summary.categories).toEqual(base.summary.categories);
  expect(compileArtMapping(base,[])).toEqual(base);
});

test('overlapping ownership, renamed IDs and unrecorded evidence fail instead of last-write-wins',()=>{
  const base=baseline();
  expect(()=>compileArtMapping(base,[fragment('a',7,'a'),fragment('b',7,'b')])).toThrow(/claimed by both/);
  const bad=fragment('bad',7,'a');
  bad.value.cards[0].changes={name:'Other entity'} as never;
  expect(()=>compileArtMapping(base,[bad])).toThrow(/cannot change/);
  bad.value.cards[0].changes={evidence:['not-a-source']} as never;
  expect(()=>compileArtMapping(base,[bad])).toThrow(/Unknown evidence/);
});
