import {getLocale, hasActiveLocale} from './index.js';
import type {Locale} from './locales.js';
import {termData, termSources} from './terms-data.js';

export type TermStatus = 'guide' | 'provisional' | 'fallback' | 'official';
export type SourceType = 'guide' | 'wiki' | 'official-gameplay' | 'project-reference';
export type TermSource = readonly [url: string, type: SourceType];
export type TermRow = readonly [name: string, source: keyof typeof termSources, status: TermStatus];
export const terms: Record<Locale, Readonly<Partial<Record<string, TermRow>>>> = termData;

export function termRecord(id: number | string, locale: Locale) {
  const row = terms[locale][id];
  if (!row) return undefined;
  const [name, source, status] = row;
  const [url, type] = termSources[source];
  return {
    id, locale, name, sourceUrl: url, sourceType: status === 'provisional' ? 'provisional-translation' : type,
    referenceType: type, status,
  };
}

export function localizedName(id: number | string, original: string, locale: Locale = getLocale()): string {
  return terms[locale][id]?.[0] ?? original;
}

export function displayName(id: number, original = ''): string {
  return hasActiveLocale() ? localizedName(id, original) : original;
}

function normalizeName(value: string, locale: Locale): string {
  return value.normalize('NFKD').replace(/\p{Mark}/gu, '').toLocaleLowerCase(locale);
}

export function matchesCardName(id: number, original: string, input: string, locale: Locale = getLocale()): boolean {
  const query = normalizeName(input.trim(), locale);
  if (/^#?\d+$/.test(query)) return id === Number(query.replace('#', ''));
  return [localizedName(id, original, locale), original, localizedName(id, original, 'en')]
    .some(name => normalizeName(name, locale).includes(query));
}
