import 'server-only';
import { CONTACT_DE, ERRORS_DE } from '../../../content/de/contact';
import { CONTACT_EN, type ContactCopy } from '../../../content/contact';
import { ERRORS, type ErrorMessages } from '@/lib/contact/fields';
import type { Locale } from '@/lib/i18n/locale';

/** The contact page's words in a language. Server only: the form gets the strings it prints as props. */
export function contactCopy(locale: Locale): ContactCopy {
  return locale === 'de' ? CONTACT_DE : CONTACT_EN;
}

/** The form's validation messages in a language. */
export function contactErrors(locale: Locale): ErrorMessages {
  return locale === 'de' ? ERRORS_DE : ERRORS;
}
