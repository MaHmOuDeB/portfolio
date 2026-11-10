// The one small-count rule for every count the Home page prints, the same as the published data's:
// a per-group count from 1 to 4 prints as "<5", 0 prints as 0 (a zero identifies no one), and 5 and
// above print exactly. Client-safe: it reads the pre-registered values only.
import { EXPERIMENT } from '../../experiment.values.ts';

/** A count as the page may print it. */
export type PublishedCount = number | '<5';

export function publishedCount(n: number): PublishedCount {
  if (EXPERIMENT.smallCellBelow !== 5) throw new TypeError('the published small-count label is "<5"');
  if (!Number.isSafeInteger(n) || n < 0) throw new TypeError(`a count must be a whole number of views, got ${String(n)}`);
  return n >= 1 && n < EXPERIMENT.smallCellBelow ? '<5' : n;
}
