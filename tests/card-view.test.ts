import {expect,test} from 'vitest';
import {byId} from '../src/cards.js';
import {getCardVisual} from '../src/visuals.js';
import {cardPatternCells,cardHasAbility,renderCardMarkup,renderCardDetailsMarkup} from '../src/card-view.js';
import {CARD_FRAME} from '../src/card-frame.js';

const cells=(html:string)=>[...html.matchAll(/<span class="qb-cell[^>]+data-cell="[^"]+"/g)].map(m=>m[0]);
test.each([[1,1,1],[2,2,3],[143,3,4]])('sample #%i has %i pawn icons and base power %i',(id,rank,power)=>{
  const card=byId.get(id)!,html=renderCardMarkup(card,getCardVisual(id));
  expect(html.match(/qb-icon--pawn/g)).toHaveLength(rank);
  expect(html).toContain(`<b>${power}</b>`);expect(html).not.toContain('qb-icon--replacement');
  expect(cells(html)).toHaveLength(25);expect(html).not.toContain('qb-description');expect(html).not.toContain('No. ');
});
test('replacement symbol is selected by placement data, never card number or cost alone',()=>{
  const grandhorn=byId.get(54)!,html=renderCardMarkup(grandhorn,getCardVisual(54));
  expect(html).toContain('qb-icon--replacement');expect(html).not.toContain('qb-icon--pawn');expect(html).toContain('<b>3</b>');
  expect(renderCardMarkup({...byId.get(1)!,placement:'replace'},getCardVisual(1))).toContain('qb-icon--replacement');
  const token=[...byId.values()].find(c=>c.rarity==='token'&&c.cost===0)!;
  expect(renderCardMarkup(token,getCardVisual(token.id))).not.toContain('qb-icon--replacement');
});
test('special ability marks cover replacement, scoring and pawn abilities as on the reference face',()=>{
  for(const id of [1,2])expect(cardHasAbility(byId.get(id)!)).toBe(false);
  for(const id of [54,143,88,98,142]){
    const card=byId.get(id)!;expect(cardHasAbility(card)).toBe(true);
    expect(renderCardMarkup(card,getCardVisual(id))).toContain('qb-ability-mark');
  }
  expect(renderCardMarkup(byId.get(1)!,getCardVisual(1))).not.toContain('qb-ability-mark');
});
test('four sample patterns retain factual coordinates, including yellow and red overlap',()=>{
  const active=(id:number)=>cardPatternCells(byId.get(id)!).filter(c=>c.pawn).map(c=>[c.x,c.y]);
  expect(active(1)).toEqual([[0,1],[-1,0],[1,0],[0,-1]]);
  expect(active(2)).toEqual([[0,2],[0,1],[1,0],[0,-1],[0,-2]]);
  expect(active(54)).toEqual([[1,0],[0,-1]]);
  const sephiroth=cardPatternCells(byId.get(143)!);
  expect(sephiroth.filter(c=>c.effect).map(c=>[c.x,c.y])).toEqual([[0,1],[0,-1]]);
  expect(sephiroth.filter(c=>c.pawn&&c.effect)).toHaveLength(2);
  expect(renderCardMarkup(byId.get(143)!,getCardVisual(143))).toContain('qb-cell--pawn qb-cell--effect');
  expect(sephiroth.filter(c=>c.origin)).toEqual([{x:0,y:0,origin:true,pawn:false,effect:false}]);
});
test('right player mirrors columns only; threshold/death cells survive and dynamic counts are not a grid',()=>{
  for(const id of [86,41,143]){
    const card=byId.get(id)!,right=cardPatternCells(card,1);
    for(const c of cardPatternCells(card))expect(right.find(p=>p.x===-c.x&&p.y===c.y)).toEqual({...c,x:-c.x||0});
  }
  for(const id of [86,41])expect(cardPatternCells(byId.get(id)!).filter(c=>c.effect)).toHaveLength(8);
  const dynamic=[...byId.values()].find(c=>c.abilities.length>0&&c.abilities.every(a=>a.timing==='dynamic'))!;
  expect(cardPatternCells(dynamic).filter(c=>c.effect)).toHaveLength(0);
});
test('all static sizes and details share base values and identical 25 cells without mutating data',()=>{
  for(const card of byId.values()){
    const before=structuredClone(card),visual=getCardVisual(card.id),details=renderCardDetailsMarkup(card,1);
    expect(details).toContain(`data-base-power="${card.power}"`);
    expect(details).toContain(card.placement==='replace'?'Replacement / 替换':card.rarity==='token'&&card.cost===0?'Generated / 自动生成':`Rank ${card.cost}`);
    for(const options of [{},{compact:true},{variant:'hand' as const}]){
      const face=renderCardMarkup(card,visual,1,options);
      expect(cells(face)).toEqual(cells(details));expect(face).toContain(`<b>${card.power}</b>`);
      expect(face).not.toContain('qb-description');expect(face).not.toContain('qb-key');
    }
    expect(card).toEqual(before);
  }
});
test('Chinese/English and unsafe text are handled in face and separate full description',()=>{
  const card={...byId.get(143)!,name:'萨菲罗斯 Sephiroth <&"',description:'A&B "arm" < 7'};
  const html=renderCardMarkup(card,{...getCardVisual(143),portraitPath:'portraits/a".png'});
  expect(html).toContain('lang="zh"');expect(html).toContain('萨菲罗斯 Sephiroth &lt;&amp;&quot;');expect(html).toContain('a&quot;.png');
  expect(renderCardDetailsMarkup(card)).toContain('A&amp;B &quot;arm&quot; &lt; 7');
});
test('missing art and ID checks preserve the same complete frame',()=>{
  const html=renderCardMarkup(byId.get(1)!,getCardVisual(1));expect(html).toContain('qb-art--missing');expect(html).not.toContain('<img');expect(cells(html)).toHaveLength(25);
  expect(()=>renderCardMarkup(byId.get(1)!,getCardVisual(2))).toThrow('ID mismatch');
});
test('J-Squad and its three generated candidates retain their own data and placement meaning',()=>{
  const parent=byId.get(134)!,html=renderCardMarkup(parent,getCardVisual(134));
  expect(html.match(/qb-icon--pawn/g)).toHaveLength(3);expect(html).toContain('<b>2</b>');expect(html).toContain('qb-ability-mark');
  for(const id of [1134,2134,3134]){
    const card=byId.get(id)!,face=renderCardMarkup(card,getCardVisual(id)),detail=renderCardDetailsMarkup(card);
    expect(face).toContain('data-rank="generated"');expect(face).not.toContain('qb-icon--replacement');expect(face).not.toContain('qb-icon--pawn');
    expect(detail).toContain('Generated / 自动生成');expect(detail).toContain('不能组入初始牌库');expect(detail).toContain(card.description);
    expect(cells(face)).toEqual(cells(detail));
  }
});
test('only authoritative card rarity can emphasize the frame',()=>{
  expect(renderCardMarkup(byId.get(1)!,getCardVisual(1))).not.toContain('qb-card--legendary');
  expect(renderCardMarkup(byId.get(143)!,getCardVisual(143))).toContain('qb-card--legendary');
});
test('live board keeps existing current power, state and triggers separately from static base power',()=>{
  const card=byId.get(86)!,options={currentPower:7,state:'enhanced' as const,markers:['阈值已触发']};
  const board=renderCardMarkup(card,getCardVisual(86),0,{variant:'board',...options});
  expect(board).toContain('<b>7</b>');expect(board).toContain('data-base-power="3"');expect(board).toContain('+4');expect(board).toContain('阈值已触发');expect(cells(board)).toHaveLength(25);
  const hand=renderCardMarkup(card,getCardVisual(86),0,{variant:'hand',...options});expect(hand).toContain('<b>3</b>');expect(hand).not.toContain('qb-state');
  expect(()=>renderCardMarkup(card,getCardVisual(86),0,{variant:'board',currentPower:NaN})).toThrow();
});
test('shared logical proportions locate the overlay grid and bottom name consistently',()=>{
  const {width,height,boxes}=CARD_FRAME;expect([width,height]).toEqual([240,346]);
  expect(boxes.pattern.x+boxes.pattern.width/2).toBe(width/2);
  expect(boxes.pattern.y/height).toBeGreaterThanOrEqual(.6);
  expect((boxes.pattern.y+boxes.pattern.height)/height).toBeLessThan(.85);
  expect(boxes.name.y/height).toBeGreaterThan(.88);
});
