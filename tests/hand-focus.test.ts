import {expect,test} from 'vitest';
import {byId} from '../src/cards.js';
import {renderCardDetailsMarkup,cardPatternCells} from '../src/card-view.js';
import {focusCaption,rangeNote} from '../src/ui-hand-focus.js';
import {createPosition,legalMoves,previewEffects,previewInfluence} from '../src/engine.js';

test('browsing caption distinguishes armed card from focused card without touching authority',()=>{
  const game=createPosition({seed:612,turn:0,hands:[[13,2,143,54,134],[7]],decks:[[],[]],board:[{row:1,col:0,owner:0,pawns:3}]}),before=structuredClone(game);
  const selected=byId.get(13)!,browsed=byId.get(143)!;
  expect(focusCaption(browsed,selected,false)).toContain('棋盘仍预览已选 '+selected.name);
  expect(focusCaption(selected,selected,false)).toContain('已选手牌');
  expect(focusCaption(browsed,selected,true)).toContain('暂不可选牌');
  const move=legalMoves(game,0).find(m=>m.handIndex===0)!;
  previewInfluence(selected,move.row,move.col,0);previewEffects(selected,move.row,move.col,0);
  expect(game).toEqual(before);
});
test.each([1,2,143,54,134,1134,2134,3134])('focus reuses details and 25 cells for #%i',id=>{
  const card=byId.get(id)!,before=structuredClone(card),html=renderCardDetailsMarkup(card);
  expect(html.match(/data-cell=/g)).toHaveLength(25);
  expect(html).toContain(`data-base-power="${card.power}"`);
  expect(html).toContain(card.name);expect(card).toEqual(before);
  if(card.placement==='replace')expect(html).toContain('摧毁一张友方牌');
  if(card.rarity==='token'&&card.cost===0)expect(html).toContain('自动生成');
});
test('local overlap and nonlocal abilities get different, conditional range explanations',()=>{
  const local=byId.get(143)!;
  expect(cardPatternCells(local).some(c=>c.pawn&&c.effect)).toBe(true);
  expect(rangeNote(local)).toContain('是否生效取决于');
  const dynamic=[...byId.values()].find(c=>c.abilities.length&&c.abilities.every(a=>a.timing==='dynamic'))!;
  expect(cardPatternCells(dynamic).some(c=>c.effect)).toBe(false);
  expect(rangeNote(dynamic)).toContain('无局部红格');
});
