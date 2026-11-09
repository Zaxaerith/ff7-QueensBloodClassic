import type {Ability,Amount,Card,CardStatus,Offset,Selector,Side,Trigger} from './cards.js';

// Factual pattern transcriptions; prose and rules builders are independently
// authored. W = Wiki Sandsea; corroboration/conflicts are in RESEARCH.md.
// '*' adds pawns, 'A' is ability-only, '@' does both; x right and y up.
export function parsePattern(pattern:string):{influence:Offset[];effects:Offset[]} {
  const rows=pattern.split('/');
  if(rows.length!==5||rows.some(r=>r.length!==5||/[^C*@A-]/.test(r))||rows[2][2]!=='C'||(pattern.match(/C/g)||[]).length!==1)throw new Error('Invalid 5x5 card pattern');
  const influence:Offset[]=[],effects:Offset[]=[];
  rows.forEach((row,r)=>[...row].forEach((mark,c)=>{
    if(mark==='*'||mark==='@')influence.push([c-2,2-r]);
    if(mark==='A'||mark==='@')effects.push([c-2,2-r]);
  }));
  return {influence,effects};
}
type Builder=(effects:Offset[])=>Ability[];
const target=(side:Side,cells:Offset[]):Selector=>({scope:'cells',side,cells});
const e=(timing:Trigger,amount:Amount,side:Side='both'):Builder=>cells=>[{timing,actions:[{kind:'power',target:target(side,cells),amount}]}];
const a=(amount:number,side:Side='ally'):Builder=>cells=>[{timing:'aura',target:target(side,cells),amount}];
const d=(side:Side='enemy'):Builder=>cells=>[{timing:'onPlay',actions:[{kind:'destroy',target:target(side,cells)}]}];
const hand=(timing:Trigger,...cards:number[]):Builder=>()=>[{timing,actions:[{kind:'addToHand',cards}]}];
const grow=(side:Side,status:CardStatus,amount:number):Builder=>()=>[{timing:'dynamic',count:{scope:'board',side,status,excludeSelf:true},amount}];
const watch=(timing:'onCardPlayed'|'onCardDestroyed',side:Side,amount:number):Builder=>()=>[{timing,watch:side,actions:[{kind:'power',target:{scope:'self',side:'ally'},amount}]}];
const inherit=(side:Side='ally',factor=1)=>e('onPlay',{value:'replacedPower',factor},side);
const empty='-----/-----/--C--/-----/-----';
const ring='-----/-AAA-/-ACA-/-AAA-/-----';
const corners='A-A-A/-----/A-C-A/-----/A-A-A';
function describe(abilities:readonly Ability[]):string {
  if(!abilities.length)return '无特殊能力';
  const who=(side:Side)=>side==='ally'?'友方':side==='enemy'?'敌方':'双方';
  const timing:Record<string,string>={onPlay:'入场',onDestroy:'摧毁时',onReplace:'替换时',firstEnhanced:'首次强化',firstEnfeebled:'首次弱化',onCardPlayed:'其他牌从手牌出场时',onCardDestroyed:'其他牌摧毁时',onCardAddedToHand:'其他牌加入手牌时'};
  return abilities.map(b=>{
    if(b.timing==='dynamic')return `动态：每张其他${who(b.count.side)}${b.count.status==='enhanced'?'强化':'弱化'}牌，自身力量 +${b.amount}`;
    if(b.timing==='aura')return `持续${b.condition?`（自身${b.condition.status==='enhanced'?'强化':'弱化'}时）`:''}：效果格${who(b.target.side)}力量 ${b.amount>0?'+':''}${b.amount}`;
    const label=b.timing==='threshold'?`力量首次达到 ${b.power}`:('watch' in b&&b.watch?who(b.watch):'')+timing[b.timing];
    return label+'：'+b.actions.map(action=>{
      if(action.kind==='power')return `${action.target.scope==='self'?'自身':who(action.target.side)+'目标'}力量 ${typeof action.amount==='number'?(action.amount>0?'+':'')+action.amount:typeof action.amount==='object'&&action.amount.factor===-1?'减少被替换牌力量':'增加被替换牌力量'}`;
      if(action.kind==='destroy')return `摧毁效果格${who(action.target.side)}牌`;
      if(action.kind==='addToHand')return `生成 ${action.cards.length} 张衍生手牌`;
      return '在己方空棋子格按等级生成衍生牌';
    }).join('；');
  }).join('；');
}
function define(id:number,name:string,cost:number,power:number,pattern:string,build?:Builder,extra:Partial<Pick<Card,'pawnBoost'|'laneBonus'|'scorePolicy'>>={}):Card {
  const {influence,effects}=parsePattern(pattern),abilities=build?.(effects)??[];
  const description=extra.pawnBoost?`入场占格增加 ${extra.pawnBoost} 级`:extra.laneBonus?`赢行加分 +${extra.laneBonus}`:extra.scorePolicy?'在场时：每行败者力量计入胜者':describe(abilities);
  return {id,name,cost,power,influence,abilities,description:(cost===0&&id<1000?'替换：':'')+description,
    rarity:id>=1000?'token':id>=86?'legendary':'standard',...(cost===0&&id<1000?{placement:'replace' as const}:{}),...extra};
}
export const M2_TOKEN={junior:1056,baby:2056,amalgam:1057,moogle:1092,bronco:1093,beast:1094,
  elemental1:2051,elemental2:2052,elemental3:2053,mage:1110,bard:2110,cacneo:1125,donberry:2125} as const;
