import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import fc from 'fast-check';
import { EXPERIMENT, TAU2, type ExperimentConfig } from '@/experiment.config';
import { EVENT_TYPES, REJECT_REASONS, type RejectReason } from '@/lib/experiment/events';
import { NO_FLAGS, type ExperimentFlags } from '@/lib/experiment/flags';
import { createMemoryRedis } from '@/lib/experiment/memory-redis';
import { buildSnapshot, closingMarker, type ExperimentSnapshot } from '@/lib/experiment/snapshot';
import { readCounters, recordEvent, recordRejection, type CounterRows, type DayCounts, type GroupCounts } from '@/lib/experiment/store';
import { berlinStartOfDay } from '@/lib/experiment/time';
import { MIN_PER_GROUP } from '@/lib/figure/states';
import { binomial, detectableEffectCs, mixtureCs, sfc32 } from '@/lib/stats';

// Counters in, snapshot out. Every fixture below is a set of day rows as the store reads them back;
// `now` is always given, so nothing depends on the clock.

const START = '2026-11-02T00:00:00+01:00';
const AB_START = '2026-12-01T00:00:00+01:00';
const AB: ExperimentConfig = { ...EXPERIMENT, phase: 'ab', namespace: 'ab-v1', ab: { ...EXPERIMENT.ab, startedOn: AB_START } };

type G = Partial<GroupCounts>;
const zero = (): GroupCounts => Object.fromEntries(EVENT_TYPES.map((t) => [t, 0])) as GroupCounts;
const counts = (g: G = {}): GroupCounts => ({ ...zero(), ...g });
/** One group's day: `inview` analysed views and `card` clicks; entries default to the analysed views, engaged to the entries. */
const grp = (inview: number, card = 0, o: G = {}): G => {
  const entry = o.entry ?? inview;
  return { entry, inview, engaged: entry, card, ...o };
};
const row = (day: string, a: G, b: G): DayCounts => ({ day, a: counts(a), b: counts(b) });

function counters(days: DayCounts[], rejectionsByDay: CounterRows['rejectionsByDay'] = {}): CounterRows {
  const totals = { a: zero(), b: zero() };
  for (const d of days) for (const arm of ['a', 'b'] as const) for (const t of EVENT_TYPES) totals[arm][t] += d[arm][t];
  const rejections = Object.fromEntries(REJECT_REASONS.map((r) => [r, 0])) as Record<RejectReason, number>;
  for (const byReason of Object.values(rejectionsByDay)) for (const [r, n] of Object.entries(byReason)) rejections[r as RejectReason] += n ?? 0;
  return { days: [...days].sort((x, y) => (x.day < y.day ? -1 : 1)), rejections, rejectionsByDay, totals };
}

const built: ExperimentSnapshot[] = [];
function make(
  days: DayCounts[],
  o: { now: string; config?: ExperimentConfig; flags?: ExperimentFlags; rejectionsByDay?: CounterRows['rejectionsByDay'] },
): ExperimentSnapshot {
  const s = buildSnapshot({
    counters: counters(days, o.rejectionsByDay),
    flags: o.flags ?? NO_FLAGS,
    now: o.now,
    start: START,
    source: 'fixture',
    config: o.config,
  });
  return s;
}
/** `make`, keeping the snapshot for the serialisation check at the end. */
function build(...args: Parameters<typeof make>): ExperimentSnapshot {
  const s = make(...args);
  built.push(s);
  return s;
}

/** The A/B days used below, and a `now` in the middle of a day. */
const D1 = '2026-12-01';
const D2 = '2026-12-02';
const D3 = '2026-12-03';
const D4 = '2026-12-04';
const noon = (day: string) => `${day}T12:00:00+01:00`;

// A clear B win: 10% against 40% of 300 analysed views, and a quick-exit difference of -2 points
// at 600 entry views per group (guardrail upper bound about +0.06).
const WIN_A = grp(300, 30, { entry: 600, engaged: 420 });
const WIN_B = grp(300, 120, { entry: 600, engaged: 432 });
// The same primary, with 300 entry views and 40% quick exits in both groups (guardrail upper about +0.12).
const WIDE_A = grp(300, 30, { entry: 300, engaged: 180 });
const WIDE_B = grp(300, 120, { entry: 300, engaged: 180 });

