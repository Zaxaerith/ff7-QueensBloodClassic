import {test,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {createGame,mulligan,play,pass,legalMoves,outcome,previewInfluence,chooseBotMove,exportReplay,replayMatch,type Game,type Player} from '../src/engine.js';
import {byId,starterDeck,playableCards,tokenCards,chainDeck,summonDeck,deckPresets,TOKEN} from '../src/cards.js';

const game=(seed=123,first:Player=0)=>createGame([starterDeck,starterDeck],seed,first);
const started=(first:Player=0)=>{const s=game(123,first);mulligan(s,0,[]);mulligan(s,1,[]);return s;};
function put(s:Game,id:number,owner:Player,row:number,col:number,delta=0){
  s.board[row][col]={owner,pawns:0,card:{id,owner,instanceId:s.nextInstanceId++,permanentDelta:delta,power:byId.get(id)!.power+delta,enhancedOnce:false,enfeebledOnce:false}};
  return s.board[row][col].card!;
}
function prepare(s:Game,id:number,owner:Player,row:number,col:number,pawns=3){
  s.turn=owner;s.hands[owner]=[id];s.decks[owner]=[];s.board[row][col]={owner,pawns,card:null};
}
function assertBoard(s:Game){
  const instances:number[]=[];
  for(const tile of s.board.flat()){
    expect(tile.pawns).toBeGreaterThanOrEqual(0);expect(tile.pawns).toBeLessThanOrEqual(3);
    if(tile.card){expect(tile.owner).toBe(tile.card.owner);expect(tile.pawns).toBe(0);expect(tile.card.power).toBeGreaterThan(0);instances.push(tile.card.instanceId);}
    else expect(tile.owner===null).toBe(tile.pawns===0);
  }
  expect(new Set(instances).size).toBe(instances.length);
}
function assertConservation(s:Game){
  for(const owner of [0,1] as const){
    const added=s.events.filter(e=>(e.type==='CardAddedToHand'&&e.reason==='generated'||e.type==='CardSpawned')&&e.player===owner).map(e=>e.cardId!);
    const actual=[...s.hands[owner],...s.decks[owner],...s.discard[owner],...s.board.flat().flatMap(t=>t.card?.owner===owner?[t.card.id]:[])];
    expect(actual.sort((a,b)=>a-b)).toEqual([...s.replay.decks[owner],...added].sort((a,b)=>a-b));
  }
}

test('numbered cards, separate tokens, source catalog and shipped catalog agree',()=>{
  expect(playableCards.length).toBeGreaterThanOrEqual(39);expect(tokenCards.length).toBeGreaterThanOrEqual(5);
  expect(new Set([...playableCards,...tokenCards].map(c=>c.id)).size).toBe(playableCards.length+tokenCards.length);
  const source=JSON.parse(readFileSync(new URL('../data/card-catalog.json',import.meta.url),'utf8'));
  const shipped=JSON.parse(readFileSync(new URL('../site/catalog.json',import.meta.url),'utf8'));
  expect(source).toEqual(shipped);expect(source.cards).toHaveLength(145);
  expect(source.cards.filter((c:{rulesImplemented?:boolean})=>c.rulesImplemented).map((c:{id:number})=>c.id)).toEqual(playableCards.map(c=>c.id));
  for(const row of source.cards)if(row.rulesImplemented)expect(row.rules).toEqual(byId.get(row.id));
  expect(source.tokens.map((c:{id:number})=>c.id)).toEqual(tokenCards.map(c=>c.id));
  expect(source.cards.some((c:{id:number})=>c.id>145)).toBe(false);
  for(const preset of deckPresets) expect(()=>createGame([preset.cards,preset.cards])).not.toThrow();
});
test('3×5 setup, five-card hand, rank-one home columns, ten-card draw piles',()=>{
  const s=game();expect(s.phase).toBe('mulligan');expect(s.board).toHaveLength(3);
  expect(s.board.every(r=>r.length===5)).toBe(true);
  expect(s.board[1].map(t=>[t.owner,t.pawns])).toEqual([[0,1],[null,0],[null,0],[null,0],[1,1]]);
  expect(s.hands.map(h=>h.length)).toEqual([5,5]);expect(s.decks.map(d=>d.length)).toEqual([10,10]);
});
test('deck rejects wrong size, unimplemented cards, excess standard/legendary copies and tokens',()=>{
  expect(()=>createGame([[1],starterDeck])).toThrow(/15-card/);
  for(const deck of [[...starterDeck.slice(1),9999],starterDeck.map((id,i)=>i===2?1:id),[...starterDeck.slice(2),98,98],[...starterDeck.slice(1),TOKEN.mandragora]])
    expect(()=>createGame([deck,starterDeck])).toThrow();
});
test('mulligan preserves unselected slots, draws before reinsertion, and conserves deck multiset',()=>{
  const s=game(),before=[...s.hands[0]],available=[...s.decks[0]],indices=[1,3];
  mulligan(s,0,indices);
  expect(s.hands[0]).toEqual([before[0],available[0],before[2],available[1],before[4]]);
  expect([...s.hands[0],...s.decks[0]].sort()).toEqual([...starterDeck].sort());
  expect(s.decks[0]).toHaveLength(10);expect(s.phase).toBe('mulligan');
  expect(()=>mulligan(s,0,[])).toThrow();mulligan(s,1,[]);expect(s.phase).toBe('playing');
});
test('mulligan input rejection is atomic; zero/all swaps and confirmation order are reproducible',()=>{
  const a=game(),before=structuredClone(a);
  for(const indices of [[0,0],[-1],[5],[0.5]]){expect(()=>mulligan(a,0,indices)).toThrow();expect(a).toEqual(before);}
  const b=game();mulligan(a,0,[0,1,2,3,4]);mulligan(a,1,[]);mulligan(b,1,[]);mulligan(b,0,[0,1,2,3,4]);
  expect(a.hands).toEqual(b.hands);expect(a.decks).toEqual(b.decks);
  expect(a.hands[0]).toHaveLength(5);
});
test('legal moves enforce phase/turn, friendly ownership, rank and occupancy; rejected moves do not mutate',()=>{
  const s=game();expect(legalMoves(s,0)).toEqual([]);mulligan(s,0,[]);mulligan(s,1,[]);
  s.hands[0]=[2];expect(legalMoves(s,0)).toEqual([]);s.hands[0]=[1];expect(legalMoves(s,1)).toEqual([]);
  const before=structuredClone(s);
  for(const args of [[1,0,1,4],[0,0,0,2],[0,9,0,0],[0,0,-1,0],[0,0,0.5,0]]){
    expect(()=>play(s,args[0] as Player,args[1],args[2],args[3])).toThrow();expect(s).toEqual(before);
  }
  const m=legalMoves(s,0)[0];play(s,0,m.handIndex,m.row,m.col);
  expect(s.turn).toBe(1);expect(s.hands.map(hand=>hand.length)).toEqual([0,6]);
  expect(s.decks.map(deck=>deck.length)).toEqual([10,9]);
  expect(s.events.filter(e=>e.type==='CardAddedToHand'&&e.reason==='draw')).toMatchObject([{player:1}]);
});
test('Elphadunk spreads up, down and backward, never forward',()=>{
  expect(previewInfluence(byId.get(11)!,1,2,0).sort()).toEqual([[0,2],[1,1],[2,2]].sort());
  expect(previewInfluence(byId.get(11)!,1,2,1).sort()).toEqual([[0,2],[1,3],[2,2]].sort());
});
test('all card influence patterns mirror and clip at every board edge',()=>{
  for(const card of [...playableCards,...tokenCards]) for(let r=0;r<3;r++) for(let c=0;c<5;c++){
    const left=previewInfluence(card,r,c,0).map(([row,col])=>`${row},${4-col}`).sort();
    const right=previewInfluence(card,r,4-c,1).map(p=>p.join(',')).sort();expect(left).toEqual(right);
    expect(previewInfluence(card,r,c,1).every(([row,col])=>row>=0&&row<3&&col>=0&&col<5)).toBe(true);
  }
  expect(previewInfluence(byId.get(14)!,1,0,1)).toEqual([]); // No abs() folding back onto col 1.
});

for(const owner of [0,1] as const){
  const home=owner===0?0:4,front=owner===0?1:3,enemy=(1-owner) as Player;
  test(`P${owner+1}: contested capture keeps rank, friendly ranks cap at three; occupied cards survive influence`,()=>{
    const s=started(owner);prepare(s,1,owner,1,home);s.board[1][front]={owner:enemy,pawns:3,card:null};
    put(s,7,enemy,0,home);play(s,owner,0,1,home);
    expect(s.board[1][front]).toMatchObject({owner,pawns:3,card:null});expect(s.board[0][home].card?.id).toBe(7);
    const t=started(owner);prepare(t,1,owner,1,home);t.board[1][front]={owner,pawns:3,card:null};play(t,owner,0,1,home);
    expect(t.board[1][front].pawns).toBe(3);
  });
  test(`P${owner+1}: Archdragon destroys before influence, creating a new rank-one position`,()=>{
    const s=started(owner);prepare(s,20,owner,1,home);put(s,1,enemy,1,front);play(s,owner,0,1,home);
    expect(s.board[1][front]).toEqual({owner,pawns:1,card:null});
    const death=s.events.find(e=>e.type==='CardDestroyed')!,claim=s.events.find(e=>e.type==='PawnsClaimed'&&e.row===1&&e.col===front)!;
    expect(death.seq).toBeLessThan(claim.seq);expect(s.discard[enemy]).toEqual([1]);
  });
  test(`P${owner+1}: entry damage respects existing aura, while a surviving enemy cannot be captured`,()=>{
    const s=started(owner);prepare(s,20,owner,0,home);put(s,1,enemy,0,front);put(s,13,enemy,1,front);
    // Security Officer has 1 + 2 aura - 3 entry = 0; with +1 permanent it survives.
    s.board[0][front].card!.permanentDelta=1;s.board[0][front].card!.power=4;
    play(s,owner,0,0,home);expect(s.board[0][front].card?.power).toBe(1);expect(s.board[0][front].owner).toBe(enemy);
  });
  test(`P${owner+1}: Mandragora generates a playable token before the next turn's draw`,()=>{
    const s=started(owner);prepare(s,10,owner,1,home);s.decks[owner]=[7];play(s,owner,0,1,home);
    expect(s.hands[owner]).toEqual([TOKEN.mandragora]);expect(s.decks[owner]).toEqual([7]);
    pass(s,enemy);expect(s.hands[owner]).toEqual([TOKEN.mandragora,7]);expect(s.decks[owner]).toEqual([]);
    play(s,owner,0,1,front);expect(s.board[1][front].card?.id).toBe(TOKEN.mandragora);
    expect(s.events.filter(e=>e.reason==='generated')).toHaveLength(1);
  });
  test(`P${owner+1}: replacement only covers allies, destroys old instance, clears modifiers and notifies observers`,()=>{
    const s=started(owner);s.hands[owner]=[51];s.decks[owner]=[];
    const original=put(s,40,owner,1,home,4),king=put(s,35,owner,2,owner===0?2:2);
    put(s,1,enemy,1,front);
    expect(legalMoves(s,owner)).toHaveLength(2);
    expect(legalMoves(s,owner).some(m=>m.row===1&&m.col===front)).toBe(false);
    play(s,owner,0,1,home);
    expect(s.board[1][home].card).toMatchObject({id:51,power:2,permanentDelta:0});
    expect(s.board[1][home].card?.instanceId).not.toBe(original.instanceId);
    expect(s.board[2][2].card?.power).toBe(king.power+2);expect(s.hands[owner]).toEqual([TOKEN.heatseeker]);
    expect(s.events.filter(e=>e.type==='CardDestroyed'&&e.instanceId===original.instanceId)).toHaveLength(1);
  });
  test(`P${owner+1}: Griffon snapshots replaced effective power including aura`,()=>{
    const s=started(owner);s.hands[owner]=[59];s.decks[owner]=[];
    const col=2,target=owner===0?3:1;
    put(s,7,owner,1,col,3);put(s,13,owner,2,col);put(s,1,owner,0,target);
    s.board[1][col].card!.power=7; // 2 base +3 permanent +2 live aura.
    play(s,owner,0,1,col);expect(s.board[0][target].card?.power).toBe(8);
    expect(s.board[1][col].card?.power).toBe(3); // New Griffon gets only the still-live aura.
  });
  test(`P${owner+1}: Amphidex triggers once, including when it enters an existing aura`,()=>{
    const s=started(owner);prepare(s,48,owner,2,home);put(s,31,owner,1,home);put(s,7,owner,0,home);
    play(s,owner,0,2,home);expect(s.board[2][home].card?.power).toBe(4);
    expect(s.board[1][home].card?.power).toBe(4);expect(s.board[0][home].card?.power).toBe(5);
    prepare(s,1,enemy,1,enemy===0?0:4);play(s,enemy,0,1,enemy===0?0:4);
    expect(s.board[0][home].card?.power).toBe(5);
    expect(s.events.filter(e=>e.type==='CardEnhanced'&&e.cardId===48)).toHaveLength(1);
  });
  test(`P${owner+1}: Reapertail first enfeeblement chains into enemy destruction only once`,()=>{
    const s=started(enemy);const col=2,forward=owner===0?3:1;
    put(s,61,owner,2,col);put(s,7,enemy,1,forward);put(s,7,enemy,0,forward);
    prepare(s,26,enemy,1,col);play(s,enemy,0,1,col);
    expect(s.board[2][col].card?.power).toBe(2);expect(s.board[0][forward].card).toBe(null);expect(s.board[1][forward].card).toBe(null);
    expect(s.events.filter(e=>e.type==='CardEnfeebled'&&e.cardId===61)).toHaveLength(1);
    prepare(s,1,owner,1,home);play(s,owner,0,1,home);
    expect(s.events.filter(e=>e.type==='CardEnfeebled'&&e.cardId===61)).toHaveLength(1);
  });
  test(`P${owner+1}: Shiva fills only empty allied positions by rank, never enemy/neutral/occupied tiles`,()=>{
    const s=started(owner);prepare(s,96,owner,1,home,2);
    for(let r=0;r<3;r++)s.board[r][front]={owner,pawns:r+1,card:null};
    put(s,32,owner,2,home);play(s,owner,0,1,home);
    expect([0,1,2].map(r=>s.board[r][front].card?.power)).toEqual([2,4,6]);
    expect(s.board[2][home].card?.power).toBe(2); // Shiva from hand, not three spawned tokens.
    expect(s.board[1][2].card).toBe(null);expect(s.board[1][enemy===0?0:4].card).toBe(null);
    expect(s.events.filter(e=>e.type==='CardSpawned').length).toBe(4); // Also the other empty home position.
    expect(s.events.filter(e=>e.type==='CardPlayed')).toHaveLength(1);assertBoard(s);
  });
  test(`P${owner+1}: Titan adds two ranks total, and capture preserves opposing rank`,()=>{
    const s=started(owner);prepare(s,98,owner,1,home,2);s.board[1][front]={owner:enemy,pawns:1,card:null};
    play(s,owner,0,1,home);expect(s.board[0][home].pawns).toBe(3);expect(s.board[2][home].pawns).toBe(3);
    expect(s.board[1][front]).toEqual({owner,pawns:1,card:null});
  });
}

test('aura recomputation never stacks; replacement removes the old source immediately',()=>{
  const s=started();prepare(s,13,0,1,0);put(s,7,0,0,0);play(s,0,0,1,0);expect(s.board[0][0].card?.power).toBe(4);
  prepare(s,1,1,1,4);play(s,1,0,1,4);expect(s.board[0][0].card?.power).toBe(4);
  s.hands[0]=[51];s.decks[0]=[];play(s,0,0,1,0);expect(s.board[0][0].card?.power).toBe(2);
});
test('first-enhancement state survives aura removal and return on the same instance',()=>{
  const s=started();prepare(s,48,0,2,2);put(s,31,0,1,2);put(s,7,0,0,2);play(s,0,0,2,2);
  prepare(s,39,1,1,3);play(s,1,0,1,3);expect(s.board[2][2].card?.power).toBe(2);
  prepare(s,31,0,1,2);play(s,0,0,1,2);expect(s.board[2][2].card?.power).toBe(4);
  expect(s.board[0][2].card?.permanentDelta).toBe(3);
  expect(s.events.filter(e=>e.type==='CardEnhanced'&&e.cardId===48)).toHaveLength(1);
});
test('simultaneous lethal wave removes all observers before destruction notifications',()=>{
  const s=started();prepare(s,26,0,1,0);put(s,35,1,0,0);put(s,40,1,2,0);put(s,43,0,1,2);
  play(s,0,0,1,0);
  expect(s.board[0][0].card).toBe(null);expect(s.board[2][0].card).toBe(null);expect(s.board[1][2].card?.power).toBe(4);
  expect(s.hands[1]).toContain(TOKEN.heatseeker);expect(s.events.some(e=>e.type==='PowerChanged'&&e.cardId===35&&e.reason==='onCardDestroyed')).toBe(false);
});
test('source destruction collapses aura, triggering a second lethal wave',()=>{
  const s=started();prepare(s,20,0,1,0);put(s,13,1,1,1);put(s,7,1,0,1,-2);
  s.board[0][1].card!.power=2; // Supported by the crab, despite zero base + permanent.
  play(s,0,0,1,0);expect(s.board[1][1].card).toBe(null);expect(s.board[0][1].card).toBe(null);
  expect(s.events.filter(e=>e.type==='CardDestroyed').map(e=>e.cardId)).toEqual([13,7]);
});
test('two Bombs chain exactly once each, can destroy the played card, and retain dead-source coordinates',()=>{
  const s=started();prepare(s,20,0,1,0);put(s,41,1,1,1);put(s,41,1,1,2);put(s,35,1,0,4);
  play(s,0,0,1,0);
  expect(s.events.filter(e=>e.type==='CardDestroyed'&&e.cardId===41)).toHaveLength(2);
  expect(s.board[1][0].card).toBe(null);expect(s.board[1][1].card).toBe(null);expect(s.board[1][2].card).toBe(null);
  expect(s.board[0][4].card?.power).toBe(5);assertBoard(s);
});
test('Mindflayer can destroy entering Mandragora; entry generation still occurs',()=>{
  const s=started();put(s,27,0,1,0);prepare(s,10,0,0,0);play(s,0,0,0,0);
  expect(s.board[0][0].card).toBe(null);expect(s.hands[0]).toEqual([TOKEN.mandragora]);
});
test('Cockatrice destroys an enhanced high-power card regardless of its power',()=>{
  const s=started();prepare(s,39,0,1,0);put(s,21,1,1,1,30);play(s,0,0,1,0);
  expect(s.board[1][1]).toEqual({owner:0,pawns:1,card:null});expect(s.events.find(e=>e.type==='CardDestroyed')?.reason).toBe('ability');
});
test('a full board remains playable when an allied replacement exists',()=>{
  const s=started();for(let r=0;r<3;r++)for(let c=0;c<5;c++)put(s,7,c<3?0:1,r,c);
  s.hands[0]=[1,51];expect(legalMoves(s,0)).toHaveLength(9);expect(s.phase).toBe('playing');play(s,0,1,1,1);assertBoard(s);
});
test('winner takes lane total, not margin or number of lanes; ties score zero',()=>{
  const s=started();put(s,21,0,0,0,10);put(s,21,1,0,4);put(s,7,0,1,0);put(s,21,1,1,4,2);put(s,7,0,2,0);put(s,21,1,2,4,2);
  expect(outcome(s).scores).toEqual([15,14]);expect(outcome(s).winner).toBe(0);
  s.board[0][0].card!.power=5;expect(outcome(s).scores).toEqual([0,14]);
});
test('win-lane bonuses add after comparison, never rescue a losing or tied row',()=>{
  const s=started();put(s,53,0,0,0);put(s,21,1,0,4);expect(outcome(s).scores).toEqual([0,0]);
  s.board[0][4].card!.power=4;expect(outcome(s).scores).toEqual([15,0]);
  s.board[0][4].card!.power=6;expect(outcome(s).scores).toEqual([0,6]);
});
test('pass hands off to the other side to draw, play resets consecutive passes, and final state rejects actions',()=>{
  const s=started(),before=[...s.decks[0]];pass(s,0);expect(s.decks[0]).toEqual(before);
  expect(s.hands[1]).toHaveLength(6);expect(s.decks[1]).toHaveLength(9);
  const m=legalMoves(s,1)[0];play(s,1,m.handIndex,m.row,m.col);expect(s.passes).toBe(0);
  pass(s,0);expect(s.phase).toBe('playing');const decks=structuredClone(s.decks);
  pass(s,1);expect(s.phase).toBe('finished');expect(s.decks).toEqual(decks);
  expect(legalMoves(s,0)).toEqual([]);expect(()=>play(s,0,0,0,0)).toThrow();expect(()=>pass(s,0)).toThrow();
  expect(s.events.filter(e=>e.type==='MatchEnded')).toHaveLength(1);
});
test('empty draw pile does not prevent a legal play, and no card is fabricated',()=>{
  const s=started();prepare(s,1,0,1,0);s.decks[1]=[];
  play(s,0,0,1,0);expect(s.phase).toBe('playing');expect(s.turn).toBe(1);
  expect(s.hands.map(hand=>hand.length)).toEqual([0,5]);
  expect(s.events.filter(e=>e.type==='CardAddedToHand')).toEqual([]);
});

function completeMatch(decks:[readonly number[],readonly number[]],seed:number,first:Player){
  const s=createGame(decks,seed,first);mulligan(s,0,[1,3]);mulligan(s,1,[0,4]);
  for(let i=0;s.phase!=='finished';i++){
    expect(i).toBeLessThan(150);
    const move=chooseBotMove(s),owner=s.turn;
    if(move)play(s,owner,move.handIndex,move.row,move.col);else pass(s,owner);
    assertBoard(s);assertConservation(s);
  }
  return s;
}
for(const first of [0,1] as const) for(const [label,decks] of [
  ['baseline',[starterDeck,starterDeck]],['chains',[chainDeck,chainDeck]],['mixed',[summonDeck,chainDeck]]
] as const){
  test(`complete deterministic ${label} match, P${first+1} first: legal commands, resolution invariants, JSON replay and final scoring`,()=>{
    const s=completeMatch([...decks],701,first);
    const replay=JSON.parse(JSON.stringify(exportReplay(s)));
    expect(replayMatch(replay)).toEqual(s);expect(s.events.at(-1)?.type).toBe('MatchEnded');
    const result=outcome(s);expect(result.winner).toBe(result.scores[0]===result.scores[1]?null:result.scores[0]>result.scores[1]?0:1);
    expect(s.events.map(e=>e.seq)).toEqual(s.events.map((_,i)=>i+1));
    const drawn=s.events.filter(e=>e.type==='CardAddedToHand'&&e.reason==='draw').length;
    expect(drawn).toBe(20-s.decks[0].length-s.decks[1].length);
  });
}
test('complete empty-board double-pass match is a draw and replays without a move',()=>{
  const s=started();pass(s,0);pass(s,1);expect(outcome(s)).toMatchObject({scores:[0,0],winner:null});expect(replayMatch(exportReplay(s))).toEqual(s);
});
test('replay rejects incompatible versions and invalid command sequences',()=>{
  const s=game();const replay=exportReplay(s);expect(()=>replayMatch({...replay,version:99} as never)).toThrow(/version/);
  replay.commands.push({type:'pass',player:0});expect(()=>replayMatch(replay)).toThrow();
});
test('browser-exported seed 701 fixture reproduces the observed 0:24 terminal scoreboard',()=>{
  // Exported via the actual web UI after a full match, without editing game state.
  const fixture=JSON.parse(readFileSync(new URL('./fixtures/ui-chain-701.json',import.meta.url),'utf8'));
  const s=replayMatch(fixture);
  expect(s.phase).toBe('finished');expect(fixture.commands).toHaveLength(40);expect(s.events).toHaveLength(155);
  expect(outcome(s)).toMatchObject({rows:[[0,9],[0,12],[0,3]],scores:[0,24],winner:1});
  expect(s.hands.map(h=>h.length)).toEqual([6,0]);expect(s.decks.map(d=>d.length)).toEqual([5,0]);
  expect(s.events.some(e=>e.type==='CardReplaced')).toBe(true);
  expect(s.events.some(e=>e.type==='CardDestroyed')).toBe(true);assertBoard(s);assertConservation(s);
});
