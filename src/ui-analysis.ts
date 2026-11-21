import {getLocale,t} from './i18n/index.js';
import {analysisActionText,localizeAnalysisError,localizeAnalysisHint,localizeAnalysisReason} from './i18n/research-text.js';
import {AnalysisClient} from './analysis-client.js';
import type {ActionStudy,AnalysisOptions} from './replay-analysis.js';
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
    options(difficulty,[['normal',t("normalImmediateEvaluation")],['hard',t("hardHypotheticalReplies")]]);options(budget,[['256',t("nodeBudget256")],['512',t("nodeBudget512")],['64',t("nodeBudget64")]]);
    const label=(text:string,node:HTMLElement)=>{const l=element('label','',text);l.append(node);return l;};
    difficulty.onchange=()=>{budget.value=difficulty.value==='hard'?'512':'256';cancelRun();};budget.onchange=cancelRun;seed.onchange=cancelRun;
    const status=element('p','analysis-status',t("analyzeThePositionImmediatelyBeforeTheSelectedMove"));status.setAttribute('role','status');
    const output=element('div','analysis-results');
    const start=button(t("startAnalysis"),()=>void run()),stop=button(t("cancelAnalysis"),cancelRun);stop.disabled=true;
    function cancelRun(){revision++;client.cancel();start.disabled=false;stop.disabled=true;status.textContent=t("analysisCancelledAdjustSettingsToRunAgain");output.replaceChildren();}
    controls.append(label(t("mode"),difficulty),label(t("budget"),budget),label(t("analysisSeed"),seed),start,stop);
    panel.append(element('p','',t("beforeMove", analysisActionText(point.actual,point.actual.type==='play'?point.view.hand[point.actual.handIndex]!:null))),controls,status,
      element('p','analysis-caution',t("analysisModelHelp")),output);
    openDialog(t("replayAnalysis"),panel);
    async function run(){
      const options:AnalysisOptions={difficulty:difficulty.value as 'normal'|'hard',maxNodes:Number(budget.value),seed:Number(seed.value)};
      if(!seed.value||!Number.isInteger(options.seed)||options.seed!<0||options.seed!>0xffffffff){status.textContent=t("seedMustBeAnIntegerFrom0To");return;}
      const ticket=++revision;start.disabled=true;stop.disabled=false;output.replaceChildren();status.textContent=t("analyzing");
      const result=await client.run(point.view,point.actual,options);
      if(!active||revision!==ticket||!result)return;
      start.disabled=false;stop.disabled=true;
      if(result.reply.status==='unavailable'){status.textContent=localizeAnalysisError(result.reply.message);return;}
      const study=result.reply;
      status.textContent=t("analysisProgress", study.status==='complete'?t("candidateComparisonComplete"):t("analysisIncomplete"), study.stats.nodes, study.stats.maxNodes, result.elapsedMs, result.cached?t("analysisCachedSuffix"):'', study.stats.searchTruncated?t("searchTruncated"):t("rootSearchComplete"));
      for(const hint of study.hints)output.append(element('p','analysis-hint',localizeAnalysisHint(hint)));
      if(study.recommended)output.append(element('p','',`${study.status==='complete'?t("recommendedMove"):t("bestScoreAmongFullyEvaluatedCandidates")}：${analysisActionText(study.recommended.action,study.recommended.cardId)}`));
      function card(candidate:ActionStudy,title:string){
        const box=element('section','analysis-choice');box.append(element('h3','',title+' · '+analysisActionText(candidate.action,candidate.cardId)),element('p','',
          t("analysisEstimate", candidate.score===null?t("unevaluated"):candidate.score.toLocaleString(getLocale(),{minimumFractionDigits:2,maximumFractionDigits:2}), candidate.complete?'':t("analysisIncompleteSuffix"), candidate.immediate===null?'—':candidate.immediate.toLocaleString(getLocale(),{minimumFractionDigits:2,maximumFractionDigits:2}), candidate.replies, candidate.replyTotal)));
        box.append(element('p','',t("analysisBoardDelta", candidate.rowDelta.map(n=>(n>0?'+':'')+n).join(' / ')||'—', candidate.spaceDelta)),element('p','analysis-caution',localizeAnalysisReason(candidate.reason,candidate.replies,candidate.replyTotal)));
        const events=candidate.preview?.events.filter(e=>['CardDestroyed','CardAddedToHand','CardSpawned','PowerChanged','DerivedPowerChanged','CardReplaced','CardEnhanced','CardEnfeebled','ThresholdReached'].includes(e.type))??[];
        if(events.length){const details=element('details');details.append(element('summary','',t("simulatedEventCount", events.length)));for(const e of events)details.append(element('p','',hooks.eventText(e)));box.append(details);}
        const buttons=element('div','analysis-controls');
        if(candidate.preview){for(const [mode,text]of [['target',t("targetsAndRange")],['result',t("boardAfterSimulation")]] as const)buttons.append(button(text,()=>{hooks.preview({view:point.view,study:candidate,mode});closeDialog();}));}
        box.append(buttons);output.append(box);
      }
      card(study.actual,t("recordedMove"));study.candidates.forEach((c,i)=>card(c,t("analysisCandidate", i+1)));
    }
  }
  return {open,cancel};
}
