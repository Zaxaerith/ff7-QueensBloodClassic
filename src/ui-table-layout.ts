/** Presentation geometry only; shared by ResizeObserver and layout assertions. */
export const TABLE_CARD_RATIO=0.70;
export interface TableSpace {width:number;height:number;scoreWidth:number;scoreGap:number;cellGap:number;}
export function fitTable(space:TableSpace){
  if(Object.values(space).some(n=>!Number.isFinite(n)||n<0))throw Error('Invalid table space');
  const availableWidth=Math.max(0,space.width-2*space.scoreWidth-2*space.scoreGap-4*space.cellGap);
  const availableHeight=Math.max(0,space.height-2*space.cellGap);
  const cellHeight=Math.floor(Math.min(availableHeight/3,availableWidth/(5*TABLE_CARD_RATIO)));
  const cellWidth=cellHeight*TABLE_CARD_RATIO;
  return {cellWidth,cellHeight,boardWidth:5*cellWidth+4*space.cellGap,boardHeight:3*cellHeight+2*space.cellGap};
}
