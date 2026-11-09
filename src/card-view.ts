// Shared presentation only. Values and patterns come from the caller's Card.
import type {Card,Offset} from './cards.js';
import type {CardVisual} from './visuals.js';
import {CARD_FRAME,cardFrameStyle} from './card-frame.js';

export interface CardViewOptions {
  readonly compact?:boolean;
  readonly lazy?:boolean;
  readonly variant?:'board'|'hand';
  readonly currentPower?:number;
  readonly state?:'neutral'|'enhanced'|'enfeebled';
  readonly markers?:readonly string[];
}
const escape=(value:string|number)=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');

export function cardPatternCells(card:Card,player:0|1=0){
  const key=([x,y]:Offset)=>`${player===1?-x:x},${y}`;
  const pawns=new Set(card.influence.map(key));
  const effects=new Set(card.abilities.flatMap(a=>a.timing==='aura'?a.target.cells??[]:a.timing==='dynamic'?[]:a.actions.flatMap(action=>'target' in action?action.target.cells??[]:[])).map(key));
  return Array.from({length:25},(_,i)=>{
    const x=i%5-2,y=2-Math.floor(i/5),position=`${x},${y}`;
    return {x,y,origin:x===0&&y===0,pawn:pawns.has(position),effect:effects.has(position)};
  });
}
/** The replacement operation itself has an ability mark on the Rebirth face.
 * Scoring/pawn modifiers also count even when the abilities array is empty. */
export function cardHasAbility(card:Card):boolean {
  return card.placement==='replace'||card.abilities.length>0||!!card.pawnBoost||!!card.laneBonus||!!card.scorePolicy;
}
const icon=(name:string,path:string)=>`<svg class="qb-icon qb-icon--${name}" viewBox="0 0 16 20" aria-hidden="true" focusable="false"><path d="${path}"/></svg>`;
const pawn=()=>icon('pawn','M5 1h6v2h2v5h-2v3H5V8H3V3h2z M6 12h4v2h2v2h2v3H2v-3h2v-2h2z');
const replacement=()=>icon('replacement','M5 1h6v9h4v2l-7 7-7-7v-2h4z');
const ability=()=>`<svg class="qb-icon" viewBox="0 0 28 24" aria-hidden="true" focusable="false"><path d="M9 0h2v4h2v2h2v2h4v2h-4v2h-2v2h-2v5H9v-5H7v-2H5v-2H0V8h5V6h2V4h2z M22 11l2 4 4 2-4 2-2 4-2-4-4-2 4-2z"/></svg>`;
const generatedOnly=(card:Card)=>card.rarity==='token'&&card.cost===0&&card.placement!=='replace';
function rankMarkup(card:Card):string {
  const replace=card.placement==='replace',generated=generatedOnly(card),label=replace?'替换 / Replacement':generated?'自动生成 / Generated':`放置等级 Rank ${card.cost}（格位要求）`;
  return `<span class="qb-rank" data-rank="${replace?'replacement':generated?'generated':card.cost}" role="img" aria-label="${label}" title="${label}">${replace?replacement():Array.from({length:card.cost},pawn).join('')}</span>`;
}
function patternMarkup(card:Card,player:0|1):string {
  const cells=cardPatternCells(card,player).map(c=>`<span class="qb-cell${c.pawn?' qb-cell--pawn':''}${c.effect?' qb-cell--effect':''}${c.origin?' qb-cell--origin':''}" data-cell="${c.x},${c.y}"></span>`).join('');
  return `<div class="qb-pattern" role="img" aria-label="5乘5格型，${player===0?'左':'右'}侧玩家视角；白格放置点，黄格占格范围，红框能力范围">${cells}</div>`;
}

