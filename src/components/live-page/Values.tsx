// Small marked values the Live test page prints: a text value from the build or the data (a tag, a
// hash, a commit, a version) as <data> with its refs, and a Berlin date as <time>.
// Server-safe, no hooks.
import { derivedAttr, type DerivedRef } from '@/components/kit/Derived';
import { berlinDate } from '@/lib/figure/time';

export const BUILD: readonly DerivedRef[] = ['build'];

/** A text value (it may hold digits) marked with where it comes from. */
export function MarkedText({ value, refs, shown }: { value: string; refs: readonly DerivedRef[]; shown?: string }) {
  return (
    <data value={value} {...derivedAttr(refs)}>
      {shown ?? value}
    </data>
  );
}

/** An instant (ISO with an offset) as its Berlin date. */
export function When({ iso, refs }: { iso: string; refs: readonly DerivedRef[] }) {
  return (
    <time dateTime={iso} {...derivedAttr(refs)}>
      {berlinDate(iso)}
    </time>
  );
}

/** Where a Figure's numbers come from, for its badge: only store data is live. */
export const provenanceOf = (refs: readonly DerivedRef[]) => (refs.includes('live') ? 'live' : 'simulated') as 'live' | 'simulated';
