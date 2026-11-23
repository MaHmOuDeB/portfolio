import 'server-only';
import { ABOUT_DE, CV_DE } from '../../../content/de/about';
import { LANGUAGES_DE } from '../../../content/de/languages';
import { ABOUT_EN, CV_EN, LANGUAGES, type AboutCopy, type CvCopy } from '../../../content/about';
import type { Locale } from '@/lib/i18n/locale';

/** The About page's words in a language. Server only. */
export function aboutCopy(locale: Locale): AboutCopy {
  return locale === 'de' ? ABOUT_DE : ABOUT_EN;
}

/** The CV page's words in a language. Server only. */
export function cvCopy(locale: Locale): CvCopy {
  return locale === 'de' ? CV_DE : CV_EN;
}

/** The language list in a language (German stays at B1). */
export function languagesIn(locale: Locale): readonly { language: string; level: string }[] {
  return locale === 'de' ? LANGUAGES_DE : LANGUAGES;
}
