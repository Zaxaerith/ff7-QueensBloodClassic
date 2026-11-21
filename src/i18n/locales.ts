export const locales = ['zh-CN', 'zh-TW', 'en', 'ja', 'ko', 'fr', 'de', 'it', 'es-ES', 'es-419', 'pt-BR'] as const;
export type Locale = typeof locales[number];
export const defaultLocale: Locale = 'zh-CN';
export const localeLabels: Record<Locale, string> = {
  'zh-CN': '简体中文',
  'zh-TW': '繁體中文',
  en: 'English',
  ja: '日本語',
  ko: '한국어',
  fr: 'Français',
  de: 'Deutsch',
  it: 'Italiano',
  'es-ES': 'Español (España)',
  'es-419': 'Español (Latinoamérica)',
  'pt-BR': 'Português (Brasil)',
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && locales.some(locale => locale === value);
}

export function resolveLocale(preferred: readonly string[]): Locale {
  for (const language of preferred) {
    try {
      const tag = new Intl.Locale(language.replaceAll('_', '-'));
      const exact = locales.find(locale => locale.toLowerCase() === tag.baseName.toLowerCase());
      if (exact) return exact;
      const {language: base, region, script} = tag;
      if (base === 'zh') return (script ?? tag.maximize().script) === 'Hant' ? 'zh-TW' : 'zh-CN';
      if (base === 'es') return !region || region === 'ES' ? 'es-ES' : 'es-419';
      if (base === 'pt') return 'pt-BR';
      if (isLocale(base)) return base;
    } catch {
      // Continue through the browser's language list if a tag is malformed.
    }
  }
  return defaultLocale;
}
