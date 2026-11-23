import 'server-only';
import { DOCPROOF_DE } from '../../../content/de/docproof';
import { DOCPROOF_EN, type DocproofCopy } from '../../../content/docproof';
import type { Locale } from '@/lib/i18n/locale';

/** The Docproof note's words in a language. Server only. */
export function docproofCopy(locale: Locale): DocproofCopy {
  return locale === 'de' ? DOCPROOF_DE : DOCPROOF_EN;
}
