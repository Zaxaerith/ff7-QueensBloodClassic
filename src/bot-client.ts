import type {BotView,BotOptions,BotDecision,BotAction} from './bot.js';
import type {AnalysisOptions,AnalysisReply} from './replay-analysis.js';
export type BotRequest={view:BotView;options:BotOptions}|{kind:'analysis';view:BotView;actual:BotAction;options:AnalysisOptions};
export type BotResponse={ok:boolean;decision?:BotDecision;analysis?:AnalysisReply;error?:string};
export interface BotWorkerPort {
  onmessage:((event:MessageEvent<BotResponse>)=>void)|null;
  onerror:((event:ErrorEvent)=>void)|null;
  postMessage(data:BotRequest):void;terminate():void;
}
/** One outstanding decision; cancellation resolves null and terminates the worker. */
export class BotClient {
  private stop:(()=>void)|undefined;
  constructor(private factory:()=>BotWorkerPort=()=>new Worker(new URL('./bot.worker.ts',import.meta.url),{type:'module'}),private timeoutMs=4000){}
  cancel(){this.stop?.();}
  choose(view:BotView,options:BotOptions):Promise<BotDecision|null>{
    return this.run({view,options},data=>data.decision,message=>({action:{type:'pass',player:view.player},difficulty:options.difficulty??'normal',seed:options.seed??1,
      stats:{nodes:0,maxNodes:options.maxNodes??0,rejected:0,depth:0,budgetReached:false},reason:'电脑搜索不可用，本回合安全 PASS',warning:message}));
  }
  analyze(view:BotView,actual:BotAction,options:AnalysisOptions):Promise<AnalysisReply|null>{
    return this.run({kind:'analysis',view,actual,options},data=>data.analysis,message=>({status:'unavailable',message}));
  }
  private run<T>(request:BotRequest,read:(data:BotResponse)=>T|undefined,failure:(message:string)=>T):Promise<T|null>{
    this.cancel();
    return new Promise(resolve=>{
      let worker:BotWorkerPort|undefined,timer:ReturnType<typeof setTimeout>|undefined,done=false;
      const finish=(value:T|null)=>{if(done)return;done=true;if(timer!==undefined)clearTimeout(timer);worker?.terminate();this.stop=undefined;resolve(value);};
      this.stop=()=>finish(null);
      const fail=(message:string)=>finish(failure(message));
      try{
        worker=this.factory();worker.onmessage=e=>{const value=read(e.data);e.data.ok&&value?finish(value):fail(e.data.error??'Worker failed');};
        worker.onerror=()=>fail('Worker error');timer=setTimeout(()=>fail('超过 4 秒浏览器安全时限'),this.timeoutMs);worker.postMessage(request);
      }catch(error){fail(String(error));}
    });
  }
}
