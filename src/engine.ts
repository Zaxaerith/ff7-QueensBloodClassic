import {byId, type Card, type Offset, type Selector, type Side, type Ability, type Action, type Trigger} from './cards.js';

export type Player = 0 | 1;
export type Phase = 'mulligan' | 'playing' | 'finished';
export type PlacedCard = {
  id: number; instanceId: number; owner: Player; permanentDelta: number; power: number;
  enhancedOnce: boolean; enfeebledOnce: boolean;
  statusPower?: number; dynamicDelta?: number; thresholds?: number[];
};
export type Tile = {owner: Player | null; pawns: number; card: PlacedCard | null};
export type Move = {handIndex: number; row: number; col: number};
export type Command = {type: 'mulligan'; player: Player; indices: number[]}
  | ({type: 'play'; player: Player} & Move) | {type: 'pass'; player: Player};
export type PositionTile = {row: number; col: number; owner: Player | null; pawns?: number; cardId?: number; permanentDelta?: number; enhancedOnce?: boolean; enfeebledOnce?: boolean; thresholds?: number[]};
export type Position = {seed?: number; phase?: Phase; turn?: Player; passes?: number; board?: PositionTile[]; hands: [number[],number[]]; decks?: [number[],number[]]; discard?: [number[],number[]]};
export const LEGACY_RULES_VERSION = 'qb-classic-m3-v1';
export const TURN_DRAW_RULES_VERSION = 'qb-classic-turn-draw-v1';
export type RulesVersion = typeof LEGACY_RULES_VERSION | typeof TURN_DRAW_RULES_VERSION;
type RulesTag = {rulesVersion?: typeof TURN_DRAW_RULES_VERSION};
type ReplayBase = RulesTag & {seed: number; decks: [number[],number[]]; firstPlayer: Player; commands: Command[]};
export type Replay = ReplayBase & ({version: 1} | {version: 2; position: Position});

export function replayRulesVersion(tag: unknown): RulesVersion {
  if(tag===undefined) return LEGACY_RULES_VERSION;
  if(tag===TURN_DRAW_RULES_VERSION) return tag;
  throw new Error('Unsupported replay rules version');
}
function rulesTag(version: RulesVersion): RulesTag {
  if(version===LEGACY_RULES_VERSION) return {};
  if(version===TURN_DRAW_RULES_VERSION) return {rulesVersion:version};
  throw new Error('Unsupported game rules version');
}
export type EventType = 'MatchStarted' | 'MulliganCommitted' | 'CardPlayed' | 'CardSpawned'
  | 'CardEnhanced' | 'CardEnfeebled' | 'ThresholdReached' | 'PowerChanged' | 'DerivedPowerChanged' | 'CardDestroyed' | 'CardReplaced'
  | 'CardAddedToHand' | 'PawnsClaimed' | 'TurnPassed' | 'TurnEnded' | 'MatchEnded';
