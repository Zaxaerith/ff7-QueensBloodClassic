import type {Direction} from '../ui-gamepad.js';

const rows=3, columns=5;
export function gridStep(index:number,direction:Direction):number {
  const row=Math.floor(index/columns),col=index%columns;
  const nextRow=Math.max(0,Math.min(rows-1,row+(direction==='down'?1:direction==='up'?-1:0)));
  const nextCol=Math.max(0,Math.min(columns-1,col+(direction==='right'?1:direction==='left'?-1:0)));
  return nextRow*columns+nextCol;
}

export function smartSnap(legal:readonly number[], previous:number|null):number {
  if(!legal.length)return previous??0;
  const distance=(a:number,b:number)=>Math.abs(Math.floor(a/columns)-Math.floor(b/columns))+Math.abs(a%columns-b%columns);
  return [...legal].sort((a,b)=>(previous===null?0:distance(a,previous)-distance(b,previous))||a-b)[0];
}

export function legalTarget<T extends {row:number;col:number}>(moves:readonly T[],index:number|null):T|null {
  return moves.find(move=>move.row*columns+move.col===index)??null;
}