describe('empty counters in calibration', () => {
  const s = build([], { now: '2026-11-20T12:00:00+01:00' });

  it('is before data, blinded, with no counts and no split check', () => {
    expect(s.phase).toBe('calibration');
    expect(s.live.phase).toBe('before-data');
    expect([s.live.nA, s.live.nB]).toEqual([0, 0]);
    expect(s.srm).toEqual({ assignment: null, analysed: null, firstFlaggedOn: null, afterDecision: false });
    expect(s.blinded).toBe(true);
    expect(s.live.series).toEqual([]);
    expect(s.looks).toEqual([]);
    expect(s.primary).toBeNull();
    expect(s.guardrail).toBeNull();
    expect(s.itt).toBeNull();
    expect(s.frozenAt).toBeNull();
  });

  it('gives the earliest end and an all-zero funnel', () => {
    expect(s.live.plannedEnd).toBe('2027-05-16T00:00:00+02:00');
    expect(s.live.plannedEndKind).toBe('earliest');
    expect(s.funnel).toEqual({
      beaconsReceived: 0,
      botFiltered: 0,
      entryViews: 0,
      analysed: 0,
      excluded: Object.fromEntries(REJECT_REASONS.map((r) => [r, 0])),
    });
  });

  it('carries the header fields', () => {
    expect(s.schema).toBe(1);
    expect(s.source).toBe('fixture');
    expect(s.readAt).toBe('2026-11-20T12:00:00+01:00');
    expect(s.namespace).toBe(EXPERIMENT.namespace);
    expect(s.live.capPerArm).toBe(EXPERIMENT.capPerArm);
    expect(s.live.freshness).toEqual({ kind: 'fresh' });
    expect(s.calibration?.analysed).toBe(0);
    expect(closingMarker(s)).toBeNull();
  });

  it('projects the half-width at the cap from the confidence sequence, in points', () => {
    const x = Math.round(EXPERIMENT.primary.planningBaseline * EXPERIMENT.capPerArm);
    const expected = mixtureCs({ xA: x, nA: 225, xB: x, nB: 225 }, { tau2: TAU2.primary }).halfWidth * 100;
    expect(s.live.projectedHalfWidthAtCap).toBe(expected);
    expect(s.live.projectedHalfWidthAtCap).toBeGreaterThan(5);
  });
});

describe('blinding', () => {
  it('hides everything while the smaller group has 49 analysed views', () => {
    const s = build([row('2026-11-03', grp(49, 5), grp(60, 9))], { now: '2026-11-05T09:00:00+01:00' });
    expect(s.live.phase).toBe('calibration');
    expect(s.blinded).toBe(true);
    expect(s.live.series).toEqual([]);
    expect(s.primary).toBeNull();
    expect(s.guardrail).toBeNull();
    expect(s.live.guardrail).toBeUndefined();
    expect(s.itt).toBeNull();
    expect([s.live.nA, s.live.nB]).toEqual([49, 60]);
    // The look is still recorded: the counts are not outcomes.
    expect(s.looks).toHaveLength(1);
  });
});

describe('completed looks only', () => {
  const days = [row(D1, grp(50, 5), grp(50, 6)), row(D2, WIN_A, WIN_B)];

  it('never decides on today\'s partial row', () => {
    const s = build(days, { now: noon(D2), config: AB });
    expect(s.live.phase).toBe('ab');
    expect(s.frozenAt).toBeNull();
    expect(s.looks.map((l) => l.day)).toEqual([D1]);
    expect(s.live.series).toHaveLength(1);
    expect(s.live.series[0]!.n).toBe(50);
    // The counts are current: the partial day is included.
    expect([s.live.nA, s.live.nB]).toEqual([350, 350]);
    expect(s.current.a.inview).toBe(350);
  });

  it('decides on the same counts once their day is complete', () => {
    const s = build(days, { now: noon(D3), config: AB });
    expect(s.live.phase).toBe('ship-b');
    expect(s.frozenAt).toBe(D2);
  });

  it('gives a cumulative look for each completed day, and the band never widens', () => {
    const s = build(
      [row('2026-11-03', grp(50, 8), grp(50, 9)), row('2026-11-04', grp(30, 4), grp(30, 5)), row('2026-11-05', grp(40, 6), grp(40, 4))],
      { now: '2026-11-06T08:00:00+01:00' },
    );
    expect(s.looks.map((l) => [l.day, l.a.inview, l.b.inview])).toEqual([
      ['2026-11-03', 50, 50],
      ['2026-11-04', 80, 80],
      ['2026-11-05', 120, 120],
    ]);
    const series = s.live.series;
    expect(series.map((p) => p.n)).toEqual([50, 80, 120]);
    for (let k = 1; k < series.length; k += 1) {
      expect(series[k]!.lower).toBeGreaterThanOrEqual(series[k - 1]!.lower);
      expect(series[k]!.upper).toBeLessThanOrEqual(series[k - 1]!.upper);
    }
    const last = series[series.length - 1]!;
    expect(s.primary!.lower).toBeCloseTo(last.lower / 100, 12);
    expect(s.primary!.upper).toBeCloseTo(last.upper / 100, 12);
    expect(s.primary!.estimate).toBeCloseTo(last.estimate / 100, 12);
    expect(s.blinded).toBe(false);
  });
});

