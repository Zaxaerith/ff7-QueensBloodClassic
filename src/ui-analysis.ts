import {AnalysisClient} from './analysis-client.js';
import {actionText,type ActionStudy,type AnalysisOptions} from './replay-analysis.js';
import type {BotView,BotAction} from './bot.js';
import type {RuleEvent} from './engine.js';
import {$,element,button,options,openDialog,closeDialog} from './ui-dom.js';

export interface StudyPreview {view:BotView;study:ActionStudy;mode:'target'|'result';}
export function mountAnalysis(hooks:{preview:(value:StudyPreview)=>void;eventText:(event:RuleEvent)=>string}){
  const client=new AnalysisClient();let active=false,revision=0,ownedPanel:HTMLElement|null=null;
  function cancel(){
    revision++;client.cancel();active=false;
    if(ownedPanel?.isConnected&&$<HTMLDialogElement>('infoDialog').open)closeDialog();
  }
  $<HTMLDialogElement>('infoDialog').addEventListener('close',()=>{if(!$<HTMLDialogElement>('infoDialog').open)cancel();});
  function open(point:{view:BotView;actual:BotAction}){
    cancel();active=true;const panel=element('div','analysis-panel'),controls=element('div','analysis-controls');
    ownedPanel=panel;
    const difficulty=element('select'),budget=element('select'),seed=element('input');seed.type='number';seed.min='0';seed.max='4294967295';seed.step='1';seed.value='1';
    options(difficulty,[['normal','Normal · 即时评价'],['hard','Hard · 假设回应']]);options(budget,[['256','256 节点'],['512','512 节点'],['64','64 节点（快速/可能截断）']]);
    const label=(text:string,node:HTMLElement)=>{const l=element('label','',text);l.append(node);return l;};
    difficulty.onchange=()=>{budget.value=difficulty.value==='hard'?'512':'256';cancelRun();};budget.onchange=cancelRun;seed.onchange=cancelRun;
    const status=element('p','analysis-status','按需分析该行动发生前的局面；不会读取之后的回放。');status.setAttribute('role','status');
    const output=element('div','analysis-results');
    const start=button('开始分析',()=>void run()),stop=button('取消计算',cancelRun);stop.disabled=true;
    function cancelRun(){revision++;client.cancel();start.disabled=false;stop.disabled=true;status.textContent='已取消；修改设置后可重新分析';output.replaceChildren();}
    controls.append(label('模式',difficulty),label('预算',budget),label('分析 Seed',seed),start,stop);
    panel.append(element('p','',`行动前 · ${actionText(point.actual,point.actual.type==='play'?point.view.hand[point.actual.handIndex]!:null)}`),controls,status,
      element('p','analysis-caution','估值是同一局面内的启发式比较，不是胜率或最终分数。Hard 使用公开固定卡池估计对手回应，未知补牌不作为事实展示。'),output);
    openDialog('REPLAY / 分析本步',panel);
    async function run(){
      const options:AnalysisOptions={difficulty:difficulty.value as 'normal'|'hard',maxNodes:Number(budget.value),seed:Number(seed.value)};
      if(!seed.value||!Number.isInteger(options.seed)||options.seed!<0||options.seed!>0xffffffff){status.textContent='Seed 必须是 uint32 整数';return;}
      const ticket=++revision;start.disabled=true;stop.disabled=false;output.replaceChildren();status.textContent='正在独立 Worker 中分析…';
      const result=await client.run(point.view,point.actual,options);
      if(!active||revision!==ticket||!result)return;
      start.disabled=false;stop.disabled=true;
      if(result.reply.status==='unavailable'){status.textContent='分析不可用：'+result.reply.message;return;}
      const study=result.reply;
      status.textContent=`${study.status==='complete'?'候选比较完成':'分析不完整'} · ${study.stats.nodes}/${study.stats.maxNodes} 节点 · ${result.elapsedMs} ms${result.cached?' · 缓存':''} · ${study.stats.searchTruncated?'搜索已截断':'候选根搜索未截断'}`;
      for(const hint of study.hints)output.append(element('p','analysis-hint',hint));
      if(study.recommended)output.append(element('p','',`${study.status==='complete'?'AI 推荐':'已完整评估候选中的最高估值（不作优劣结论）'}：${actionText(study.recommended.action,study.recommended.cardId)}`));
      function card(candidate:ActionStudy,title:string){
        const box=element('section','analysis-choice');box.append(element('h3','',title+' · '+actionText(candidate.action,candidate.cardId)),element('p','',
          `估值 ${candidate.score===null?'未评估':candidate.score.toFixed(2)}${candidate.complete?'':'（不完整）'} · 即时 ${candidate.immediate===null?'—':candidate.immediate.toFixed(2)} · 回应 ${candidate.replies}/${candidate.replyTotal}`));
        box.append(element('p','',`三行力量差变化：${candidate.rowDelta.map(n=>(n>0?'+':'')+n).join(' / ')||'—'}；己方空格净增 ${candidate.spaceDelta}`),element('p','analysis-caution',candidate.reason));
        const events=candidate.preview?.events.filter(e=>['CardDestroyed','CardAddedToHand','CardSpawned','PowerChanged','DerivedPowerChanged','CardReplaced','CardEnhanced','CardEnfeebled','ThresholdReached'].includes(e.type))??[];
        if(events.length){const details=element('details');details.append(element('summary','',`模拟本步能力事件 · ${events.length}`));for(const e of events)details.append(element('p','',hooks.eventText(e)));box.append(details);}
        const buttons=element('div','analysis-controls');
        if(candidate.preview){for(const [mode,text]of [['target','目标与范围'],['result','模拟后棋盘']] as const)buttons.append(button(text,()=>{hooks.preview({view:point.view,study:candidate,mode});closeDialog();}));}
        box.append(buttons);output.append(box);
      }
      card(study.actual,'实际行动（统一模型估值）');study.candidates.forEach((c,i)=>card(c,`候选 ${i+1}`));
    }
  }
  return {open,cancel};
}
