import {byId} from './cards.js';
import {exportReplay,replayMatch,replayRulesVersion,TURN_DRAW_RULES_VERSION,outcome,type Game,type Replay,type RulesVersion,type Position,type PositionTile,type Player,type Command,type RuleEvent} from './engine.js';
import {startMatch,type MatchSettings} from './match-flow.js';
import {readRecords,STORAGE,type StoragePort,type MatchRecord} from './ui-data.js';

export const RULES_VERSION=TURN_DRAW_RULES_VERSION;
export const MATCH_KEY='qbclassic.match.v1',REPLAYS_KEY='qbclassic.replays.v1';
const MAX_REPLAY=240_000,MAX_ARCHIVE=1_000_000,MAX_COMMANDS=1024;
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const integer=(v:unknown,min:number,max:number)=>Number.isSafeInteger(v)&&Number(v)>=min&&Number(v)<=max;
const pair=(v:unknown)=>Array.isArray(v)&&v.length===2&&v.every(a=>Array.isArray(a)&&a.length<=256&&a.every(n=>Number.isInteger(n)&&byId.has(n)));
const text=(v:unknown,max=80)=>typeof v==='string'&&v.length>0&&v.length<=max;
function requireValue(ok:unknown):asserts ok {if(!ok)throw Error('存档或回放结构无效');}
function matchesReplayRules(replay:unknown,version:unknown):version is RulesVersion {
  if(!object(replay))return false;
  try{return replayRulesVersion(replay.rulesVersion)===version;}catch{return false;}
}

/** Schema checks bound local payloads; all rule legality remains in replayMatch. */
export function checkedReplay(value:unknown):Replay {
  requireValue(object(value)&&(value.version===1||value.version===2)&&integer(value.seed,0,0xFFFFFFFF)&&pair(value.decks)&&(value.firstPlayer===0||value.firstPlayer===1)&&Array.isArray(value.commands)&&value.commands.length<=MAX_COMMANDS);
  requireValue(JSON.stringify(value).length<=MAX_REPLAY);
  const rulesVersion=replayRulesVersion(value.rulesVersion);
  const commands:Command[]=value.commands.map(raw=>{
    requireValue(object(raw)&&(raw.player===0||raw.player===1));const player=raw.player;
    if(raw.type==='pass')return {type:'pass',player};
    if(raw.type==='play'){requireValue(integer(raw.handIndex,0,255)&&integer(raw.row,0,2)&&integer(raw.col,0,4));return {type:'play',player,handIndex:Number(raw.handIndex),row:Number(raw.row),col:Number(raw.col)};}
    requireValue(raw.type==='mulligan'&&Array.isArray(raw.indices)&&raw.indices.length<=5&&raw.indices.every(n=>integer(n,0,4))&&new Set(raw.indices).size===raw.indices.length);
    return {type:'mulligan',player,indices:[...raw.indices] as number[]};
  });
  const base={...(rulesVersion===TURN_DRAW_RULES_VERSION?{rulesVersion}:{}),seed:Number(value.seed),decks:structuredClone(value.decks) as [number[],number[]],firstPlayer:value.firstPlayer as Player,commands};
  if(value.version===1)return {version:1,...base};
  requireValue(value.version===2&&object(value.position));
  const p=value.position;
  requireValue(pair(p.hands)&&(p.decks===undefined||pair(p.decks))&&(p.discard===undefined||pair(p.discard))&&(p.board===undefined||Array.isArray(p.board)&&p.board.length<=15));
  const pick=(v:Record<string,unknown>,keys:string[])=>Object.fromEntries(keys.filter(k=>v[k]!==undefined).map(k=>[k,structuredClone(v[k])]));
  const position=pick(p,['seed','phase','turn','passes','hands','decks','discard']) as Position;
  if(Array.isArray(p.board))position.board=p.board.map(tile=>{requireValue(object(tile));return pick(tile,['row','col','owner','pawns','cardId','permanentDelta','enhancedOnce','enfeebledOnce','thresholds']) as PositionTile;});
  // Core validates sparse fixture ownership, flags, thresholds and stabilization.
  requireValue((p.seed??1)===base.seed&&(p.turn??0)===base.firstPlayer);
  return {version:2,...base,position};
}

