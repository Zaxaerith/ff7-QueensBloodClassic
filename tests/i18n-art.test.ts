import {afterEach, describe, expect, test, vi} from 'vitest';
import {byId} from '../src/cards.js';
import {renderCardMarkup} from '../src/card-view.js';
import {setLocale} from '../src/i18n/index.js';
import {locales} from '../src/i18n/locales.js';
import {loadVisualPack} from '../src/visual-pack.js';
import {getCardVisual, type VisualManifest} from '../src/visuals.js';

// Synthetic metadata only: public tests never read or redistribute private PNGs.
const ids = Array.from({length:145}, (_, index) => index + 1);
const manifest: VisualManifest = {version:1, cards:ids.map(cardId => ({
  cardId, portraitPath:'classic/portraits/fixture-' + cardId + '.png',
}))};
const resolve = await loadVisualPack(async () => manifest);
const bindings = new Map(ids.map(id => [id, resolve(id)]));

afterEach(() => setLocale('zh-CN'));

describe('M8-A2.1 locale-independent artwork', () => {
  test.each(locales)('%s keeps every numeric art binding and the focus-card image sources', locale => {
    setLocale(locale);
    for (const id of ids) {
      expect(resolve(id)).toBe(bindings.get(id));
      expect(resolve(id).portraitPath).toBe('classic/portraits/fixture-' + id + '.png');
      expect(getCardVisual(id).portraitPath).toBeNull();
    }
    for (const id of [112, 122, 133]) {
      const card = byId.get(id)!;
      for (const variant of [undefined, 'hand', 'board'] as const) {
        const markup = renderCardMarkup(card, resolve(id), 0, {locale, ...(variant ? {variant} : {})});
        expect(markup).toContain('data-card-id="' + id + '"');
        expect(markup.match(/<img[^>]+src="([^"]+)"/)?.[1]).toBe(resolve(id).portraitPath);
        expect(markup).not.toContain('qb-art--missing');
      }
    }
  });

  test('a locale change while the manifest is loading does not discard its result', async () => {
    let deliver!: (value: VisualManifest) => void;
    const load = vi.fn(() => new Promise<VisualManifest>(done => { deliver = done; }));
    const pending = loadVisualPack(load);
    setLocale('ja');
    deliver(manifest);
    const loaded = await pending;
    for (const locale of locales) {
      setLocale(locale);
      for (const id of [112, 122, 133]) expect(loaded(id).portraitPath).toBe(resolve(id).portraitPath);
    }
    expect(load).toHaveBeenCalledOnce();
  });
});