describe('the A/B decision', () => {
  it('ships B on a clear win with the guardrail inside its limit', () => {
    const s = build([row(D1, WIN_A, WIN_B)], { now: noon(D2), config: AB });
    expect(s.guardrail!.upper).toBeLessThan(0.1);
    expect(s.primary!.lower).toBeGreaterThan(0);
    expect(s.live.phase).toBe('ship-b');
    expect(s.phase).toBe('ab');
    expect(s.frozenAt).toBe(D1);
    expect(s.live.decidedOn).toBe(berlinStartOfDay(D1));
    expect(s.live.abStartedOn).toBe(AB_START);
    expect(s.live.plannedEnd).toBe('2027-06-01T00:00:00+02:00');
    expect(s.live.plannedEndKind).toBe('fixed');
    expect(s.live.guardrail).toEqual({ lower: s.guardrail!.lower * 100, upper: s.guardrail!.upper * 100, limit: 10 });
    expect(s.calibration).toBeNull();
    expect(closingMarker(s)).toEqual({ kind: 'decision', day: D1 });
  });

  it('does not ship B when the guardrail upper bound is at +0.12', () => {
    const s = build([row(D1, WIDE_A, WIDE_B)], { now: noon(D2), config: AB });
    expect(s.primary!.lower).toBeGreaterThan(0);
    expect(s.guardrail!.upper).toBeGreaterThan(0.11);
    expect(s.guardrail!.upper).toBeLessThan(0.13);
    expect(s.live.phase).toBe('ab');
    expect(s.frozenAt).toBeNull();
    expect(s.live.decidedOn).toBeUndefined();
    expect(closingMarker(s)).toBeNull();
  });

  it('stops for harm on a clear loss', () => {
    const s = build([row(D1, WIN_B, WIN_A)], { now: noon(D2), config: AB });
    expect(s.primary!.upper).toBeLessThan(0);
    expect(s.live.phase).toBe('stop-for-harm');
    expect(s.frozenAt).toBe(D1);
    expect(closingMarker(s)).toEqual({ kind: 'decision', day: D1 });
  });

  it('is inconclusive at the planned end, and still running one minute before', () => {
    const days = [row(D1, grp(60, 6), grp(60, 7))];
    expect(build(days, { now: '2027-06-01T00:00:00+02:00', config: AB }).live.phase).toBe('inconclusive');
    expect(build(days, { now: '2027-05-31T23:59:00+02:00', config: AB }).live.phase).toBe('ab');
    expect(closingMarker(build(days, { now: '2027-06-01T00:00:00+02:00', config: AB }))).toBeNull();
  });

  it('ignores rows dated before the A/B start', () => {
    const s = build([row('2026-11-30', WIN_A, WIN_B)], { now: noon(D2), config: AB });
    expect(s.live.phase).toBe('ab');
    expect(s.looks).toEqual([]);
    expect(s.current.a.entry).toBe(0);
  });
});

