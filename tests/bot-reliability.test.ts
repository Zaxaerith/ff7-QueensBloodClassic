import {afterEach,expect,test,vi} from 'vitest';
import {BotClient,type BotWorkerPort,type BotRequest} from '../src/bot-client.js';
import {BotWorkerFailure,type BotDiagnostic} from '../src/bot-diagnostics.js';
import {decideBot,observeGame,type BotDecision} from '../src/bot.js';
import {createPosition,play,type Game} from '../src/engine.js';
import {MatchPresentation} from '../src/match-presentation.js';
import {setLocale} from '../src/i18n/index.js';
class Worker implements BotWorkerPort {
  onmessage:BotWorkerPort['onmessage']=null;onerror:BotWorkerPort['onerror']=null;onmessageerror:NonNullable<BotWorkerPort['onmessageerror']>|null=null;
  terminated=false;payload:BotRequest|undefined;
  postMessage(data:BotRequest){this.payload=data;}terminate(){this.terminated=true;}
  reply(data:unknown){this.onmessage?.({data} as MessageEvent);}
}
const fresh=()=>createPosition({turn:1,hands:[[7],[7,1]],board:[{owner:0,row:0,col:0,pawns:1},{owner:1,row:0,col:4,pawns:1}]});
afterEach(()=>{vi.useRealTimers();setLocale('zh-CN');});
test.each(['worker-startup','worker-error','worker-message','timeout','search-error','rule-resolution'] as const)('Worker failure %s retains its code and cleans up',async reason=>{
  vi.useFakeTimers();const worker=new Worker();
  const client=new BotClient(()=>{if(reason==='worker-startup')throw Error('blocked');return worker;});
  const result=client.choose(observeGame(fresh()),{}).catch(error=>error as BotWorkerFailure);
  if(reason==='worker-error')worker.onerror?.({message:'blocked'} as ErrorEvent);
  if(reason==='worker-message')worker.onmessageerror?.({} as MessageEvent);
  if(reason==='timeout')vi.advanceTimersByTime(4000);
  if(reason==='search-error'||reason==='rule-resolution')worker.reply({ok:false,error:'failure',failureCode:reason});
  const error=await result;expect(error).toBeInstanceOf(BotWorkerFailure);
  expect((error as BotWorkerFailure).diagnostic).toMatchObject({source:'worker',reason,degraded:true,nodes:null});
  if(reason!=='worker-startup')expect(worker.terminated).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});
test.each([null,{ok:true,decision:true},{ok:true,decision:{action:{type:'pass',player:1}}},{ok:false},{ok:false,error:{toString:0,valueOf:0}},{ok:true,decision:{action:{type:'pass',player:1},stats:{nodes:-1,exhausted:'false',resolutionFailures:{}}}},{ok:true,decision:{action:{type:'pass',player:1},stats:{nodes:1},warning:{toString:0,valueOf:0}}},{}])('malformed Worker response terminates immediately: %j',async data=>{
  vi.useFakeTimers();const worker=new Worker(),client=new BotClient(()=>worker);
  const result=client.choose(observeGame(fresh()),{}).catch(error=>error as BotWorkerFailure);
  worker.reply(data);const error=await result;
  expect(error).toBeInstanceOf(BotWorkerFailure);expect((error as BotWorkerFailure).diagnostic.reason).toBe('worker-message');
  expect(worker.terminated).toBe(true);expect(vi.getTimerCount()).toBe(0);
});
test.each([null,false,undefined])('empty analysis response %j is unavailable, not cancellation',async analysis=>{
  vi.useFakeTimers();const worker=new Worker(),client=new BotClient(()=>worker);
  const result=client.analyze(observeGame(fresh()),{type:'pass',player:1},{});
  worker.reply({ok:true,analysis});
  expect(await result).toEqual({status:'unavailable',message:'Invalid Worker response'});
  expect(worker.terminated).toBe(true);expect(vi.getTimerCount()).toBe(0);
});
test('successful Worker diagnostics expose only counters/codes and cancellation ignores malformed late data',async()=>{
  const worker=new Worker(),client=new BotClient(()=>worker),game=fresh();
  const pending=client.choose(observeGame(game),{seed:701});worker.reply({ok:true,decision:decideBot(observeGame(game),{seed:701})});
  const result=(await pending)!;expect(result.diagnostic).toMatchObject({source:'worker',reason:'decision',degraded:false});
  expect(Object.keys(result.diagnostic!).sort()).toEqual(['degraded','elapsedMs','nodes','reason','resolutionFailures','source']);
  expect(worker.payload).not.toHaveProperty('replay');expect(worker.payload!.view).not.toHaveProperty('hands');expect(worker.payload!.view).not.toHaveProperty('decks');
  const cancelled=client.choose(observeGame(game),{});client.cancel();worker.reply(null);expect(await cancelled).toBeNull();
});
function present(game:Game,choose:()=>Promise<BotDecision|null>){
  const records:BotDiagnostic[]=[];
  const p=new MatchPresentation({game:()=>game,choose,cancelBot:()=>{},checkpoint:()=>null,completed:()=>null,changed:()=>{},result:()=>{},diagnostic:d=>records.push(d)},()=>true);
  p.resume();return {p,records};
}
test('search exhaustion is not a strategic PASS when fallback can still place',async()=>{
  vi.useFakeTimers();setLocale('en');const game=fresh();
  const decision:BotDecision={action:{type:'pass',player:1},difficulty:'normal',seed:1,stats:{nodes:1,maxNodes:1,rejected:1,depth:1,budgetReached:true,exhausted:true},reason:'exhausted'};
  const {p,records}=present(game,async()=>decision);await vi.runAllTimersAsync();
  expect(game.replay.commands).toMatchObject([{type:'play',player:1}]);
  expect(records).toMatchObject([{source:'fallback',reason:'search-exhausted',degraded:true}]);p.pause();
});
test('an evaluated strategic PASS with a nonfatal warning stays a PASS',async()=>{
  vi.useFakeTimers();const game=fresh();const decision=decideBot(observeGame(game),{});
  decision.action={type:'pass',player:1};decision.warning='nonfatal';
  const {p,records}=present(game,async()=>decision);await vi.runAllTimersAsync();
  expect(game.replay.commands).toEqual([{type:'pass',player:1}]);expect(records[0]).toMatchObject({source:'worker',reason:'strategic-pass',degraded:false});p.pause();
});
test('real rule rejection reports exhaustion, preserves atomicity and takes explicit no-resolvable fallback',async()=>{
  vi.useFakeTimers();setLocale('en');
  const game=createPosition({turn:1,hands:[[],[66]],board:[{owner:0,row:0,col:2,cardId:66,permanentDelta:-1},{owner:1,row:2,col:2,cardId:13},{owner:1,row:1,col:2,pawns:2}]});
  const before=structuredClone(game);
  expect(()=>play(game,1,0,1,2)).toThrow('UNSTABLE_AURA');expect(game).toEqual(before);
  const decision=decideBot(observeGame(game),{difficulty:'normal'});
  expect(decision.stats).toMatchObject({rejected:1,resolutionFailures:1,exhausted:true});
  expect(decision.action.type).toBe('pass');
  const {p,records}=present(game,async()=>decision);await vi.runAllTimersAsync();
  expect(game.replay.commands).toEqual([{type:'pass',player:1},{type:'pass',player:0}]);
  expect(records[0]).toMatchObject({source:'fallback',reason:'rule-resolution',resolutionFailures:2,degraded:true});p.pause();
});
