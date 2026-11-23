import { describe, expect, it } from 'vitest';
import { INTL, LOCALES, isLocale } from '@/lib/i18n/locale';

describe('locale', () => {
  it('lists the two languages and maps each to its Intl tag', () => {
    expect(LOCALES).toEqual(['en', 'de']);
    expect(INTL).toEqual({ en: 'en-GB', de: 'de-DE' });
  });

  it('narrows only the two known codes', () => {
    expect(isLocale('en')).toBe(true);
    expect(isLocale('de')).toBe(true);
    for (const v of ['fr', 'EN', '', 'de-DE', null, undefined, 3, {}]) expect(isLocale(v), String(v)).toBe(false);
  });
});
