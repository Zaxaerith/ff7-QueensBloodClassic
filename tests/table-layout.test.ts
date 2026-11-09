import {expect,test} from 'vitest';
import {fitTable,TABLE_CARD_RATIO} from '../src/ui-table-layout.js';
for(const [width,height] of [[1216,624],[1216,306],[1216,300],[360,420],[330,370]]){
  test(`table fits BOTH constraints at ${width}x${height} with portrait cells`,()=>{
    const scoreWidth=width<500?23:34,scoreGap=width<500?3:7,cellGap=width<500?3:6;
    const result=fitTable({width,height,scoreWidth,scoreGap,cellGap});
    expect(result.cellWidth/result.cellHeight).toBeCloseTo(TABLE_CARD_RATIO,6);
    expect(result.boardWidth+2*scoreWidth+2*scoreGap).toBeLessThanOrEqual(width);
    expect(result.boardHeight).toBeLessThanOrEqual(height);
    expect(result.boardWidth).toBeCloseTo(5*result.cellWidth+4*cellGap);
    expect(result.boardHeight).toBeCloseTo(3*result.cellHeight+2*cellGap);
  });
}
test('surplus viewport space does not stretch cells, while short height reduces BOTH axes',()=>{
  const base={width:360,height:400,scoreWidth:23,scoreGap:3,cellGap:3};
  expect(fitTable({...base,height:800})).toEqual(fitTable(base));
  const short=fitTable({...base,height:200});expect(short.cellHeight).toBeLessThan(fitTable(base).cellHeight);
  expect(short.cellWidth/short.cellHeight).toBeCloseTo(.7,6);
  expect(()=>fitTable({...base,height:NaN})).toThrow();
});
