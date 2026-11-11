// Snapshots for the Home scroll moment's states beyond one per mode: low and enough data in each
// phase, the small counts, stopped tests with too little data, closures and their mixes. Built
// like the mode fixtures (src/lib/home/fixtures.ts): the real snapshot builder over hand-written day
// rows, and a top-level override only where the builder cannot reach a state the reader can give.
// For the unit tests and the dev host; the data is fictional and never shown on a production page.
import { NO_FLAGS } from '@/lib/experiment/flags';
import type { ExperimentSnapshot } from '@/lib/experiment/snapshot';
import { plannedEnd } from '@/lib/experiment/time';
import { FIXTURE_START } from '@/experiment.config';
import { FIXTURE_AB, FIXTURE_CALIBRATION, buildFixture, snapshotFixture, type FixtureRow } from './fixtures';

const CALIBRATION_NOW = '2026-11-20T10:00:00Z';
const AB_NOW = '2026-12-03T12:00:00+01:00';
const AB_END = plannedEnd(FIXTURE_AB, FIXTURE_START).at;
/** One second after the A/B's planned end: inside the analysis margin, before the last look. */
const IN_MARGIN = new Date(Date.parse(AB_END) + 1000).toISOString();
const AFTER_END = '2027-06-02T12:00:00+02:00';
const PAUSE = { on: '2026-11-10T09:00:00+01:00', reason: 'I am updating the page' };

/** Analysed views `inview` with no card clicks; entry views 20 more unless given. */
const views = (inview: number, entry = inview + 20) => ({ entry, inview, engaged: inview, card: 0 });
const day = (d: string, a: number, b: number): FixtureRow => ({ day: d, a: views(a), b: views(b) });

const calibration = (rows: readonly FixtureRow[], paused = false) =>
  buildFixture({ config: FIXTURE_CALIBRATION, now: CALIBRATION_NOW, rows, flags: paused ? { ...NO_FLAGS, paused: PAUSE } : NO_FLAGS });
const ab = (rows: readonly FixtureRow[], now = AB_NOW) => buildFixture({ config: FIXTURE_AB, now, rows });

export const NARRATIVE_FIXTURES = [
  'calibration-under-50',
  'calibration-asymmetric',
  'calibration-tiny',
  'calibration-ready',
  'ab-under-50',
  'ab-asymmetric',
  'ab-tiny',
  'ab-zero-sixty',
  'srm-zero-sixty',
  'ab-due',
  'srm-one-sided-small',
  'paused-tiny',
  'paused-under-50',
  'held-under-50',
  'held-enough-no-look',
  'held-srm',
  'closed-under-50',
  'final-low',
  'ship-b-confirmed',
  'ship-b-late-srm',
  'stale',
  'paused-aa-failed',
  'paused-srm',
  'paused-ship-b',
] as const;
export type NarrativeFixture = (typeof NARRATIVE_FIXTURES)[number];

/** A snapshot in the named state. */
export function narrativeFixture(name: NarrativeFixture): ExperimentSnapshot {
  switch (name) {
    case 'calibration-under-50':
      return calibration([day('2026-11-03', 30, 40)]);
    case 'calibration-asymmetric':
      return calibration([day('2026-11-03', 49, 60)]);
    case 'calibration-tiny':
      return calibration([day('2026-11-03', 1, 4)]);
    case 'calibration-ready': {
      // The calibration fixture with its checks passed (the builder needs two weeks of looks for that).
      const s = snapshotFixture('calibration');
      return { ...s, calibration: { ...s.calibration!, ready: true, evaluatedOn: '2026-11-16' } };
    }
    case 'ab-under-50':
      return ab([day('2026-12-01', 20, 30)]);
    case 'ab-asymmetric':
      return ab([day('2026-12-01', 49, 60)]);
    case 'ab-tiny':
      return ab([day('2026-12-01', 1, 4)]);
    case 'ab-zero-sixty': {
      // No analysed view yet in A and 60 in B, while the test runs (counts as the reader may give
      // them between looks; as day rows the split check would flag them, see srm-zero-sixty).
      const s = ab([day('2026-12-01', 20, 30)]);
      return { ...s, live: { ...s.live, nA: 0, nB: 60, series: [] } };
    }
    case 'srm-zero-sixty':
      return ab([day('2026-12-01', 0, 60)]);
    case 'ab-due':
      // Both groups past 50 on a day that is not completed yet: no look, so nothing to draw.
      return ab([day('2026-12-03', 60, 60)]);
    case 'srm-one-sided-small':
      // Entry views split 60 to 4 (flagged), analysed views 3 and 2.
      return ab([{ day: '2026-12-01', a: views(3, 60), b: views(2, 4) }]);
    case 'paused-tiny':
      return calibration([day('2026-11-03', 3, 2)], true);
    case 'paused-under-50':
      return calibration([day('2026-11-03', 20, 30)], true);
    case 'held-under-50':
      // A clean first day under 50, then more card clicks than views: held at the last clean look.
      return ab([day('2026-12-01', 20, 20), { day: '2026-12-02', a: { entry: 10, inview: 5, engaged: 5, card: 100 }, b: views(5, 10) }]);
    case 'held-enough-no-look': {
      // A held test whose last clean look has 50 views a group but no interval to draw.
      const s = snapshotFixture('held');
      const live = { ...s.live, nA: 60, nB: 60, series: [] };
      delete live.guardrail;
      return { ...s, live };
    }
    case 'held-srm':
      // Held on 02.12, where the entry split is flagged too.
      return ab([day('2026-12-01', 50, 50), { day: '2026-12-02', a: { entry: 300, inview: 5, engaged: 5, card: 100 }, b: views(5, 20) }]);
    case 'closed-under-50':
      // The A/B's planned end has passed, but its last look is not in yet: phase still ab.
      return ab([day('2026-12-01', 20, 30)], IN_MARGIN);
    case 'final-low':
      return ab([day('2026-12-01', 20, 30)], AFTER_END);
    case 'ship-b-confirmed':
      return snapshotFixture('ship-b', { closed: { kind: 'decision', day: '2026-12-01' } });
    case 'ship-b-late-srm': {
      const s = snapshotFixture('ship-b', { closed: { kind: 'decision', day: '2026-12-01' } });
      return { ...s, srm: { ...s.srm, afterDecision: true } };
    }
    case 'stale': {
      const s = snapshotFixture('ab');
      return { ...s, live: { ...s.live, freshness: { kind: 'stale', updatedAt: s.readAt, renderedAt: '2026-12-03T14:00:00+01:00' } } };
    }
    case 'paused-aa-failed': {
      const s = snapshotFixture('aa-failed');
      return { ...s, live: { ...s.live, freshness: { kind: 'paused', pausedOn: PAUSE.on, reason: PAUSE.reason } } };
    }
    case 'paused-srm': {
      const s = snapshotFixture('srm-suppressed');
      return { ...s, live: { ...s.live, freshness: { kind: 'paused', pausedOn: PAUSE.on, reason: PAUSE.reason } } };
    }
    case 'paused-ship-b': {
      const s = snapshotFixture('ship-b');
      return { ...s, live: { ...s.live, freshness: { kind: 'paused', pausedOn: '2026-12-02T09:00:00+01:00', reason: PAUSE.reason } } };
    }
  }
}
