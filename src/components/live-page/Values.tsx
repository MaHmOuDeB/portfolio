// Small marked values the Live test page prints: a text value from the build or the data (a tag, a
// hash, a commit, a version) as <data> with its refs, and a Berlin date as <time>.
// Server-safe, no hooks.
import { Derived, derivedAttr, type DerivedRef } from '@/components/kit/Derived';
import { berlinDate, berlinDateYear } from '@/lib/figure/time';
import type { PublishedCount } from '@/lib/home/counts';
import type { Locale } from '@/lib/i18n/locale';

export const BUILD: readonly DerivedRef[] = ['build'];

/** A text value (it may hold digits) marked with where it comes from. */
export function MarkedText({ value, refs, shown }: { value: string; refs: readonly DerivedRef[]; shown?: string }) {
  return (
    <data value={value} {...derivedAttr(refs)}>
      {shown ?? value}
    </data>
  );
}

/** An instant (ISO with an offset) as its Berlin date; `withYear` adds the year for a date that needs it. */
export function When({ iso, refs, withYear = false, locale = 'en' }: { iso: string; refs: readonly DerivedRef[]; withYear?: boolean; locale?: Locale }) {
  return (
    <time dateTime={iso} {...derivedAttr(refs)}>
      {withYear ? berlinDateYear(iso) : berlinDate(iso, { locale })}
    </time>
  );
}

/** A published count (a number through Derived, "<5" as a marked span), in the page's language. */
export function Count({ value, refs, locale = 'en' }: { value: PublishedCount; refs: readonly DerivedRef[]; locale?: Locale }) {
  if (value === '<5') {
    return (
      <span data-num="" {...derivedAttr(refs)}>
        &lt;5
      </span>
    );
  }
  return <Derived value={value} unit="count" refs={refs} locale={locale} />;
}

/** Where a Figure's numbers come from, for its badge: only store data is live. */
export const provenanceOf = (refs: readonly DerivedRef[]) => (refs.includes('live') ? 'live' : 'simulated') as 'live' | 'simulated';