// M6-A1 candidates: Wiki transcription corroborated by a player's rank-by-rank
// experiment. Printed token power remains disputed; see getCardEvidence(134).
export const M6_TOKEN={johnny1:1134,johnny2:2134,johnny3:3134} as const;
export const additionalCards:readonly Card[]=[
  define(3,'Grenadier',2,1,'-----/-----/--C-A/-----/-----',e('onPlay',-4,'enemy')),
  define(6,'Toxirat',2,2,'-----/-----/--C--/--*@-/-----',e('onPlay',-3)),
  define(24,'Zemzelett',2,1,'-----/--*--/-AC--/--**-/-----',a(3)),
  define(25,'Ignilisk',1,1,'-----/-----/--C@-/-----/--@--',a(2)),
  define(28,'Scrutineye',1,1,'--*--/--A--/--C--/--A--/--*--',a(1,'both')),
  define(29,'Hell Rider II',3,5,'-----/-----/--C@-/-**@-/-----',e('onPlay',-3,'enemy')),
  define(33,'Shoalopod',2,1,'-----/--@*-/--C*-/-----/-----',a(4)),
  define(34,'Crown Lance',2,2,'-----/-----/--C--/--*@-/---@-',e('onPlay',-2)),
  define(36,'Sandhog Pie',1,1,'-----/--@--/--C@-/-----/-----',e('onDestroy',3,'ally')),
  define(37,'Bloatfloat',1,1,'-----/-----/--C*A/--*--/-----',e('onDestroy',-4)),
  define(38,'Bagnadrana',3,2,'-----/-----/--C*-/---*-/-----',watch('onCardPlayed','enemy',1)),
  define(44,'Landworm',3,5,'-----/-----/--C*-/--**-/-----',watch('onCardDestroyed','enemy',2)),
  define(45,'Sandspitter',2,3,'--@@-/-----/--C--/-----/--@@-',e('onPlay',-1)),
  define(46,'Chimera',2,4,'-----/--*--/--C*-/--*--/-----',grow('enemy','enfeebled',2)),
  define(47,'Joker',2,2,'--**-/-----/--C--/-----/--**-',watch('onCardDestroyed','both',1)),
  define(49,'Frightflower',1,1,'A-A-A/--*--/A*C*A/--*--/A-A-A',e('onDestroy',2)),
  define(50,'Gagighandi',2,4,'-----/-----/--C*-/--*A-/--*A-',e('firstEnhanced',-2,'enemy')),
  define(52,'Gigantoad',0,3,'-----/--*--/--C*-/-----/-----'),
  define(54,'Grandhorn',0,3,'-----/-----/--C*-/--*--/-----'),
  define(55,'Great Malboro',3,3,'-----/---@-/--C@-/---@-/-----',e('onPlay',-6)),
  define(56,'Grangalan',3,3,'-----/--**-/-*C*-/-**--/-----',hand('onPlay',M2_TOKEN.junior)),
  define(57,'Amalgam',1,1,'-----/-----/-*C*-/-----/-----',hand('onDestroy',M2_TOKEN.amalgam)),
  define(58,'Skeeskee',1,1,'-----/--*--/-*C*-/-----/-----',watch('onCardDestroyed','ally',1)),
  define(60,'Basilisk',3,2,'-----/---*-/--C--/-*-@-/-----',d()),
  define(62,'Jabberwock',2,6,'-----/-A@--/-AC--/-A@--/-----',e('onPlay',-1)),
  define(63,'Desert Sahagin',1,3,'-----/-----/--C*-/--@--/-----',e('firstEnfeebled',4,'ally')),
  define(64,'Cavestalker',2,4,'--*--/---@-/--CA-/---@-/--*--',e('firstEnfeebled',-2,'enemy')),
  define(65,'Stone Golem',1,4,'-----/-----/--CA-/-----/-----',e('firstEnhanced',-4,'enemy')),
  define(66,'Two Face',2,3,'-----/--@--/--C--/--@--/-----',cells=>[
    {timing:'aura',target:target('both',cells),amount:4,condition:{status:'enhanced'}},
    {timing:'aura',target:target('both',cells),amount:-4,condition:{status:'enfeebled'}}]),
  define(67,'Gi Specter',0,2,'-----/-----/--C--/--*@-/-----',inherit('both',-1)),
  define(68,'Valron',2,3,'-----/-*-*-/--C--/-*-*-/-----',grow('ally','enfeebled',2)),
  define(69,'Disgorgon',2,3,'-----/---*-/--C--/---*-/-----',undefined,{pawnBoost:2}),
  define(70,'Dragon',3,5,'-----/--@--/--C@-/--@--/-----',e('onPlay',-4,'enemy')),
  define(71,'Twin Brain',1,1,'--*--/-----/--C--/-----/--*--',undefined,{pawnBoost:2}),
  define(72,'Black Bat',1,2,'-----/--@--/-@C@-/--@--/-----',e('onPlay',-1)),
  define(73,'Bahba Velamyu',1,2,'---A-/--*A-/-*C@-/---A-/---A-',e('onDestroy',-1,'enemy')),
  define(74,'Rictus',1,2,'-----/-----/-*C*-/--*--/-----',grow('both','enfeebled',1)),
  // Disjoint statuses compose: no card is counted twice and self is excluded.
  define(75,'Adjudicator',2,1,empty,()=>[...grow('both','enhanced',1)([]),...grow('both','enfeebled',1)([])]),
  define(76,'Yin & Yang',0,3,'--A--/-----/-*C*-/-----/--A--',inherit()),
  define(77,'Diabolic Variant',0,2,'-----/--A--/-*C*-/--A--/-----',inherit('both',-1)),
  define(78,'Special Forces Operator',1,2,'--@--/-----/--C*-/-----/--@--',a(2)),
  define(79,'2-C SOLDIER Operator',2,3,'--@*-/-----/--C*-/-----/-----',a(3)),
  define(80,'Kelzmelzer',0,3,'---A-/--*--/--C*-/--*--/---A-',inherit('both',-1)),
  define(81,'Panthera Protector',2,3,'-----/-***-/--C@-/-----/-----',e('firstEnhanced',4,'ally')),
  define(82,'Hecteyes',1,1,corners,e('onDestroy',3,'ally')),
  define(83,'Floating Death',1,1,ring,e('onPlay',-1)),
  define(84,'Ironclad',3,1,'-----/-----/--C*-/--*--/-----',grow('enemy','enhanced',3)),
  define(85,'Moss-Grown Adamantoise',3,4,'-----/-***-/--C--/-***-/-----',undefined,{pawnBoost:3}),
  define(86,'Cloud',2,3,'-----/-AAA-/-AC@-/-AAA-/-----',cells=>[{timing:'threshold',power:7,actions:[{kind:'power',target:target('ally',cells),amount:2}]}]),
  define(87,'Barret',3,4,'-----/-----/--C*@/-----/-----',e('onPlay',-8,'enemy')),
  define(88,'Tifa',1,1,'-----/-----/--C*-/--*--/--*--',undefined,{laneBonus:5}),
  define(89,'Aerith',2,1,'-----/-----/-@C@-/-----/-----',a(3)),
  define(90,'Red XIII',1,3,'A-A-A/--*--/A-C*A/-----/A-A-A',e('firstEnfeebled',-2,'enemy')),
  define(91,'Yuffie',0,1,'-----/-A@A-/-@C@-/-A@A-/-----',inherit('both',-1)),
  define(92,'Cait Sith',1,1,'-----/-----/-*C*-/--*--/-----',hand('onPlay',M2_TOKEN.moogle)),
  define(93,'Cid',1,2,'--*--/-----/--C*-/-----/-----',hand('onPlay',M2_TOKEN.bronco)),
  define(94,'Vincent',1,2,'-----/--*--/--C*-/--*--/-----',hand('onDestroy',M2_TOKEN.beast)),
  define(95,'Ifrit',3,5,'-----/--*--/--C--/--*--/-----',grow('ally','enhanced',2)),
  define(97,'Ramuh',3,3,'@---@/-@-@-/--C--/-@-@-/@---@',e('onPlay',-3)),
  define(99,'Kujata',3,6,'-----/---@-/-@C--/---@-/-----',e('firstEnhanced',-5,'enemy')),
  define(100,'Odin',2,3,'-----/-*-*-/--C--/-*-*-/-----',grow('enemy','enhanced',2)),
  define(101,'Phoenix',3,4,'-----/-@-@-/--C--/-@-@-/-----',e('onDestroy',5,'ally')),
  define(102,'Leviathan',3,4,'A-@-A/-----/@-C-@/-----/A-@-A',a(-3,'enemy')),
  define(103,'Alexander',3,4,'-----/--*--/-*C*-/--*--/-----',grow('ally','enfeebled',3)),
  define(104,'Bahamut',3,5,'-----/--*--/-*C@@/--*--/-----',e('onPlay',-5,'enemy')),
  define(105,'Bahamut Arisen',3,4,empty,()=>[{timing:'onPlay',actions:[{kind:'spawn',cardsByRank:[M2_TOKEN.elemental1,M2_TOKEN.elemental2,M2_TOKEN.elemental3]}]}]),
  define(106,'Gilgamesh',0,3,'A---A/-----/--C--/-----/A---A',inherit('both',-1)),
  define(107,'Chocobo & Moogle',1,1,'-----/--*--/--C*-/--*--/-----',grow('ally','enhanced',1)),
  define(108,'Fat Chocobo',3,5,'--*--/-*-*-/*-C-*/-*-*-/--*--'),
  define(109,'Posh Chocobo',1,2,'-----/-----/-*C*-/-----/-----',undefined,{laneBonus:3}),
  define(110,'Moogle Trio',2,1,'-----/---*-/--C--/---*-/-----',hand('onPlay',M2_TOKEN.mage,M2_TOKEN.bard)),
  define(111,'Magic Pot',3,1,'-----/-A-A-/--C--/-A-A-/-----',a(2)),
  define(112,'Materia Guardian',3,5,'AA*AA/--*--/--C*-/--*--/AA*AA',e('firstEnfeebled',-6,'enemy')),
  define(113,'Midgardsormr',3,6,'-----/--*--/--C*-/--*--/-----',watch('onCardDestroyed','both',1)),
  define(114,'Mythril Golem',3,8,'-----/--*--/--C--/--*--/-----'),
  define(115,'Terror of the Deep',3,2,'-----/-@@@-/-@C@-/-@@@-/-----',a(-1,'both')),
  define(116,'Grasptropod',3,5,'A---A/A*-*A/--C--/A*-*A/A---A',e('firstEnhanced',-4)),
  define(117,'Custom Valkyrie',3,4,'-----/-@-@-/--C--/-@-@-/-----',e('onPlay',-4)),
  define(118,'Gigatrice',3,4,'--*@-/--*--/--C--/--*--/--*@-',d('both')),
  define(119,'Dyne',3,4,'---@-/----@/--C--/----@/---@-',e('onPlay',-5)),
  define(120,'Anuran Suppressor',2,2,'-----/-----/--C*-/-----/--**-',watch('onCardDestroyed','enemy',2)),
  define(121,'Specimen H1024',3,6,'A-A-A/--*--/A*C*A/--*--/A-A-A',a(3,'both')),
  define(122,'Crimson Mare Mk. II',3,5,'-----/--@*-/-ACA-/--@*-/-----',e('firstEnfeebled',-5)),
  define(123,'Gi Nattak',0,1,'-----/--@--/--C--/--@--/-----',inherit()),
  define(124,'Forgotten Specimen',3,4,'---*-/---*-/--C--/-A---/-A---',a(3)),
  define(125,'Don Corneo & Abzu',2,4,empty,hand('onPlay',M2_TOKEN.cacneo,M2_TOKEN.donberry)),
  define(126,'Red Dragon',3,6,'--@--/---@-/--C-@/---@-/--@--',e('onPlay',-4)),
  define(127,'Demon Gate',3,5,'-----/-@-@-/-@C@-/-@-@-/-----',e('onDestroy',-9,'enemy')),
  define(128,'Reno',1,2,'-----/-----/--C*-/-A*--/--A--',a(2)),
  define(129,'Rude',1,2,'--A--/-A*--/--C*-/-----/-----',a(2)),
  define(130,'Elena',1,2,'-----/-----/--C@-/-----/-----',e('firstEnhanced',-99)),
  define(131,'Tseng',1,1,'-----/--*--/--C*A/--*--/-----',e('firstEnhanced',4,'ally')),
  define(132,'Rufus',2,4,'-*-*-/-*-*-/--C--/-*-*-/-*-*-'),
  define(133,'Roche',2,5,'A-A-A/-A@A-/A@C@A/-AAA-/A-A-A',e('onPlay',-1,'ally')),
  define(134,'J-Squad',3,2,empty,()=>[{timing:'onPlay',actions:[{kind:'spawn',cardsByRank:[M6_TOKEN.johnny1,M6_TOKEN.johnny2,M6_TOKEN.johnny3]}]}]),
  define(135,'Chocobo Jockey',2,2,'-----/-----/--C*-/-----/-----',undefined,{laneBonus:10}),
  define(136,'Space Ranger',1,2,'--*--/--*--/--C*-/-----/-----',grow('enemy','enhanced',1)),
  define(137,'Haunted Hotel',1,1,'-----/--*AA/--C--/--*AA/-----',a(2)),
  define(138,'Skywheel',3,2,'-*-*-/*---*/--C--/*---*/-*-*-'),
  define(139,'Loveless',1,1,ring,e('onPlay',1)),
  define(140,'Saucer Squad',2,3,'---*-/--*--/--C*-/--*--/---*-'),
  define(141,'Dio',3,4,'-----/--*--/-*C*-/--*--/-----',grow('both','enhanced',1)),
  define(142,'Ultimate Party Animal',1,1,'-----/--*--/-*C*-/--*--/-----',undefined,{scorePolicy:'winnerTakesBoth'}),
  define(143,'Sephiroth',3,4,'-----/--@--/-*C*-/--@--/-----',d()),
  define(144,'Emerald Witch',2,2,'--A--/-A*A-/A*C*A/-A*A-/--A--',a(2,'both')),
  define(145,'Shadowblood Queen',3,3,'-----/--**-/--C--/--**-/-----',grow('both','enfeebled',3))
];
export const additionalTokens:readonly Card[]=[
  define(M2_TOKEN.junior,'Grangalan Junior',2,2,'-----/-*-*-/--C--/-*-*-/-----',hand('onPlay',M2_TOKEN.baby)),
  define(M2_TOKEN.baby,'Baby Grangalan',1,1,'-----/-@@@-/-@C@-/-@@@-/-----',e('onDestroy',-5)),
  define(M2_TOKEN.amalgam,'Resurrected Amalgam',1,2,'-----/--@--/--C--/--@--/-----',a(-2,'both')),
  define(M2_TOKEN.moogle,'Moogle',2,2,'-----/--A--/--C*-/---*-/-----',a(3)),
  define(M2_TOKEN.bronco,'The Tiny Bronco',2,2,'-----/-----/--C*-/--*--/---*-',undefined,{pawnBoost:2}),
  define(M2_TOKEN.beast,'Galian Beast',2,4,'-AAA-/A---A/A-C-A/A---A/-AAA-',e('onPlay',-1)),
  ...[M2_TOKEN.elemental1,M2_TOKEN.elemental2,M2_TOKEN.elemental3].map((id,i)=>define(id,`Elemental (rank ${i+1})`,0,1,ring,e('onDestroy',i+1))),
  define(M2_TOKEN.mage,'Moogle Mage',1,1,'----@/-----/--C--/-----/-----',e('onPlay',-4)),
  define(M2_TOKEN.bard,'Moogle Bard',1,1,'-----/-----/--C*-/--*A-/---A-',a(2)),
  define(M2_TOKEN.cacneo,'Cacneo',2,2,'---A-/---*-/--C*-/---*-/---A-',a(3)),
  define(M2_TOKEN.donberry,'Donberry',2,2,'-----/-----/--C@-/-----/-----',d()),
  define(M6_TOKEN.johnny1,'Hype Johnnys I',0,1,corners,a(1,'both')),
  define(M6_TOKEN.johnny2,'Hype Johnnys II',0,1,'--A--/-----/A-C-A/-----/--A--',a(2,'both')),
  define(M6_TOKEN.johnny3,'Hype Johnnys III',0,1,'A---A/-----/--C--/-----/A---A',a(4,'both'))
];
