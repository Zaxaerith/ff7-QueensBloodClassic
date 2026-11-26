// Public visual evidence only: never constructs an intermediate Game.
import {t} from './i18n/index.js';
import {displayName} from './i18n/card-names.js';
import type {RuleEvent} from './engine.js';
import type {PublicBatch,PublicMatch} from './match-presentation.js';
import {byId} from './cards.js';

export type TransitionStage='start'|'turn'|'deal'|'draw';
export type EffectStage='commit'|'events'|'settle'|'summary'|'scoring'|TransitionStage;
export interface CellChange {row:number;col:number;kind:'power'|'pawns';text:string;delta:number;}
export interface EventTarget {row:number;col:number;kind:string;text:string;current:boolean;source:string|null;}
export interface MatchEffect {
  key:number;batch:number;stage:EffectStage;actor:0|1;action:'play'|'pass'|'transition';motion:boolean;
  events:readonly RuleEvent[];changes:readonly CellChange[];targets:readonly EventTarget[];
  placement:RuleEvent|undefined;
  opening?:boolean;
  drawIndex?:number;
  rivalHandCount?:number;
  scoring?:{result:PublicMatch['result'];revealed:number;totals:boolean};
}
const location=(e:RuleEvent)=>e.row!==undefined&&e.col!==undefined&&e.row>=0&&e.row<3&&e.col>=0&&e.col<5;
const name=(e:RuleEvent)=>displayName(e.cardId??-1,byId.get(e.cardId??-1)?.name??t("card"));
/** Only the card explicitly identified by its OWN trigger event is a known
 * source. PowerChanged.reason alone cannot identify the upstream source. */
export function eventSource(e:RuleEvent):string|null {
  const timing=({CardPlayed:'onPlay',CardDestroyed:'onDestroy',CardEnhanced:'firstEnhanced',CardEnfeebled:'firstEnfeebled',ThresholdReached:'threshold'} as Record<string,string>)[e.type];
  if(!timing||!byId.get(e.cardId??-1)?.abilities.some(a=>a.timing===timing))return null;
  return ({onPlay:t("onPlayAbility"),onDestroy:t("onDestructionAbility"),firstEnhanced:t("enhancementAbility"),firstEnfeebled:t("enfeeblementAbility"),threshold:t("thresholdAbility")} as Record<string,string>)[timing];
}
export function effectText(e:RuleEvent):string {
  const signed=(n:number)=>`${n>=0?'+':''}${n}`;
  switch(e.type){
    case 'CardPlayed':return t("playedCardAt", name(e), e.row!+1, e.col!+1);
    case 'CardReplaced':return t("replacedCard", name(e));
    case 'CardDestroyed':return `${name(e)} ${e.reason==='replaced'?t("replaced"):t("destroyed")}`;
    // These events record a rule modifier, not every intermediate displayed power.
    case 'PowerChanged':return t("cardPowerDelta", name(e), signed(e.amount!));
    case 'DerivedPowerChanged':return t("cardDerivedPowerChanged", name(e));
    case 'CardEnhanced':return t("firstEnhancementEvent", name(e), byId.get(e.cardId??-1)?.abilities.some(a=>a.timing==='firstEnhanced')?t("abilityTriggered"):t("statusApplied"));
    case 'CardEnfeebled':return t("firstEnfeeblementEvent", name(e), byId.get(e.cardId??-1)?.abilities.some(a=>a.timing==='firstEnfeebled')?t("abilityTriggered"):t("statusApplied"));
    case 'ThresholdReached':return t("thresholdTriggeredEvent", name(e));
    case 'CardSpawned':return t("cardSpawnedEvent", name(e), e.row!+1, e.col!+1);
    case 'PawnsClaimed':return t("pawnsAtPosition", e.row!+1, e.col!+1, e.amount);
    case 'CardAddedToHand':return e.player===1?t("computerHandEvent", e.reason==='draw'?t("drew"):t("generatedInHand")):e.reason==='draw'?t("youDrewOneCard"):t("playerHandGeneration", name(e));
    case 'TurnPassed':return `${e.player===0?t("you"):t("computer")} · ${t("pass")}`;
    default:return '';
  }
}
export function netChanges(before:PublicMatch,after:PublicMatch):CellChange[]{
  const changes:CellChange[]=[];
  for(let row=0;row<3;row++)for(let col=0;col<5;col++){
    const a=before.board[row][col],b=after.board[row][col];
    if(a.card&&b.card&&a.card.instanceId===b.card.instanceId&&a.card.power!==b.card.power){
      const delta=b.card.power-a.card.power;
      changes.push({row,col,kind:'power',delta,text:`${a.card.power} → ${b.card.power} (${delta>0?'+':''}${delta})`});
    }else if(!a.card&&!b.card&&(a.owner!==b.owner||a.pawns!==b.pawns)){
      const label=(tile:typeof a)=>tile.owner===null?t("emptyTile"):`${tile.owner===0?t("you"):t("computer")} ♟${tile.pawns}`;
      changes.push({row,col,kind:'pawns',delta:b.pawns-a.pawns,text:`${label(a)} → ${label(b)}`});
    }
  }
  return changes;
}
export function effectTargets(events:readonly RuleEvent[],before:PublicMatch,after:PublicMatch):EventTarget[]{
  return events.filter(location).filter(e=>{
    if(e.type==='PowerChanged'&&e.amount===0)return false;
    if(e.type!=='PawnsClaimed')return !!effectText(e);
    const a=before.board[e.row!][e.col!],b=after.board[e.row!][e.col!];
    return !a.card&&!b.card&&(a.owner!==b.owner||a.pawns!==b.pawns);
  }).map(e=>({row:e.row!,col:e.col!,kind:e.type,
    text:effectText(e),source:eventSource(e),current:e.type==='PawnsClaimed'||e.instanceId!==undefined&&after.board[e.row!][e.col!].card?.instanceId===e.instanceId}));
}
export function effectPlan(batch:PublicBatch){
  // Sequence is the engine's existing order, never sorted by type or stage.
  const events=batch.events.filter(e=>!['MatchStarted','MulliganCommitted','TurnEnded','MatchEnded','TurnPassed'].includes(e.type)&&effectText(e));
  const size=Math.max(1,Math.ceil(events.length/4)),groups:RuleEvent[][]=[];
  for(let i=0;i<events.length;i+=size)groups.push(events.slice(i,i+size));
  return {groups,placement:batch.events.find(e=>e.type==='CardPlayed'),changes:netChanges(batch.before,batch.after)};
}

