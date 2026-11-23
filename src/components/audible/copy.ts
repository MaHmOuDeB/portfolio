import 'server-only';
import { AUDIBLE_DE } from '../../../content/de/audible';
import { AUDIBLE_EN, type AudibleCopy } from '../../../content/audible';
import type { Locale } from '@/lib/i18n/locale';

/** The Audible page's words in a language. Server only: the ship-rule island gets the words it prints as props. */
export function audibleCopy(locale: Locale): AudibleCopy {
  return locale === 'de' ? AUDIBLE_DE : AUDIBLE_EN;
}
