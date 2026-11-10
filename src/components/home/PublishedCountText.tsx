// A count as the page prints it (publishedCount): a number through Derived, "<5" as a marked span.
// Server-safe, no hooks. Every printed count on the Home page goes through this component.
import { Derived, derivedAttr, type DerivedRef } from '@/components/kit/Derived';
import type { PublishedCount } from '@/lib/home/counts';

export function PublishedCountText({ value, refs }: { value: PublishedCount; refs: readonly DerivedRef[] }) {
  if (value === '<5') {
    return (
      <span data-num="" {...derivedAttr(refs)}>
        &lt;5
      </span>
    );
  }
  return <Derived value={value} unit="count" refs={refs} />;
}
