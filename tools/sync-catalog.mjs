import {readFile,writeFile} from 'node:fs/promises';
import {withRuntime} from './runtime.mjs';

const root=new URL('../',import.meta.url),file=new URL('data/card-catalog.json',root);
const wiki='https://finalfantasy.fandom.com/wiki/Final_Fantasy_Wiki%3ASandsea';
const guide='https://www.gamespot.com/articles/all-queens-blood-cards-in-final-fantasy-7-r-list-and-locations/1100-6521437/';
await withRuntime(async load=>{
  const {playableCards,tokenCards}=await load('cards');
  const {getCardEvidence,evidenceDimensions,evidenceSources}=await load('evidence');
  const johnnys=new Set(Object.values((await load('card-expansion')).M6_TOKEN));
  const catalog=JSON.parse(await readFile(file,'utf8')),implemented=new Map(playableCards.map(c=>[c.id,c]));
  const tokenIds=card=>[...new Set(card.abilities.flatMap(a=>'actions' in a?a.actions.flatMap(action=>action.kind==='addToHand'?action.cards:action.kind==='spawn'?action.cardsByRank:[]):[]))];
  catalog.note='145 numbered collection cards. Executable candidates are not in-game verified. Token definitions and rank variants are separate. coverageSummary categories partition the numbered catalog.';
  catalog.sources=[...new Set([...catalog.sources,wiki,guide])];
  catalog.evidenceSchemaVersion=1;
  catalog.evidenceSources=evidenceSources;
  for(const row of catalog.cards){
    const card=implemented.get(row.id);row.rulesImplemented=!!card;row.gameplayStatus=card?'incomplete':'not-implemented';row.coverageStatus=card?'candidate':'missing-data';
    const evidence=getCardEvidence(row.id);row.verification=evidence.dimensions;row.evidenceIssues=evidence.issues;
    row.sources=[...new Set(Object.values(evidence.dimensions).flatMap(d=>d.sources).map(id=>evidenceSources[id].url).filter(url=>url.startsWith('https://')))];
    delete row.researchNote;delete row.knownFacts;
    if(evidence.issues.length)row.researchNote=evidence.issues.join(' ');
    if(evidence.knownFacts)row.knownFacts=evidence.knownFacts;
    if(card){
      row.name=card.name;row.rarity=card.rarity;row.rules={...card};row.tokenRelations=tokenIds(card);
    } else {delete row.rules;delete row.tokenRelations;row.rarity=row.id>=86?'legendary':'standard';}
  }
  catalog.tokens=tokenCards.map(c=>({...c,generatedBy:[...playableCards,...tokenCards].filter(source=>tokenIds(source).includes(c.id)).map(source=>source.id),sources:johnnys.has(c.id)?[wiki,evidenceSources.johnnyTest.url,evidenceSources.johnnyDiscussion.url]:[wiki]}));
  catalog.coverageSummary={numbered:145,implemented:0,candidate:playableCards.length,missingData:145-playableCards.length,unsupported:0,executable:playableCards.length,tokens:tokenCards.length};
  catalog.evidenceSummary=Object.fromEntries(evidenceDimensions.map(d=>[d,Object.fromEntries(['verified','candidate','conflict','missing'].map(status=>[status,catalog.cards.filter(c=>c.verification[d].status===status).length]))]));
  const json=JSON.stringify(catalog,null,2)+'\n';
  await writeFile(file,json);await writeFile(new URL('site/catalog.json',root),json);
  console.log(JSON.stringify(catalog.coverageSummary));
});
