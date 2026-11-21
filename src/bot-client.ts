import {t} from './i18n/index.js';
import type {BotView,BotOptions,BotDecision,BotAction} from './bot.js';
import {BotWorkerFailure,elapsedSince,type BotDiagnostic,type BotFailureReason} from './bot-diagnostics.js';
import type {AnalysisOptions,AnalysisReply} from './replay-analysis.js';
export type BotRequest={view:BotView;options:BotOptions}|{kind:'analysis';view:BotView;actual:BotAction;options:AnalysisOptions};
export type BotResponse={ok:boolean;decision?:BotDecision;analysis?:AnalysisReply;error?:string;failureCode?:'rule-resolution'|'search-error'};
export interface BotWorkerPort {
  onmessage:((event:MessageEvent<BotResponse>)=>void)|null;
  onerror:((event:ErrorEvent)=>void)|null;
  onmessageerror?:((event:MessageEvent)=>void)|null;
  postMessage(data:BotRequest):void;terminate():void;
}
function isDecision(decision:BotDecision|undefined,view:BotView):decision is BotDecision {
  const action=decision?.action,stats=decision?.stats;
  const count=(value:unknown)=>typeof value==='number'&&Number.isInteger(value)&&value>=0;
  return !!action&&action.player===view.player&&
    (action.type==='pass'||action.type==='play'&&count(action.handIndex)&&action.handIndex<view.hand.length&&
      count(action.row)&&action.row<3&&count(action.col)&&action.col<5)&&!!stats&&count(stats.nodes)&&
    (decision.warning===undefined||typeof decision.warning==='string')&&
    (stats.exhausted===undefined||typeof stats.exhausted==='boolean')&&
    (stats.resolutionFailures===undefined||count(stats.resolutionFailures));
}
/** One outstanding decision; cancellation resolves null and terminates the worker. */
export class BotClient {
  private stop:(()=>void)|undefined;
  constructor(private factory:()=>BotWorkerPort=()=>new Worker(new URL('./bot.worker.ts',import.meta.url),{type:'module'}),private timeoutMs=4000){}
  cancel(){this.stop?.();}
  choose(view:BotView,options:BotOptions):Promise<BotDecision|null>{
    const started=performance.now();
    return this.run({view,options},data=>{
      const decision=data.decision;if(!isDecision(decision,view))return undefined;
      const diagnostic:BotDiagnostic={source:'worker',reason:decision.stats.exhausted?'search-exhausted':decision.action.type==='pass'?'strategic-pass':'decision',
        elapsedMs:elapsedSince(started),nodes:decision.stats.nodes,resolutionFailures:decision.stats.resolutionFailures??0,degraded:!!decision.stats.exhausted};
      return {...decision,diagnostic};
    });
  }
  analyze(view:BotView,actual:BotAction,options:AnalysisOptions):Promise<AnalysisReply|null>{
    return this.run({kind:'analysis',view,actual,options},data=>data.analysis,message=>({status:'unavailable',message}));
  }
  private run<T>(request:BotRequest,read:(data:BotResponse)=>T|undefined,failure?:(message:string)=>T):Promise<T|null>{
    this.cancel();const started=performance.now();
    return new Promise((resolve,reject)=>{
      let worker:BotWorkerPort|undefined,timer:ReturnType<typeof setTimeout>|undefined,done=false;
      const settle=(complete:()=>void)=>{if(done)return;done=true;if(timer!==undefined)clearTimeout(timer);try{worker?.terminate();}catch{/* A failed cleanup must not strand the request. */}this.stop=undefined;complete();};
      const finish=(value:T|null)=>settle(()=>resolve(value));
      this.stop=()=>finish(null);
      const fail=(message:string,reason:BotFailureReason)=>{
        const error=new BotWorkerFailure(message,{source:'worker',reason,elapsedMs:elapsedSince(started),nodes:null,resolutionFailures:reason==='rule-resolution'?1:0,degraded:true});
        settle(()=>failure?resolve(failure(message)):reject(error));
      };
      try{
        worker=this.factory();
        worker.onmessage=event=>{
          if(done)return;
          try{
            const data=event.data;
            if(!data||typeof data!=='object'||typeof data.ok!=='boolean'){fail('Invalid Worker response','worker-message');return;}
            if(!data.ok){
              if(data.error!==undefined&&typeof data.error!=='string'){fail('Invalid Worker error','worker-message');return;}
              fail(data.error??'Worker failed',data.failureCode==='rule-resolution'?'rule-resolution':data.failureCode==='search-error'?'search-error':'worker-message');return;
            }
            const value=read(data);value?finish(value):fail('Invalid Worker response','worker-message');
          }catch{fail('Invalid Worker response','worker-message');}
        };
        worker.onerror=event=>fail(event.message||'Worker error','worker-error');
        worker.onmessageerror=()=>fail('Worker message could not be decoded','worker-message');
        timer=setTimeout(()=>fail(t('botTimeout'),'timeout'),this.timeoutMs);
        worker.postMessage(request);
      }catch(error){fail(String(error),worker?'worker-message':'worker-startup');}
    });
  }
}
