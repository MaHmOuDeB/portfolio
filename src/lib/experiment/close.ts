// The closing check: once the counters call for it (the first decision, a failed calibration, or an
// A/B held at a data fault), the closed marker is written and the event route stops counting. The
// marker only stops writes: the snapshot builder freezes the analysis at the deciding look by
// itself, so an event counted between the look and the marker changes nothing that is reported.
//
// When it runs. A day becomes a look pvTtlSeconds plus a minute after the next Berlin midnight
// (00:31), when its views' later events can no longer arrive. The check therefore runs where the
// data is next read after that, never on a clock of its own:
// - on the read path (getExperimentSnapshot), after the response, whenever the snapshot it built
//   calls for a marker: the first page regeneration after 00:31 closes. Every counted entry comes
//   from a visit to `/`, which regenerates the page once its 5 minutes are up;
// - from the event route, after the day's first counted entry (`onNewDay`), which closes on any look
//   completed before it (it runs before 00:31, so never on the day that just ended).
// At the A/B's planned end the route refuses every event by itself, so no marker is needed there.
// Writing is SET NX, so any number of checks writes the marker once. Server only.
import type { ExperimentConfig } from '../../experiment.config.ts';
import { NO_FLAGS, type ExperimentFlags } from './flags.ts';
import type { RedisRest } from './redis-rest.ts';
import { buildSnapshot, closingMarker } from './snapshot.ts';
import { readClosed, readCounters, writeClosed, type ClosedMarker } from './store.ts';

/** An error as a log category: never its message, which a fetch error could fill with a host. */
export function errorCategory(e: unknown): string {
  const name = e instanceof Error ? e.name : '';
  switch (name) {
    case 'RedisUnavailable':
      return 'store-unavailable';
    case 'CorruptCounters':
      return 'store-corrupt';
    case 'FlagsUnavailable':
      return 'flags-unavailable';
    default:
      return 'internal';
  }
}

/**
 * Reads the counters with the write client and sets the closed marker once a decision or an
 * A/A failure exists (or an A/B is held at a data fault). Returns the marker now stored, or null
 * when none is called for. Never throws (logs).
 */
export async function closeIfDecided(o: {
  write: RedisRest;
  ns: string;
  config: ExperimentConfig;
  start: string;
  now: string;
  log: (l: object) => void;
  /** The flags, for an A/A failed by the flag alone; without them only the rules close. */
  flags?: ExperimentFlags;
}): Promise<ClosedMarker | null> {
  try {
    const counters = await readCounters(o.write, o.ns);
    const snapshot = buildSnapshot({ counters, flags: o.flags ?? NO_FLAGS, now: o.now, start: o.start, source: 'store', config: o.config });
    const marker = closingMarker(snapshot);
    if (marker === null) return null;
    const wrote = await writeClosed(o.write, o.ns, marker);
    // A marker written first (by another check, or for another reason) stays as it is.
    const stored = wrote ? marker : ((await readClosed(o.write, o.ns)) ?? marker);
    o.log({ evt: 'close', outcome: wrote ? 'closed' : 'already-closed', kind: stored.kind, day: stored.day });
    return stored;
  } catch (e) {
    try {
      o.log({ evt: 'close', outcome: 'error', reason: errorCategory(e) });
    } catch {
      // A failing logger never makes the check throw.
    }
    return null;
  }
}