// Accidental-corruption / reconstruction check, not a signature or security claim.
export function stateCheck(game:Game):string {
  const data=JSON.stringify([game.board,game.hands,game.decks,game.discard,game.mulliganDone,game.phase,game.turn,game.passes,game.nextInstanceId,game.events]);
  let hash=2166136261;for(let i=0;i<data.length;i++){hash^=data.charCodeAt(i);hash=Math.imul(hash,16777619);}
  return (hash>>>0).toString(16).padStart(8,'0');
}
export interface SavedMatch {
  schema:'qbclassic.match';version:1;rulesVersion:RulesVersion;id:string;deckName:string;
  settings:MatchSettings;replay:Replay;phase:Game['phase'];check:string;
}
export function saveMatch(game:Game,settings:MatchSettings,deckName:string,id:string):SavedMatch {
  const replay=exportReplay(game);
  return {schema:'qbclassic.match',version:1,rulesVersion:replayRulesVersion(replay.rulesVersion),id,deckName,settings:{...settings,deck:[...settings.deck]},replay,phase:game.phase,check:stateCheck(game)};
}
export function restoreMatch(value:unknown):{save:SavedMatch;game:Game}{
  requireValue(object(value)&&value.schema==='qbclassic.match'&&value.version===1&&matchesReplayRules(value.replay,value.rulesVersion)&&text(value.id)&&text(value.deckName,40)&&object(value.settings)&&typeof value.check==='string'&&/^[0-9a-f]{8}$/.test(value.check));
  const s=value.settings;
  requireValue(Array.isArray(s.deck)&&integer(s.seed,0,0xFFFFFFFF));
  const settings:MatchSettings={deck:[...s.deck] as number[],seed:Number(s.seed),difficulty:s.difficulty as MatchSettings['difficulty'],first:s.first as MatchSettings['first']};
  const initial=startMatch(settings),replay=checkedReplay(value.replay);
  requireValue(settings.seed===replay.seed);
  if(replay.version===1)requireValue(JSON.stringify(replay.decks)===JSON.stringify([settings.deck,settings.deck])&&initial.turn===replay.firstPlayer);
  const game=replayMatch(replay);requireValue(value.phase===game.phase&&value.check===stateCheck(game));
  return {save:saveMatch(game,settings,String(value.deckName),String(value.id)),game};
}
export function readActive(storage:StoragePort|null):{present:boolean;restored:ReturnType<typeof restoreMatch>|null;error:string|null}{
  if(!storage)return {present:false,restored:null,error:'本地存储不可用，本局只能在当前页面继续'};
  try{const raw=storage.getItem(MATCH_KEY);if(!raw||raw==='null')return {present:false,restored:null,error:null};
    requireValue(raw.length<=MAX_REPLAY+4000);return {present:true,restored:restoreMatch(JSON.parse(raw)),error:null};
  }catch{return {present:true,restored:null,error:'存档无法校验或与当前规则不兼容；原始数据已保留，请明确舍弃后再开新局'};}
}
export function writeActive(storage:StoragePort|null,save:SavedMatch|null):string|null {
  try{requireValue(storage);if(save){requireValue(matchesReplayRules(save.replay,save.rulesVersion));checkedReplay(save.replay);}const raw=JSON.stringify(save);requireValue(raw.length<=MAX_REPLAY+4000);storage.setItem(MATCH_KEY,raw);return null;}
  catch{return '自动保存失败：存储不可用或空间不足。当前对局可继续，刷新前请导出回放。';}
}

