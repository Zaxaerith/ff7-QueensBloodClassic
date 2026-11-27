import {byId,deckPresets} from '../cards.js';
import type {BotDifficulty} from '../bot.js';
import type {BotStrategy} from '../bot-strategy.js';
import {findBossChallenger,type BossChallenger} from '../boss-challengers.js';
import {findChallenger,type Challenger} from '../challengers.js';
import type {GoldSaucerChallengeId,SurvivalChallengeId} from '../gold-saucer-catalog.js';
import type {BloodRankKey} from '../progress.js';
import type {TournamentStage} from '../tournament-session.js';
import {localizedName} from './card-names.js';
import {challengerTactics} from './challenger-tactics.js';
import {getLocale,messageSlots,t} from './index.js';
import type {Locale} from './locales.js';

const difficultyKeys = {easy: 'easy', normal: 'normalDifficulty', hard: 'hard'} as const;
const presetKeys = ['presetBasic', 'presetChain', 'presetSummon', 'presetAdvanced', 'presetDynamic'] as const;
const tierKeys = {beginner: 'neneTier', intermediate: 'zoganTier', advanced: 'isabelleTier'} as const;
const regionNames: Record<Challenger['regionId'], string> = {
  kalm: 'Kalm',
  'under-junon': 'Under Junon',
  'crows-nest': "Crow's Nest",
  'shinra-8': 'Shinra-8',
  'costa-del-sol': 'Costa del Sol',
  corel: 'Corel',
  gongaga: 'Gongaga',
  'cosmo-canyon': 'Cosmo Canyon',
  nibel: 'Nibel',
};
const bossTacticCards = [145, 74, 46] as const;
const seedLabels: Record<Locale,string> = {
  'zh-CN':'随机种子','zh-TW':'隨機種子',en:'Seed',ja:'シード',ko:'시드',
  fr:'Graine',de:'Startwert',it:'Seme','es-ES':'Semilla','es-419':'Semilla','pt-BR':'Semente',
};

// Archetype display names for presets 4..7 across all 11 locales (index 4 polishes the legacy 'M2 动态与条件' name).
const archetypePresetLabels: Record<Locale, readonly [string, string, string, string]> = {
  'zh-CN': ['王权终局共鸣', '亡语献祭深渊', '蚀心减益控场', '陆行鸟与强尼大军'],
  'zh-TW': ['王權終局共鳴', '亡語獻祭深淵', '蝕心減益控場', '陸行鳥與強尼大軍'],
  en: ['Royal Endgame Resonance', 'Deathrattle Abyss', 'Enfeeble Control', 'Chocobo & J-Squad Swarm'],
  ja: ['王権終局の共鳴', '消滅と犠牲の深淵', '弱体化コントロール', 'チョコボ＆ジョニー軍団'],
  ko: ['왕권 종국의 공명', '파괴 희생의 심연', '약화 침식 컨트롤', '초코보 & 조니 군단'],
  fr: ['Résonance royale', 'Abîme sacrificiel', 'Contrôle affaiblissant', 'Armée Chocobo & Johnny'],
  de: ['Königliche Resonanz', 'Opferungs-Abgrund', 'Schwächungskontrolle', 'Chocobo- & Johnny-Armee'],
  it: ['Risonanza reale', 'Abisso sacrificale', 'Controllo debilitante', 'Armata Chocobo & Johnny'],
  'es-ES': ['Resonancia real', 'Abismo sacrificial', 'Control debilitante', 'Ejército Chocobo y Johnny'],
  'es-419': ['Resonancia real', 'Abismo sacrificial', 'Control debilitante', 'Ejército Chocobo y Johnny'],
  'pt-BR': ['Ressonância Real', 'Abismo Sacrificial', 'Controle Enfraquecedor', 'Exército Chocobo e Johnny'],
};

export const difficultyName = (id: BotDifficulty) => t(difficultyKeys[id]);
export const presetName = (index: number): string => {
  if (index >= 4 && index < 8) return archetypePresetLabels[getLocale()][index - 4];
  return t(presetKeys[index] ?? presetKeys[0]);
};
export const opponentName = (id: string, original = id) => findBossChallenger(id) ? t('shadowbloodQueenName') : localizedName('npc:' + id, original);
export const opponentRegionName = (id: Challenger['regionId']) => localizedName('region:' + id,regionNames[id]);

export function opponentOptionLabel({id,name,regionId}: Challenger): string {
  return `${opponentName(id,name)} · ${opponentRegionName(regionId)}`;
}

export function bossProfile(boss: BossChallenger) {
  const name = (id: number) => localizedName(id,byId.get(id)?.name ?? String(id));
  const [queen, rictus, chimera] = bossTacticCards.map(name);
  const ruleSummary = t('shadowbloodQueenRuleSummary', queen);
  const tactic = t('shadowbloodQueenTactic', queen, rictus, chimera);
  const reward = '#' + String(boss.rewardCardId).padStart(3,'0') + ' ' + name(boss.rewardCardId);
  return {
    name: opponentName(boss.id, boss.name),
    section: t('bossChallengeSection'),
    tier: t('bossBattleBanner'),
    reward,
    ruleSummary,
    tactic,
    description: `${ruleSummary} ${tactic}`,
  };
}

export function opponentProfile(npc: Challenger) {
  const name = (id: number) => localizedName(id,byId.get(id)?.name ?? String(id));
  const {tactic,rewardCardId} = npc;
  const names = tactic.cards.map(name);
  const description = 'addedKey' in tactic
    ? challengerTactics[getLocale()][tactic.addedKey].replace(messageSlots,(_, index: string) => names[Number(index)] ?? '')
    : t(tactic.key,...names);
  const reward = '#' + String(rewardCardId).padStart(3,'0') + ' ' + name(rewardCardId);
  return {tier:t(tierKeys[npc.tier]),reward,description};
}

