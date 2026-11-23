import 'server-only';
import { LAB_DE } from '../../../content/de/lab';
import { LAB_EN, type LabCopy } from '../../../content/lab';
import type { Locale } from '@/lib/i18n/locale';

/** The Lab's words in a language. Server only: a client island gets the words it prints as props. */
export function labCopy(locale: Locale): LabCopy {
  return locale === 'de' ? LAB_DE : LAB_EN;
}
