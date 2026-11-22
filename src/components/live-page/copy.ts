import 'server-only';
import { LIVE_DE } from '../../../content/de/live';
import { LIVE_EN, type LiveCopy } from '../../../content/live';
import type { Locale } from '@/lib/i18n/locale';

/** The Live test page's words in a language. Server only: this page has no client island. */
export function liveCopy(locale: Locale): LiveCopy {
  return locale === 'de' ? LIVE_DE : LIVE_EN;
}
