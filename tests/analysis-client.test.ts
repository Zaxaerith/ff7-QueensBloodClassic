import {test,expect,vi,afterEach} from 'vitest';
import {BotClient,type BotWorkerPort,type BotRequest,type BotResponse} from '../src/bot-client.js';
import {AnalysisClient} from '../src/analysis-client.js';
import {observeGame,recommendBot} from '../src/bot.js';
import {analyzeDecision} from '../src/replay-analysis.js';
import {createPosition} from '../src/engine.js';
afterEach(()=>vi.useRealTimers());
class FakeWorker implements BotWorkerPort {
  onmessage:BotWorkerPort['onmessage']=null;onerror:BotWorkerPort['onerror']=null;terminated=false;payload:BotRequest|null=null;
  postMessage(data:BotRequest){this.payload=data;}terminate(){this.terminated=true;}
  complete(data:BotResponse){this.onmessage?.({data} as MessageEvent);}
}
const view=()=>observeGame(createPosition({hands:[[],[]],board:[]})),actual={type:'pass' as const,player:0 as const};
test('step changes/exit terminate pending analysis and stale replies cannot replace the new result',async()=>{
  const workers:FakeWorker[]=[],analysis=new AnalysisClient(new BotClient(()=>{const w=new FakeWorker();workers.push(w);return w;}));
  const a=analysis.run(view(),actual,{seed:1}),b=analysis.run(view(),actual,{seed:2});expect(await a).toBeNull();expect(workers[0].terminated).toBe(true);
  workers[0].complete({ok:true,analysis:analyzeDecision(view(),actual,{seed:1})});workers[1].complete({ok:true,analysis:analyzeDecision(view(),actual,{seed:2})});
  expect((await b)!.reply).toMatchObject({seed:2});
  const next=analysis.run(view(),actual,{seed:3});analysis.cancel();expect(await next).toBeNull();expect(workers[2].terminated).toBe(true);
});
test('analysis timeout/failure is unavailable, never a fabricated PASS evaluation',async()=>{
  vi.useFakeTimers();const worker=new FakeWorker(),client=new BotClient(()=>worker,4000);
  const pending=client.analyze(view(),actual,{});vi.advanceTimersByTime(4000);expect(await pending).toMatchObject({status:'unavailable',message:expect.stringContaining('4 秒')});expect(worker.terminated).toBe(true);
  const failed=new BotClient(()=>{throw Error('blocked');});expect(await failed.analyze(view(),actual,{})).toEqual({status:'unavailable',message:'Error: blocked'});
});
test('independent live/analysis clients do not cancel each other and send no history/secrets',async()=>{
  const wa=new FakeWorker(),wl=new FakeWorker(),live=new BotClient(()=>wl),analysis=new AnalysisClient(new BotClient(()=>wa));
  const liveResult=live.choose(view(),{}),result=analysis.run(view(),actual,{});
  expect(wa.payload).toHaveProperty('kind','analysis');expect(wa.payload).not.toHaveProperty('replay');expect(wa.payload!.view).not.toHaveProperty('decks');expect(wa.payload!.view).not.toHaveProperty('hands');
  analysis.cancel();expect(await result).toBeNull();expect(wl.terminated).toBe(false);wl.complete({ok:true,decision:recommendBot(createPosition({hands:[[],[]],board:[]}))});expect(await liveResult).not.toBeNull();
});
test('bounded cache clones results, evicts oldest, and pending cached results respect cancellation',async()=>{
  let calls=0;
  const port={cancel(){},async analyze(v:ReturnType<typeof view>,a:typeof actual,o:{seed?:number}){calls++;return analyzeDecision(v,a,o);}} as unknown as BotClient;
  const client=new AnalysisClient(port,2);
  const a=await client.run(view(),actual,{seed:1});expect(a!.cached).toBe(false);a!.reply.status!=='unavailable'&&a!.reply.hints.push('mutation');
  const cached=await client.run(view(),actual,{seed:1});expect(cached!.cached).toBe(true);expect(cached!.reply).not.toEqual(a!.reply);
  await client.run(view(),actual,{seed:2});await client.run(view(),actual,{seed:3});expect((await client.run(view(),actual,{seed:1}))!.cached).toBe(false);expect(calls).toBe(4);
  const pending=client.run(view(),actual,{seed:1});client.cancel();expect(await pending).toBeNull();
});
