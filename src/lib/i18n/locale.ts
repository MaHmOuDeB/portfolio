export const LOCALES = ['en', 'de'] as const;

/** The site's languages: English at the unprefixed addresses, German under /de. */
export type Locale = (typeof LOCALES)[number];