describe('the first decision is final', () => {
  // After the ship-b look: a day whose counts alone would reverse it, with a split that fails SRM.
  const reverse = row(D2, grp(400, 300, { entry: 900, engaged: 800 }), grp(100, 0, { entry: 120, engaged: 100 }));
  const s = build([row(D1, WIN_A, WIN_B), reverse], { now: noon(D4), config: AB });

  it('keeps ship-b, the frozen counts and the frozen interval', () => {
    const atDecision = build([row(D1, WIN_A, WIN_B)], { now: noon(D2), config: AB });
    expect(s.live.phase).toBe('ship-b');
    expect(s.frozenAt).toBe(D1);
    expect([s.live.nA, s.live.nB]).toEqual([300, 300]);
    expect(s.looks.map((l) => l.day)).toEqual([D1]);
    expect(s.live.series).toEqual(atDecision.live.series);
    expect(s.primary).toEqual(atDecision.primary);
    expect(s.guardrail).toEqual(atDecision.guardrail);
  });

  it('notes the later SRM flag and changes nothing else', () => {
    expect(s.srm.afterDecision).toBe(true);
    expect(s.srm.firstFlaggedOn).toBe(D2);
    expect(closingMarker(s)).toEqual({ kind: 'decision', day: D1 });
    // The current totals and the funnel still count everything that was counted.
    expect(s.current.a.inview).toBe(700);
    expect(s.funnel.analysed).toBe(1100);
  });
});

describe('an empty intersection', () => {
  // Day 1: 10% against 30% of 50, an interval of about -0.07 to +0.47. Day 2 (cumulative 300):
  // 33% against 8%, an interval of about -0.35 to -0.15, wholly outside the band.
  const days = [
    row(D1, grp(50, 5, { entry: 60, engaged: 50 }), grp(50, 15, { entry: 60, engaged: 50 })),
    row(D2, grp(250, 95, { entry: 340, engaged: 250 }), grp(250, 10, { entry: 340, engaged: 250 })),
  ];
  const s = build(days, { now: noon(D3), config: AB });

  it('keeps the previous band and records the day', () => {
    expect(s.bandConflictOn).toBe(D2);
    const [first, last] = [s.live.series[0]!, s.live.series[1]!];
    expect([last.lower, last.upper]).toEqual([first.lower, first.upper]);
    expect(last.upper - last.lower).toBeGreaterThan(1);
    expect(last.n).toBe(300);
  });

  it('decides nothing on the conflicting look', () => {
    expect(s.live.phase).toBe('ab');
    expect(s.frozenAt).toBeNull();
  });
});

describe('SRM before a decision', () => {
  it('suppresses the verdict on a flagged completed look, and stays suppressed', () => {
    const flagged = row(D1, grp(30, 3), grp(70, 7));
    const s1 = build([flagged], { now: noon(D2), config: AB });
    expect(s1.live.phase).toBe('srm-suppressed');
    expect(s1.srm.firstFlaggedOn).toBe(D1);
    expect(s1.srm.assignment!.flagged).toBe(true);
    // Later balanced days, even a clear win, keep it suppressed.
    const s2 = build([flagged, row(D2, grp(1000, 100, { entry: 2000, engaged: 1400 }), grp(960, 400, { entry: 1960, engaged: 1400 }))], {
      now: noon(D4),
      config: AB,
    });
    expect(s2.srm.analysed!.flagged).toBe(false);
    expect(s2.live.phase).toBe('srm-suppressed');
    expect(s2.srm.firstFlaggedOn).toBe(D1);
    expect(s2.frozenAt).toBeNull();
    expect(closingMarker(s2)).toBeNull();
  });

  it('ignores a flag that is only in today\'s partial row', () => {
    const s = build([row(D1, grp(60, 6), grp(60, 6)), row(D2, grp(30, 3), grp(170, 17))], { now: noon(D2), config: AB });
    expect(s.live.phase).toBe('ab');
    expect(s.srm.firstFlaggedOn).toBeNull();
    expect(s.srm.assignment!.flagged).toBe(false);
  });
});

