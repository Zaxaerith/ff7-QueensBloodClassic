import {getLocale,t} from './i18n/index.js';
import {displayName} from './i18n/card-names.js';
import {byId, type Card} from './cards.js';
import {createCardDetails, createCardView} from './card-view.js';
import {deckCardAvailability, type LibraryEntry} from './ui-data.js';
import {button, element} from './ui-dom.js';
import type {CardVisual} from './visuals.js';

export const cardNumber = (id: number) => `#${String(id).padStart(3, '0')}`;

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