export type RuleEvent = {
  seq: number; type: EventType; player?: Player; cardId?: number; instanceId?: number;
  row?: number; col?: number; amount?: number; power?: number; reason?: string;
  stage?: 'setup' | 'replacement' | 'placement' | 'ability' | 'stabilization' | 'influence' | 'draw' | 'turn' | 'scoring';
};
export type Game = RulesTag & {
  board: Tile[][]; hands: [number[],number[]]; decks: [number[],number[]]; discard: [number[],number[]];
  mulliganDone: [boolean,boolean]; phase: Phase; turn: Player; passes: number;
  history: string[]; events: RuleEvent[]; nextInstanceId: number; replay: Replay;
};
export type Outcome = {rows: [number,number][]; bonuses: [number,number][]; scores: [number,number]; winner: Player | null};
type Located = {row: number; col: number; card: PlacedCard};
type Triggered = Exclude<Ability, {timing:'aura' | 'dynamic'}>;
type Task = {source: Located; ability: Triggered; replacedPower: number};
export const ROWS = 3, COLS = 5;
export const opponent = (p: Player): Player => p === 0 ? 1 : 0;
function assertPlayer(p: Player): void {if(p !== 0 && p !== 1) throw new Error('Invalid player');}
function definition(id: number): Card {const c = byId.get(id); if(!c) throw new Error(`Card #${id} not implemented`); return c;}
function inside(row: number,col: number): boolean {return row >= 0 && row < ROWS && col >= 0 && col < COLS;}
function targetCell(row: number,col: number,p: Player,[dx,dy]: Offset): [number,number] {return [row-dy,col+(p === 0 ? dx : -dx)];}
function matches(side: Side,source: Player,other: Player): boolean {return side === 'both' || (side === 'ally' ? other === source : other !== source);}
export function cardStatus(card: PlacedCard): 'enhanced' | 'enfeebled' | 'neutral' {
  const delta=(card.statusPower ?? card.power)-definition(card.id).power;
  return delta>0?'enhanced':delta<0?'enfeebled':'neutral';
}
function cardsOnBoard(game: Game): Located[] {
  return game.board.flatMap((row,r)=>row.flatMap((tile,c)=>tile.card ? [{row:r,col:c,card:tile.card}] : []));
}
function snapshot(source: Located): Located {return {...source,card:{...source.card}};}
function record(game: Game,event: Omit<RuleEvent,'seq'>): void {
  const type=event.type;
  const stage:RuleEvent['stage']=type==='MatchStarted'||type==='MulliganCommitted'?'setup':type==='CardReplaced'||type==='CardDestroyed'&&event.reason==='replaced'?'replacement'
    :type==='CardPlayed'?'placement':type==='PawnsClaimed'?'influence':type==='CardAddedToHand'&&event.reason==='draw'?'draw'
    :type==='MatchEnded'?'scoring':type==='TurnEnded'||type==='TurnPassed'?'turn'
    :['CardEnhanced','CardEnfeebled','ThresholdReached','DerivedPowerChanged'].includes(type)||type==='CardDestroyed'&&event.reason==='power'?'stabilization':'ability';
  game.events.push({seq:game.events.length+1,stage,...event});
}
function cardEvent(game: Game,type: EventType,s: Located,extra: Partial<RuleEvent> = {}): void {
  record(game,{type,player:s.card.owner,cardId:s.card.id,instanceId:s.card.instanceId,row:s.row,col:s.col,...extra});
}
export function seededRng(seed: number): ()=>number {
  let s = seed >>> 0;
  return ()=>{s=(s+0x6D2B79F5)>>>0;let t=s;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};
}
function shuffle(cards: readonly number[],rng: ()=>number): number[] {
  const result=[...cards];
  for(let i=result.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[result[i],result[j]]=[result[j],result[i]];}
  return result;
}
export function createGame(decks: [readonly number[],readonly number[]],seed = 1234,firstPlayer: Player = 0,rules: RulesVersion = TURN_DRAW_RULES_VERSION): Game {
  assertPlayer(firstPlayer);
  if(!Number.isFinite(seed)) throw new Error('Invalid seed');
  for(const deck of decks){
    if(deck.length !== 15) throw new Error('Each player needs a 15-card deck');
    const counts = new Map<number,number>();
    for(const id of deck){
      const card=definition(id),count=(counts.get(id)||0)+1;
      if(card.rarity === 'token') throw new Error('Generated cards cannot be included in a deck');
      if(count > (card.rarity === 'legendary' ? 1 : 2)) throw new Error(`Too many copies of card #${id}`);
      counts.set(id,count);
    }
  }
  const rng=seededRng(seed), d: [number[],number[]]=[shuffle(decks[0],rng),shuffle(decks[1],rng)];
  const hands: [number[],number[]]=[d[0].splice(0,5),d[1].splice(0,5)];
  const board: Tile[][]=Array.from({length:ROWS},()=>Array.from({length:COLS},(_,c)=>({owner:c===0?0:c===4?1:null,pawns:c===0||c===4?1:0,card:null})));
  const tag=rulesTag(rules);
  const game: Game={...tag,board,hands,decks:d,discard:[[],[]],mulliganDone:[false,false],phase:'mulligan',turn:firstPlayer,passes:0,
    history:[],events:[],nextInstanceId:1,replay:{...tag,version:1,seed,decks:[[...decks[0]],[...decks[1]]],firstPlayer,commands:[]}};
  record(game,{type:'MatchStarted',player:firstPlayer});
  return game;
}
export function mulligan(game: Game,player: Player,indices: number[]): void {
  assertPlayer(player);
  if(game.phase !== 'mulligan' || game.mulliganDone[player]) throw new Error('Mulligan unavailable');
  const unique=new Set(indices);
  if(unique.size !== indices.length || indices.some(i=>!Number.isInteger(i)||i<0||i>=game.hands[player].length)) throw new Error('Bad card indices');
  // Draw before returning the selected physical cards. Another copy can still be drawn.
  const selected=indices.map(i=>game.hands[player][i]);
  const replacements=game.decks[player].splice(0,indices.length);
  indices.forEach((index,i)=>{game.hands[player][index]=replacements[i];});
  // A separate deterministic stream makes the result independent of who confirms first.
  if(indices.length) game.decks[player]=shuffle([...game.decks[player],...selected],seededRng(game.replay.seed ^ (0xA531+player)));
  game.mulliganDone[player]=true;
  record(game,{type:'MulliganCommitted',player,amount:indices.length});
  game.replay.commands.push({type:'mulligan',player,indices:[...indices]});
  if(game.mulliganDone.every(Boolean)) game.phase='playing';
}
export function legalMoves(game: Game,player: Player): Move[] {
  assertPlayer(player);
  if(game.phase !== 'playing' || game.turn !== player) return [];
  const result: Move[]=[];
  game.hands[player].forEach((id,h)=>{
    const card=definition(id);
    if(card.cost === 0 && card.placement !== 'replace') return; // Auto-spawned tokens.
    game.board.forEach((row,r)=>row.forEach((tile,c)=>{
      const legal=card.placement === 'replace' ? tile.card?.owner === player
        : !tile.card && tile.owner === player && tile.pawns >= card.cost;
      if(legal) result.push({handIndex:h,row:r,col:c});
    }));
  });
  return result;
}

