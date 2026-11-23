// A month range as it prints on the About timeline and the CV: "Aug 2023 to Apr 2025" or
// "Oct 2026 to present" (a word, not a dash), each month in its own <time> (yyyy-mm). German month names
// come from Intl (short, as the glossary has them; the Home FAQ prints its own long names) and the two words from the page's copy. Server-safe, no hooks.
import type { ReactNode } from 'react';
import { INTL, type Locale } from '@/lib/i18n/locale';

/** A month as yyyy-mm. */
export type Month = `${number}-${number}`;
export type MonthRange = { from: Month; to: Month | null };

const NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/** The two words of a range: "to" and "present". */
export type RangeWords = { to: string; present: string };

function monthText(m: Month, locale: Locale): string {
  const [year, month] = m.split('-');
  const name = NAMES[Number(month) - 1];
  if (!year || !name || !/^\d{4}$/.test(year)) throw new Error(`months: "${m}" is not a yyyy-mm month`);
  if (locale === 'en') return `${name} ${year}`;
  return new Intl.DateTimeFormat(INTL[locale], { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(Date.UTC(Number(year), Number(month) - 1, 1));
}

function MonthTime({ m, locale }: { m: Month; locale: Locale }) {
  return <time dateTime={m}>{monthText(m, locale)}</time>;
}

/** `words` is required for a language other than English: the words are the page's copy. */
export function Months({ range, locale = 'en', words = { to: 'to', present: 'present' } }: { range: MonthRange; locale?: Locale; words?: RangeWords }): ReactNode {
  return (
    <>
      <MonthTime m={range.from} locale={locale} />{` ${words.to} `}{range.to ? <MonthTime m={range.to} locale={locale} /> : words.present}
    </>
  );
}
