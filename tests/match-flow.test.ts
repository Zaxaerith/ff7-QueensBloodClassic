import {expect,test,vi,afterEach} from 'vitest';
import {BotClient,type BotWorkerPort} from '../src/bot-client.js';
import {observeGame,recommendBot,type BotDecision} from '../src/bot.js';
import {startMatch,resultMarkup,eventLabel,actionFeedback,type MatchSettings} from '../src/match-flow.js';
import {createPosition,pass,scoreBreakdown,mulligan} from '../src/engine.js';
import {chainDeck} from '../src/cards.js';
afterEach(()=>vi.useRealTimers());
class FakeWorker implements BotWorkerPort {
  onmessage:BotWorkerPort['onmessage']=null;onerror:BotWorkerPort['onerror']=null;
  terminated=false;payload:any;postMessage(data:any){this.payload=data;}terminate(){this.terminated=true;}
  complete(decision:BotDecision){this.onmessage?.({data:{ok:true,decision}} as MessageEvent);}
}
const view=()=>observeGame(createPosition({hands:[[],[]],board:[]}));
test('new game, cancellation and stale worker replies cannot submit old moves',async()=>{
  const workers:FakeWorker[]=[],client=new BotClient(()=>{const w=new FakeWorker();workers.push(w);return w;});
  const first=client.choose(view(),{difficulty:'hard'}),second=client.choose(view(),{difficulty:'normal'});
  expect(await first).toBeNull();expect(workers[0].terminated).toBe(true);
  const decision=recommendBot(createPosition({hands:[[],[]],board:[]}));
  workers[0].complete(decision);workers[1].complete(decision);expect(await second).toEqual(decision);expect(workers[1].terminated).toBe(true);
  const next=client.choose(view(),{});client.cancel();expect(await next).toBeNull();
});
test('worker deadline/error returns a visible safe PASS and terminates the computation',async()=>{
  vi.useFakeTimers();const worker=new FakeWorker(),client=new BotClient(()=>worker,4000);
  const pending=client.choose(view(),{difficulty:'hard',seed:7});vi.advanceTimersByTime(4000);
  const result=await pending;expect(result?.action).toEqual({type:'pass',player:0});expect(result?.warning).toContain('4 秒');expect(worker.terminated).toBe(true);
  const failed=new BotClient(()=>{throw Error('no worker');});expect((await failed.choose(view(),{}))?.warning).toContain('no worker');
});
test('Worker receives only public BotView, never full Game',async()=>{
  const worker=new FakeWorker(),client=new BotClient(()=>worker);const pending=client.choose(view(),{});
  expect(worker.payload.view).not.toHaveProperty('hands');expect(worker.payload.view).not.toHaveProperty('decks');expect(worker.payload.view).not.toHaveProperty('events');
  client.cancel();await pending;
});
test('custom first-player settings, mulligan and rematch seed are reproducible',()=>{
  const settings:MatchSettings={deck:chainDeck,seed:701,difficulty:'hard',first:'computer'};
  const game=startMatch(settings);expect(game.turn).toBe(1);expect(game.phase).toBe('mulligan');
  mulligan(game,0,[0,2]);mulligan(game,1,[]);expect(game.turn).toBe(1);expect(game.phase).toBe('playing');
  expect(startMatch(settings).replay.firstPlayer).toBe(1);expect(startMatch({...settings,first:'player'}).turn).toBe(0);
  expect(startMatch({...settings,first:'seeded'})).toEqual(startMatch({...settings,first:'seeded'}));
  expect(()=>startMatch({...settings,seed:-1})).toThrow(/Seed/);
});
test('end screen uses engine lane awards including special scoring, ties and draw',()=>{
  const game=createPosition({hands:[[],[]],board:[{cardId:142,owner:0,row:0,col:0},{cardId:7,owner:1,row:0,col:4},{cardId:53,owner:0,row:1,col:0},{cardId:7,owner:1,row:1,col:4}]});
  expect(resultMarkup(game)).toBe('');pass(game,0);pass(game,1);
  const result=scoreBreakdown(game);expect(result.awards).toEqual([[0,3],[17,0],[0,0]]);
  expect(resultMarkup(game)).toContain('你赢了 · 17 : 3');expect(resultMarkup(game)).toContain('<td>17 : 0</td>');
  const draw=createPosition({phase:'finished',hands:[[],[]],board:[]});expect(resultMarkup(draw)).toContain('平局');
});
test('feedback summarizes chains and event log never reveals opponent draw identity',()=>{
  expect(eventLabel({seq:1,type:'CardAddedToHand',player:1,cardId:145,reason:'draw'})).toBe('电脑补牌 1 张');
  expect(actionFeedback([{seq:1,type:'CardPlayed',player:0,cardId:10},{seq:2,type:'CardAddedToHand',reason:'generated'},{seq:3,type:'CardDestroyed'}])).toContain('生成手牌 1 张');
});
