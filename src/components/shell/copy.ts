import 'server-only';
import { SHELL_DE } from '../../../content/de/shell';
import { SHELL_EN, type ShellCopy } from '../../../content/shell';
import type { Locale } from '@/lib/i18n/locale';

/** The shell's words in a language. Server only: a client component gets the strings it prints as props. */
export function shellCopy(locale: Locale): ShellCopy {
  return locale === 'de' ? SHELL_DE : SHELL_EN;
}