export type LegendaryVfxKind='mako'|'abyss'|'chain';
export interface LegendaryVfxBurst {
  readonly kind:LegendaryVfxKind;
  readonly row?:number;
  readonly col?:number;
}

/** Classify iconic legendary cards (#086-#106 party/summons, #143 Sephiroth, #144 Emerald Witch, #145 Queen). */
export function legendaryCardVfx(cardId:number|undefined):'mako'|'abyss'|null {
  if(cardId===undefined)return null;
  if(cardId===143||cardId===145)return 'abyss';
  if((cardId>=86&&cardId<=106)||cardId===144)return 'mako';
  return null;
}

/** Detect whether a resolved event batch warrants a crisp 260ms PS1 legendary crystal pulse. */
export function batchLegendaryVfx(events:readonly RuleEvent[],placement?:RuleEvent):LegendaryVfxBurst|null {
  const cardKind=placement?.type==='CardPlayed'?legendaryCardVfx(placement.cardId):null;
  if(cardKind){
    return {
      kind:cardKind,
      ...(placement?.row!==undefined?{row:placement.row}:{}),
      ...(placement?.col!==undefined?{col:placement.col}:{}),
    };
  }
  let destroyedCount=0;
  let lastDestroyed:RuleEvent|undefined;
  for(const event of events){
    if(event.type==='CardDestroyed'){
      destroyedCount++;
      if(event.row!==undefined&&event.col!==undefined)lastDestroyed=event;
    }
  }
  if(destroyedCount>=2){
    return {
      kind:'chain',
      ...(lastDestroyed?.row!==undefined?{row:lastDestroyed.row}:{}),
      ...(lastDestroyed?.col!==undefined?{col:lastDestroyed.col}:{}),
    };
  }
  return null;
}
