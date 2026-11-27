import {getLocale,t} from './i18n/index.js';
import {displayName} from './i18n/card-names.js';
import {byId, type Card} from './cards.js';
import {createCardDetails, createCardView} from './card-view.js';
import {analyzeDeckCurve} from './deck-code.js';
import {deckCardAvailability, type LibraryEntry} from './ui-data.js';
import {button, element} from './ui-dom.js';
import type {CardVisual} from './visuals.js';

export const cardNumber = (id: number) => `#${String(id).padStart(3, '0')}`;

export function renderDeckCurve(host: HTMLElement, cards: readonly number[]) {
  const stats = analyzeDeckCurve(cards);
  const maxBar = Math.max(4, stats.ranks.rank1, stats.ranks.rank2, stats.ranks.rank3, stats.ranks.replace);

  const head = element('div', 'deck-curve-head');
  const bars = element('div', 'deck-curve-bars');
  const columns: ReadonlyArray<{key: string; label: string; count: number; title: string; tone: string}> = [
    {key: 'rank1', label: 'R1', count: stats.ranks.rank1, title: t('rank1'), tone: 'mako'},
    {key: 'rank2', label: 'R2', count: stats.ranks.rank2, title: t('rank2'), tone: 'cobalt'},
    {key: 'rank3', label: 'R3', count: stats.ranks.rank3, title: t('rank3'), tone: 'gold'},
    {key: 'replace', label: '↻', count: stats.ranks.replace, title: t('replace'), tone: 'crimson'},
  ];

  for (const col of columns) {
    const item = element('div', 'deck-curve-col');
    item.dataset.rank = col.key;
    item.title = `${col.title}: ${col.count}`;
    const countEl = element('span', 'deck-curve-count', String(col.count));
    const track = element('div', 'deck-curve-track');
    const fill = element('div', `deck-curve-fill deck-curve-fill--${col.tone}`);
    const pct = col.count > 0 ? Math.max(14, Math.round((col.count / maxBar) * 100)) : 0;
    fill.style?.setProperty?.('--bar-pct', `${pct}%`);
    track.append(fill);
    const axis = element('span', 'deck-curve-axis', col.label);
    item.append(countEl, track, axis);
    bars.append(item);
  }

  const summary = element('div', 'deck-curve-stats');
  const avg = element('span', 'deck-curve-stat', t('deckAvgPower', stats.avgPower.toFixed(1)));
  avg.dataset.stat = 'avg-power';
  const leg = element('span', 'deck-curve-stat deck-curve-stat--gold', t('deckLegendaryCount', stats.rarities.legendary));
  leg.dataset.stat = 'legendary';
  summary.append(avg, leg);
  head.append(bars, summary);

  const tags = element('div', 'deck-curve-tags');
  const mechDefs: ReadonlyArray<{key: string; count: number; text: string}> = [
    {key: 'enhance', count: stats.mechanics.enhance, text: t('curveEnhance', stats.mechanics.enhance)},
    {key: 'enfeeble', count: stats.mechanics.enfeeble, text: t('curveEnfeeble', stats.mechanics.enfeeble)},
    {key: 'destroy', count: stats.mechanics.destroy, text: t('curveDestroy', stats.mechanics.destroy)},
    {key: 'spawn', count: stats.mechanics.spawn, text: t('curveSpawn', stats.mechanics.spawn)},
    {key: 'replace', count: stats.mechanics.replace, text: t('curveReplace', stats.mechanics.replace)},
  ];
  for (const mech of mechDefs) {
    if (mech.count <= 0) continue;
    const pill = element('span', `deck-curve-pill deck-curve-pill--${mech.key}`, mech.text);
    pill.dataset.mechanic = mech.key;
    tags.append(pill);
  }

  host.dataset.total = String(stats.total);
  if (tags.children.length) host.replaceChildren(head, tags);
  else host.replaceChildren(head);
}

export function browseCard(entry: LibraryEntry, face: HTMLElement, focus: () => void, activate: () => void) {
  const item = button('', activate, 'd4-card-button');
  item.dataset.cardId = String(entry.id);
  item.setAttribute('aria-label', t("inspectCardLabel", cardNumber(entry.id), face.getAttribute('aria-label') ?? entry.name));
  item.onfocus = focus;
  item.append(face);
  return item;
}

