import {byId,type Selector} from './cards.js';
import {cardStatus,opponent,type Game,type Player} from './engine.js';

export type BotStrategy='neutral'|'nene'|'zogan'|'isabelle';
export function strategyForOpponent(npcId?:string):BotStrategy {
  return npcId==='nene'||npcId==='zogan'||npcId==='isabelle'?npcId:'neutral';
}
/** Classic-authored preferences, not a reconstruction of Rebirth's NPC AI.
 * Only the resolved public board and the Bot's own hand enter these features. */
function features(game:Game,player:Player,knownHand:readonly number[]=[]){
  let frontier=0,ranks=0,support=0,chains=0,spawned=0;
  const hand=knownHand.map(id=>byId.get(id)!);
  const targets=(target:Selector,row:number,col:number)=>target.scope==='self'?[[row,col]]:
    target.scope==='board'?game.board.flatMap((line,r)=>line.map((_,c)=>[r,c])):
    (target.cells??[]).map(([dx,dy])=>[row-dy,col+(player===0?dx:-dx)]);
  for(let row=0;row<3;row++)for(let col=0;col<5;col++){
    const tile=game.board[row][col];if(tile.owner!==player)continue;
    // Occupying our frontier does not destroy it; reward usable openings only modestly.
    frontier+=1+(player===0?col:4-col)*.25;
    if(!tile.card){
      if(hand.some(d=>d.placement!=='replace'&&d.cost<=tile.pawns))frontier+=.1;
      ranks+=Math.max(0,tile.pawns-1);continue;
    }
    const card=tile.card,definition=byId.get(card.id)!;
    if(definition.rarity==='token'&&definition.cost===0)spawned+=Math.max(0,card.power);
    chains+=Math.max(0,card.permanentDelta)*.35;
    for(const ability of definition.abilities){
      if(ability.timing!=='aura'||ability.amount<=0||ability.target.side==='enemy'||
        ability.condition&&cardStatus(card)!==ability.condition.status)continue;
      for(const [r,c] of targets(ability.target,row,col)){
        const target=game.board[r]?.[c];
        if(!target||target.owner!==player||ability.target.excludeSelf&&r===row&&c===col)continue;
        if(target.card){if(!ability.target.status||cardStatus(target.card)===ability.target.status)support+=ability.amount;}
        else if(!ability.target.status&&hand.some(d=>d.placement!=='replace'&&d.cost<=target.pawns))support+=ability.amount*.35;
      }
    }
  }
  // Forecast only a spawn ability actually held, using its rank-to-token data.
  // No named card or hidden future draw is assumed; the engine still resolves it.
  let spawnPotential=0;
  for(const card of hand)for(const ability of card.abilities){
    if(!('actions' in ability)||ability.timing!=='onPlay')continue;
    for(const action of ability.actions)if(action.kind==='spawn'){
      const spaces=game.board.flat().filter(t=>t.owner===player&&!t.card);
      if(!spaces.some(t=>t.pawns>=card.cost))continue;
      // The summoner consumes one legal tile before its ability runs.
      const values=spaces.map(t=>({rank:t.pawns,power:byId.get(action.cardsByRank[t.pawns-1])!.power}));
      const consumed=Math.min(...values.filter(t=>t.rank>=card.cost).map(t=>t.power));
      spawnPotential=Math.max(spawnPotential,values.reduce((sum,t)=>sum+t.power,0)-consumed);
    }
  }
  return {frontier,ranks,support,chains,spawned,spawnPotential};
}
export function strategyScore(game:Game,player:Player,strategy:BotStrategy,knownHand:readonly number[]=game.hands[player]):number {
  if(strategy==='neutral'||game.phase==='finished')return 0;
  const own=features(game,player,knownHand),enemy=features(game,opponent(player));
  if(strategy==='nene')return (own.frontier-enemy.frontier)*1.6;
  if(strategy==='zogan')return (own.support-enemy.support)*.9+(own.chains-enemy.chains)*.7;
  // Future spawn opportunity uses only our own held cards, never enemy hypotheses.
  return (own.ranks-enemy.ranks)*.8+(own.spawned-enemy.spawned)*.4+own.spawnPotential*.25;
}
