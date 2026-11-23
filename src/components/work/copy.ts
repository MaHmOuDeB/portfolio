import 'server-only';
import { WORK_DE } from '../../../content/de/work';
import { WORK_EN, type WorkCopy } from '../../../content/work';
import type { Locale } from '@/lib/i18n/locale';

/** The Work page's words in a language. Server only. */
export function workCopy(locale: Locale): WorkCopy {
  return locale === 'de' ? WORK_DE : WORK_EN;
}
