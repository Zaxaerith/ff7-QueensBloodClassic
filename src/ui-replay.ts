import {byId} from './cards.js';
import {outcome,previewInfluence,previewEffects,replayRulesVersion,LEGACY_RULES_VERSION,type Replay,type RuleEvent} from './engine.js';
import {historicalDecision,actionText} from './replay-analysis.js';
import {mountAnalysis,type StudyPreview} from './ui-analysis.js';
import {ReplayTimeline} from './match-archive.js';
import {eventLabel,resultMarkup,rulesLabel} from './match-flow.js';
import {createCardView} from './card-view.js';
import {observeTable,placedCardView} from './ui-board.js';
import type {CardVisual} from './visuals.js';
import {$,element,button,openDialog,downloadJson} from './ui-dom.js';

export function replayEventLabel(e:RuleEvent):string {
  const known=eventLabel(e);if(known)return known;
  const name=e.cardId===undefined?'':byId.get(e.cardId)?.name??'';
  if(e.type==='CardSpawned')return `${name} 生成在 ${e.row!+1}-${e.col!+1}`;
  if(e.type==='CardEnhanced'||e.type==='CardEnfeebled')return `${name} ${e.type==='CardEnhanced'?'强化':'弱化'}触发`;
  if(e.type==='ThresholdReached')return `${name} 达到力量阈值`;
  if(e.type==='PawnsClaimed')return `玩家${e.player!+1} 占格 ${e.row!+1}-${e.col!+1} · 等级 ${e.amount}`;
  if(e.type==='MatchStarted')return '开局局面';
  if(e.type==='TurnEnded')return `玩家${e.player!+1}回合结束`;
  return e.type;
}
interface ReplayHooks {visual:(id:number)=>CardVisual;showCard:(id:number)=>void;exit:()=>void;}
export function mountReplay(hooks:ReplayHooks){
  let timeline:ReplayTimeline|null=null,step=0,current:ReturnType<ReplayTimeline['at']>|null=null;
  let preview:StudyPreview|null=null;
  const analysis=mountAnalysis({preview:value=>{preview=value;render();},eventText:replayEventLabel});
  observeTable($('replayBoard').parentElement!);
  function render(){
    if(!timeline)return;current=timeline.at(step);const {game,command,events}=current;
    const board=preview?(preview.mode==='target'?preview.view.board:preview.study.preview!.board):game.board;
    const result=preview?(preview.mode==='target'?outcome({...game,board,phase:'playing'}):preview.study.preview!.result):outcome(game);
    const move=preview?.study.action,card=preview?.study.cardId?byId.get(preview.study.cardId):null;
    const pawn=new Set(move?.type==='play'&&card&&preview?.mode==='target'?previewInfluence(card,move.row,move.col,move.player).map(p=>p.join('-')):[]);
    const effect=new Set(move?.type==='play'&&card&&preview?.mode==='target'?previewEffects(card,move.row,move.col,move.player).map(p=>p.join('-')):[]);
    $('replayStep').textContent=`${step} / ${timeline.length}`;
    $('replayTurn').textContent=game.phase==='finished'?'终局':game.phase==='mulligan'?'开局换牌':`玩家${game.turn+1}回合`;
    $('replayScore0').textContent=String(result.scores[0]);$('replayScore1').textContent=String(result.scores[1]);
    $('replayPlayerCount').textContent=`手牌 ${game.hands[0].length} · 牌库 ${game.decks[0].length}`;
    $('replayEnemyCount').textContent=`手牌 ${game.hands[1].length} · 牌库 ${game.decks[1].length}`;
    $('replayAction').textContent=!command?(timeline.replay.version===2?'固定局面开头；不推测此前未记录的行动':'开局；尚未执行任何行动'):command.type==='pass'?`玩家${command.player+1} · PASS`:command.type==='mulligan'?`玩家${command.player+1} · 换牌 ${command.indices.length} 张`:replayEventLabel(events.find(e=>e.type==='CardPlayed')!);
    $('replayHint').textContent=game.phase==='finished'?`最终计分 ${result.scores[0]} : ${result.scores[1]} · 可查看三行结算`:'只读回放；手牌区展示玩家1，对手仅显示数量';
    if(preview){
      $('replayTurn').textContent=preview.mode==='target'?'行动前 · 范围预览':'分析模拟 · 非历史';
      $('replayAction').textContent=actionText(preview.study.action,preview.study.cardId);
      $('replayHint').textContent=preview.mode==='target'?'黄：占格 · 红：能力范围；尚未执行 · 按“返回历史”还原':'仅模拟本步；未知补牌不展示 · 按“返回历史”还原';
      $('replayPlayerCount').textContent=$('replayEnemyCount').textContent='分析预览 · 隐藏手牌不展示';
    }
    const rules=replayRulesVersion(timeline.replay.rulesVersion);
    $('replayTurn').title=rules;
    if(rules===LEGACY_RULES_VERSION)$('replayHint').prepend(`${rulesLabel(rules)} · `);
    $('replayExit').textContent=preview?'返回历史':'退出回放';
    const analyzeButton=$<HTMLButtonElement>('replayAnalyze');
    try{historicalDecision(timeline,step);analyzeButton.disabled=false;analyzeButton.title='按当时行动方的信息分析';}catch(error){analyzeButton.disabled=true;analyzeButton.title=String(error);}
    for(const side of [0,1] as const)$('replayScores'+side).replaceChildren(...result.rows.map((row,r)=>{const node=element('div','lane-score'+(row[side]>row[1-side]?' winning':''),String(row[side]));node.setAttribute('aria-label',`第${r+1}行玩家${side+1}力量 ${row[side]}`);return node;}));
    $('replayBoard').replaceChildren(...board.flatMap((row,r)=>row.map((tile,c)=>{
      const key=`${r}-${c}`,target=preview?.mode==='target'&&move?.type==='play'&&move.row===r&&move.col===c;
      const node=button('',()=>{if(tile.card)hooks.showCard(tile.card.id);},'tile '+(tile.card?`occupied owner-${tile.card.owner}`:tile.owner===null?'':`pawn-${tile.owner}`)+(target?' pending':'')+(pawn.has(key)?' preview-pawn':'')+(effect.has(key)?' preview-effect':''));
      node.disabled=!tile.card;node.dataset.cell=`${r}-${c}`;
      node.setAttribute('aria-label',`第${r+1}行第${c+1}列 ${tile.card?`${byId.get(tile.card.id)!.name} 当前力量 ${tile.card.power}`:tile.owner===null?'空白':`玩家${tile.owner+1}棋子${tile.pawns}`}`);
      node.append(tile.card?placedCardView(tile.card,hooks.visual(tile.card.id)):element('span','pawn',tile.owner===null?'·':'♟'.repeat(tile.pawns)));return node;
    })));
    $('replayHand').replaceChildren(...(preview?[element('p','analysis-caution','分析预览不展示假设手牌；真实历史与本机存档保持不变。')]:game.hands[0].map(id=>{const node=button('',()=>hooks.showCard(id),'hand-card');node.setAttribute('aria-label',`查看 ${byId.get(id)!.name}`);node.append(createCardView(byId.get(id)!,hooks.visual(id),{variant:'hand'}));return node;})));
    $<HTMLButtonElement>('replayFirst').disabled=$<HTMLButtonElement>('replayPrev').disabled=step===0;
    $<HTMLButtonElement>('replayLast').disabled=$<HTMLButtonElement>('replayNext').disabled=step===timeline.length;
    $('replayEvents').textContent=`本步事件 · ${events.length}`;
    $<HTMLButtonElement>('replayScoreDetails').disabled=game.phase!=='finished';
  }
  const cancel=()=>{analysis.cancel();preview=null;};
  const go=(index:number)=>{cancel();step=index;render();};
  $('replayFirst').onclick=()=>go(0);$('replayPrev').onclick=()=>go(Math.max(0,step-1));$('replayNext').onclick=()=>go(Math.min(timeline!.length,step+1));$('replayLast').onclick=()=>go(timeline!.length);
  $('replayExit').onclick=()=>{if(preview){preview=null;render();}else{cancel();hooks.exit();}};
  $('replayAnalyze').onclick=()=>{if(timeline)try{analysis.open(historicalDecision(timeline,step));}catch(error){openDialog('分析不可用',element('p','',String(error)));}};
  $('replayEvents').onclick=()=>{if(!current)return;const list=element('div','event-log');for(const event of current.events)list.append(element('p','',replayEventLabel(event)));if(!current.events.length)list.append(element('p','','本步没有额外事件'));openDialog('REPLAY / 本步事件',list);};
  $('replayScoreDetails').onclick=()=>{if(current?.game.phase==='finished'){const content=element('div','match-result');content.innerHTML=resultMarkup(current.game);openDialog('REPLAY / 终局计分',content);}};
  $('replayExport').onclick=()=>{if(timeline)downloadJson(timeline.replay,`queens-blood-replay-${timeline.replay.seed}.json`);};
  return {open:(replay:Replay)=>{const next=new ReplayTimeline(replay);timeline=next;go(0);},refresh:render,cancel};
}
