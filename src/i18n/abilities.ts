import type {Ability, Action, Amount, Card, CardStatus, Selector} from '../cards.js';
import {translate, type MessageKey, type MessageValue} from './index.js';
import {localizedName} from './card-names.js';
import type {Locale} from './locales.js';

const triggerText = {
  onPlay: 'onPlayTrigger', onDestroy: 'onDestroyTrigger', onReplace: 'onReplaceTrigger',
  firstEnhanced: 'firstEnhancedTrigger', firstEnfeebled: 'firstEnfeebledTrigger', onCardPlayed: 'onCardPlayedTrigger',
  onCardDestroyed: 'onCardDestroyedTrigger', onCardAddedToHand: 'onCardAddedToHandTrigger',
} as const satisfies Record<Exclude<Ability['timing'], 'aura' | 'dynamic' | 'threshold'>, MessageKey>;
const sideText = {ally: 'ally', enemy: 'enemy', both: 'both'} as const;
const statusText = {neutral: 'neutral', enhanced: 'enhanced', enfeebled: 'enfeebled'} as const;

export function localizedStatus(status: CardStatus, locale: Locale): string {
  return translate(locale, statusText[status]);
}

export function describeAbilities(card: Card, locale: Locale): string[] {
  const t = (key: MessageKey, ...values: MessageValue[]) => translate(locale, key, ...values);
  const names = new Intl.ListFormat(locale, {style: 'short', type: 'unit'});
  const name = (id: number) => localizedName(id, '#' + id, locale);
  const signed = (n: number) => n > 0 ? '+' + n : String(n);
  const amountText = (amount: Amount) => typeof amount === 'number' ? signed(amount)
    : amount === 'replacedPower' ? t('replacedAmount', 1)
    : t(amount.value === 'replacedPower' ? 'replacedAmount' : 'sourceAmount', amount.factor ?? 1);
  function modify(target: Selector, amount: Amount) {
    const value = amountText(amount);
    if (target.scope === 'self') return t('powerSelf', value);
    const side = t(sideText[target.side]);
    return t(target.scope === 'cells' ? 'powerCells' : 'powerBoard', side, value);
  }
  function actionText(action: Action): string {
    switch (action.kind) {
      case 'power': return modify(action.target, action.amount);
      case 'destroy': return t('destroyCells', t(sideText[action.target.side]));
      case 'addToHand': return t('addHand', names.format(action.cards.map(name)));
      case 'spawn': return t('spawn', names.format(action.cardsByRank.map((id, i) => t('tierToken', i + 1, name(id)))));
    }
  }
  const lines = card.abilities.map(ability => {
    if (ability.timing === 'aura') {
      const when = ability.condition ? t('activeWhile', localizedStatus(ability.condition.status, locale)) : t('aura');
      return t('amountLine', when, modify(ability.target, ability.amount));
    }
    if (ability.timing === 'dynamic') {
      return t('dynamic', localizedStatus(ability.count.status ?? 'neutral', locale), t(sideText[ability.count.side]), signed(ability.amount));
    }
    const trigger = ability.timing === 'threshold' ? t('threshold', ability.power) : t(triggerText[ability.timing]);
    const when = 'watch' in ability && ability.watch ? t('watch', trigger, t(sideText[ability.watch])) : trigger;
    return t('amountLine', when, names.format(ability.actions.map(actionText)));
  });
  if (card.pawnBoost) lines.push(t('boost', card.pawnBoost));
  if (card.laneBonus) lines.push(t('laneBonus', card.laneBonus));
  if (card.scorePolicy === 'winnerTakesBoth') lines.push(t('scorePolicy'));
  if (!lines.length && card.placement !== 'replace' && card.cost !== 0) lines.push(t('noAbility'));
  return lines;
}
