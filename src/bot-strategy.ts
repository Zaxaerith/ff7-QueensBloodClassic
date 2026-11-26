import {byId,type Selector} from './cards.js';
import {findBossChallenger} from './boss-challengers.js';
import {cardStatus,opponent,type Game,type Player} from './engine.js';

export const BOT_STRATEGIES=[
  'neutral',
  'nene',
  'zogan',
  'isabelle',
  'ned',
  'zahira',
  'devin-moore',
  'darren-moore',
  'michaela',
  'neil',
  'cameron',
  'felix',
  'regina',
  'maurya',
  'biff',
  'lidrehl',
  'zhijun',
  'regina-rematch',
  'bernard',
  'turner',
  'vincent-gatekeeper',
  'queen',
] as const;
export type BotStrategy=typeof BOT_STRATEGIES[number];

const STRATEGY_SET:ReadonlySet<string>=new Set(BOT_STRATEGIES);
export function isBotStrategy(value:unknown):value is BotStrategy {
  return typeof value==='string'&&STRATEGY_SET.has(value);
}
export function strategyForOpponent(npcId?:string):BotStrategy {
  const boss=findBossChallenger(npcId);
  if(boss)return boss.strategy;
  return isBotStrategy(npcId)?npcId:'neutral';
}

interface BoardFeatures {
  frontier:number;
  ranks:number;
  support:number;
  verticalSupport:number;
  chains:number;
  spawned:number;
  spawnPotential:number;
  enhancedCount:number;
  enhancedScalerWeight:number;
  enfeebled:number;
  enfeebledSeverity:number;
  enfeebledScalerBoard:number;
  enfeebledScalerWeight:number;
  fragile:number;
  debuffAura:number;
  destroyWatcherActive:number;
  destroyWatcherGrowth:number;
  watchAlly:number;
  watchEnemy:number;
  destroyed:number;
  deathrattlePosition:number;
  laneSpread:number;
  rowPower:[number,number,number];
  frontlinePower:number;
  rank3Prep:number;
  cost3Cards:number;
  knownHandCount:number;
  generatedHandCount:number;
}

/** Classic-authored preferences, not a reconstruction of Rebirth's NPC AI.
 * Only the resolved public board, public discard counts and the Bot's own known hand enter these features. */
