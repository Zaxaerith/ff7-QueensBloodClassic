import {getLocale,t} from './i18n/index.js';
import {isLocale,type Locale} from './i18n/locales.js';
import {localizedName,matchesCardName} from './i18n/card-names.js';
import {byId,playableCards,tokenCards,deckPresets,type Card} from './cards.js';
import {createGame} from './engine.js';
import {getCardEvidence} from './evidence.js';
import type {BotDifficulty} from './bot.js';
import {defaultAudioVolumes} from './audio-controller.js';

export const STORAGE={decks:'qbclassic.decks.v1',config:'qbclassic.config.v1',records:'qbclassic.records.v1',audio:'qbclassic.audio.v1'} as const;
export interface StoragePort {getItem(key:string):string|null;setItem(key:string,value:string):void;}
export interface SavedDeck {id:string;name:string;cards:number[];}
export interface DeckStore {version:1;selectedId:string|null;decks:SavedDeck[];}
export interface UiConfig {version:1;density:'comfortable'|'compact';textSize:'normal'|'large';reduceMotion:boolean;locale?:Locale;}
export interface AudioConfig {
  version:1;
  bgmVolume:number;
  bgmMuted:boolean;
  sfxVolume:number;
  sfxMuted:boolean;
}
export interface MatchRecord {id:string;date:string;deckName:string;difficulty:BotDifficulty;seed:number;scores:[number,number];}
export const defaultConfig:UiConfig={version:1,density:'comfortable',textSize:'normal',reduceMotion:false};
export function validateDeck(cards:readonly number[]):string|null {
  try{createGame([cards,cards],1);return null;}catch(error){const message=error instanceof Error?error.message:String(error);
    const id=/#(\d+)/.exec(message)?.[1];
    if(message.startsWith('Card #'))return t('invalidDeckCard',id);
    if(message.startsWith('Too many copies'))return t('invalidDeckCopies',id);
    if(message.startsWith('Generated cards'))return t('invalidDeckToken');
    return t('invalidDeckCount');}
}
export function addReason(cards:readonly number[],id:number):string|null {
  const card=byId.get(id);
  if(!card)return t("cardUnavailableForDeck", id);
  if(card.rarity==='token')return t("generatedCardsCanOnlyAppearDuringPlay");
  if(cards.length>=15)return t("theDeckAlreadyHas15CardsRemoveA");
  const cap=card.rarity==='legendary'?1:2;
  if(cards.filter(n=>n===id).length>=cap)return t("cardCopyLimit", card.rarity==='legendary'?t("legendary"):t("normal"), cap);
  return null;
}
export function deckCardAvailability(cards:readonly number[],id:number) {
  const count=cards.filter(cardId=>cardId===id).length;
  const reason=addReason(cards,id);
  if(reason)return {count,available:0,reason};
  const trial=[...cards,id];
  while(!addReason(trial,id))trial.push(id);
  return {count,available:trial.length-cards.length,reason};
}
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
export function readDecks(raw:string|null):{data:DeckStore;issues:string[]} {
  const data:DeckStore={version:1,selectedId:null,decks:[]},issues:string[]=[];
  if(raw===null)return {data,issues};
  try{
    const parsed:unknown=JSON.parse(raw);
    if(!object(parsed)||parsed.version!==1||!Array.isArray(parsed.decks))throw Error(t("invalidDeckStorageVersionOrFormatOriginalData"));
    const ids=new Set<string>();
    for(const row of parsed.decks){
      if(!object(row)||typeof row.id!=='string'||!row.id||ids.has(row.id)||typeof row.name!=='string'||!row.name.trim()||row.name.length>40||!Array.isArray(row.cards)||row.cards.some(n=>!Number.isInteger(n))){issues.push(t("skippedInvalidOrDuplicateDecksOriginalDataRetained"));continue;}
      const error=validateDeck(row.cards as number[]);
      if(error){issues.push(t("storedDeckUnavailable", row.name, error));continue;}
      ids.add(row.id);data.decks.push({id:row.id,name:row.name,cards:[...row.cards] as number[]});
    }
    data.selectedId=typeof parsed.selectedId==='string'&&ids.has(parsed.selectedId)?parsed.selectedId:null;
  }catch(error){issues.push(t("deckReadFailed", error instanceof SyntaxError?t('invalidFormat'):error instanceof Error?error.message:t('invalidFormat')));}
  return {data,issues};
}
export function readConfig(raw:string|null):UiConfig {
  if(!raw)return {...defaultConfig};
  try{const v=JSON.parse(raw);if(v?.version===1&&['comfortable','compact'].includes(v.density)&&['normal','large'].includes(v.textSize)&&typeof v.reduceMotion==='boolean')return {version:1,density:v.density,textSize:v.textSize,reduceMotion:v.reduceMotion,...(isLocale(v.locale)?{locale:v.locale}:{})};}catch{}
  return {...defaultConfig};
}
export function readAudioConfig(raw:string|null):AudioConfig {
  const defaults:AudioConfig={version:1,bgmVolume:defaultAudioVolumes.bgm,bgmMuted:false,
    sfxVolume:defaultAudioVolumes.sfx,sfxMuted:false};
  let value:unknown;
  try{value=JSON.parse(raw??'null');}catch{return defaults;}
  if(!object(value)||value.version!==1)return defaults;
  const volume=(stored:unknown,fallback:number)=>typeof stored==='number'&&Number.isFinite(stored)
    ?Math.round(Math.min(100,Math.max(0,stored))):fallback;
  return {
    version:1,
    bgmVolume:volume(value.bgmVolume,defaults.bgmVolume),
    bgmMuted:value.bgmMuted===true,
    sfxVolume:volume(value.sfxVolume,defaults.sfxVolume),
    sfxMuted:value.sfxMuted===true,
  };
}
export function readRecords(raw:string|null):MatchRecord[]{
  try{const v=JSON.parse(raw??'null');if(v?.version!==1||!Array.isArray(v.records))return [];
    return v.records.filter((r:unknown)=>object(r)&&typeof r.id==='string'&&typeof r.date==='string'&&Number.isFinite(Date.parse(r.date))&&typeof r.deckName==='string'&&['easy','normal','hard'].includes(r.difficulty as string)&&Number.isInteger(r.seed)&&Number(r.seed)>=0&&Number(r.seed)<=0xFFFFFFFF&&Array.isArray(r.scores)&&r.scores.length===2&&r.scores.every(n=>Number.isSafeInteger(n)&&n>=0)).slice(0,20)
      .map((r:MatchRecord)=>({id:r.id,date:r.date,deckName:r.deckName,difficulty:r.difficulty,seed:r.seed,scores:[r.scores[0],r.scores[1]] as [number,number]}));
  }catch{return [];}
}
export function safeRead(storage:StoragePort|null,key:string):{raw:string|null;error:string|null}{
  try{return {raw:storage?.getItem(key)??null,error:storage?null:t("storageUnavailable")};}
  catch{return {raw:null,error:t("storageReadFailed")};}
}
export function safeWrite(storage:StoragePort|null,key:string,value:unknown,backupRaw?:string|null):string|null {
  if(!storage)return t("storageWriteUnavailable");
  try{if(backupRaw)storage.setItem(key+'.recovery',backupRaw);storage.setItem(key,JSON.stringify(value));return null;}
  catch{return t("deckWriteFailed");}
}
export interface LibraryEntry {id:number;name:string;card:Card|null;rarity:Card['rarity']|null;}
export function libraryEntries(catalog:unknown):LibraryEntry[]{
  const rows=object(catalog)&&Array.isArray(catalog.cards)?catalog.cards:[];
  const indexed=new Map<number,{name:string;rarity:Card['rarity']|null}>();
  for(const row of rows)if(object(row)&&Number.isInteger(row.id)&&typeof row.name==='string')indexed.set(Number(row.id),{name:row.name,rarity:row.rarity==='standard'||row.rarity==='legendary'?row.rarity:null});
  return Array.from({length:145},(_,i)=>{const id=i+1,card=byId.get(id)??null;return {id,name:card?.name??indexed.get(id)?.name??t("catalogCardPlaceholder", id),card,rarity:card?.rarity??indexed.get(id)?.rarity??null};});
}
export const tokenEntries=():LibraryEntry[]=>tokenCards.map(card=>({id:card.id,name:card.name,card,rarity:'token'}));
/** UI availability follows the same catalog entries and executable definitions
 * as the collection/deck editor; evidence status remains separate. */