describe('the A/A failure', () => {
  const SPLIT = row('2026-11-05', grp(2, 0, { entry: 3 }), grp(20, 2, { entry: 27 }));

  it('fails by rule on a split check of 3 against 27 entries', () => {
    const s = build([SPLIT], { now: '2026-11-06T10:00:00+01:00' });
    expect(s.live.phase).toBe('aa-failed');
    expect(s.calibration!.failed).toEqual({ day: '2026-11-05', reason: 'srm' });
    expect(s.frozenAt).toBe('2026-11-05');
    expect(s.live.aaFailed).toEqual({ on: berlinStartOfDay('2026-11-05'), reason: 'the split check failed' });
    expect(s.live.aaFailed!.restartsOn).toBeUndefined();
    expect(s.live.decidedOn).toBeUndefined();
    expect(s.calibration!.srmPassed).toBe(false);
    expect(s.calibration!.ready).toBe(false);
    expect(closingMarker(s)).toEqual({ kind: 'aa-failed', day: '2026-11-05' });
  });

  it('fails when the A/A interval excludes 0 at an evaluated look', () => {
    const s = build([row('2026-11-04', grp(60, 2), grp(60, 30))], { now: '2026-11-07T10:00:00+01:00' });
    expect(s.primary!.lower).toBeGreaterThan(0);
    expect(s.live.phase).toBe('aa-failed');
    expect(s.calibration!.failed).toEqual({ day: '2026-11-04', reason: 'interval-excludes-zero' });
    expect(s.live.aaFailed!.reason).toBe('the two identical groups differed');
    expect(s.calibration!.intervalContainsZero).toBe(false);
    expect(closingMarker(s)).toEqual({ kind: 'aa-failed', day: '2026-11-04' });
  });

  it('takes the human reason and the restart date from the flag', () => {
    const flags: ExperimentFlags = {
      paused: null,
      aaFailed: { on: '2026-11-06T09:00:00+01:00', reason: 'a beacon fault in one group', restartsOn: '2026-11-20T00:00:00+01:00' },
      malformed: false,
    };
    const s = build([SPLIT], { now: '2026-11-06T10:00:00+01:00', flags });
    expect(s.live.aaFailed).toEqual({ on: berlinStartOfDay('2026-11-05'), reason: 'a beacon fault in one group', restartsOn: '2026-11-20T00:00:00+01:00' });
    expect(closingMarker(s)).toEqual({ kind: 'aa-failed', day: '2026-11-05' });
  });

  it('follows the flag alone without writing a closing marker', () => {
    const flags: ExperimentFlags = { paused: null, aaFailed: { on: '2026-11-06T09:00:00+01:00', reason: 'a beacon fault' }, malformed: false };
    const s = build([row('2026-11-04', grp(10, 1), grp(10, 1))], { now: '2026-11-06T10:00:00+01:00', flags });
    expect(s.live.phase).toBe('aa-failed');
    expect(s.live.aaFailed).toEqual({ on: '2026-11-06T09:00:00+01:00', reason: 'a beacon fault' });
    expect(s.calibration!.failed).toBeNull();
    expect(closingMarker(s)).toBeNull();
  });
});

describe('the calibration check', () => {
  const BALANCED = row('2026-11-02', grp(50, 5), grp(50, 5));

  it('is ready after 14 days and 100 analysed views with no SRM and an interval containing 0', () => {
    const s = build([BALANCED], { now: '2026-11-16T08:00:00+01:00' });
    expect(s.calibration).toEqual({
      days: 14,
      analysed: 100,
      srmPassed: true,
      intervalContainsZero: true,
      evaluatedOn: '2026-11-15',
      ready: true,
      failed: null,
    });
    expect(s.live.phase).toBe('calibration');
  });

  it('is evaluated on the first completed day that qualifies', () => {
    const s = build([row('2026-11-03', grp(30, 3), grp(30, 3)), row('2026-11-17', grp(20, 2), grp(20, 2))], { now: '2026-11-20T08:00:00+01:00' });
    expect(s.calibration!.evaluatedOn).toBe('2026-11-17');
    expect(s.calibration!.ready).toBe(true);
  });

  it('is not ready after 13 days', () => {
    const s = build([BALANCED], { now: '2026-11-15T23:59:00+01:00' });
    expect(s.calibration!.days).toBe(13);
    expect(s.calibration!.evaluatedOn).toBeNull();
    expect(s.calibration!.ready).toBe(false);
  });

  it('is not ready with 99 analysed views', () => {
    const s = build([row('2026-11-02', grp(50, 5), grp(49, 5))], { now: '2026-11-20T08:00:00+01:00' });
    expect(s.calibration!.analysed).toBe(99);
    expect(s.calibration!.evaluatedOn).toBeNull();
    expect(s.calibration!.ready).toBe(false);
  });
});

