import {byId,deckPresets} from '../cards.js';
import type {BotDifficulty} from '../bot.js';
import type {Challenger} from '../challengers.js';
import {localizedName} from './card-names.js';
import {challengerTactics} from './challenger-tactics.js';
import {getLocale,messageSlots,t} from './index.js';
import type {Locale} from './locales.js';

const difficultyKeys = {easy: 'easy', normal: 'normalDifficulty', hard: 'hard'} as const;
const presetKeys = ['presetBasic', 'presetChain', 'presetSummon', 'presetAdvanced', 'presetDynamic'] as const;
const tierKeys = {beginner: 'neneTier', intermediate: 'zoganTier', advanced: 'isabelleTier'} as const;
const regionNames = {kalm: 'Kalm', 'under-junon': 'Under Junon', 'crows-nest': "Crow's Nest"} as const;
const seedLabels: Record<Locale,string> = {
  'zh-CN':'随机种子','zh-TW':'隨機種子',en:'Seed',ja:'シード',ko:'시드',
  fr:'Graine',de:'Startwert',it:'Seme','es-ES':'Semilla','es-419':'Semilla','pt-BR':'Semente',
};

export const difficultyName = (id: BotDifficulty) => t(difficultyKeys[id]);
export const presetName = (index: number) => t(presetKeys[index] ?? presetKeys[0]);
export const opponentName = (id: string, original = id) => localizedName('npc:' + id, original);
export const opponentRegionName = (id: Challenger['regionId']) => localizedName('region:' + id,regionNames[id]);

export function opponentOptionLabel({id,name,regionId}: Challenger): string {
  return `${opponentName(id,name)} · ${opponentRegionName(regionId)}`;
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
