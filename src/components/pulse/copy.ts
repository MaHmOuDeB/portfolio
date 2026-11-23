import 'server-only';
import { PULSE_DE } from '../../../content/de/pulse';
import { PULSE_EN, type PulseCopy } from '../../../content/pulse';
import type { Locale } from '@/lib/i18n/locale';

/** The Pulse page's words in a language. Server only: the dashboard island gets the words it prints as props. */
export function pulseCopy(locale: Locale): PulseCopy {
  return locale === 'de' ? PULSE_DE : PULSE_EN;
}
