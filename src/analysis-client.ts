import {BotClient} from './bot-client.js';
import type {BotView,BotAction} from './bot.js';
import type {AnalysisOptions,AnalysisReply} from './replay-analysis.js';

/** Separate instance from the live Bot. Epoch protects even cache-hit promises. */
export class AnalysisClient {
  private epoch=0;private cache=new Map<string,AnalysisReply>();
  constructor(private client=new BotClient(),private capacity=16){}
  cancel(){this.epoch++;this.client.cancel();}
  async run(view:BotView,actual:BotAction,options:AnalysisOptions):Promise<{reply:AnalysisReply;elapsedMs:number;cached:boolean}|null>{
    this.cancel();const epoch=this.epoch,key=JSON.stringify([view,actual,options]),started=performance.now();
    let reply=this.cache.get(key),cached=!!reply;
    if(!reply)reply=await this.client.analyze(view,actual,options)??undefined;
    else await Promise.resolve(); // Cancellation must also win before a cache-hit continuation.
    if(epoch!==this.epoch||!reply)return null;
    if(reply.status!=='unavailable'&&this.capacity>0){
      this.cache.delete(key);this.cache.set(key,structuredClone(reply));
      while(this.cache.size>this.capacity)this.cache.delete(this.cache.keys().next().value!);
    }
    return {reply:structuredClone(reply),elapsedMs:Math.round(performance.now()-started),cached};
  }
}
