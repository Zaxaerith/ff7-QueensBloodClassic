// Public visual evidence only: never constructs an intermediate Game.
import type {RuleEvent} from './engine.js';
import type {PublicBatch,PublicMatch} from './match-presentation.js';
import {byId} from './cards.js';

export type EffectStage='commit'|'events'|'settle'|'summary'|'scoring';
export interface CellChange {row:number;col:number;kind:'power'|'pawns';text:string;delta:number;}
export interface EventTarget {row:number;col:number;kind:string;text:string;current:boolean;source:string|null;}
export interface MatchEffect {
  key:number;batch:number;stage:EffectStage;actor:0|1;action:'play'|'pass'|'mulligan';motion:boolean;
  events:readonly RuleEvent[];changes:readonly CellChange[];targets:readonly EventTarget[];
  placement:RuleEvent|undefined;
  scoring?:{result:PublicMatch['result'];revealed:number;totals:boolean};
}
const location=(e:RuleEvent)=>e.row!==undefined&&e.col!==undefined&&e.row>=0&&e.row<3&&e.col>=0&&e.col<5;
const name=(e:RuleEvent)=>byId.get(e.cardId??-1)?.name??'卡牌';
/** Only the card explicitly identified by its OWN trigger event is a known
 * source. PowerChanged.reason alone cannot identify the upstream source. */
export function eventSource(e:RuleEvent):string|null {
  const timing=({CardPlayed:'onPlay',CardDestroyed:'onDestroy',CardEnhanced:'firstEnhanced',CardEnfeebled:'firstEnfeebled',ThresholdReached:'threshold'} as Record<string,string>)[e.type];
  if(!timing||!byId.get(e.cardId??-1)?.abilities.some(a=>a.timing===timing))return null;
  return ({onPlay:'入场能力',onDestroy:'离场能力',firstEnhanced:'强化能力',firstEnfeebled:'弱化能力',threshold:'阈值能力'} as Record<string,string>)[timing];
}
export function effectText(e:RuleEvent):string {
  const signed=(n:number)=>`${n>=0?'+':''}${n}`;
  switch(e.type){
    case 'CardPlayed':return `${name(e)} 落牌 ${e.row!+1}-${e.col!+1}`;
    case 'CardReplaced':return `替换旧牌 ${name(e)}`;
    case 'CardDestroyed':return `${name(e)} ${e.reason==='replaced'?'被替换离场':'被摧毁'}`;
    // These events record a rule modifier, not every intermediate displayed power.
    case 'PowerChanged':return `${name(e)} 力量修正 ${signed(e.amount!)}`;
    case 'DerivedPowerChanged':return `${name(e)} 持续/动态力量重算`;
    case 'CardEnhanced':return `${name(e)} 首次强化${byId.get(e.cardId??-1)?.abilities.some(a=>a.timing==='firstEnhanced')?'能力触发':'状态'}`;
    case 'CardEnfeebled':return `${name(e)} 首次弱化${byId.get(e.cardId??-1)?.abilities.some(a=>a.timing==='firstEnfeebled')?'能力触发':'状态'}`;
    case 'ThresholdReached':return `${name(e)} 力量阈值触发`;
    case 'CardSpawned':return `${name(e)} 生成于 ${e.row!+1}-${e.col!+1}`;
    case 'PawnsClaimed':return `占格 ${e.row!+1}-${e.col!+1} · 记录等级 ${e.amount}`;
    case 'CardAddedToHand':return e.player===1?`电脑${e.reason==='draw'?'补牌':'生成手牌'} 1 张`:e.reason==='draw'?'你补牌 1 张':`生成手牌 ${name(e)}`;
    case 'TurnPassed':return `${e.player===0?'你':'电脑'} PASS`;
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
      const label=(t:typeof a)=>t.owner===null?'空格':`${t.owner===0?'你':'电脑'} ♟${t.pawns}`;
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
