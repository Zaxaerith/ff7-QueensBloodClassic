import {decideBot} from './bot.js';
import {analyzeDecision} from './replay-analysis.js';
import type {BotRequest} from './bot-client.js';
const worker=globalThis as unknown as {onmessage:((event:MessageEvent<BotRequest>)=>void)|null;postMessage:(data:unknown)=>void};
worker.onmessage=event=>{
  try{const data=event.data;worker.postMessage('kind' in data?{ok:true,analysis:analyzeDecision(data.view,data.actual,data.options)}:{ok:true,decision:decideBot(data.view,data.options)});}
  catch(error){worker.postMessage({ok:false,error:error instanceof Error?error.message:String(error)});}
};