type ReplayEntry={recordId:string;rulesVersion:string;replay:Replay;check:string};
/** Two bounded local keys: legacy summaries stay v1, replay bodies are separate. */
export class MatchHistory {
  records:MatchRecord[]=[];private items:ReplayEntry[]=[];issue:string|null=null;
  constructor(private storage:StoragePort|null){
    try{
      this.records=readRecords(storage?.getItem(STORAGE.records)??null);
      const raw=storage?.getItem(REPLAYS_KEY);if(!raw)return;
      requireValue(raw.length<=MAX_ARCHIVE+4000);const v=JSON.parse(raw);
      requireValue(object(v)&&v.version===1&&Array.isArray(v.items)&&v.items.length<=20);
      const ids=new Set(this.records.map(r=>r.id));
      this.items=v.items.filter((r:unknown)=>object(r)&&typeof r.recordId==='string'&&ids.has(r.recordId)&&typeof r.rulesVersion==='string'&&typeof r.check==='string'&&object(r.replay)) as ReplayEntry[];
    }catch{this.issue='历史回放数据无法读取；已有结果摘要仍保留，原始存储未覆盖';}
  }
  rulesVersion(id:string):RulesVersion|null {
    const item=this.items.find(i=>i.recordId===id);
    return item&&matchesReplayRules(item.replay,item.rulesVersion)?item.rulesVersion:null;
  }
  available(id:string){return this.rulesVersion(id)!==null;}
  replay(id:string):Replay {
    const item=this.items.find(i=>i.recordId===id),record=this.records.find(r=>r.id===id);
    requireValue(item&&record&&matchesReplayRules(item.replay,item.rulesVersion));
    const replay=checkedReplay(item.replay),game=replayMatch(replay);
    requireValue(game.phase==='finished'&&stateCheck(game)===item.check&&record.seed===replay.seed);
    requireValue(JSON.stringify(outcome(game).scores)===JSON.stringify(record.scores));
    return replay;
  }
  add(save:SavedMatch):string|null {
    try{
      const {game}=restoreMatch(save);requireValue(game.phase==='finished');
      const record:MatchRecord={id:save.id,date:new Date().toISOString(),deckName:save.deckName,difficulty:save.settings.difficulty,seed:save.settings.seed,scores:score(game)};
      const existing=this.records.find(r=>r.id===save.id);if(existing)record.date=existing.date;
      const records=[record,...this.records.filter(r=>r.id!==save.id)].slice(0,20);
      const entry:ReplayEntry={recordId:save.id,rulesVersion:save.rulesVersion,replay:exportReplay(game),check:save.check};
      return this.commit(records,[entry,...this.items.filter(r=>r.recordId!==save.id)]);
    }catch{return '无法归档：回放未能通过终局校验；本局存档仍保留';}
  }
  remove(id:string){return this.commit(this.records.filter(r=>r.id!==id),this.items.filter(r=>r.recordId!==id));}
  private commit(records:MatchRecord[],items:ReplayEntry[]):string|null {
    if(!this.storage)return '历史记录保存失败：本地存储不可用';
    const ids=new Set(records.map(r=>r.id));items=items.filter(r=>ids.has(r.recordId));
    while(JSON.stringify({version:1,items}).length>MAX_ARCHIVE)items.pop();
    let previous:string|null=null,changed=false;
    try{
      previous=this.storage.getItem(REPLAYS_KEY);
      this.storage.setItem(REPLAYS_KEY,JSON.stringify({version:1,items}));changed=true;
      this.storage.setItem(STORAGE.records,JSON.stringify({version:1,records}));
      this.items=items;this.records=records;this.issue=null;return null;
    }catch{
      if(changed)try{this.storage.setItem(REPLAYS_KEY,previous??JSON.stringify({version:1,items:[]}));}catch{}
      return '历史记录保存失败（存储不可用或空间不足）；对局存档保留，可稍后重试';
    }
  }
}
const score=(game:Game)=>outcome(game).scores;

export class ReplayTimeline {
  readonly replay:Replay;readonly length:number;
  constructor(value:unknown){this.replay=checkedReplay(value);requireValue(replayMatch(this.replay).phase==='finished');this.length=this.replay.commands.length;}
  at(step:number):{game:Game;command:Command|null;events:RuleEvent[]}{
    requireValue(integer(step,0,this.length));
    const game=replayMatch({...this.replay,commands:this.replay.commands.slice(0,step)});
    const cursor=step?replayMatch({...this.replay,commands:this.replay.commands.slice(0,step-1)}).events.length:0;
    return {game,command:step?structuredClone(this.replay.commands[step-1]):null,events:game.events.slice(cursor)};
  }
}