// A single resolution owns the queue. Dead sources retain their on-destroy snapshot;
// other queued abilities require the same living instance, not merely the same tile.
class Resolution {
  private queue: Task[]=[];
  private steps=0;
  constructor(private game: Game) {}
  private living(source: Located): boolean {return this.game.board[source.row]?.[source.col]?.card?.instanceId === source.card.instanceId;}
  private targets(source: Located,selector: Selector): Located[] {
    let candidates: Located[];
    if(selector.scope === 'self') candidates=this.living(source) ? [{...source,card:this.game.board[source.row][source.col].card!}] : [];
    else if(selector.scope === 'board') candidates=cardsOnBoard(this.game);
    else candidates=(selector.cells||[]).flatMap(offset=>{
      const [r,c]=targetCell(source.row,source.col,source.card.owner,offset);
      const card=inside(r,c) ? this.game.board[r][c].card : null;
      return card ? [{row:r,col:c,card}] : [];
    });
    const seen=new Set<number>();
    return candidates.filter(s=>{
      if(!matches(selector.side,source.card.owner,s.card.owner) || seen.has(s.card.instanceId)
        || selector.excludeSelf && s.card.instanceId===source.card.instanceId
        || selector.status && cardStatus(s.card)!==selector.status) return false;
      seen.add(s.card.instanceId);return true;
    });
  }
  trigger(source: Located,timing: Trigger,replacedPower = 0): void {
    for(const ability of definition(source.card.id).abilities){
      if(ability.timing === timing) this.queue.push({source:snapshot(source),ability:ability as Triggered,replacedPower});
    }
  }
  notify(timing: 'onCardPlayed' | 'onCardDestroyed' | 'onCardAddedToHand',owner: Player,subjectId?: number): void {
    for(const source of cardsOnBoard(this.game)){
      if(source.card.instanceId === subjectId) continue;
      for(const ability of definition(source.card.id).abilities){
        if(ability.timing === timing && matches(ability.watch||'both',source.card.owner,owner))
          this.queue.push({source:snapshot(source),ability,replacedPower:0});
      }
    }
  }
  private place(id: number,owner: Player,row: number,col: number): Located {
    const card: PlacedCard={id,owner,instanceId:this.game.nextInstanceId++,permanentDelta:0,power:definition(id).power,enhancedOnce:false,enfeebledOnce:false};
    this.game.board[row][col]={owner,pawns:0,card};
    return {row,col,card};
  }
  private destroy(sources: Located[],reason: string): void {
    // Remove a complete lethal wave before any observer is selected or aura rebuilt.
    const removed=sources.filter(s=>this.living(s)).map(snapshot);
    for(const s of removed){
      this.game.board[s.row][s.col]={owner:null,pawns:0,card:null};
      this.game.discard[s.card.owner].push(s.card.id);
    }
    for(const s of removed){
      cardEvent(this.game,'CardDestroyed',s,{reason,power:Math.max(0,s.card.power)});
      this.game.history.push(`${definition(s.card.id).name} destroyed (${s.row+1},${s.col+1})`);
      this.trigger(s,'onDestroy');
      this.notify('onCardDestroyed',s.card.owner,s.card.instanceId);
    }
  }
  private recompute(): void {
    const sources=cardsOnBoard(this.game);
    const previous=sources.map(s=>s.card.power);
    const base=sources.map(s=>definition(s.card.id).power+s.card.permanentDelta);
    for(const [i,s] of sources.entries()){s.card.power=base[i];s.card.statusPower=base[i];s.card.dynamicDelta=0;}
    // Unconditional spatial modifiers form the baseline. Conditional auras are
    // solved synchronously; never let row traversal order choose an outcome.
    for(const s of sources) for(const ability of definition(s.card.id).abilities){
      if(ability.timing === 'aura' && !ability.condition) for(const target of this.targets(s,ability.target)) target.card.power+=ability.amount;
    }
    const fixed=sources.map(s=>s.card.power),seen=new Set<string>();
    // Each next vector is a fixed baseline plus a subset of the finite aura
    // contributions. Equality or a repeated vector therefore terminates this
    // solver without an arbitrary iteration cap. This is a candidate solver,
    // not evidence of Rebirth's event order for conditional feedback.
    for(;;){
      const current=sources.map(s=>s.card.power),signature=current.join(',');
      if(seen.has(signature)) throw new Error('UNSTABLE_AURA: candidate solver repeated a conditional aura state; Rebirth ordering is unverified');
      seen.add(signature);
      for(const s of sources) s.card.statusPower=s.card.power;
      const next=[...fixed];
      for(const s of sources) for(const ability of definition(s.card.id).abilities){
        if(ability.timing==='aura' && ability.condition && cardStatus(s.card)===ability.condition.status)
          for(const target of this.targets(s,ability.target)) next[sources.findIndex(t=>t.card.instanceId===target.card.instanceId)]+=ability.amount;
      }
      sources.forEach((s,i)=>{s.card.power=next[i];s.card.statusPower=next[i];});
      if(next.every((n,i)=>n===current[i])) break;
    }
    // Intrinsic count bonuses are separate from enhancement/enfeeblement.
    // They cannot count their own derived bonus or create feedback between scalers.
    const bonuses=sources.map(s=>definition(s.card.id).abilities.reduce((sum,a)=>
      sum+(a.timing==='dynamic'?a.amount*this.targets(s,a.count).length:0),0));
    sources.forEach((s,i)=>{
      s.card.dynamicDelta=bonuses[i];s.card.power+=bonuses[i];
      if(!Number.isSafeInteger(s.card.power))throw new Error('Power exceeds supported integer range');
    });
    if(sources.some(s=>definition(s.card.id).abilities.some(a=>a.timing==='dynamic'||a.timing==='aura'&&a.condition)))
      sources.forEach((s,i)=>{if(s.card.power!==previous[i])cardEvent(this.game,'DerivedPowerChanged',s,{amount:s.card.power-previous[i],power:s.card.power,reason:'continuous'});});
  }
  private settle(): void {
    for(let wave=0;wave<=ROWS*COLS;wave++){
      this.recompute();
      const sources=cardsOnBoard(this.game);
      for(const s of sources){
        const base=definition(s.card.id).power;
        if((s.card.statusPower ?? s.card.power)>base && !s.card.enhancedOnce){
          s.card.enhancedOnce=true;cardEvent(this.game,'CardEnhanced',s,{power:s.card.power});this.trigger(s,'firstEnhanced');
        }
        if((s.card.statusPower ?? s.card.power)<base && !s.card.enfeebledOnce){
          s.card.enfeebledOnce=true;cardEvent(this.game,'CardEnfeebled',s,{power:Math.max(0,s.card.power)});this.trigger(s,'firstEnfeebled');
        }
        for(const [index,ability] of definition(s.card.id).abilities.entries()){
          if(ability.timing==='threshold' && s.card.power>=ability.power && !s.card.thresholds?.includes(index)){
            (s.card.thresholds??=[]).push(index);
            cardEvent(this.game,'ThresholdReached',s,{power:s.card.power,amount:ability.power});
            this.queue.push({source:snapshot(s),ability,replacedPower:0});
          }
        }
      }
      const lethal=sources.filter(s=>s.card.power<=0);
      if(!lethal.length) return;
      this.destroy(lethal,'power');
    }
    throw new Error('Continuous effect stabilization failed');
  }
  private addToHand(owner: Player,id: number,reason: string): void {
    definition(id);this.game.hands[owner].push(id);
    record(this.game,{type:'CardAddedToHand',player:owner,cardId:id,reason});
    this.notify('onCardAddedToHand',owner);
  }
  private action(task: Task,action: Action): void {
    const {source}=task;
    if(action.kind === 'power'){
      const amount=typeof action.amount==='number'?action.amount:action.amount==='replacedPower'?task.replacedPower
        :(action.amount.value==='replacedPower'?task.replacedPower:source.card.power)*(action.amount.factor??1);
      for(const target of this.targets(source,action.target)){
        const delta=target.card.permanentDelta+amount;
        if(!Number.isSafeInteger(delta))throw new Error('Power exceeds supported integer range');
        target.card.permanentDelta=delta;
        cardEvent(this.game,'PowerChanged',target,{amount,reason:task.ability.timing});
      }
    } else if(action.kind === 'destroy') this.destroy(this.targets(source,action.target),'ability');
    else if(action.kind === 'addToHand') for(const id of action.cards) this.addToHand(source.card.owner,id,'generated');
    else {
      // Snapshot all empty allied positions before spawning. Spawned cards do not
      // count as cards played from hand, and do not spread pawns or run on-play.
      const positions=this.game.board.flatMap((row,r)=>row.flatMap((tile,c)=>
        !tile.card && tile.owner === source.card.owner && tile.pawns>0 ? [{r,c,rank:tile.pawns}] : []));
      for(const {r,c,rank} of positions){
        const spawned=this.place(action.cardsByRank[rank-1],source.card.owner,r,c);
        cardEvent(this.game,'CardSpawned',spawned);
      }
    }
  }
  private drain(): void {
    this.settle();
    while(this.queue.length){
      if(++this.steps>1024) throw new Error('Ability resolution exceeded safety limit');
      const task=this.queue.shift()!;
      if(!['onDestroy','onReplace','onPlay'].includes(task.ability.timing) && !this.living(task.source)) continue;
      for(const action of task.ability.actions){this.action(task,action);this.settle();}
    }
  }
  stabilize(): void {this.drain();}
  draw(player: Player): void {
    const drawn=this.game.decks[player].shift();
    if(drawn !== undefined) this.addToHand(player,drawn,'draw');
    this.drain();
  }
  play(id: number,owner: Player,row: number,col: number): void {
    const replaced=this.game.board[row][col].card;
    const old=replaced ? snapshot({row,col,card:replaced}) : null;
    const replacedPower=old ? Math.max(0,old.card.power) : 0;
    if(old){
      // The replaced card is destroyed, but its old modifiers never transfer.
      this.game.board[row][col]={owner:null,pawns:0,card:null};
      this.game.discard[owner].push(old.card.id);
      cardEvent(this.game,'CardReplaced',old,{power:replacedPower});
    }
    const placed=this.place(id,owner,row,col);
    cardEvent(this.game,'CardPlayed',placed);
    this.trigger(placed,'onPlay',replacedPower);
    if(old){
      cardEvent(this.game,'CardDestroyed',old,{reason:'replaced',power:replacedPower});
      this.trigger(old,'onReplace',replacedPower);this.trigger(old,'onDestroy');
      this.notify('onCardDestroyed',owner,old.card.instanceId);
    }
    this.notify('onCardPlayed',owner,placed.card.instanceId);
    this.drain();
    // Entry damage/destruction opens positions BEFORE the played card spreads pawns.
    const def=definition(id);
    for(const [r,c] of previewInfluence(def,row,col,owner)){
      const tile=this.game.board[r][c];if(tile.card) continue;
      const amount=def.pawnBoost||1;
      if(tile.owner === owner) tile.pawns=Math.min(3,tile.pawns+amount);
      else if(tile.owner === null){tile.owner=owner;tile.pawns=Math.min(3,amount);}
      else tile.owner=owner; // Capture preserves rank; it is not an extra upgrade.
      record(this.game,{type:'PawnsClaimed',player:owner,row:r,col:c,amount:tile.pawns});
    }
    if(this.game.rulesVersion===undefined) this.draw(owner);
    this.game.history.push(`P${owner+1}: ${def.name} → row ${row+1}, col ${col+1}`);
  }
}

