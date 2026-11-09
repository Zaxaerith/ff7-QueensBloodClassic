import {additionalCards,additionalTokens} from './card-expansion.js';
// Independently authored rules data. Evidence and unresolved details: docs/RESEARCH.md.
// Coordinates are x = right, y = up, viewed from the left player's side.
export type Offset = readonly [dx: number, dy: number];
export type Side = 'ally' | 'enemy' | 'both';
export type CardStatus = 'enhanced' | 'enfeebled' | 'neutral';
export type Selector = Readonly<{scope: 'self' | 'cells' | 'board'; side: Side; cells?: readonly Offset[]; status?: CardStatus; excludeSelf?: boolean}>;
export type Condition = Readonly<{status: CardStatus}>;
export type Amount = number | 'replacedPower' | Readonly<{value: 'replacedPower' | 'sourcePower'; factor?: number}>;
export type Action =
  | Readonly<{kind: 'power'; target: Selector; amount: Amount}>
  | Readonly<{kind: 'destroy'; target: Selector}>
  | Readonly<{kind: 'addToHand'; cards: readonly number[]}>
  | Readonly<{kind: 'spawn'; cardsByRank: readonly [number, number, number]}>;
export type Trigger = 'onPlay' | 'onDestroy' | 'onReplace' | 'firstEnhanced' | 'firstEnfeebled'
  | 'onCardPlayed' | 'onCardDestroyed' | 'onCardAddedToHand';
export type Ability =
  | Readonly<{timing: 'aura'; target: Selector; amount: number; condition?: Condition}>
  | Readonly<{timing: 'dynamic'; count: Selector; amount: number}>
  | Readonly<{timing: 'threshold'; power: number; actions: readonly Action[]}>
  | Readonly<{timing: Trigger; actions: readonly Action[]; watch?: Side}>;
export interface Card {
  readonly id: number;
  readonly name: string;
  readonly cost: number;
  readonly power: number;
  readonly influence: readonly Offset[];
  readonly abilities: readonly Ability[];
  readonly description: string;
  readonly rarity: 'standard' | 'legendary' | 'token';
  readonly placement?: 'replace';
  readonly pawnBoost?: number;
  readonly laneBonus?: number;
  readonly scorePolicy?: 'winnerTakesBoth';
}
const cells = (side: Side, offsets: readonly Offset[]): Selector => ({scope: 'cells', side, cells: offsets});
const self: Selector = {scope: 'self', side: 'ally'};
const power = (timing: Trigger, side: Side, amount: number | 'replacedPower', offsets: readonly Offset[]): Ability =>
  ({timing, actions: [{kind: 'power', target: cells(side, offsets), amount}]});
const aura = (amount: number, offsets: readonly Offset[], side: Side = 'ally'): Ability =>
  ({timing: 'aura', target: cells(side, offsets), amount});
const watch = (timing: 'onCardPlayed' | 'onCardDestroyed', side: Side, amount: number): Ability =>
  ({timing, watch: side, actions: [{kind: 'power', target: self, amount}]});
const add = (timing: Trigger, id: number): Ability => ({timing, actions: [{kind: 'addToHand', cards: [id]}]});
const card = (id: number, name: string, cost: number, basePower: number, influence: readonly Offset[],
  abilities: readonly Ability[] = [], description = '无特殊能力', extra: Partial<Pick<Card, 'placement' | 'rarity' | 'pawnBoost' | 'laneBonus'>> = {}): Card =>
  ({id, name, cost, power: basePower, influence, abilities, description, rarity: 'standard', ...extra});