describe('rows before the start', () => {
  it('are ignored everywhere', () => {
    const before = row('2026-11-01', grp(500, 50, { entry: 30 }), grp(20, 20));
    const s = build([before], { now: '2026-11-03T08:00:00+01:00', rejectionsByDay: { '2026-11-01': { bot: 9, ceiling: 1 } } });
    expect(s.live.phase).toBe('before-data');
    expect(s.looks).toEqual([]);
    expect(s.current).toEqual({ a: zero(), b: zero() });
    expect(s.funnel.beaconsReceived).toBe(0);
    expect(s.funnel.excluded.bot).toBe(0);
    expect(s.srm.firstFlaggedOn).toBeNull();
    expect(s.ceilingDays).toEqual([]);
  });
});

describe('the funnel', () => {
  it('counts beacons received, bot-filtered, entry and analysed views', () => {
    const rejections = { bot: 7, internal: 2, self: 1, forced: 3, not_entry: 5, rate_limited: 4, ceiling: 1 };
    const s = build([row('2026-11-03', grp(15, 1, { entry: 20 }), grp(16, 2, { entry: 20 }))], {
      now: '2026-11-03T20:00:00+01:00',
      rejectionsByDay: { '2026-11-03': rejections },
    });
    expect(s.funnel).toEqual({ beaconsReceived: 58, botFiltered: 49, entryViews: 40, analysed: 31, excluded: rejections });
  });
});

describe('the ceiling', () => {
  it('keeps a day that reached the daily ceiling out of every look', () => {
    const days = [row(D1, grp(60, 6), grp(60, 6)), row(D2, WIN_A, WIN_B)];
    const s = build(days, { now: noon(D4), config: AB, rejectionsByDay: { [D2]: { ceiling: 3 } } });
    expect(s.ceilingDays).toEqual([D2]);
    expect(s.looks.map((l) => l.day)).toEqual([D1]);
    expect(s.live.phase).toBe('ab');
    expect(s.frozenAt).toBeNull();
    // It is still counted: only the analysis leaves it out.
    expect(s.current.b.card).toBe(126);
    expect(s.funnel.excluded.ceiling).toBe(3);
  });
});

describe('the intention-to-treat rate', () => {
  it('is card clicks per entry view, and absent while blinded', () => {
    const s = build([row('2026-11-03', grp(60, 6, { entry: 100 }), grp(60, 9, { entry: 100 }))], { now: '2026-11-04T08:00:00+01:00' });
    expect(s.itt).toEqual({ a: 0.06, b: 0.09 });
    const blinded = build([row('2026-11-03', grp(40, 6, { entry: 100 }), grp(60, 9, { entry: 100 }))], { now: '2026-11-04T08:00:00+01:00' });
    expect(blinded.itt).toBeNull();
  });
});

describe('the detectable curve', () => {
  it('runs from 50 to 225 per group at the planning baseline, finite and decreasing', () => {
    const s = build([], { now: '2026-11-04T08:00:00+01:00' });
    const d = s.detectable;
    expect(d.baseline).toBe(EXPERIMENT.primary.planningBaseline);
    expect(d.power).toBe(0.8);
    expect(d.tau2).toBe(TAU2.primary);
    expect(d.looks).toBe('one look at n');
    expect(d.points[0]!.nPerArm).toBe(50);
    expect(d.points[d.points.length - 1]!.nPerArm).toBe(225);
    expect(d.points.map((p) => p.nPerArm)).toEqual([50, 75, 100, 125, 150, 175, 200, 225]);
    for (const [k, p] of d.points.entries()) {
      expect(Number.isFinite(p.effect)).toBe(true);
      if (k > 0) expect(p.effect).toBeLessThan(d.points[k - 1]!.effect);
    }
    expect(d.atCurrent).toBeNull();
  });

  it('gives the effect at the smaller analysed group', () => {
    const s = build([row('2026-11-03', grp(12, 1), grp(9, 1))], { now: '2026-11-04T08:00:00+01:00' });
    const expected = detectableEffectCs({ nPerArm: 9, baseline: 0.15, tau2: TAU2.primary, alpha: 0.05, power: 0.8 });
    expect(s.detectable.atCurrent).toBe(Number.isFinite(expected) ? expected : null);
  });
});

