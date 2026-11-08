// How fresh live data is when a reader looks at it. Pure and client-safe (it imports only the
// pre-registered values and types), so a client island can label a page stale at view time: under
// ISR a server render is always minutes old at most, and old data shows only when regeneration
// keeps failing, which only the reader's clock can tell.
import { EXPERIMENT } from '../../experiment.values.ts';
import type { Freshness } from '../figure/states.ts';

/** A pause stays; data older than `staleAfterMinutes` is stale; otherwise fresh. */
export function freshnessFrom(
  o: { readAt: string; freshness: Freshness },
  nowIso: string,
  staleAfterMinutes: number = EXPERIMENT.staleAfterMinutes,
): Freshness {
  if (o.freshness.kind === 'paused') return o.freshness;
  const age = Date.parse(nowIso) - Date.parse(o.readAt);
  return age > staleAfterMinutes * 60_000 ? { kind: 'stale', updatedAt: o.readAt, renderedAt: nowIso } : { kind: 'fresh' };
}

/** The freshness of a page's live view (`readAt` and the kit snapshot it carries). */
export function viewFreshnessAt(
  view: { readAt: string; snapshot: { freshness: Freshness } },
  nowIso: string,
  staleAfterMinutes: number = EXPERIMENT.staleAfterMinutes,
): Freshness {
  return freshnessFrom({ readAt: view.readAt, freshness: view.snapshot.freshness }, nowIso, staleAfterMinutes);
}
