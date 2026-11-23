// The slots a piece of copy is written with (content/about.tsx `Slots`): a figure as an element in the
// page's language. A node (English copy) passes through unchanged; a function is called with the slots.
import type { ReactNode } from 'react';
import { Derived } from '@/components/kit/Derived';
import { Fact } from '@/components/kit/Fact';
import type { Locale } from '@/lib/i18n/locale';
import { WINDOW_DAYS } from '@/lib/retention/rfm';
import type { Body, Slots } from '../../../content/about';

export function slotsFor(locale: Locale): Slots {
  return {
    fact: (id, decimals) => <Fact id={id} decimals={decimals} locale={locale} />,
    windowDays: () => <Derived value={WINDOW_DAYS} unit="count" refs={['source:retention']} locale={locale} />,
  };
}

/** The copy as a node, in the page's language. */
export function body(b: Body, locale: Locale): ReactNode {
  return typeof b === 'function' ? b(slotsFor(locale)) : b;
}