export function renderCardMarkup(card:Card,visual:CardVisual,player:0|1=0,options:CardViewOptions={}):string {
  if(card.id!==visual.cardId)throw new Error('Card visual ID mismatch');
  if(options.variant&&!['board','hand'].includes(options.variant))throw Error('Unsupported card variant');
  // Only live board cards show current power; every static face uses base power.
  const live=options.variant==='board',current=live?options.currentPower??card.power:card.power;
  if(!Number.isSafeInteger(current))throw Error('Invalid displayed power');
  const state=live?options.state??'neutral':'neutral',delta=current-card.power;
  if(!['neutral','enhanced','enfeebled'].includes(state))throw Error('Invalid displayed state');
  const stateText=state==='enhanced'?'强化':state==='enfeebled'?'弱化':'中性',markers=live?options.markers??[]:[];
  const status=[...(delta?[`${delta>0?'+':''}${delta}`]:[]),...(markers.length?['◆']:[])].join(' ');
  const statusTitle=[`当前力量 ${current}，基础力量 ${card.power}，${stateText}`,...markers].join('；');
  const mode=options.variant??(options.compact?'compact':'full');
  const label=`${card.name}，${card.placement==='replace'?'替换':generatedOnly(card)?'自动生成':`放置等级 ${card.cost}`}，基础力量 ${card.power}${live?`，当前力量 ${current}，${stateText}`:''}`;
  return `<div class="qb-card${mode==='full'?'':` qb-card--${mode}`}${card.rarity==='legendary'?' qb-card--legendary':''}" style="${cardFrameStyle()}" data-frame-version="${CARD_FRAME.version}" data-mode="${mode}" data-card-id="${card.id}" data-base-power="${card.power}" data-power-state="${state}" aria-label="${escape(label)}">
    <div class="qb-hero${visual.portraitPath?'':' qb-art--missing'}"${options.lazy?' data-art-lazy':''}>
      <span class="qb-placeholder" aria-label="暂无立绘">${escape(visual.placeholder.glyph)}</span>
      ${visual.portraitPath?`<img class="qb-image"${options.lazy?' loading="lazy" decoding="async"':''} src="${escape(visual.portraitPath)}" alt="${escape(card.name)}">`:''}
    </div>
    ${rankMarkup(card)}
    <span class="qb-power${String(current).length>2?' qb-power--wide':''}" aria-label="${live?'当前':'基础'}力量 ${current}" title="${escape(live?statusTitle:`基础力量 ${card.power}`)}"><b>${current}</b></span>
    ${patternMarkup(card,player)}
    ${cardHasAbility(card)?`<span class="qb-ability-mark" role="img" aria-label="特殊能力，查看详情" title="特殊能力，查看详情">${ability()}</span>`:''}
    ${status?`<span class="qb-state" title="${escape(statusTitle)}">${escape(status)}</span>`:''}
    <div class="qb-nameband"><span class="qb-name" lang="${/[\u3400-\u9fff]/u.test(card.name)?'zh':'en'}">${escape(card.name)}</span></div>
  </div>`;
}

/** Separate OG menu window. All activation paths read the same Card. */
export function renderCardDetailsMarkup(card:Card,player:0|1=0):string {
  const triggers:Record<string,string>={aura:'持续生效',dynamic:'随场上状态更新',threshold:'首次达到力量阈值',onPlay:'入场时',onDestroy:'被摧毁时',onReplace:'被替换时',firstEnhanced:'首次强化时',firstEnfeebled:'首次弱化时',onCardPlayed:'其他牌从手牌出场时',onCardDestroyed:'其他牌被摧毁时',onCardAddedToHand:'其他牌加入手牌时'};
  const notes=[...new Set(card.abilities.map(a=>triggers[a.timing]))];
  if(card.placement==='replace')notes.unshift('摧毁一张友方牌并占据其位置；不要求普通棋子等级');
  else if(card.rarity!=='token'||card.cost>0)notes.unshift(`要求己方空格位至少有 ${card.cost} 个棋子；棋子不是扣除的资源`);
  if(card.rarity==='token')notes.push(generatedOnly(card)?'衍生卡：仅由能力自动生成，不能组入初始牌库或从手牌普通放置':'衍生卡：由能力生成，不能组入初始牌库');
  return `<section class="qb-details" data-card-id="${card.id}" data-base-power="${card.power}" aria-label="卡牌详情">
    <h3>${card.rarity==='token'?'TOKEN':'No. '+String(card.id).padStart(3,'0')} · ${escape(card.name)}</h3>
    <dl class="qb-facts"><dt>放置</dt><dd>${card.placement==='replace'?'Replacement / 替换':generatedOnly(card)?'Generated / 自动生成':`Rank ${card.cost}`}</dd><dt>基础力量</dt><dd>${card.power}</dd></dl>
    ${patternMarkup(card,player)}<p class="qb-key">白格：放置位置 · 黄格：占格范围 · 红框：能力范围</p>
    <p class="qb-description">${escape(card.description)}</p>
    ${notes.map(note=>`<p class="qb-trigger">${escape(note)}</p>`).join('')}
  </section>`;
}
/** Shared by static proofs too. A missing portrait never hides card data. */
export function bindCardArtwork(root:ParentNode):void {
  root.querySelectorAll<HTMLImageElement>('.qb-image').forEach(image=>{
    const fallback=()=>{image.hidden=true;image.parentElement?.classList.add('qb-art--missing');};
    image.addEventListener('error',fallback,{once:true});
    if(image.complete&&image.naturalWidth===0)fallback();
  });
}
export function createCardView(card:Card,visual:CardVisual,options:CardViewOptions={}):HTMLElement {
  const host=document.createElement('div');host.innerHTML=renderCardMarkup(card,visual,0,options);
  bindCardArtwork(host);return host.firstElementChild as HTMLElement;
}
export function createCardDetails(card:Card,player:0|1=0):HTMLElement {
  const host=document.createElement('div');host.innerHTML=renderCardDetailsMarkup(card,player);return host.firstElementChild as HTMLElement;
}