export function libraryRuleSummary(entries:readonly LibraryEntry[]):string {
  const numbered=entries.filter(entry=>entry.rarity!=='token');
  const executable=numbered.filter(entry=>entry.card!==null).length;
  return `${numbered.length} 张编号牌 · ${executable} 张可执行候选${executable<numbered.length?t("unimplementedCountSuffix", numbered.length-executable):''}`;
}
export type AbilityFilter='all'|'none'|'entry'|'aura'|'death'|'generate'|'condition'|'special';
export type LibrarySort='id'|'name'|'rank'|'power';
export function sortLibraryEntries(entries:readonly LibraryEntry[],order:LibrarySort):LibraryEntry[] {
  const compare=(a:LibraryEntry,b:LibraryEntry)=>{
    switch(order){
      case 'name':return localizedName(a.id,a.name).localeCompare(localizedName(b.id,b.name),getLocale(),{sensitivity:'base',numeric:true});
      case 'rank':return (a.card?.cost??Infinity)-(b.card?.cost??Infinity);
      case 'power':return (b.card?.power??-Infinity)-(a.card?.power??-Infinity);
      default:return 0;
    }
  };
  return [...entries].sort((a,b)=>compare(a,b)||a.id-b.id);
}
export interface LibraryFilter {query:string;rank:string;power:string;rarity:string;ability:AbilityFilter;}
export const emptyFilter=():LibraryFilter=>({query:'',rank:'all',power:'all',rarity:'all',ability:'all'});
export function matchesEntry(entry:LibraryEntry,filter:LibraryFilter):boolean {
  const card=entry.card;
  if(!matchesCardName(entry.id,entry.name,filter.query))return false;
  const facts=card??(entry.id<=145?getCardEvidence(entry.id).knownFacts:undefined);
  if(filter.rank==='0'&&card?.placement!=='replace')return false;
  if(filter.rank!=='all'&&String(card?.placement==='replace'?0:facts?.cost)!==filter.rank)return false;
  if(filter.rarity!=='all'&&entry.rarity!==filter.rarity)return false;
  if(filter.power!=='all'){
    const p=facts?.power;if(p===undefined)return false;
    if(filter.power==='low'&&p>2||filter.power==='mid'&&(p<3||p>5)||filter.power==='high'&&p<6)return false;
  }
  if(filter.ability==='all')return true;
  if(!card)return false;
  if(filter.ability==='none')return !card.abilities.length&&!card.placement&&!card.pawnBoost&&!card.laneBonus&&!card.scorePolicy;
  if(filter.ability==='special')return !!(card.pawnBoost||card.laneBonus||card.scorePolicy);
  if(filter.ability==='entry')return card.abilities.some(a=>a.timing==='onPlay');
  if(filter.ability==='aura')return card.abilities.some(a=>a.timing==='aura'||a.timing==='dynamic');
  if(filter.ability==='death')return card.placement==='replace'||card.abilities.some(a=>a.timing==='onDestroy'||a.timing==='onReplace');
  if(filter.ability==='condition')return card.abilities.some(a=>['firstEnhanced','firstEnfeebled','threshold'].includes(a.timing));
  return card.abilities.some(a=>'actions' in a&&a.actions.some(a=>a.kind==='addToHand'||a.kind==='spawn'));
}
export function presetDeck(index=0):SavedDeck {const preset=deckPresets[index]??deckPresets[0];return {id:`preset:${index}`,name:preset.name,cards:[...preset.cards]};}
export const numberedPlayable=playableCards;
