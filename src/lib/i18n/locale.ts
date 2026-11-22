export const LOCALES = ['en', 'de'] as const;

/** The site's languages: English at the unprefixed addresses, German under /de. */
export type Locale = (typeof LOCALES)[number];

/** The Intl tag of each language: the one place a formatter learns it. */
export const INTL: Record<Locale, 'en-GB' | 'de-DE'> = { en: 'en-GB', de: 'de-DE' };

export function isLocale(v: unknown): v is Locale {
  return typeof v === 'string' && (LOCALES as readonly string[]).includes(v);
}