// A playable turn is ready for legalMoves and Worker observation on return.
// The opening turn comes from mulligan and has no turn handoff.
function advanceTurn(game: Game): void {
  game.turn=opponent(game.turn);
  if(game.rulesVersion===TURN_DRAW_RULES_VERSION && game.decks[game.turn].length) {
    new Resolution(game).draw(game.turn);
  }
}
export function play(game: Game,player: Player,handIndex: number,row: number,col: number): void {
  assertPlayer(player);
  if(game.phase !== 'playing' || player !== game.turn) throw new Error('Not your turn');
  if(!legalMoves(game,player).some(m=>m.handIndex===handIndex && m.row===row && m.col===col)) throw new Error('Illegal move');
  // A failed resolution never leaves a half-mutated match behind.
  const next=structuredClone(game),id=next.hands[player].splice(handIndex,1)[0];
  new Resolution(next).play(id,player,row,col);
  next.passes=0;
  record(next,{type:'TurnEnded',player});
  advanceTurn(next);
  next.replay.commands.push({type:'play',player,handIndex,row,col});
  Object.assign(game,next);
}
export function pass(game: Game,player: Player): void {
  assertPlayer(player);
  if(game.phase !== 'playing' || game.turn !== player) throw new Error('Not your turn');
  const next=structuredClone(game);
  next.passes++;next.history.push(`P${player+1}: pass`);record(next,{type:'TurnPassed',player});
  next.replay.commands.push({type:'pass',player});
  if(next.passes === 2){next.phase='finished';record(next,{type:'MatchEnded'});}
  else advanceTurn(next);
  Object.assign(game,next);
}
export function scoreBreakdown(game: Game): Outcome & {awards:[number,number][]} {
  const rows: [number,number][]=game.board.map(row=>{
    const totals: [number,number]=[0,0];for(const t of row) if(t.card) totals[t.card.owner]+=t.card.power;return totals;
  });
  const bonuses: [number,number][]=game.board.map(row=>{
    const total: [number,number]=[0,0];for(const t of row) if(t.card) total[t.card.owner]+=definition(t.card.id).laneBonus||0;return total;
  });
  const scores: [number,number]=[0,0];
  const takeBoth=cardsOnBoard(game).some(s=>definition(s.card.id).scorePolicy==='winnerTakesBoth');
  const awards:[number,number][]=rows.map(([a,b],r)=>a>b?[a+bonuses[r][0]+(takeBoth?b:0),0]:b>a?[0,b+bonuses[r][1]+(takeBoth?a:0)]:[0,0]);
  awards.forEach(([a,b])=>{scores[0]+=a;scores[1]+=b;});
  return {rows,bonuses,scores,awards,winner:scores[0]===scores[1]?null:scores[0]>scores[1]?0:1};
}
export function outcome(game:Game):Outcome {const {awards,...result}=scoreBreakdown(game);return result;}
export function previewInfluence(card: Card,row: number,col: number,player: Player): [number,number][] {
  return card.influence.map(p=>targetCell(row,col,player,p)).filter(([r,c])=>inside(r,c));
}
export function previewEffects(card: Card,row: number,col: number,player: Player): [number,number][] {
  const cells=card.abilities.flatMap(a=>a.timing==='aura' ? a.target.cells||[] : a.timing==='dynamic'?[]:a.actions.flatMap(action=>'target' in action ? action.target.cells||[] : []));
  return [...new Map(cells.map(p=>targetCell(row,col,player,p)).filter(([r,c])=>inside(r,c)).map(p=>[p.join(','),p])).values()];
}
export function chooseBotMove(game: Game): Move | null {
  const player=game.turn,moves=legalMoves(game,player);if(!moves.length) return null;
  let best=moves[0],value=-Infinity;
  for(const move of moves){
    const trial=structuredClone(game);
    try{play(trial,player,move.handIndex,move.row,move.col);}catch(error){if(String(error).includes('UNSTABLE_AURA'))continue;throw error;}
    const result=outcome(trial),enemy=opponent(player);
    const territory=trial.board.flat().reduce((n,t)=>n+(!t.card && t.owner===player ? 1 : !t.card && t.owner===enemy ? -1 : 0),0);
    const powers=result.rows.reduce((n,row)=>n+row[player]-row[enemy],0);
    const score=(result.scores[player]-result.scores[enemy])*2+powers+territory*3+trial.hands[player].length*.2;
    if(score>value){best=move;value=score;}
  }
  return value===-Infinity?null:best;
}
export function exportReplay(game: Game): Replay {return structuredClone(game.replay);}
export function replayMatch(replay: Replay): Game {
  if(replay.version !== 1 && replay.version !== 2) throw new Error('Unsupported replay version');
  const rules=replayRulesVersion(replay.rulesVersion);
  const game=replay.version===2?createPosition(replay.position,rules):createGame(replay.decks,replay.seed,replay.firstPlayer,rules);
  for(const command of replay.commands){
    if(command.type==='mulligan') mulligan(game,command.player,command.indices);
    else if(command.type==='play') play(game,command.player,command.handIndex,command.row,command.col);
    else if(command.type==='pass') pass(game,command.player);
    else throw new Error('Unknown replay command');
  }
  return game;
}

