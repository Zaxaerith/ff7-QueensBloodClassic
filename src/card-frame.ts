// One logical layout for HTML and browser/Canvas/PNG proofs. Project design
// coordinates, not claimed measurements from Rebirth.
export const CARD_FRAME = Object.freeze({
  version:'1.0',width:240,height:346,
  colors:Object.freeze({deepBlue:'#0B146F',menuBlue:'#2048A0',silver:'#C9D6E8',gold:'#F5D47B',dark:'#10152D'}),
  // Bounded small-card typography preserves the accepted M5 table geometry.
  minimum:Object.freeze({boardPower:12,boardBadge:18,boardPawn:7,boardPawnHeight:10,boardName:8,boardNameHeight:18,handPower:16,handName:9,handNameHeight:22}),
  boxes:Object.freeze({
    art:{x:4,y:4,width:232,height:304},rank:{x:12,y:14,width:96,height:30},
    power:{x:182,y:12,width:46,height:46},pattern:{x:78,y:208,width:84,height:84},
    ability:{x:43,y:269,width:27,height:23},name:{x:4,y:308,width:232,height:34},
    state:{x:12,y:173,width:216,height:22},
  }),
});
/** Inline variables also work in file:// proofs without a build. */
export function cardFrameStyle():string {
  const {width,height,boxes,colors,minimum}=CARD_FRAME;
  return [`--frame-width:${width}`,`--frame-height:${height}`,
    ...Object.entries(colors).map(([key,value])=>`--frame-${key}:${value}`),
    ...Object.entries(minimum).map(([key,value])=>`--minimum-${key}:${value}px`),
    ...Object.entries(boxes).flatMap(([name,b])=>[
      `--${name}-x:${b.x/width*100}%`,`--${name}-y:${b.y/height*100}%`,
      `--${name}-w:${b.width/width*100}%`,`--${name}-h:${b.height/height*100}%`,
    ])].join(';');
}
