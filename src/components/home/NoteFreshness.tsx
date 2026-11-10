'use client';
// The "as of" time under the active test note, by the reader's clock. A cached page can outlive its
// data (regeneration can keep failing) and the A/B's planned end, and only the reader's clock can
// tell. On the server and before hydration it renders nothing; after hydration it adds the kit's
// updated label when the data is stale or the planned end has passed. It takes named props only,
// never the Home model.
import { useSyncExternalStore } from 'react';
import type { DerivedRef } from '@/components/kit/Derived';
import { UpdatedLabel } from '@/components/kit/LiveLabels';
import { viewFreshnessAt } from '@/lib/experiment/freshness';
import type { Freshness } from '@/lib/figure/states';

type Timing = { readAt: string; freshness: Freshness; plannedEnd: string };
type Props = Timing & { refs: readonly DerivedRef[] };

/** True when the note needs its time at `nowIso`: stale data, or the planned end reached. */
export function asOfAt(t: Timing, nowIso: string): boolean {
  const f = viewFreshnessAt({ readAt: t.readAt, snapshot: { freshness: t.freshness } }, nowIso);
  return f.kind === 'stale' || Date.parse(nowIso) >= Date.parse(t.plannedEnd);
}

/** The label at a given client time; null (the server, before hydration) renders nothing. */
export function NoteFreshnessView({ nowIso, refs, ...t }: Props & { nowIso: string | null }) {
  if (nowIso === null || !asOfAt(t, nowIso)) return null;
  return (
    <p className="mt-2">
      <UpdatedLabel updatedAt={t.readAt} renderedAt={nowIso} refs={refs} />
    </p>
  );
}

// The client clock as an external store, to the second, re-read every 15 seconds.
const TICK_MS = 15_000;
function subscribe(onChange: () => void): () => void {
  const timer = setInterval(onChange, TICK_MS);
  return () => clearInterval(timer);
}
const clientSecond = () => Math.floor(Date.now() / 1000) * 1000;
const serverSecond = () => null;

export function NoteFreshness(props: Props) {
  const now = useSyncExternalStore(subscribe, clientSecond, serverSecond);
  return <NoteFreshnessView {...props} nowIso={now === null ? null : new Date(now).toISOString()} />;
}
