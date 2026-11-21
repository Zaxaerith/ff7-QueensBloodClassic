import {byId} from '../cards.js';
import type {BotAction} from '../bot.js';
import {displayName} from './card-names.js';
import {catalogFor,t,type MessageKey} from './index.js';

const sourceNotes = Object.entries(catalogFor('zh-CN'))
  .filter(([key]) => key.startsWith('evidenceNote') && key !== 'evidenceNote')
  .map(([key, text]) => ({key: key as MessageKey, text}))
  .sort((a,b) => b.text.length - a.text.length);

export function localizeEvidenceNote(text: string): string {
  return sourceNotes.reduce((note, source) => note.replace(source.text, () => t(source.key)), text);
}

export function analysisActionText(action: BotAction, cardId: number | null): string {
  const card = byId.get(cardId ?? 0);
  const move = action.type === 'pass' ? t('pass')
    : displayName(cardId ?? 0, card?.name ?? t('unknownCard')) + ' → ' + (action.row + 1) + '-' + (action.col + 1);
  return t('analysisPlayerPrefix',action.player + 1) + move;
}

const analysisErrorKeys = ['selectRecordedMove','mulliganAnalysisUnavailable','invalidAnalysisSettings','illegalAnalyzedMove'] as const;
export function localizeAnalysisError(error: unknown): string {
  const message = error instanceof Error ? error.message : error;
  const source = catalogFor('zh-CN');
  const key = analysisErrorKeys.find(key => message === source[key]);
  return t(key ?? 'analysisError');
}

const hintKeys = ['analysisComparisonIncomplete','analysisSimilarMoves','analysisCompareAlternative','analysisLaneAdvantage','analysisTerritoryAdvantage'] as const;
export function localizeAnalysisHint(text: string): string {
  const source = catalogFor('zh-CN');
  const key = hintKeys.find(key => source[key] === text);
  return key ? t(key) : text;
}

export function localizeAnalysisReason(text: string, replies: number, replyTotal: number): string {
  const final = /^终局有效分差 (-?\d+)/.exec(text);
  if (final) return t('analysisFinalMargin',final[1]);
  const estimate = /^有效分差 (-?\d+)，行力量差 (-?\d+)，领地\/空格等级\/纵深差 (-?\d+(?:\.\d+)?)/.exec(text);
  if (!estimate) return text === catalogFor('zh-CN')['analysisBudgetExhausted'] ? t('analysisBudgetExhausted') : t('analysisFailedResolve');
  const summary = t('analysisHeuristic',estimate[1],estimate[2],estimate[3]);
  return replyTotal ? summary + ' · ' + t('analysisHypothetical',replies,replyTotal) : summary;
}
