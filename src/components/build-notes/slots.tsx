// What a build note's copy is given to put a number where its grammar wants it: a <Fact> in the
// page's language. A note adds its own slots (a derived number, a year) on top of these. Server-safe.
import { cloneElement, isValidElement, type ReactNode } from 'react';
import { Fact } from '@/components/kit/Fact';
import type { FactId } from '@/lib/facts';
import type { Locale } from '@/lib/i18n/locale';

export type NoteSlots = {
  locale: Locale;
  /** A number from the facts data, written in the page's language. */
  fact: (id: FactId) => ReactNode;
};

/** The English form passes no locale to <Fact>, so the English markup is the one it always was. */
export function noteSlots(locale: Locale): NoteSlots {
  return { locale, fact: (id) => <Fact id={id} locale={locale === 'de' ? 'de' : undefined} /> };
}

/** The `locale` prop of a number element: German only, so the English markup stays as it was. */
export const numberLocale = (locale: Locale): Locale | undefined => (locale === 'de' ? 'de' : undefined);

/** A title-and-body list in the order a note draws it. */
export type Items = readonly [key: string, body: ReactNode][];

/** The items with each body keyed by its own key, so a list of elements never reaches React keyless. */
export function keyed(items: Items): Items {
  return items.map(([key, body]) => [key, isValidElement(body) ? cloneElement(body, { key }) : body]);
}