describe('freshness', () => {
  it('is paused from the flag', () => {
    const flags: ExperimentFlags = { paused: { on: '2026-11-04T09:00:00+01:00', reason: 'checking the split' }, aaFailed: null, malformed: false };
    const s = build([], { now: '2026-11-04T10:00:00+01:00', flags });
    expect(s.live.freshness).toEqual({ kind: 'paused', pausedOn: '2026-11-04T09:00:00+01:00', reason: 'checking the split' });
  });
});

describe('the counters the store writes', () => {
  it('build the snapshot the rows describe', async () => {
    const redis = createMemoryRedis({ now: () => 0 });
    let pv = 0;
    const view = async (arm: 'a' | 'b', types: ('entry' | 'inview' | 'card' | 'engaged')[], day: string) => {
      pv += 1;
      const id = `00000000-0000-4000-8000-${String(pv).padStart(12, '0')}`;
      for (const type of types) await recordEvent(redis, { ns: 'aa-v1', pv: id, arm, type, day, ttlSeconds: 1800 });
    };
    await view('a', ['entry', 'inview', 'card'], '2026-11-03');
    await view('b', ['entry', 'engaged'], '2026-11-03');
    await view('b', ['entry', 'inview'], '2026-11-04');
    await recordRejection(redis, { ns: 'aa-v1', reason: 'bot', day: '2026-11-03' });
    const s = buildSnapshot({ counters: await readCounters(redis, 'aa-v1'), flags: NO_FLAGS, now: '2026-11-04T12:00:00+01:00', start: START, source: 'local' });
    expect(s.looks).toEqual([{ day: '2026-11-03', a: counts({ entry: 1, inview: 1, card: 1 }), b: counts({ entry: 1, engaged: 1 }) }]);
    expect(s.current.b).toEqual(counts({ entry: 2, inview: 1, engaged: 1 }));
    expect(s.funnel.beaconsReceived).toBe(4);
    expect(s.live.phase).toBe('calibration');
    expect(s.source).toBe('local');
  });
});

// ---------------------------------------------------------------------------------------------
// Invariants over arbitrary counters.

const arbGroup: fc.Arbitrary<GroupCounts> = fc
  .nat({ max: 60 })
  .chain((entry) => fc.tuple(fc.constant(entry), fc.nat({ max: entry }), fc.nat({ max: entry })))
  .chain(([entry, inview, engaged]) => fc.nat({ max: inview }).map((card) => counts({ entry, inview, engaged, card })));
const arbDays = (from: string, max: number) =>
  fc.array(fc.tuple(arbGroup, arbGroup), { minLength: 0, maxLength: max }).map((rows) =>
    rows.map(([a, b], k) => ({ day: dayPlus(from, k), a, b })),
  );
const arbCase = fc.record({
  ab: fc.boolean(),
  rows: arbDays('2026-12-01', 25),
  extra: arbDays('2026-12-26', 6),
  today: fc.tuple(arbGroup, arbGroup),
});

function dayPlus(day: string, k: number): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + k)).toISOString().slice(0, 10);
}

/** JSON.stringify that throws on a number that is not finite. */
const strictJson = (value: unknown) =>
  JSON.stringify(value, (_key, v: unknown) => {
    if (typeof v === 'number' && !Number.isFinite(v)) throw new Error(`non-finite number ${v}`);
    return v;
  });

