import 'server-only';
import { RETENTION_DE } from '../../../content/de/retention';
import { RETENTION_EN, type RetentionCopy } from '../../../content/retention';
import type { Locale } from '@/lib/i18n/locale';

/** The Retention page's words in a language. Server only: a client island gets the strings it prints as props. */
export function retentionCopy(locale: Locale): RetentionCopy {
  return locale === 'de' ? RETENTION_DE : RETENTION_EN;
}
