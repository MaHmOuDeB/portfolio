// Snapshots for every Home mode, for the unit tests and the dev host. Built with the real snapshot
// builder over hand-written day rows, so every count, look and split result is one the analysis
// could give; the reader's own adjustments (placeholders, the stop freshness of unreadable settings
// and of a held test) are applied as the reader applies them, with its exported reason sentences.
// The data is fictional: it is never shown on a production page.
import { EXPERIMENT, FIXTURE_START, type ExperimentConfig } from '@/experiment.config';
import { EVENT_TYPES, REJECT_REASONS, type RejectReason } from '@/lib/experiment/events';
import { NO_FLAGS, type ExperimentFlags } from '@/lib/experiment/flags';
import { HELD_REASON, MALFORMED_REASON, NOT_STARTED_REASON, UNAVAILABLE_REASON } from '@/lib/experiment/live';
import { buildSnapshot, type ExperimentSnapshot } from '@/lib/experiment/snapshot';
import type { CounterRows, GroupCounts } from '@/lib/experiment/store';
import { berlinStartOfDay } from '@/lib/experiment/time';
import type { HomeMode } from './model';

/** The calibration, started at the fixture start. */
export const FIXTURE_CALIBRATION: ExperimentConfig = {
  ...EXPERIMENT,
  calibration: { ...EXPERIMENT.calibration, startedOn: FIXTURE_START },
} as ExperimentConfig;

/** The A/B, started on 1 December after that calibration. */
export const FIXTURE_AB: ExperimentConfig = {
  ...FIXTURE_CALIBRATION,
  phase: 'ab',
  namespace: 'ab-fixture',
  ab: { ...EXPERIMENT.ab, startedOn: '2026-12-01T00:00:00+01:00' },
} as ExperimentConfig;

const CALIBRATION_NOW = '2026-11-20T10:00:00Z';
const AB_NOW = '2026-12-03T12:00:00+01:00';
/** A day after the A/B's planned end (its start plus the six-month cap). */
const AFTER_END = '2027-06-02T12:00:00+02:00';

export type FixtureRow = { day: string; a: Partial<GroupCounts>; b: Partial<GroupCounts> };

const zeros = (): GroupCounts => Object.fromEntries(EVENT_TYPES.map((t) => [t, 0])) as GroupCounts;

function counters(rows: readonly FixtureRow[]): CounterRows {
  const days = rows.map((r) => ({ day: r.day, a: { ...zeros(), ...r.a }, b: { ...zeros(), ...r.b } })).sort((x, y) => (x.day < y.day ? -1 : 1));
  const totals = { a: zeros(), b: zeros() };
  for (const d of days) for (const arm of ['a', 'b'] as const) for (const t of EVENT_TYPES) totals[arm][t] += d[arm][t];
  return {
    days,
    rejections: Object.fromEntries(REJECT_REASONS.map((r) => [r, 0])) as Record<RejectReason, number>,
    rejectionsByDay: {},
    totals,
  };
}

/** A snapshot from day rows, with the reader's stop freshness for a held A/B. */
export function buildFixture(o: { config: ExperimentConfig; now: string; rows: readonly FixtureRow[]; flags?: ExperimentFlags }): ExperimentSnapshot {
  const start = o.config.calibration.startedOn ?? o.now;
  const s = buildSnapshot({ counters: counters(o.rows), flags: o.flags ?? NO_FLAGS, now: o.now, start, source: 'store', config: o.config });
  if (s.live.freshness.kind !== 'paused' && s.configPhase === 'ab' && s.held !== null && (s.status === 'ab' || s.status === 'inconclusive')) {
    return { ...s, live: { ...s.live, freshness: { kind: 'paused', pausedOn: berlinStartOfDay(s.held.on), reason: HELD_REASON[s.held.reason] } } };
  }
  return s;
}

/** A placeholder with no data, as the reader gives it. */
function placeholder(config: ExperimentConfig, now: string, why: 'not-started' | 'unreadable'): ExperimentSnapshot {
  const s = buildSnapshot({ counters: counters([]), flags: NO_FLAGS, now, start: config.calibration.startedOn ?? now, source: 'unavailable', config });
  const reason = why === 'not-started' ? NOT_STARTED_REASON : UNAVAILABLE_REASON;
  return { ...s, unavailable: why, live: { ...s.live, freshness: { kind: 'paused', pausedOn: now, reason } } };
}