function features(game:Game,player:Player,knownHand:readonly number[]=[]):BoardFeatures {
  let frontier=0,ranks=0,support=0,verticalSupport=0,chains=0,spawned=0;
  let enhancedCount=0,enhancedScalerWeight=0,enfeebled=0,enfeebledSeverity=0,enfeebledScalerBoard=0,enfeebledScalerWeight=0,fragile=0,debuffAura=0;
  let destroyWatcherActive=0,destroyWatcherGrowth=0,watchAlly=0,watchEnemy=0;
  let frontlinePower=0,rank2Tiles=0,rank3Tiles=0,cost3Cards=0;
  const rowTiles:[number,number,number]=[0,0,0];
  const rowCards:[number,number,number]=[0,0,0];
  const rowPower:[number,number,number]=[0,0,0];
  const hand=knownHand.map(id=>byId.get(id)!);
  const hasCost3InHand=hand.some(d=>d.placement!=='replace'&&d.cost>=3);
  const generatedHandCount=hand.filter(d=>d.rarity==='token'&&d.cost>0).length;
  for(const def of hand)for(const ability of def.abilities){
    if(ability.timing!=='dynamic')continue;
    if(ability.count.status==='enhanced'&&ability.count.side!=='enemy')enhancedScalerWeight+=ability.amount*.6;
    if(ability.count.status==='enfeebled')enfeebledScalerWeight+=ability.amount*.5;
  }
  const targets=(target:Selector,row:number,col:number):[number,number][]=>target.scope==='self'?[[row,col]]:
    target.scope==='board'?game.board.flatMap((line,r)=>line.map((_,c):[number,number]=>[r,c])):
    (target.cells??[]).map(([dx,dy]):[number,number]=>[row-dy,col+(player===0?dx:-dx)]);

  for(let row=0;row<3;row++)for(let col=0;col<5;col++){
    const tile=game.board[row][col];if(tile.owner!==player)continue;
    const advance=player===0?col:4-col;
    rowTiles[row]++;
    // Occupying our frontier does not destroy it; reward usable openings only modestly.
    frontier+=1+advance*.25;
    if(!tile.card){
      if(hand.some(d=>d.placement!=='replace'&&d.cost<=tile.pawns))frontier+=.1;
      ranks+=Math.max(0,tile.pawns-1);
      if(tile.pawns===2)rank2Tiles++;
      else if(tile.pawns>=3)rank3Tiles++;
      continue;
    }
    const card=tile.card,definition=byId.get(card.id)!;
    const status=cardStatus(card);
    rowCards[row]++;
    rowPower[row]+=card.power;
    frontlinePower+=card.power*advance*.25;
    if(definition.cost>=3)cost3Cards++;
    if(definition.rarity==='token'&&definition.cost===0)spawned+=Math.max(0,card.power);
    chains+=Math.max(0,card.permanentDelta)*.35;
    if(status==='enhanced')enhancedCount++;
    else if(status==='enfeebled'){
      enfeebled++;
      enfeebledSeverity+=Math.max(0,definition.power-card.power);
    }
    if(card.power<=1)fragile+=1.5;
    else if(card.power===2)fragile+=.75;

    for(const ability of definition.abilities){
      if(ability.timing==='dynamic'){
        if(ability.count.status==='enhanced'&&ability.count.side!=='enemy')enhancedScalerWeight+=ability.amount;
        if(ability.count.status==='enfeebled'){
          enfeebledScalerBoard+=ability.amount;
          enfeebledScalerWeight+=ability.amount;
        }
        continue;
      }
      if(ability.timing==='onCardDestroyed'){
        let gain=0;
        for(const action of ability.actions){
          if(action.kind==='power'&&action.target.scope==='self'&&typeof action.amount==='number'&&action.amount>0)gain+=action.amount;
        }
        if(gain>0){
          destroyWatcherActive+=gain;
          destroyWatcherGrowth+=Math.max(0,card.permanentDelta)*.5;
          const watch=ability.watch??'both';
          if(watch==='ally'||watch==='both')watchAlly+=gain;
          if(watch==='enemy'||watch==='both')watchEnemy+=gain;
        }
        continue;
      }
      if(ability.timing!=='aura')continue;
      if(ability.condition&&status!==ability.condition.status)continue;
      if(ability.amount>0&&ability.target.side!=='enemy'){
        for(const [r,c] of targets(ability.target,row,col)){
          const target=game.board[r]?.[c];
          if(!target||target.owner!==player||ability.target.excludeSelf&&r===row&&c===col)continue;
          const isVertical=c===col&&r!==row;
          if(target.card){
            if(!ability.target.status||cardStatus(target.card)===ability.target.status){
              support+=ability.amount;
              if(isVertical)verticalSupport+=ability.amount;
            }
          } else if(!ability.target.status&&hand.some(d=>d.placement!=='replace'&&d.cost<=target.pawns)){
            support+=ability.amount*.35;
            if(isVertical)verticalSupport+=ability.amount*.35;
          }
        }
      } else if(ability.amount<0&&ability.target.side!=='ally'){
        const mag=-ability.amount;
        for(const [r,c] of targets(ability.target,row,col)){
          const target=game.board[r]?.[c];
          if(!target||ability.target.excludeSelf&&r===row&&c===col)continue;
          if(target.card){
            if(ability.target.status&&cardStatus(target.card)!==ability.target.status)continue;
            if(target.card.owner!==player)debuffAura+=mag;
            else if(ability.target.side==='both')debuffAura-=mag*1.1;
          } else if(!ability.target.status){
            if(target.owner!==null&&target.owner!==player)debuffAura+=mag*.45;
            else if(target.owner===null)debuffAura+=mag*.15;
            else if(ability.target.side==='both')debuffAura-=mag*.1;
          }
        }
      }
    }
  }

  // Evaluate deathrattle positioning after scanning board watchers so ally-sacrifice synergy is known.
  let deathrattlePosition=0;
  for(let row=0;row<3;row++)for(let col=0;col<5;col++){
    const card=game.board[row][col].card;
    if(!card||card.owner!==player)continue;
    const definition=byId.get(card.id)!;
    for(const ability of definition.abilities){
      if(ability.timing!=='onDestroy')continue;
      for(const action of ability.actions){
        if(action.kind==='addToHand'){deathrattlePosition+=action.cards.length*.6;continue;}
        if(action.kind!=='power'||typeof action.amount!=='number')continue;
        for(const [r,c] of targets(action.target,row,col)){
          const target=game.board[r]?.[c];
          if(!target||action.target.excludeSelf&&r===row&&c===col)continue;
          if(action.amount<0){
            const dmg=-action.amount;
            if(target.card){
              if(target.card.owner!==player&&action.target.side!=='ally'){
                deathrattlePosition+=Math.min(dmg,Math.max(1,target.card.power))*.45+(target.card.power<=dmg?.5:0);
              } else if(target.card.owner===player&&action.target.side!=='enemy'){
                const penalty=Math.min(dmg,Math.max(1,target.card.power))*.4+(target.card.power<=dmg?.4:0);
                deathrattlePosition-=watchAlly>0?penalty*.35:penalty;
              }
            } else if(target.owner!==null&&target.owner!==player&&action.target.side!=='ally'){
              deathrattlePosition+=dmg*.1;
            }
          } else if(action.amount>0&&target.card&&target.card.owner===player&&action.target.side!=='enemy'){
            deathrattlePosition+=action.amount*.3;
          }
        }
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

  const occupiedRows=(rowTiles[0]>0?1:0)+(rowTiles[1]>0?1:0)+(rowTiles[2]>0?1:0);
  const cardRows=(rowCards[0]>0?1:0)+(rowCards[1]>0?1:0)+(rowCards[2]>0?1:0);
  const wingPresence=(rowTiles[0]>0?1:0)+(rowTiles[2]>0?1:0)+Math.min(rowTiles[0],rowTiles[2])*.5;
  const maxRowCards=Math.max(rowCards[0],rowCards[1],rowCards[2]);
  const minRowCards=Math.min(rowCards[0],rowCards[1],rowCards[2]);
  const laneSpread=cardRows*1.1+occupiedRows*.5+wingPresence*.8-Math.max(0,maxRowCards-minRowCards-1)*.6;
  const rank3Prep=rank3Tiles*(hasCost3InHand?1.4:.45)+rank2Tiles*(hasCost3InHand?.4:.15);

  return {
    frontier,ranks,support,verticalSupport,chains,spawned,spawnPotential,
    enhancedCount,enhancedScalerWeight,enfeebled,enfeebledSeverity,enfeebledScalerBoard,enfeebledScalerWeight,fragile,debuffAura,
    destroyWatcherActive,destroyWatcherGrowth,watchAlly,watchEnemy,destroyed:game.discard[player].length,deathrattlePosition,
    laneSpread,rowPower,frontlinePower,rank3Prep,cost3Cards,knownHandCount:hand.length,generatedHandCount,
  };
}

export function strategyScore(game:Game,player:Player,strategy:BotStrategy,knownHand:readonly number[]=game.hands[player]):number {
  if(strategy==='neutral'||game.phase==='finished')return 0;
  const own=features(game,player,knownHand),enemy=features(game,opponent(player));
  if(strategy==='nene')return (own.frontier-enemy.frontier)*1.6;
  if(strategy==='zogan')return (own.support-enemy.support)*.9+(own.chains-enemy.chains)*.7;
  if(strategy==='isabelle'){
    // Future spawn opportunity uses only our own held cards, never enemy hypotheses.
    return (own.ranks-enemy.ranks)*.8+(own.spawned-enemy.spawned)*.4+own.spawnPotential*.25;
  }
  if(strategy==='ned'){
    return (own.support-enemy.support)*.75
      +(own.verticalSupport-enemy.verticalSupport)*.55
      +(own.enhancedCount-enemy.enhancedCount)*.65
      +(own.frontier-enemy.frontier)*.45;
  }
  if(strategy==='zahira'){
    return own.knownHandCount*.55
      +own.generatedHandCount*.65
      +(own.ranks-enemy.ranks)*.75
      +own.rank3Prep*.95
      +(own.cost3Cards-enemy.cost3Cards)*1.4
      +(own.frontier-enemy.frontier)*.5;
  }
  if(strategy==='devin-moore'){
    return (own.laneSpread-enemy.laneSpread)*1.15
      +(own.frontier-enemy.frontier)*.85
      +(own.ranks-enemy.ranks)*.4;
  }
  if(strategy==='darren-moore'){
    let strongestLead=0,enemyStrongestLead=0,maxRowPower=0,contestedWins=0;
    for(let r=0;r<3;r++){
      const diff=own.rowPower[r]-enemy.rowPower[r];
      if(diff>strongestLead)strongestLead=diff;
      if(-diff>enemyStrongestLead)enemyStrongestLead=-diff;
      if(own.rowPower[r]>maxRowPower)maxRowPower=own.rowPower[r];
      if(enemy.rowPower[r]>0&&diff>0)contestedWins++;
    }
    const laneDominance=strongestLead*.45+maxRowPower*.35+contestedWins*1.1-enemyStrongestLead*.25;
    return (enemy.enfeebled-own.enfeebled)*1.1
      +(enemy.enfeebledSeverity-own.enfeebledSeverity)*.35
      +(enemy.fragile-own.fragile)*.55
      +(enemy.destroyed-own.destroyed)*.8
      +laneDominance;
  }
  if(strategy==='michaela'){
    return (own.debuffAura-enemy.debuffAura)*1.35
      +(enemy.enfeebled-own.enfeebled)*1.25
      +(enemy.enfeebledSeverity-own.enfeebledSeverity)*.45
      +(enemy.fragile-own.fragile)*.5
      +(enemy.destroyed-own.destroyed)*.75
      +(own.deathrattlePosition-enemy.deathrattlePosition)*.65;
  }
  if(strategy==='neil'){
    return (own.enhancedCount-enemy.enhancedCount)*(1.15+own.enhancedScalerWeight*.45)
      +(own.support-enemy.support)*.65
      +(own.deathrattlePosition-enemy.deathrattlePosition)*.95
      +(own.frontlinePower-enemy.frontlinePower)*.25;
  }
  if(strategy==='felix'){
    return (own.frontier-enemy.frontier)*1.15
      +(own.verticalSupport-enemy.verticalSupport)*.7
      +(own.support-enemy.support)*.55
      +(own.enhancedCount-enemy.enhancedCount)*.45;
  }
  if(strategy==='regina'){
    return (own.enhancedCount-enemy.enhancedCount)*(1.25+own.enhancedScalerWeight*.5)
      +(own.support-enemy.support)*.95
      +(own.chains-enemy.chains)*.75
      +(own.frontier-enemy.frontier)*.45;
  }
  if(strategy==='maurya'){
    return own.knownHandCount*.5
      +own.generatedHandCount*.8
      +(own.laneSpread-enemy.laneSpread)*.85
      +(own.deathrattlePosition-enemy.deathrattlePosition)*.75
      +(own.frontier-enemy.frontier)*.65;
  }
  if(strategy==='biff'){
    return (own.deathrattlePosition-enemy.deathrattlePosition)*1.15
      +own.destroyWatcherActive*1.2+own.destroyWatcherGrowth*1.1
      -enemy.destroyWatcherActive*.6-enemy.destroyWatcherGrowth*.5
      +(enemy.destroyed-own.destroyed*.35)*1.15
      +(own.frontlinePower-enemy.frontlinePower)*.45;
  }
  if(strategy==='lidrehl'){
    return (own.support-enemy.support)*.85
      +(own.chains-enemy.chains)*.95
      +own.destroyWatcherActive*1.1+own.destroyWatcherGrowth*1
      +(own.enhancedCount-enemy.enhancedCount)*.7
      +(own.ranks-enemy.ranks)*.4;
  }
  if(strategy==='zhijun'){
    return (own.debuffAura-enemy.debuffAura)*1.15
      +(enemy.enfeebled-own.enfeebled)*.95
      +own.destroyWatcherActive*1.1+own.destroyWatcherGrowth*.9
      +own.generatedHandCount*.65
      +(own.deathrattlePosition-enemy.deathrattlePosition)*.6;
  }
  if(strategy==='regina-rematch'){
    return (own.support-enemy.support)*.95
      +(own.enhancedCount-enemy.enhancedCount)*.9
      +(enemy.destroyed-own.destroyed*.5)*1.1
      +(enemy.enfeebled-own.enfeebled)*.8
      +(own.frontlinePower-enemy.frontlinePower)*.4;
  }
  if(strategy==='bernard'){
    let strongestLead=0,maxRowPower=0;
    for(let r=0;r<3;r++){
      const diff=own.rowPower[r]-enemy.rowPower[r];
      if(diff>strongestLead)strongestLead=diff;
      if(own.rowPower[r]>maxRowPower)maxRowPower=own.rowPower[r];
    }
    return (own.ranks-enemy.ranks)*.75
      +own.rank3Prep*.85
      +(own.cost3Cards-enemy.cost3Cards)*1.35
      +(own.support-enemy.support)*.7
      +strongestLead*.4+maxRowPower*.45;
  }
  if(strategy==='turner'){
    return (own.enhancedCount+own.enfeebled+enemy.enfeebled)*.85
      +(own.support-enemy.support)*.75
      +(own.debuffAura-enemy.debuffAura)*.9
      +(enemy.enfeebled-own.enfeebled)*.8;
  }
  if(strategy==='vincent-gatekeeper'){
    return own.destroyWatcherActive*1.5+own.destroyWatcherGrowth*1.35
      -enemy.destroyWatcherActive*.7-enemy.destroyWatcherGrowth*.6
      +(own.deathrattlePosition-enemy.deathrattlePosition)*1.2
      +(enemy.destroyed-own.destroyed*.2)*1.2
      +own.generatedHandCount*.75
      +(own.frontlinePower-enemy.frontlinePower)*.35;
  }
  if(strategy==='queen'){
    const totalEnfeebled=own.enfeebled+enemy.enfeebled;
    const midDiff=own.rowPower[1]-enemy.rowPower[1];
    const midControl=midDiff>0?1.5+Math.min(midDiff,12)*.45:midDiff*.6-1.5;
    const wingContest=(own.rowPower[0]>enemy.rowPower[0]?1.1:0)+(own.rowPower[2]>enemy.rowPower[2]?1.1:0);
    return own.enfeebledScalerBoard*2
      +totalEnfeebled*(1.8+own.enfeebledScalerBoard*.65)
      +enemy.enfeebled*.9
      +(own.debuffAura-enemy.debuffAura)*1.25
      +midControl
      +wingContest
      +(own.ranks-enemy.ranks)*.75
      +(own.laneSpread-enemy.laneSpread)*.65
      +(own.frontier-enemy.frontier)*.55;
  }
  // cameron: aggressive enfeeble/kill pressure + destroy-watcher snowball & rank-3 readiness.
  const watcherBonus=own.destroyWatcherActive*1.6+own.destroyWatcherGrowth*1.4
    -enemy.destroyWatcherActive*.8-enemy.destroyWatcherGrowth*.7;
  const killMomentum=(enemy.destroyed-own.destroyed*(own.watchAlly>0?.25:.65))*1.45;
  return watcherBonus
    +killMomentum
    +(enemy.enfeebled-own.enfeebled)*.9
    +(enemy.fragile-own.fragile)*.85
    +(own.deathrattlePosition-enemy.deathrattlePosition)*.75
    +own.rank3Prep*.75;
}