// Sparse, explicit fixtures are a supported core API, shared by tests and CLI.
// Import is atomic: validation and initial stabilization happen on a new game.
export function createPosition(input: Position,rules: RulesVersion = TURN_DRAW_RULES_VERSION): Game {
  if(!input || typeof input!=='object') throw new Error('Invalid position object');
  const pair=(value: unknown,label: string): [number[],number[]]=>{
    if(!Array.isArray(value)||value.length!==2||value.some(list=>!Array.isArray(list)||list.some(id=>!Number.isInteger(id)||!byId.has(id))))
      throw new Error(`Invalid ${label}: expected two arrays of implemented card IDs`);
    return structuredClone(value) as [number[],number[]];
  };
  const hands=pair(input.hands,'hands'),decks=pair(input.decks??[[],[]],'decks'),discard=pair(input.discard??[[],[]],'discard');
  const turn=input.turn??0,phase=input.phase??'playing',seed=input.seed??1,passes=input.passes??(phase==='finished'?2:0);
  assertPlayer(turn);
  if(!Number.isSafeInteger(seed)||seed<0||seed>0xFFFFFFFF) throw new Error('Invalid position seed');
  if(!['mulligan','playing','finished'].includes(phase)||!Number.isInteger(passes)||passes<0||passes>2||(phase==='finished')!==(passes===2)) throw new Error('Invalid phase/pass count');
  const game=createGame([[1,1,2,2,4,4,5,5,7,7,8,8,9,9,11],[1,1,2,2,4,4,5,5,7,7,8,8,9,9,11]],seed,turn,rules);
  game.hands=hands;game.decks=decks;game.discard=discard;game.phase=phase;game.turn=turn;game.passes=passes;
  game.mulliganDone=phase==='mulligan'?[false,false]:[true,true];
  if(input.board!==undefined){
    if(!Array.isArray(input.board)) throw new Error('Invalid board');
    game.board=Array.from({length:ROWS},()=>Array.from({length:COLS},()=>({owner:null,pawns:0,card:null})));
    const occupied=new Set<string>();
    for(const tile of input.board){
      if(!tile||!Number.isInteger(tile.row)||!Number.isInteger(tile.col)||!inside(tile.row,tile.col)) throw new Error('Invalid board coordinates (zero-based 3x5)');
      const key=`${tile.row},${tile.col}`;
      if(occupied.has(key)) throw new Error(`Duplicate position ${key}`);occupied.add(key);
      if(tile.owner!==null) assertPlayer(tile.owner);
      const pawns=tile.pawns??0;
      if(!Number.isInteger(pawns)||pawns<0||pawns>3) throw new Error('Invalid pawn rank');
      if(tile.cardId!==undefined){
        definition(tile.cardId);
        if(tile.owner===null||pawns!==0||!Number.isSafeInteger(tile.permanentDelta??0)) throw new Error('Invalid card position');
        for(const flag of [tile.enhancedOnce,tile.enfeebledOnce]) if(flag!==undefined&&typeof flag!=='boolean') throw new Error('Invalid once flag');
        if(tile.thresholds!==undefined&&(!Array.isArray(tile.thresholds)||tile.thresholds.some(i=>!Number.isInteger(i)||definition(tile.cardId!).abilities[i]?.timing!=='threshold'))) throw new Error('Invalid threshold flags');
        game.board[tile.row][tile.col]={owner:tile.owner,pawns:0,card:{id:tile.cardId,owner:tile.owner,instanceId:game.nextInstanceId++,
          permanentDelta:tile.permanentDelta??0,power:definition(tile.cardId).power,enhancedOnce:tile.enhancedOnce??false,enfeebledOnce:tile.enfeebledOnce??false,
          ...(tile.thresholds?{thresholds:[...tile.thresholds]}:{})}};
      } else {
        if((tile.owner===null)!==(pawns===0)) throw new Error('Empty position ownership must match pawn rank');
        game.board[tile.row][tile.col]={owner:tile.owner,pawns,card:null};
      }
    }
  }
  if(phase==='mulligan'&&(hands.some(h=>h.length!==5)||decks.some(d=>d.length<5))) throw new Error('Mulligan positions require five-card hands and at least five drawable cards');
  const position=structuredClone({...input,seed,turn,phase,passes,hands,decks,discard});
  game.replay={...rulesTag(rules),version:2,seed,decks:[[],[]],firstPlayer:turn,position,commands:[]};
  new Resolution(game).stabilize();
  return game;
}
