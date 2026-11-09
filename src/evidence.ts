import {byId} from './cards.js';

// Research metadata is deliberately outside Card and the resolution engine.
export type EvidenceStatus='verified'|'candidate'|'conflict'|'missing';
export const evidenceDimensions=['identity','stats','influence','abilityPattern','effect','timing','implementation'] as const;
export type EvidenceDimension=typeof evidenceDimensions[number];
export interface EvidenceItem {
  status:EvidenceStatus;
  scope:'game-data'|'project';
  basis:'transcription'|'card-image'|'community-text'|'walkthrough'|'local-regression'|'unverified';
  sources:string[];
  note:string;
}
export interface CardEvidence {
  cardId:number;
  dimensions:Record<EvidenceDimension,EvidenceItem>;
  issues:string[];
  knownFacts?:{cost:number;power:number;influence:readonly (readonly [number,number])[];effect:string};
}
const gg='https://www.gamerguides.com/final-fantasy-vii-rebirth/';
const gw='https://gamewith.jp/ff7rebirth/';
export const evidenceSources:Record<string,{url:string;kind:string;checked:string}>={
  wiki:{url:'https://finalfantasy.fandom.com/wiki/Final_Fantasy_Wiki%3ASandsea',kind:'community-transcription',checked:'2026-10-29'},
  locations:{url:'https://www.powerpyx.com/final-fantasy-7-vii-rebirth-all-queens-blood-card-locations/',kind:'collection-index',checked:'M1/M2'},
  gamespot:{url:'https://www.gamespot.com/articles/all-queens-blood-cards-in-final-fantasy-7-r-list-and-locations/1100-6521437/',kind:'community-text',checked:'2026-10-29'},
  ggStandard:{url:gg+'database/queens-blood/standard',kind:'community-text',checked:'2026-10-29'},
  ggLegendary:{url:gg+'database/queens-blood/legendary',kind:'community-text',checked:'2026-10-29'},
  ggPuzzles:{url:gg+'guide/minigames/queens-blood/all-card-carnival-advanced-puzzles-final-fantasy-vii-rebirth',kind:'game-puzzle-walkthrough',checked:'2026-10-29'},
  gwIndex:{url:gw+'438321',kind:'community-text',checked:'2026-10-29'},
  engine:{url:'docs/ENGINE.md',kind:'project-contract',checked:'2026-10-30'},
  m3Tests:{url:'tests/m3.test.ts',kind:'project-regression',checked:'2026-10-30'},
  johnnyTest:{url:'https://www.reddit.com/r/FF7Rebirth/comments/1bqaz3l/comment/ky4hsdc/',kind:'community-play-test',checked:'2026-11-09'},
  johnnyDiscussion:{url:'https://www.reddit.com/r/FF7Rebirth/comments/1bqaz3l/',kind:'community-discussion-with-conflicting-power-claims',checked:'2026-11-09'},
  m6a1Tests:{url:'tests/m6-a1.test.ts',kind:'project-regression',checked:'2026-11-09'},
};
const researched:Record<number,{page:string;image:string;grid:string;effect:string;issue?:string}>={
  25:{page:'439772',image:'card33',grid:'c0da2ef6e41b9e00a51d8e024ffaf5ff',effect:'采用持续友方 +2；GameWith、Gamer Guides、GameSpot 一致。',issue:'Wiki Sandsea 写 +3，与三个文字来源冲突；未看到游戏内能力全文。'},
  28:{page:'439773',image:'card34',grid:'491717d850d66ff382366f5d709c7b51',effect:'采用持续双方 +1；GameWith、Gamer Guides、GameSpot 一致。',issue:'Wiki Sandsea 仅写友方，目标范围仍记录为来源冲突。'},
  63:{page:'439795',image:'card48',grid:'2378ff5144865beb372c5f2a6aa661fa',effect:'采用首次弱化时友方 +4。',issue:'GameSpot 写首次强化；GameWith、Gamer Guides、Wiki 及 Cloud 谜题弱化连锁支持首次弱化。首次判定和致死边界仍待实机。'},
  73:{page:'439806',image:'card51',grid:'f6816c0ab6ae7ab678a3eadd1c013ffc',effect:'采用摧毁时敌方 -1；GameWith、Gamer Guides、GameSpot 一致。',issue:'Wiki Sandsea 写入场，与其他来源冲突；摧毁事件内部先后未核验。'},
  75:{page:'439824',image:'card69',grid:'017d861f39027beee15f541a7342cfb7',effect:'每张其他强化或弱化的双方卡 +1；两个互斥计数相加。',issue:'Wiki Sandsea 只列弱化；GameWith、Gamer Guides、GameSpot 与 Aerith 谜题说明同时计强化和弱化。状态分层仍为候选。'},
  106:{page:'440109',image:'card141',grid:'664b5c8e1e8182db58f3c15b7205c463',effect:'替换友方；四个距中心横纵各 2 格的角上双方减去旧牌有效力量。'},
  133:{page:'439827',image:'card72',grid:'f9d49df1cf357cd4c6586ed08dc70e34',effect:'入场时效果格友方 -1。占格仅上、左、右相邻三格。'},
  134:{page:'440233',image:'card144',grid:'62d3e78dc3c61354edc365d52edbd85c',effect:'入场在己方空棋子格按等级生成 Hype Johnnys I/II/III；衍生牌持续强化效果格双方 +1/+2/+4，母牌无占格标记。',issue:'Wiki 作者保留衍生格型为观察推断的警告；M6-A1 找到逐等级玩家实测文字，格型及 +1/+2/+4 相符，仍没有直接牌面/逐帧核验。'},
};
for(const [id,r] of Object.entries(researched)){
  evidenceSources['gw'+id]={url:gw+r.page,kind:'community-text',checked:'2026-10-29'};
  evidenceSources['image'+id]={url:`https://img.gamewith.jp/article_tools/ff7rebirth/gacha/${r.image}.png`,kind:'visible-card-face',checked:'2026-10-29'};
  evidenceSources['grid'+id]={url:`https://img.gamewith.jp/img/${r.grid}.png`,kind:'transcribed-position-diagram',checked:'2026-10-29'};
}
const item=(status:EvidenceStatus,basis:EvidenceItem['basis'],sources:string[],note:string,scope:EvidenceItem['scope']='game-data'):EvidenceItem=>({status,scope,basis,sources,note});
export function getCardEvidence(cardId:number):CardEvidence {
  if(!Number.isInteger(cardId)||cardId<1||cardId>145)throw new Error('Evidence requires numbered Card ID 1..145');
  const implemented=byId.has(cardId);
  const dimensions:Record<EvidenceDimension,EvidenceItem>={
    identity:item('candidate','transcription',['locations','wiki'],'沿用编号目录；英文名称与稀有度未逐张对照游戏内收藏。'),
    stats:item(implemented?'candidate':'missing','transcription',implemented?['wiki']:[],'M1/M2 社区抄录；未逐张看牌面。'),
    influence:item(implemented?'candidate':'missing','transcription',implemented?['wiki']:[],'M1/M2 社区格型抄录。'),
    abilityPattern:item(implemented?'candidate':'missing','transcription',implemented?['wiki']:[],'M1/M2 效果格型抄录；无效果的空集合也未自动升格。'),
    effect:item(implemented?'candidate':'missing','transcription',implemented?['wiki']:[],'社区技能转述，不能由程序测试证明游戏内正确。'),
    timing:item('candidate','unverified',['engine'],'共享队列和状态边界为工程候选契约，缺少逐帧实机对照。'),
    implementation:item(implemented?'candidate':'missing',implemented?'local-regression':'unverified',implemented?['engine']:[],implemented?'已有可执行规则；未声称每张牌都有独立回归。':'尚未启用。','project'),
  };
  const result:CardEvidence={cardId,dimensions,issues:[]},r=researched[cardId];
  if(r){
    dimensions.identity=item('candidate','community-text',['gw'+cardId,cardId<86?'ggStandard':'ggLegendary','gamespot'],'编号、英文名和稀有度有索引支持；缩略图日文名称不能证明英文拼写。');
    dimensions.stats=item('verified','card-image',['image'+cardId],'仅核对可见牌面的等级（或替换图标）及印刷力量，不代表完整游戏规则核验。');
    dimensions.influence=item('verified','card-image',['image'+cardId,'grid'+cardId],'逐格对照可见牌面与独立放大格型；黄底占格、红框效果。');
    dimensions.abilityPattern=item('verified','card-image',['image'+cardId,'grid'+cardId],'仅核对母牌可见红框；不证明目标阵营或触发时间。');
    dimensions.effect=item(r.issue&&cardId!==134?'conflict':'candidate','community-text',['gw'+cardId,cardId<86?'ggStandard':'ggLegendary','gamespot',...(r.issue?['wiki']:[])],r.effect);
    if(cardId===63||cardId===75){dimensions.effect.sources.push('ggPuzzles');dimensions.effect.basis='walkthrough';}
    if(r.issue)result.issues.push(r.issue);
    if(cardId!==134)dimensions.implementation=item('verified','local-regression',['m3Tests'],'仅指本项目新增牌的镜像固定局面回归；不提升任何 game-data 维度。','project');
  }
  if(cardId===134){
    dimensions.abilityPattern=item('candidate','community-text',['wiki','johnnyTest','image134'],'母牌无红框已看图。衍生 I 为距中心横纵各 0/2 的外圈八格，II 为相隔两格的上下左右，III 为四个远角；Wiki 与玩家逐等级实测文字相符，尚未直接看衍生牌格型。');
    dimensions.effect.status='conflict'; // The generated cards' base power is part of this effect chain.
    dimensions.effect.sources.push('johnnyTest','johnnyDiscussion');
    dimensions.effect.note+='三种衍生基础力量均采用 Wiki 明列的 1；同一讨论另有 1/2/3 的说法，未能直接读图排除，明确保留冲突。';
    dimensions.timing.note+='沿用现有 spawn 的等级快照、整批生成及后续稳定，不算从手牌打出；与死亡/首次状态/条件光环的极端先后仍为候选。';
    dimensions.implementation=item('verified','local-regression',['m6a1Tests'],'仅指项目固定局面、组牌、Bot/分析、Session 和旧存档回归；不证明衍生牌事实或原作结算顺序。','project');
    result.issues.push('衍生基础力量存在 1/1/1 与 1/2/3 的来源冲突；当前选择明确表列的 1/1/1 候选，优先取得三个等级的游戏内详情核对。');
  }
  if(cardId===66)result.issues.push('条件光环循环的 Rebirth 事件规则未确认；UNSTABLE_AURA 是候选求解器限制，不是游戏规则。');
  if(cardId===68){dimensions.identity.status='conflict';result.issues.push('Wiki 研究页重复编号 67；按收藏索引归入 68，保留出处差异。');}
  if(cardId===116||cardId===136){dimensions.identity.status='conflict';result.issues.push('来源存在名称别名，沿用现有显示名；稳定 Card ID 不受影响。');}
  if(cardId===142){
    dimensions.effect=item('candidate','community-text',['ggLegendary','gamespot'],'在场时各行败者分数加入胜者；全盘范围有文字支持。');
    dimensions.timing.note+='Ultimate Party Animal 的平行、多个实例及败方奖励转移组合尚缺实机核验，沿用 M2。';
  }
  return result;
}
