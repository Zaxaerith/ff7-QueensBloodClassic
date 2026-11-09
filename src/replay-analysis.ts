import {byId} from './cards.js';
import {outcome,opponent,seededRng,legalMoves,type Game,type RuleEvent} from './engine.js';
import {observeGame,botSimulation,decideBot,simulateBotAction,assessBotRoot,evaluateBotPosition,botReplyHypotheses,type BotAction,type BotView} from './bot.js';
import type {ReplayTimeline} from './match-archive.js';

export interface AnalysisOptions {difficulty?:'normal'|'hard';seed?:number;maxNodes?:number;}
export interface AnalysisPreview {board:Game['board'];result:ReturnType<typeof outcome>;phase:Game['phase'];turn:Game['turn'];events:RuleEvent[];}
export interface ActionStudy {
  action:BotAction;cardId:number|null;score:number|null;immediate:number|null;complete:boolean;replies:number;replyTotal:number;
  reason:string;preview:AnalysisPreview|null;rowDelta:number[];spaceDelta:number;
}
export interface ReplayAnalysis {
  status:'complete'|'incomplete';difficulty:'normal'|'hard';seed:number;actual:ActionStudy;candidates:ActionStudy[];
  recommended:ActionStudy|null;hints:string[];
  stats:{nodes:number;maxNodes:number;searchNodes:number;searchTruncated:boolean;rejected:number;};
}
export type AnalysisReply=ReplayAnalysis|{status:'unavailable';message:string};
export function historicalDecision(timeline:ReplayTimeline,step:number):{view:BotView;actual:BotAction}{
  if(!Number.isInteger(step)||step<1||step>timeline.length)throw Error('请先选择一项已记录的历史行动');
  const actual=timeline.replay.commands[step-1];
  if(actual.type==='mulligan')throw Error('换牌步骤不进行落子分析；仍可正常回放');
  const before=timeline.at(step-1).game;
  return {view:observeGame(before,actual.player),actual:structuredClone(actual)};
}
export function actionKey(action:BotAction,view:BotView){return action.type==='pass'?`pass:${action.player}`:`${action.player}:${view.hand[action.handIndex]}:${action.row}:${action.col}`;}
export function actionText(action:BotAction,cardId:number|null){return `玩家${action.player+1} · `+(action.type==='pass'?'PASS':`${byId.get(cardId!)?.name??'未知卡'} → ${action.row+1}-${action.col+1}`);}
const spaces=(game:Game,player:0|1)=>game.board.flat().filter(t=>!t.card&&t.owner===player).length;
/** Only BotView crosses this boundary. Unknown draws remain Bot's fixed public
 * hypotheses; previews return public board/events, never invented hand/deck IDs. */