describe('invariants (property)', () => {
  const cfg = (ab: boolean) => (ab ? AB : EXPERIMENT);

  it('never throws, publishes only finite numbers, and keeps a band that never widens', () => {
    fc.assert(
      fc.property(arbCase, ({ ab, rows }) => {
        const now = noon(dayPlus('2026-12-01', rows.length));
        const s = make(rows, { now, config: cfg(ab) });
        expect(() => strictJson(s)).not.toThrow();
        for (const look of s.looks) expect(look.day < now.slice(0, 10)).toBe(true);
        const series = s.live.series;
        for (const [k, p] of series.entries()) {
          expect(p.n).toBeGreaterThanOrEqual(MIN_PER_GROUP);
          expect(p.lower).toBeLessThan(p.upper);
          if (k > 0) {
            expect(p.lower).toBeGreaterThanOrEqual(series[k - 1]!.lower);
            expect(p.upper).toBeLessThanOrEqual(series[k - 1]!.upper);
          }
        }
        if (s.blinded) expect([series.length, s.primary, s.guardrail, s.itt, s.live.guardrail]).toEqual([0, null, null, null, undefined]);
        if (s.frozenAt !== null) expect(s.looks[s.looks.length - 1]!.day).toBe(s.frozenAt);
        if (s.live.phase === 'ship-b' || s.live.phase === 'stop-for-harm') expect(closingMarker(s)).toEqual({ kind: 'decision', day: s.frozenAt });
      }),
      { numRuns: 300 },
    );
  });

  it('is unmoved by today\'s partial row (no partial day decides anything)', () => {
    fc.assert(
      fc.property(arbCase, ({ ab, rows, today }) => {
        const day = dayPlus('2026-12-01', rows.length);
        const without = make(rows, { now: noon(day), config: cfg(ab) });
        const withToday = make([...rows, { day, a: today[0], b: today[1] }], { now: noon(day), config: cfg(ab) });
        const pick = (s: ExperimentSnapshot) => [s.looks, s.frozenAt, s.primary, s.guardrail, s.live.series, s.srm.firstFlaggedOn, s.calibration?.failed, s.bandConflictOn];
        expect(pick(withToday)).toEqual(pick(without));
        if (without.live.phase !== 'before-data') expect(withToday.live.phase).toBe(without.live.phase);
      }),
      { numRuns: 300 },
    );
  });

  it('keeps the first decision (or A/A failure) whatever comes after it', () => {
    let decided = 0;
    fc.assert(
      fc.property(arbCase, ({ ab, rows, extra }) => {
        const first = make(rows, { now: noon('2026-12-26'), config: cfg(ab) });
        if (first.frozenAt === null) return;
        decided += 1;
        const later = make([...rows, ...extra], { now: noon('2027-01-05'), config: cfg(ab) });
        const pick = (s: ExperimentSnapshot) => [s.live.phase, s.frozenAt, s.looks, s.primary, s.guardrail, s.live.series, s.live.nA, s.live.nB, closingMarker(s)];
        expect(pick(later)).toEqual(pick(first));
      }),
      { numRuns: 400 },
    );
    // The generator reaches decisions and failures often enough for the property to bite.
    expect(decided).toBeGreaterThan(20);
  });
});

describe('a seeded A/A simulation', () => {
  it('rarely fails identical groups by rule', () => {
    // 400 calibrations of 30 days, about 8 entry views a day in all, every view assigned 50/50 and
    // every group with the same rates: the rule (SRM on either base at any completed look, or the
    // A/A interval excluding 0) should fail few of them.
    const rng = sfc32(20261102);
    let failed = 0;
    const runs = 400;
    for (let run = 0; run < runs; run += 1) {
      const rows: DayCounts[] = [];
      for (let k = 0; k < 30; k += 1) {
        const entries = binomial(rng, 16, 0.5);
        const a = binomial(rng, entries, 0.5);
        const group = (entry: number): G => {
          const inview = binomial(rng, entry, 0.6);
          return { entry, inview, engaged: binomial(rng, entry, 0.6), card: binomial(rng, inview, 0.15) };
        };
        rows.push(row(dayPlus('2026-11-02', k), group(a), group(entries - a)));
      }
      const s = buildSnapshot({ counters: counters(rows), flags: NO_FLAGS, now: '2026-12-02T12:00:00+01:00', start: START, source: 'fixture' });
      if (s.calibration!.failed !== null) failed += 1;
    }
    // About 2.5% with this seed, in line with the 1% to 3% expected from repeated split checks.
    expect(failed / runs).toBeLessThan(0.06);
  });
});

describe('the builder module', () => {
  it('imports no server-only code (types only from the store and the flags)', () => {
    const text = readFileSync(join(import.meta.dirname, '../../../src/lib/experiment/snapshot.ts'), 'utf8');
    const valueImports = [...text.matchAll(/^import\s+(?!type\s)[^;]*?from\s+['"]([^'"]+)['"]/gm)].map((m) => m[1]);
    for (const spec of valueImports) expect(spec).not.toMatch(/store|flags|redis|keys|env|access|deps|handler|node:/);
    expect(text).not.toMatch(/Date\.now|new Date\(\)/);
  });
});

describe('every fixture above', () => {
  it('serialises with finite numbers only', () => {
    expect(built.length).toBeGreaterThan(30);
    for (const s of built) expect(() => strictJson(s)).not.toThrow();
  });
});