const group = (inview: number, card: number, entry = inview + 20) => ({ entry, inview, engaged: inview, card });

function base(mode: HomeMode): ExperimentSnapshot {
  switch (mode) {
    case 'not-started':
      return placeholder(EXPERIMENT, CALIBRATION_NOW, 'not-started');
    case 'unavailable':
      return placeholder(FIXTURE_CALIBRATION, CALIBRATION_NOW, 'unreadable');
    case 'closure-check': {
      // A stored decision that the current analysis does not confirm: the reader's fallback.
      const day = '2026-12-02';
      const s = placeholder(FIXTURE_AB, AB_NOW, 'unreadable');
      return { ...s, closed: { kind: 'decision', day }, closureMismatch: true, frozenAt: day, live: { ...s.live, freshness: { kind: 'paused', pausedOn: berlinStartOfDay(day), reason: UNAVAILABLE_REASON } } };
    }
    case 'settings-unreadable': {
      const s = buildFixture({ config: FIXTURE_CALIBRATION, now: CALIBRATION_NOW, rows: [{ day: '2026-11-03', a: group(60, 9), b: group(60, 10) }] });
      return { ...s, live: { ...s.live, freshness: { kind: 'paused', pausedOn: CALIBRATION_NOW, reason: MALFORMED_REASON } } };
    }
    case 'held':
      return buildFixture({
        config: FIXTURE_AB,
        now: AB_NOW,
        rows: [
          { day: '2026-12-01', a: group(50, 5, 60), b: group(50, 6, 60) },
          // More card clicks than analysed views: a data fault.
          { day: '2026-12-02', a: group(5, 100, 10), b: group(5, 1, 10) },
        ],
      });
    case 'srm-suppressed':
      return buildFixture({ config: FIXTURE_AB, now: AB_NOW, rows: [{ day: '2026-12-01', a: group(50, 6, 120), b: group(50, 7, 60) }] });
    case 'aa-failed':
      return buildFixture({
        config: FIXTURE_CALIBRATION,
        now: CALIBRATION_NOW,
        rows: [{ day: '2026-11-03', a: group(60, 9), b: group(60, 10) }],
        flags: { ...NO_FLAGS, aaFailed: { on: '2026-11-06T09:00:00+01:00', reason: 'a script error dropped some views' } },
      });
    case 'paused':
      return buildFixture({
        config: FIXTURE_CALIBRATION,
        now: CALIBRATION_NOW,
        rows: [{ day: '2026-11-03', a: group(60, 9), b: group(60, 10) }],
        flags: { ...NO_FLAGS, paused: { on: '2026-11-10T09:00:00+01:00', reason: 'I am updating the page' } },
      });
    case 'before-data':
      return buildFixture({ config: FIXTURE_CALIBRATION, now: CALIBRATION_NOW, rows: [] });
    case 'calibration':
      return buildFixture({ config: FIXTURE_CALIBRATION, now: CALIBRATION_NOW, rows: [{ day: '2026-11-03', a: group(60, 9), b: group(60, 10) }] });
    case 'ab':
      return buildFixture({ config: FIXTURE_AB, now: AB_NOW, rows: [{ day: '2026-12-01', a: group(60, 9), b: group(70, 11) }] });
    case 'ship-b':
      return buildFixture({ config: FIXTURE_AB, now: AB_NOW, rows: [{ day: '2026-12-01', a: { entry: 600, inview: 300, engaged: 420, card: 30 }, b: { entry: 600, inview: 300, engaged: 432, card: 120 } }] });
    case 'stop-for-harm':
      return buildFixture({ config: FIXTURE_AB, now: AB_NOW, rows: [{ day: '2026-12-01', a: { entry: 600, inview: 300, engaged: 432, card: 120 }, b: { entry: 600, inview: 300, engaged: 420, card: 30 } }] });
    case 'inconclusive':
      return buildFixture({ config: FIXTURE_AB, now: AFTER_END, rows: [{ day: '2026-12-01', a: group(60, 9, 80), b: group(60, 10, 80) }] });
  }
}

/** A snapshot in `mode`; `overrides` replace top-level fields. */
export function snapshotFixture(mode: HomeMode, overrides: Partial<ExperimentSnapshot> = {}): ExperimentSnapshot {
  return { ...base(mode), ...overrides };
}
