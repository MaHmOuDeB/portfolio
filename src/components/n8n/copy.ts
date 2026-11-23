import 'server-only';
import { N8N_DE } from '../../../content/de/n8n';
import { N8N_EN, type N8nCopy } from '../../../content/n8n';
import type { Locale } from '@/lib/i18n/locale';

/** The n8n note's words in a language. Server only. */
export function n8nCopy(locale: Locale): N8nCopy {
  return locale === 'de' ? N8N_DE : N8N_EN;
}
