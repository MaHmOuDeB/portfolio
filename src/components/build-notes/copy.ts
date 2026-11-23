import 'server-only';
import { BUILD_NOTE_TEXT_DE } from '../../../content/de/build-notes';
import type { Locale } from '@/lib/i18n/locale';
import { BUILD_NOTE_TEXT_EN, type BuildNoteText } from './text';

/** The build-note frame's words in a language. Server only. */
export function buildNoteText(locale: Locale): BuildNoteText {
  return locale === 'de' ? BUILD_NOTE_TEXT_DE : BUILD_NOTE_TEXT_EN;
}