export function analyzeDecision(view:BotView,actual:BotAction,options:AnalysisOptions={}):ReplayAnalysis {
  const difficulty=options.difficulty??'normal',seed=options.seed??1,maxNodes=options.maxNodes??(difficulty==='hard'?512:256);
  if(!['normal','hard'].includes(difficulty)||!Number.isInteger(seed)||seed<0||seed>0xffffffff||!Number.isInteger(maxNodes)||maxNodes<1||maxNodes>512)throw Error('分析设置无效：Normal/Hard，uint32 seed，1..512 节点');
  const initial=botSimulation(view);
  // Actual history may play the second identical copy; Bot's deduplicated pool
  // intentionally keeps only the first, so validate against the engine moves.
  if(!actual||!['play','pass'].includes(actual.type)||actual.player!==view.player||actual.type==='play'&&!legalMoves(initial,view.player).some(a=>a.handIndex===actual.handIndex&&a.row===actual.row&&a.col===actual.col))throw Error('实际行动不属于行动前局面的合法操作');
  const searchBudget=Math.max(1,Math.floor(maxNodes/2));
  const search=decideBot(view,{difficulty,seed,maxNodes:searchBudget,explain:true});
  const stats={nodes:search.stats.nodes,maxNodes,searchNodes:search.stats.nodes,searchTruncated:search.stats.budgetReached,rejected:search.stats.rejected};
  // Bot's mixed-depth explanation scores are used only to select a small pool.
  // Actual and alternatives are all re-evaluated below on one common basis.
  const targets=[actual],seen=new Set([actionKey(actual,view)]);
  for(const action of [search.action,...[...(search.candidates??[])].sort((a,b)=>b.immediate-a.immediate).map(c=>c.action)]){
    const key=actionKey(action,view);if(!seen.has(key)&&targets.length<4){seen.add(key);targets.push(action);}
  }
  const quota=Math.floor((maxNodes-stats.nodes)/targets.length),before=outcome(initial),enemy=opponent(view.player),random=seededRng(seed),replySeed=random();
  const results=targets.map(action=>{
    const study:ActionStudy={action:structuredClone(action),cardId:action.type==='play'?view.hand[action.handIndex]!:null,score:null,immediate:null,complete:false,replies:0,replyTotal:0,reason:'预算不足，未评估',preview:null,rowDelta:[],spaceDelta:0};
    let used=0;
    const simulate=(game:Game,move:BotAction)=>{
      if(used>=quota||stats.nodes>=maxNodes)return null;used++;stats.nodes++;
      try{return simulateBotAction(game,move);}catch(error){stats.rejected++;study.reason=`共享引擎无法稳定结算：${error instanceof Error?error.message:String(error)}`;return null;}
    };
    const root=simulate(initial,action);if(!root)return study;
    const assessed=assessBotRoot(root,view,action),result=outcome(root);
    study.immediate=assessed.score;study.reason=assessed.reason;
    study.rowDelta=result.rows.map((r,i)=>(r[view.player]-r[enemy])-(before.rows[i][view.player]-before.rows[i][enemy]));
    study.spaceDelta=spaces(root,view.player)-spaces(initial,view.player);
    study.preview={board:structuredClone(root.board),result,phase:root.phase,turn:root.turn,events:root.events.filter(e=>e.reason!=='draw').map(e=>({...e}))};
    if(difficulty==='normal'||root.phase==='finished'){study.score=assessed.score;study.complete=true;return study;}
    const replies=botReplyHypotheses(root,view,replySeed);study.replyTotal=replies.length;let worst=Infinity,failed=false;
    for(const reply of replies){
      const trial=simulate(reply.game,reply.action);if(!trial){failed=true;if(used>=quota)break;continue;}
      study.replies++;worst=Math.min(worst,evaluateBotPosition(trial,view.player).score);
    }
    study.complete=!failed&&study.replies===replies.length;
    if(study.replies)study.score=worst;
    study.reason+=`；固定公开假设回应 ${study.replies}/${study.replyTotal}，不代表对手真实手牌`;
    return study;
  });
  const actualStudy=results[0],candidates=results.slice(1).sort((a,b)=>(b.score??-Infinity)-(a.score??-Infinity));
  const comparable=results.every(r=>r.complete)&&!stats.searchTruncated&&stats.rejected===0;
  const best=[...results].filter(r=>r.complete&&r.score!==null).sort((a,b)=>b.score!-a.score!)[0]??null;
  const hints:string[]=[];
  if(!comparable)hints.push('分析不完整：搜索截断、回应预算不足或结算失败；不作优劣结论');
  else if(best&&actualStudy.score!==null){
    if(best.score!-actualStudy.score<=1)hints.push('推荐与实际行动接近（本局面启发式评价）');
    else {
      hints.push('存在值得比较的替代行动');
      if(best.preview!.result.rows.some((r,i)=>r[view.player]>r[enemy]&&actualStudy.preview!.result.rows[i][view.player]<=actualStudy.preview!.result.rows[i][enemy]))hints.push('可能损失关键行优势');
      if(best.spaceDelta>actualStudy.spaceDelta)hints.push('可能错过重要占格机会');
    }
  }
  return {status:comparable?'complete':'incomplete',difficulty,seed,actual:actualStudy,candidates,recommended:best,hints,stats};
}
