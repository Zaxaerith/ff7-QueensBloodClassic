import {byId,playableCards,tokenCards,type Card} from './cards.js';
import {createGame} from './engine.js';

const DECK_CODE_PREFIX='QBC1-';
const DECK_CODE_PATTERN=/^QBC1-([0-9A-Z]{30})-([0-9A-Z]{2})$/;
const CHECKSUM_MOD=36*36;

export type DecodeDeckResult=
  | {readonly ok:true;readonly cards:number[]}
  | {readonly ok:false;readonly reason:string};

export interface DeckCurveAnalysis {
  readonly total:number;
  readonly ranks:{
    readonly rank1:number;
    readonly rank2:number;
    readonly rank3:number;
    readonly replace:number;
  };
  readonly rarities:{
    readonly standard:number;
    readonly legendary:number;
  };
  readonly avgPower:number;
  readonly totalPower:number;
  readonly mechanics:{
    readonly enhance:number;
    readonly enfeeble:number;
    readonly destroy:number;
    readonly spawn:number;
    readonly replace:number;
  };
}

function deckCodeChecksum(body:string):string {
  let hash=2166136261;
  for(let i=0;i<body.length;i++){
    hash^=body.charCodeAt(i);
    hash=Math.imul(hash,16777619);
  }
  return ((hash>>>0)%CHECKSUM_MOD).toString(36).toUpperCase().padStart(2,'0');
}

function validateNumberedDeck(cards:readonly number[]):string|null {
  if(cards.length!==15)return 'Deck must contain exactly 15 cards';
  for(const id of cards){
    if(!Number.isInteger(id)||id<1||id>145)return `Card #${id} is out of numbered range 1..145`;
  }
  try{
    createGame([cards,cards],1);
    return null;
  }catch(error){
    return error instanceof Error?error.message:'Invalid deck composition';
  }
}

/** Encode a legal 15-card numbered deck into a compact 38-char QBC1 share code. */
export function encodeDeckCode(cards:readonly number[]):string {
  const err=validateNumberedDeck(cards);
  if(err)throw new Error(err);
  const sorted=[...cards].sort((a,b)=>a-b);
  const payload=sorted.map(id=>id.toString(36).toUpperCase().padStart(2,'0')).join('');
  const body=`${DECK_CODE_PREFIX}${payload}`;
  return `${body}-${deckCodeChecksum(body)}`;
}

/** Decode and strictly validate a QBC1 deck share code (whitespace/case tolerant). */
export function decodeDeckCode(raw:string):DecodeDeckResult {
  if(typeof raw!=='string')return {ok:false,reason:'Deck code must be a string'};
  const normalized=raw.trim().replace(/\s+/g,'').toUpperCase();
  if(!normalized)return {ok:false,reason:'Empty deck code'};
  if(!normalized.startsWith(DECK_CODE_PREFIX))return {ok:false,reason:'Invalid prefix: expected QBC1-'};
  const match=DECK_CODE_PATTERN.exec(normalized);
  if(!match)return {ok:false,reason:'Invalid deck code format'};
  const [,payload,checksum]=match;
  const expected=deckCodeChecksum(`${DECK_CODE_PREFIX}${payload}`);
  if(checksum!==expected)return {ok:false,reason:'Deck code checksum mismatch'};

  const cards:number[]=[];
  for(let i=0;i<30;i+=2){
    const id=parseInt(payload.slice(i,i+2),36);
    if(!Number.isInteger(id)||id<1||id>145)return {ok:false,reason:`Invalid card ID #${id}`};
    cards.push(id);
  }
  const err=validateNumberedDeck(cards);
  if(err)return {ok:false,reason:err};
  return {ok:true,cards};
}

function classifyCardMechanics(card:Card):{enhance:boolean;enfeeble:boolean;destroy:boolean;spawn:boolean;replace:boolean} {
  let enhance=false,enfeeble=false,destroy=false,spawn=false;
  const replace=card.placement==='replace';

  for(const ability of card.abilities){
    if(ability.timing==='aura'){
      if(ability.amount>0)enhance=true;
      else if(ability.amount<0)enfeeble=true;
      continue;
    }
    if(ability.timing==='dynamic'){
      if(ability.count.status==='enhanced')enhance=true;
      else if(ability.count.status==='enfeebled')enfeeble=true;
      continue;
    }
    if(ability.timing==='firstEnhanced')enhance=true;
    if(ability.timing==='firstEnfeebled')enfeeble=true;
    if(ability.timing==='onDestroy'||ability.timing==='onCardDestroyed')destroy=true;
    for(const action of ability.actions){
      if(action.kind==='destroy'){destroy=true;continue;}
      if(action.kind==='spawn'||action.kind==='addToHand'){spawn=true;continue;}
      if(action.kind==='power'){
        if(typeof action.amount==='number'){
          if(action.amount>0)enhance=true;
          else if(action.amount<0)enfeeble=true;
        } else if(action.amount==='replacedPower'){
          enhance=true;
        } else {
          if((action.amount.factor??1)>=0)enhance=true;
          else enfeeble=true;
        }
      }
    }
  }

  return {enhance,enfeeble,destroy,spawn,replace};
}

