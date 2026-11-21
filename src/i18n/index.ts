import {defaultLocale, type Locale} from './locales.js';
import zhCN from './messages/zh-CN.js';
import zhTW from './messages/zh-TW.js';
import en from './messages/en.js';
import ja from './messages/ja.js';
import ko from './messages/ko.js';
import fr from './messages/fr.js';
import de from './messages/de.js';
import it from './messages/it.js';
import esES from './messages/es-ES.js';
import es419 from './messages/es-419.js';
import ptBR from './messages/pt-BR.js';

export type MessageKey = keyof typeof zhCN;
export type MessageCatalog = Record<MessageKey, string>;

let activeLocale: Locale | undefined;
export function setLocale(locale: Locale): void {
  activeLocale = locale;
}
export function getLocale(): Locale {
  return activeLocale ?? defaultLocale;
}
export function hasActiveLocale(): boolean {
  return activeLocale !== undefined;
}

const catalogs: Record<Locale, MessageCatalog> = {
  'zh-CN': zhCN,
  'zh-TW': zhTW,
  'en': en,
  'ja': ja,
  'ko': ko,
  'fr': fr,
  'de': de,
  'it': it,
  'es-ES': esES,
  'es-419': es419,
  'pt-BR': ptBR,
};
export const catalogFor = (locale: Locale): MessageCatalog => catalogs[locale];
export const messageSlots = /⟦(\d+)⟧/g;
export type MessageValue = string | number | undefined;

const missingText: Record<Locale, string> = {
  'zh-CN': '文字暂不可用',
  'zh-TW': '文字暫時無法顯示',
  en: 'Text unavailable',
  ja: 'テキストを表示できません',
  ko: '텍스트를 표시할 수 없습니다',
  fr: 'Texte indisponible',
  de: 'Text nicht verfügbar',
  it: 'Testo non disponibile',
  'es-ES': 'Texto no disponible',
  'es-419': 'Texto no disponible',
  'pt-BR': 'Texto indisponível',
};
function lookup(catalog: MessageCatalog, key: MessageKey): string | undefined {
  const message = Object.hasOwn(catalog, key) ? catalog[key] : undefined;
  return message?.trim() ? message : undefined;
}
export function translate(locale: Locale, key: MessageKey, ...values: MessageValue[]): string {
  const message = lookup(catalogFor(locale), key) ?? lookup(catalogFor(defaultLocale), key) ?? missingText[locale];
  return message.replace(messageSlots, (_, index: string) => String(values[Number(index)] ?? ''));
}
export function t(key: MessageKey, ...values: MessageValue[]): string {
  return translate(getLocale(), key, ...values);
}

export const localizedAttributes = ['aria-label', 'placeholder', 'title'] as const;
export function localizePage(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>('[data-i18n]').forEach(node => {
    node.textContent = t(node.dataset.i18n as MessageKey);
  });
  for (const attr of localizedAttributes) {
    const binding = 'data-i18n-' + attr;
    root.querySelectorAll<HTMLElement>('[' + binding + ']').forEach(node => {
      node.setAttribute(attr, t(node.getAttribute(binding) as MessageKey));
    });
  }
}