const cross: readonly Offset[] = [[0,1],[-1,0],[1,0],[0,-1]];
const adjacent: readonly Offset[] = [[-1,1],[0,1],[1,1],[-1,0],[1,0],[-1,-1],[0,-1],[1,-1]];
// Internal token IDs are not additional numbered collection cards.
export const TOKEN = {mandragora: 1010, heatseeker: 1040, dust2: 1961, dust4: 1962, dust6: 1963} as const;
export const playableCards: readonly Card[] = [
  card(1,'Security Officer',1,1,cross),
  card(2,'Riot Trooper',2,3,[[0,2],[0,1],[1,0],[0,-1],[0,-2]]),
  card(4,'J-Unit Sweeper',2,2,[[0,1],[1,1],[0,-1],[1,-1]]),
  card(5,'Queen Bee',1,1,[[0,2],[0,-2]]),
  card(7,'Levrikon',1,2,[[1,0],[0,-1]]),
  card(8,'Grasslands Wolf',1,2,[[1,0],[0,1]]),
  card(9,'Mu',2,1,[[1,1],[1,0]],[aura(1,[[0,-1]])],'持续：下方友方力量 +1'),
  card(10,'Mandragora',1,1,[[1,0],[0,-1]],[add('onPlay',TOKEN.mandragora)],'入场：将一张 Mandragora Minion 加入手牌'),
  card(11,'Elphadunk',2,4,[[0,1],[-1,0],[0,-1]]),
  card(12,'Cactuar',1,1,[[1,0],[0,-1]],[aura(3,[[1,-2]])],'持续：右一、下二的友方力量 +3'),
  card(13,'Crystalline Crab',1,1,[[-1,0],[0,1],[1,0]],[aura(2,[[0,1]])],'持续：上方友方力量 +2'),
  card(14,'Quetzalcoatl',2,3,[[0,2],[1,1],[1,-1],[0,-2]]),
  card(15,'Zu',2,2,[[-1,1],[1,1],[-1,-1],[1,-1]]),
  card(16,'Devil Rider',2,4,[[-2,1],[-2,0],[-1,0],[-2,-1]]),
  card(17,'Screamer',3,1,adjacent),
  card(18,'Flan',1,2,[[-1,1],[-1,0],[-1,-1]]),
  card(19,'Crawler',1,2,[[-1,1],[0,1],[-1,-1],[0,-1]]),
  card(20,'Archdragon',1,3,[[-1,1],[-1,-1],[1,0]],[power('onPlay','enemy',-3,[[1,0]])],'入场：前方敌方力量 -3'),
  card(21,'Ogre',2,5,[[0,2],[1,2],[0,-2],[1,-2]]),
  card(22,'Deathwheel',1,1,[],[power('onPlay','both',-3,[[2,2],[2,-2]])],'入场：右二、上二／下二的双方力量 -3'),
  card(23,'Fleetwing',1,3,[[-2,2],[-1,1],[-1,-1],[-2,-2]]),
  card(26,'Capparwire',1,3,[[0,1],[1,0],[0,-1]],[power('onPlay','both',-1,[[0,1],[0,-1]])],'入场：上、下方双方力量 -1'),
  card(27,'Mindflayer',2,1,[[0,1],[1,1],[0,-1]],[aura(-1,[[0,1],[1,1],[0,-1],[1,-1]],'both')],'持续：效果格内双方力量 -1'),
  card(30,'Flametrooper',1,3,[[-1,1],[0,1],[-1,0],[-1,-1],[0,-1]],[power('onDestroy','both',-3,[[-1,1],[-1,0],[-1,-1]])],'摧毁时：左侧三格双方力量 -3'),
  card(31,'Spearhawk',1,1,[[-1,0],[1,0],[0,-1]],[aura(2,[[0,-1]])],'持续：下方友方力量 +2'),
  card(32,'Sea Devil',3,1,[[0,1],[-1,0],[1,0]],[watch('onCardPlayed','ally',1)],'其他友方牌从手牌出场时：自身力量 +1'),
  card(35,'Tonberry King',2,1,[[1,0]],[watch('onCardDestroyed','ally',2)],'其他友方牌摧毁时：自身力量 +2'),
  card(39,'Cockatrice',2,3,[[1,0]],[{timing:'onPlay',actions:[{kind:'destroy',target:cells('both',[[1,0]])}]}],'入场：直接摧毁前方的友方或敌方牌'),
  card(40,'Heatseeker',1,1,cross,[add('onDestroy',TOKEN.heatseeker)],'摧毁时：将一张 Heatseeker Minion 加入手牌'),
  card(41,'Bomb',2,2,cross,[power('onDestroy','both',-4,adjacent)],'摧毁时：周围八格双方力量 -4'),
  card(42,'Thug',2,4,[[1,2],[-1,0],[1,0],[1,-2]]),
  card(43,'Death Claw',1,2,[[0,1],[1,0]],[watch('onCardDestroyed','enemy',1)],'敌方牌摧毁时：自身力量 +1'),
  card(48,'Amphidex',1,2,[[0,2],[1,0]],[power('firstEnhanced','ally',3,[[0,1],[0,2]])],'首次强化时：上方一格、两格的友方力量 +3'),
  card(51,'Insectoid Chimera',0,2,cross,[],'替换：摧毁一张友方牌并占据其位置',{placement:'replace'}),
  card(53,'Maloceros',3,5,[[1,2],[-1,0],[1,0],[1,-2]],[],'赢得本行时：额外得分 +10',{laneBonus:10}),
  card(59,'Griffon',0,1,[[0,1],[1,0]],[power('onPlay','ally','replacedPower',[[1,1]])],'替换：右上方友方力量增加被替换牌的力量',{placement:'replace'}),
  card(61,'Reapertail',1,3,[[0,1],[1,0]],[power('firstEnfeebled','enemy',-2,[[1,2],[1,1]])],'首次弱化时：右一、上一／上二的敌方力量 -2'),
  card(96,'Shiva',2,3,[],[{timing:'onPlay',actions:[{kind:'spawn',cardsByRank:[TOKEN.dust2,TOKEN.dust4,TOKEN.dust6]}]}],'入场：在己方空棋子格生成力量为棋子等级 ×2 的 Diamond Dust',{rarity:'legendary'}),
  card(98,'Titan',2,5,[[0,1],[1,0],[0,-1]],[],'入场占格：棋子等级增加 2（上限 3）',{rarity:'legendary',pawnBoost:2}),
  ...additionalCards
].sort((a,b)=>a.id-b.id);
export const tokenCards: readonly Card[] = [
  card(TOKEN.mandragora,'Mandragora Minion',1,1,[[0,1],[1,0]],[],'无特殊能力',{rarity:'token'}),
  card(TOKEN.heatseeker,'Heatseeker Minion',1,1,[[0,1],[1,0],[0,-1]],[],'无特殊能力',{rarity:'token'}),
  ...[TOKEN.dust2,TOKEN.dust4,TOKEN.dust6].map((id,i)=>card(id,`Diamond Dust ${2*(i+1)}`,0,2*(i+1),[],[],'自动生成；不能从手牌放置',{rarity:'token'})),
  ...additionalTokens
];
export const byId: ReadonlyMap<number,Card> = new Map([...playableCards,...tokenCards].map(c=>[c.id,c]));
export const starterDeck: readonly number[] = [1,1,4,5,7,7,8,8,9,11,11,12,13,14,18];
export const chainDeck: readonly number[] = [1,1,8,10,10,12,13,20,26,27,35,40,41,43,51];
export const summonDeck: readonly number[] = [1,1,8,8,10,10,13,13,20,31,40,48,59,96,98];
export const deckPresets = [
  {name:'经典基础',cards:starterDeck}, {name:'摧毁与替换',cards:chainDeck}, {name:'强化与召唤',cards:summonDeck},
  {name:'进阶能力',cards:[1,7,8,10,12,13,20,22,26,32,39,48,53,59,61]},
  {name:'M2 动态与条件',cards:[1,8,10,12,13,27,46,66,86,95,103,107,113,123,145]}
] as const;