/** Compute rank curve, rarity breakdown, power stats, and mechanic counts for a deck. */
export function analyzeDeckCurve(cards:readonly number[]):DeckCurveAnalysis {
  let total=0,rank1=0,rank2=0,rank3=0,replace=0,standard=0,legendary=0,totalPower=0;
  let enhance=0,enfeeble=0,destroy=0,spawn=0,replaceMech=0;

  for(const id of cards){
    const card=byId.get(id);
    if(!card)continue;
    total++;
    totalPower+=card.power;
    if(card.placement==='replace')replace++;
    else if(card.cost===1)rank1++;
    else if(card.cost===2)rank2++;
    else if(card.cost>=3)rank3++;

    if(card.rarity==='legendary')legendary++;
    else if(card.rarity==='standard')standard++;

    const m=classifyCardMechanics(card);
    if(m.enhance)enhance++;
    if(m.enfeeble)enfeeble++;
    if(m.destroy)destroy++;
    if(m.spawn)spawn++;
    if(m.replace)replaceMech++;
  }

  const avgPower=total>0?Math.round((totalPower/total)*100)/100:0;
  return {
    total,
    ranks:{rank1,rank2,rank3,replace},
    rarities:{standard,legendary},
    avgPower,
    totalPower,
    mechanics:{enhance,enfeeble,destroy,spawn,replace:replaceMech},
  };
}

function buildTokenGraphs():{
  directChildren:Map<number,number[]>;
  directParents:Map<number,number[]>;
} {
  const directChildren=new Map<number,number[]>();
  const directParents=new Map<number,number[]>();
  const allCards=[...playableCards,...tokenCards];

  for(const card of allCards){
    const children:number[]=[];
    const seen=new Set<number>();
    for(const ability of card.abilities){
      if(!('actions' in ability))continue;
      for(const action of ability.actions){
        const ids=action.kind==='addToHand'?action.cards:action.kind==='spawn'?action.cardsByRank:[];
        for(const childId of ids){
          if(childId===card.id||seen.has(childId)||!byId.has(childId))continue;
          seen.add(childId);
          children.push(childId);
          const parents=directParents.get(childId)??[];
          if(!parents.includes(card.id))parents.push(card.id);
          directParents.set(childId,parents);
        }
      }
    }
    if(children.length)directChildren.set(card.id,children);
  }
  return {directChildren,directParents};
}

const TOKEN_GRAPHS=buildTokenGraphs();

/** Return all derived token IDs reachable from a card (including multi-generation chains like #056 -> 1056 -> 2056). */
export function derivedTokensForCard(cardId:number):number[] {
  const result:number[]=[];
  const visited=new Set<number>([cardId]);
  const queue=[...(TOKEN_GRAPHS.directChildren.get(cardId)??[])];
  while(queue.length){
    const next=queue.shift()!;
    if(visited.has(next))continue;
    visited.add(next);
    result.push(next);
    for(const child of TOKEN_GRAPHS.directChildren.get(next)??[]){
      if(!visited.has(child))queue.push(child);
    }
  }
  return result;
}

/** Return all ancestor/parent card IDs that can generate or spawn the given token (playable parents first, sorted ascending). */
export function parentCardsForToken(tokenId:number):number[] {
  const result:number[]=[];
  const visited=new Set<number>([tokenId]);
  const queue=[...(TOKEN_GRAPHS.directParents.get(tokenId)??[])];
  while(queue.length){
    const next=queue.shift()!;
    if(visited.has(next))continue;
    visited.add(next);
    result.push(next);
    for(const parent of TOKEN_GRAPHS.directParents.get(next)??[]){
      if(!visited.has(parent))queue.push(parent);
    }
  }
  return result.sort((a,b)=>a-b);
}