export function renderDeckSlots(
  host: HTMLElement,
  cards: readonly number[],
  visual: (id: number) => CardVisual,
  select: (slot: number, activate: boolean) => void,
) {
  host.replaceChildren();
  for (let slot = 0; slot < 15; slot++) {
    const card = byId.get(cards[slot]);
    const item = element('div', 'd4-slot');
    if (card) {
      const face = createCardView(card, visual(card.id), {variant: 'hand', lazy: true});
      const entry = {id: card.id, name: card.name, rarity: card.rarity, card};
      const control = browseCard(entry, face, () => select(slot, false), () => select(slot, true));
      control.dataset.slot = String(slot);
      item.append(control, element('span', 'd4-slot-code', cardNumber(card.id)));
    } else {
      const empty = element('div', 'd4-empty-slot', t("empty"));
      empty.setAttribute('aria-label', t("emptyDeckSlot", slot + 1));
      item.append(empty);
    }
    host.append(item);
  }
}

export function bindDeckGridKeys(grid: HTMLElement) {
  grid.addEventListener('keydown', event => {
    if (!(event.target instanceof HTMLButtonElement)) return;
    const cards = Array.from(grid.querySelectorAll<HTMLButtonElement>('.d4-card-button'));
    const index = cards.indexOf(event.target);
    if (index < 0) return;
    const columns = getComputedStyle(grid).gridTemplateColumns.split(' ').length;
    const offsets: Record<string, number> = {ArrowLeft: -1, ArrowRight: 1, ArrowUp: -columns, ArrowDown: columns};
    const offset = offsets[event.key];
    if (offset === undefined) return;
    event.preventDefault();
    cards[index + offset]?.focus();
  });
}

export function mountDeckInspector(
  host: HTMLElement,
  showCard: (id: number) => void,
  edits?: {add: (id: number) => void; remove: () => void},
) {
  let current: LibraryEntry | undefined;
  let rendered: Card | null | undefined;
  let renderedLocale: string;
  const body = element('div', 'd4-inspector-body');
  const count = element('p', 'd4-copy-count');
  const reason = element('p', 'warning d4-limit');
  const controls = element('div', 'button-row d4-inspector-actions');
  const details = button(t("fullDetails"), () => { if (current) showCard(current.id); });
  details.dataset.cardDetails = '';
  const add = button(t("addOne"), () => { if (current) edits?.add(current.id); }, 'primary');
  const remove = button(t("removeOne"), () => edits?.remove());
  if (edits) {
    add.id = 'deckAdd';
    remove.id = 'deckRemove';
    controls.append(add, remove);
  }
  controls.append(details);
  host.append(body, count, reason, controls);

  return {
    update(entry: LibraryEntry | undefined, cards: readonly number[]) {
      details.textContent=t('fullDetails');add.textContent=t('addOne');remove.textContent=t('removeOne');
      const locale=getLocale();
      if (renderedLocale!==locale || entry?.id !== current?.id || entry?.card !== rendered || !body.firstChild) {
        rendered = entry?.card;renderedLocale=locale;
        body.replaceChildren();
        if (entry?.card) {
          const detail = createCardDetails(entry.card);
          if (entry.card.placement === 'replace') detail.querySelector('dd')!.textContent = t("replaceAnAlliedCard");
          if (entry.rarity === 'token') detail.querySelector('h3')!.textContent = t("tokenDetailsHeading", cardNumber(entry.id), displayName(entry.id,entry.name));
          body.append(detail);
        } else {
          body.append(element('p', 'muted', entry ? t("cardDataMissing", cardNumber(entry.id), displayName(entry.id,entry.name)) : t("selectACardToViewItsDetails")));
        }
      }
      current = entry;
      const availability = entry ? deckCardAvailability(cards, entry.id) : null;
      count.hidden = !availability;
      count.textContent = availability ? t("deckCopyCounts", availability.count, edits ? t("copiesAvailableSuffix", availability.available) : '') : '';
      reason.hidden = !edits || !availability?.reason;
      reason.textContent = availability?.reason ?? '';
      const focused = document.activeElement;
      add.disabled = !availability || availability.available === 0;
      remove.disabled = !availability?.count;
      details.disabled = !entry;
      if ((focused === add && add.disabled || focused === remove && remove.disabled) && !details.disabled) {
        details.focus({preventScroll: true});
      }
    },
  };
}
