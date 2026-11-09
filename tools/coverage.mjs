import {readFile} from 'node:fs/promises';
const catalog=JSON.parse(await readFile(new URL('../data/card-catalog.json',import.meta.url),'utf8'));
console.log(JSON.stringify({summary:catalog.coverageSummary,evidence:catalog.evidenceSummary,remaining:catalog.cards.filter(c=>!c.rulesImplemented).map(({id,name,coverageStatus,researchNote})=>({id,name,coverageStatus,reason:researchNote}))},null,2));