export function opponentDetails(npc: Challenger | undefined): string {
  if (!npc) return t('theComputerUsesTheSameDeckAsYou');
  const {tier,reward,description}=opponentProfile(npc);
  return t('npcDetails',tier,reward,description);
}

export function deckLabel(deck: {id: string; name: string}): string {
  const index = Number(/^preset:(\d+)$/.exec(deck.id)?.[1]);
  return deckPresets[index]?.name === deck.name ? presetName(index) : deck.name;
}

export function recordedDeckLabel(name: string, cards: readonly number[] | undefined): string {
  const index = deckPresets.findIndex(preset => preset.name === name &&
    preset.cards.length === cards?.length && preset.cards.every((id, position) => id === cards[position]));
  return index < 0 ? name : presetName(index);
}

export const seedLabel = () => seedLabels[getLocale()];

type KnownGoldSaucerId = GoldSaucerChallengeId | 'gs-luxury-real-estate' | 'gs-behind-enemy-lines' | 'gs-chadley-callous';
type KnownSurvivalId = SurvivalChallengeId | 'survival-extreme';

const gsChallengeTitleKeys: Record<KnownGoldSaucerId, 'gsHighGroundTitle' | 'gsOutflankedTitle' | 'gsMaisHereTitle' | 'gsLuxuryRealEstateTitle' | 'gsBehindEnemyLinesTitle' | 'gsChadleyCallousTitle'> = {
  'gs-high-ground': 'gsHighGroundTitle',
  'gs-outflanked': 'gsOutflankedTitle',
  'gs-mais-here': 'gsMaisHereTitle',
  'gs-luxury-real-estate': 'gsLuxuryRealEstateTitle',
  'gs-behind-enemy-lines': 'gsBehindEnemyLinesTitle',
  'gs-chadley-callous': 'gsChadleyCallousTitle',
};
const survivalTitleKeys: Record<KnownSurvivalId, 'gsBootCampTitle' | 'gsExtremeTitle' | 'gsNightmareTitle'> = {
  'survival-boot-camp': 'gsBootCampTitle',
  'survival-extreme': 'gsExtremeTitle',
  'survival-nightmare': 'gsNightmareTitle',
};

export const goldSaucerChallengeTitle = (id: KnownGoldSaucerId | string): string => {
  const key = (gsChallengeTitleKeys as Record<string, (typeof gsChallengeTitleKeys)[KnownGoldSaucerId] | undefined>)[id];
  return key ? t(key) : id;
};
export const survivalChallengeTitle = (id: KnownSurvivalId | string): string => {
  const key = (survivalTitleKeys as Record<string, (typeof survivalTitleKeys)[KnownSurvivalId] | undefined>)[id];
  return key ? t(key) : id;
};
export const goldSaucerOpponentLabel = (id: KnownGoldSaucerId | string): string =>
  `${t('goldSaucerTab')} · ${goldSaucerChallengeTitle(id)}`;
export const survivalRoundOpponentLabel = (round: number, strategy: BotStrategy, bossId?: string): string => {
  if (strategy === 'queen' || findBossChallenger(bossId)) {
    return `${t('survivalRoundNumber', round)} · ${t('shadowbloodQueenName')}`;
  }
  const npc = findChallenger(strategy);
  const name = npc ? opponentName(npc.id, npc.name) : t('computer');
  return `${t('survivalRoundNumber', round)} · ${name}`;
};

const bloodRankMessageKeys: Record<BloodRankKey,
  'bloodRank1'|'bloodRank2'|'bloodRank3'|'bloodRank4'|'bloodRank5'|'bloodRank6'|
  'bloodRank7'|'bloodRank8'|'bloodRank9'|'bloodRank10'|'bloodRank11'|'bloodRank12'> = {
  bloodathalon: 'bloodRank1',
  bloodletter: 'bloodRank2',
  bloodSquire: 'bloodRank3',
  bloodPatriot: 'bloodRank4',
  bloodMystic: 'bloodRank5',
  bloodExecutioner: 'bloodRank6',
  bloodMarquis: 'bloodRank7',
  bloodSovereign: 'bloodRank8',
  bloodDespot: 'bloodRank9',
  bloodMonarch: 'bloodRank10',
  bloodChampion: 'bloodRank11',
  bloodGrandmaster: 'bloodRank12',
};

export const bloodRankTitle = (key: BloodRankKey): string => t(bloodRankMessageKeys[key]);

const tournamentStageMessageKeys: Record<TournamentStage,
  'tournamentStageR1'|'tournamentStageR2'|'tournamentStageR3'|'tournamentStageSemi'|'tournamentStageFinal'|'tournamentStageExhibition'> = {
  'round-1': 'tournamentStageR1',
  'round-2': 'tournamentStageR2',
  'round-3': 'tournamentStageR3',
  semifinal: 'tournamentStageSemi',
  final: 'tournamentStageFinal',
  exhibition: 'tournamentStageExhibition',
};

export const tournamentStageLabel = (stage: TournamentStage): string => t(tournamentStageMessageKeys[stage]);

const cruiseCharacterCardIds: Record<string, number> = {
  'aerith-cruise': 89,
  'barret-cruise': 87,
  'tifa-cruise': 88,
};

export const tournamentOpponentLabel = (opponentId: string, fallbackName: string): string => {
  if (opponentId === 'red-xiii-overfang') return t('tournamentRedXiii');
  const cardId = cruiseCharacterCardIds[opponentId];
  if (cardId !== undefined) return localizedName(cardId, fallbackName);
  const npc = findChallenger(opponentId);
  if (npc) return opponentName(npc.id, npc.name);
  return fallbackName;
};
