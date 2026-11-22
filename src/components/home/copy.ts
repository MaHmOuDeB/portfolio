import 'server-only';
import { HOME_DE } from '../../../content/de/home';
import { HOME_EN, type HomeCopy } from '../../../content/home.ts';
import type { Locale } from '@/lib/i18n/locale';

/** The Home parts' words in a language. Server only: a client component gets the strings it prints as props. */
export function homeCopy(locale: Locale): HomeCopy {
  return locale === 'de' ? HOME_DE : HOME_EN;
}
