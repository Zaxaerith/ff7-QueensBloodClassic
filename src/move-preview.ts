import {
  legalMoves,outcome,play,
  type Game,type Player,
} from './engine.js';

export interface DestroyedCellPreview {
  readonly row:number;
  readonly col:number;
  readonly owner:Player;
  readonly cardId:number;
}

export interface ChangedCellPreview {
  readonly row:number;
  readonly col:number;
  readonly owner:Player;
  readonly before:number;
  readonly after:number;
  readonly delta:number;
}

export interface MovePreview {
  readonly rowsBefore:readonly [number,number][];
  readonly rowsAfter:readonly [number,number][];
  readonly rowDeltas:readonly [number,number][];
  readonly scoresBefore:readonly [number,number];
  readonly scoresAfter:readonly [number,number];
  readonly scoreDelta:readonly [number,number];
  readonly destroyedCells:readonly DestroyedCellPreview[];
  readonly changedCells:readonly ChangedCellPreview[];
  readonly spawnedCount:number;
}

/** Pure, non-mutating preview of a legal placement's exact row/score deltas,
 * direct/chain destructions, existing-card power changes, and spawned/generated cards. */
export function simulateMovePreview(
  game:Game,
  player:Player,
  handIndex:number,
  row:number,
  col:number,
):MovePreview|null {
  if(game.phase!=='playing'||game.turn!==player)return null;
  if(!legalMoves(game,player).some(m=>m.handIndex===handIndex&&m.row===row&&m.col===col))return null;

  const beforeOutcome=outcome(game);
  const beforeEventCount=game.events.length;
  const beforeCards=new Map<number,{row:number;col:number;owner:Player;power:number}>();
  for(let r=0;r<game.board.length;r++){
    for(let c=0;c<game.board[r].length;c++){
      const card=game.board[r][c].card;
      if(card)beforeCards.set(card.instanceId,{row:r,col:c,owner:card.owner,power:card.power});
    }
  }

  const trial=structuredClone(game);
  try{
    play(trial,player,handIndex,row,col);
  }catch{
    return null;
  }

  const afterOutcome=outcome(trial);
  const rowsBefore=beforeOutcome.rows.map(([a,b]):[number,number]=>[a,b]);
  const rowsAfter=afterOutcome.rows.map(([a,b]):[number,number]=>[a,b]);
  const rowDeltas=rowsAfter.map(([a,b],i):[number,number]=>[a-rowsBefore[i][0],b-rowsBefore[i][1]]);
  const scoresBefore:[number,number]=[beforeOutcome.scores[0],beforeOutcome.scores[1]];
  const scoresAfter:[number,number]=[afterOutcome.scores[0],afterOutcome.scores[1]];
  const scoreDelta:[number,number]=[scoresAfter[0]-scoresBefore[0],scoresAfter[1]-scoresBefore[1]];

  const newEvents=trial.events.slice(beforeEventCount);
  const destroyedCells:DestroyedCellPreview[]=[];
  const seenDestroyed=new Set<string>();
  let spawnedCount=0;

  for(const event of newEvents){
    if(event.type==='CardDestroyed'&&event.row!==undefined&&event.col!==undefined&&
      event.player!==undefined&&event.cardId!==undefined){
      const key=`${event.row},${event.col},${event.instanceId??event.cardId}`;
      if(!seenDestroyed.has(key)){
        seenDestroyed.add(key);
        destroyedCells.push({
          row:event.row,
          col:event.col,
          owner:event.player,
          cardId:event.cardId,
        });
      }
    } else if(event.type==='CardSpawned'||(event.type==='CardAddedToHand'&&event.reason==='generated')){
      spawnedCount++;
    }
  }

  const changedCells:ChangedCellPreview[]=[];
  for(let r=0;r<trial.board.length;r++){
    for(let c=0;c<trial.board[r].length;c++){
      const card=trial.board[r][c].card;
      if(!card)continue;
      const prev=beforeCards.get(card.instanceId);
      if(!prev||card.power===prev.power)continue;
      changedCells.push({
        row:r,
        col:c,
        owner:card.owner,
        before:prev.power,
        after:card.power,
        delta:card.power-prev.power,
      });
    }
  }

  return {
    rowsBefore,
    rowsAfter,
    rowDeltas,
    scoresBefore,
    scoresAfter,
    scoreDelta,
    destroyedCells,
    changedCells,
    spawnedCount,
  };
}
