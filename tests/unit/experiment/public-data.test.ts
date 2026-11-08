import { EXPERIMENT, TAU2, type ExperimentConfig } from '@/experiment.config';
import { EVENT_TYPES, REJECT_REASONS, type RejectReason } from '@/lib/experiment/events';
import { NO_FLAGS } from '@/lib/experiment/flags';
import { preregHash } from '@/lib/experiment/prereg-hash';
import { toPublicData, type PublicData } from '@/lib/experiment/public-data';
import { buildSnapshot, type ExperimentSnapshot } from '@/lib/experiment/snapshot';
import type { CounterRows, DayCounts, GroupCounts } from '@/lib/experiment/store';

const START = '2026-11-02T00:00:00+01:00';
const AB: ExperimentConfig = {
  ...EXPERIMENT,
  phase: 'ab',
  namespace: 'ab-v1',
  ab: { ...EXPERIMENT.ab, startedOn: '2026-12-01T00:00:00+01:00' },
} as ExperimentConfig;
const BUILD = { commit: '0123456789abcdef0123456789abcdef01234567' };
const OUTCOMES = ['engaged', 'card', 'secondary', 'cv', 'contact'];

type G = Partial<GroupCounts>;
const zero = (): GroupCounts => Object.fromEntries(EVENT_TYPES.map((t) => [t, 0])) as GroupCounts;
const row = (day: string, a: G, b: G): DayCounts => ({ day, a: { ...zero(), ...a }, b: { ...zero(), ...b } });

function counters(days: DayCounts[], rejectionsByDay: CounterRows['rejectionsByDay'] = {}): CounterRows {
  const totals = { a: zero(), b: zero() };
  for (const d of days) for (const arm of ['a', 'b'] as const) for (const t of EVENT_TYPES) totals[arm][t] += d[arm][t];
  const rejections = Object.fromEntries(REJECT_REASONS.map((r) => [r, 0])) as Record<RejectReason, number>;
  for (const byReason of Object.values(rejectionsByDay)) for (const [r, n] of Object.entries(byReason)) rejections[r as RejectReason] += n ?? 0;
  return { days, rejections, rejectionsByDay, totals };
}

const make = (days: DayCounts[], o: { now: string; config?: ExperimentConfig; rejectionsByDay?: CounterRows['rejectionsByDay'] }): ExperimentSnapshot =>
  buildSnapshot({ counters: counters(days, o.rejectionsByDay), flags: NO_FLAGS, now: o.now, start: START, source: 'store', config: o.config ?? AB });

/** Every [path, value] pair in a JSON value. */
function walk(value: unknown, path = '$'): [string, unknown][] {
  if (Array.isArray(value)) return value.flatMap((v, i) => walk(v, `${path}[${i}]`));
  if (value !== null && typeof value === 'object') return Object.entries(value).flatMap(([k, v]) => [[`${path}.${k}`, v] as [string, unknown], ...walk(v, `${path}.${k}`)]);
  return [];
}
const keysOf = (value: unknown) => walk(value).map(([path]) => path.split('.').pop()!.replace(/\[\d+\]$/, ''));

// A blinded A/B: small daily rows with cells of every size, and one day still running.
const SMALL = [
  row('2026-12-01', { entry: 7, inview: 3, engaged: 2, card: 1, cv: 1 }, { entry: 6, inview: 4, engaged: 4, card: 0, contact: 2 }),
  row('2026-12-02', { entry: 5, inview: 1, engaged: 0 }, { entry: 9, inview: 6, engaged: 5, card: 3, secondary: 1 }),
  row('2026-12-03', { entry: 2 }, { entry: 1 }),
];
const blinded = make(SMALL, { now: '2026-12-03T12:00:00+01:00', rejectionsByDay: { '2026-12-01': { bot: 3, not_entry: 12 }, '2026-12-02': { forced: 1 } } });

// An unblinded A/B: 300 analysed views a group on 01.12, still running on 02.12.
const OPEN = [
  row('2026-12-01', { entry: 300, inview: 300, engaged: 250, card: 45, cv: 3 }, { entry: 300, inview: 300, engaged: 252, card: 51, cv: 0 }),
  row('2026-12-02', { entry: 4, inview: 2, engaged: 2 }, { entry: 3, inview: 3, engaged: 3 }),
];
const open = make(OPEN, { now: '2026-12-02T12:00:00+01:00' });

describe('toPublicData', () => {
  const d = toPublicData(blinded, BUILD);

  it('has cumulative looks over completed days and the current totals, and no per-day increments', () => {
    expect(d.schema).toBe('experiment-data/1');
    expect(d.looks.map((l) => l.day)).toEqual(['2026-12-01', '2026-12-02']);
    // Cumulative: 01.12 then 01.12 + 02.12.
    expect(d.looks[0]!.a.entry).toBe(7);
    expect(d.looks[1]!.a.entry).toBe(12);
    expect(d.looks[1]!.b.entry).toBe(15);
    expect(d.current.a.entry).toBe(14);
    expect(keysOf(d)).not.toContain('days');
    expect(keysOf(d)).not.toContain('rejectionsByDay');
  });

  it('prints every count from 1 to 4 as "<5" and keeps 0 as 0', () => {
    const scanned = [d.looks, d.current, d.funnel, d.srm.flaggedLook, d.calibration];
    const numbers = scanned.flatMap((v) => walk(v)).filter(([, v]) => typeof v === 'number' || v === '<5');
    expect(numbers.length).toBeGreaterThan(10);
    for (const [path, v] of numbers) {
      if (typeof v === 'number') expect(v === 0 || v >= 5, `${path} = ${v}`).toBe(true);
    }
    expect(d.looks[0]!.a.inview).toBe('<5');
    expect(d.looks[0]!.a.entry).toBe(7);
    expect(d.funnel.excluded.bot).toBe('<5');
    expect(d.funnel.excluded.forced).toBe('<5');
    expect(d.funnel.excluded.not_entry).toBe(12);
    expect(d.funnel.excluded.internal).toBe(0);
    expect(d.current.b.inview).toBe(10);
    expect(d.current.a.inview).toBe('<5');
  });

  it('withholds every outcome while blinded: no outcome key anywhere, and no itt', () => {
    expect(blinded.blinded).toBe(true);
    const found = keysOf(d);
    for (const key of OUTCOMES) expect(found, key).not.toContain(key);
    expect(found).not.toContain('itt');
    expect(d.primary).toBeNull();
    expect(d.guardrail).toBeNull();
  });

  it('has no p-values', () => {
    const found = keysOf(toPublicData(open, BUILD));
    expect(found).not.toContain('p');
    expect(found).not.toContain('pValue');
    expect(keysOf(d)).not.toContain('p');
  });

  it('withholds the split statistic where a count is a small cell', () => {
    expect(d.srm.assignment).toEqual({ chi2: expect.any(Number), flagged: false });
    expect(d.srm.analysed).toEqual({ chi2: null, flagged: false });
  });

  it('carries the pre-registration: version, tag, commit and the design hash', () => {
    expect(d.prereg).toEqual({ version: EXPERIMENT.prereg.version, tag: EXPERIMENT.prereg.tag, commit: BUILD.commit, configSha256: preregHash() });
    expect(toPublicData(blinded, { commit: null }).prereg.commit).toBeNull();
  });

  it('carries the phase, the decision fields and the faults', () => {
    for (const key of ['configPhase', 'status', 'plannedEnd', 'plannedEndKind', 'decision', 'decidedOn', 'frozenAt', 'held', 'inconsistentOn', 'bandConflictOn', 'ceilingDays', 'namespace', 'readAt']) {
      expect(d, key).toHaveProperty(key);
    }
    expect(d.srm).toHaveProperty('afterDecision', false);
    expect(d.srm).toHaveProperty('flaggedBase', null);
    expect(d.srm).toHaveProperty('flaggedLook', null);
    expect(d.configPhase).toBe('ab');
    expect(d.status).toBe('ab');
    expect(d.decision).toBeNull();
    expect(d.plannedEndKind).toBe('fixed');
    expect(d.namespace).toBe('ab-v1');
  });

  it('carries the pre-registered values', () => {
    expect(d.config).toEqual({
      alpha: EXPERIMENT.alpha,
      power: EXPERIMENT.power,
      srmFlagP: EXPERIMENT.srmFlagP,
      minPerGroup: EXPERIMENT.minPerGroup,
      capPerArm: EXPERIMENT.capPerArm,
      entryCapPerArm: EXPERIMENT.entryCapPerArm,
      ab: { capMonths: EXPERIMENT.ab.capMonths },
      calibration: { minDays: EXPERIMENT.calibration.minDays, minAnalysedViews: EXPERIMENT.calibration.minAnalysedViews },
      guardrail: { quickExitSeconds: EXPERIMENT.guardrail.quickExitSeconds, marginPp: EXPERIMENT.guardrail.marginPp },
      cardsInView: EXPERIMENT.cardsInView,
      dailyEntryCeiling: EXPERIMENT.dailyEntryCeiling,
      planningBaselines: { primary: EXPERIMENT.primary.planningBaseline, guardrail: EXPERIMENT.guardrail.planningBaseline },
      TAU2,
    });
  });

  it('shows the look outcomes and the intervals once both groups have 50 analysed views', () => {
    const o = toPublicData(open, BUILD);
    expect(open.blinded).toBe(false);
    expect(o.looks[0]!.a.card).toBe(45);
    expect(o.looks[0]!.b.engaged).toBe(252);
    expect(o.itt).toEqual({ a: 45 / 300, b: 51 / 300 });
    expect(o.primary).toEqual(open.primary);
    expect(o.guardrail).toEqual(open.guardrail);
  });

  it('keeps current to exposures and CV and contact clicks out of every look while the test runs', () => {
    const o = toPublicData(open, BUILD);
    expect(Object.keys(o.current.a).sort()).toEqual(['entry', 'inview']);
    expect(Object.keys(o.current.b).sort()).toEqual(['entry', 'inview']);
    const found = keysOf(o);
    expect(found).not.toContain('cv');
    expect(found).not.toContain('contact');
    expect(o.finalDescriptive).toBeNull();
  });

  it('gives CV and contact clicks as final totals once the test has ended', () => {
    const won = make(
      [
        row('2026-12-01', { entry: 600, inview: 300, engaged: 420, card: 30, cv: 7, contact: 2 }, { entry: 600, inview: 300, engaged: 432, card: 120, cv: 0, contact: 9 }),
        row('2026-12-02', { entry: 10, inview: 5, engaged: 5, cv: 3 }, { entry: 10, inview: 5, engaged: 5 }),
      ],
      { now: '2026-12-03T12:00:00+01:00' },
    );
    const w = toPublicData(won, BUILD);
    expect(w.decision).toBe('ship-b');
    expect(w.finalDescriptive).toEqual({ day: '2026-12-01', a: { cv: 7, contact: '<5' }, b: { cv: 0, contact: 9 } });
    expect(w.looks.flatMap((l) => [Object.keys(l.a), Object.keys(l.b)]).flat()).not.toContain('cv');
  });

  it('publishes no sum of cells and no ratio beside a small cell, so no identity gives a "<5" back', () => {
    // No totals: the funnel gives only its reasons, the calibration no analysed total.
    expect(Object.keys(d.funnel)).toEqual(['excluded']);
    const aa = toPublicData(make(SMALL, { now: '2026-12-03T12:00:00+01:00', config: { ...EXPERIMENT, calibration: { ...EXPERIMENT.calibration, startedOn: START } } as ExperimentConfig }), BUILD);
    expect(aa.calibration).not.toBeNull();
    expect(aa.calibration).not.toHaveProperty('analysed');
    // The review's probe: with an analysed total, 14 - 10 gave back the "<5" of group A.
    expect(d.current.a.inview).toBe('<5');
    expect(keysOf(d.funnel)).not.toContain('analysed');
    expect(keysOf(d)).not.toContain('entryViews');
    expect(keysOf(d)).not.toContain('beaconsReceived');
    expect(keysOf(d)).not.toContain('botFiltered');
    // itt x entry gives the card count: withheld while a card cell is small, though unblinded.
    const smallCard = make(
      [row('2026-12-01', { entry: 300, inview: 300, engaged: 250, card: 3 }, { entry: 300, inview: 300, engaged: 250, card: 40 })],
      { now: '2026-12-02T12:00:00+01:00' },
    );
    expect(smallCard.blinded).toBe(false);
    const sc = toPublicData(smallCard, BUILD);
    expect(sc.looks[0]!.a.card).toBe('<5');
    expect(sc.itt).toBeNull();
    // Wherever itt is given, itt x entry is a published number already.
    const o = toPublicData(open, BUILD);
    const last = o.looks[o.looks.length - 1]!;
    for (const arm of ['a', 'b'] as const) {
      expect(typeof last[arm].card).toBe('number');
      expect(Math.round(o.itt![arm] * (last[arm].entry as number))).toBe(last[arm].card);
    }
  });

  it('carries notes on what the counts can tell, and never calls them anonymous', () => {
    expect(d.notes.length).toBeGreaterThan(0);
    expect(d.notes.join(' ')).toMatch(/not anonymous/);
    expect(d.notes.join(' ')).toMatch(/interval/);
  });

  it('publishes no decision for a placeholder, and says why it has no data', () => {
    const after = buildSnapshot({ counters: counters([]), flags: NO_FLAGS, now: '2027-07-01T12:00:00+02:00', start: START, source: 'unavailable', config: AB });
    expect(after.status).toBe('inconclusive');
    const p = toPublicData({ ...after, unavailable: 'unreadable' }, BUILD);
    expect(p.decision).toBeNull();
    expect(p.unavailable).toBe('unreadable');
    expect(p.finalDescriptive).toBeNull();
    expect(toPublicData({ ...after, unavailable: 'not-started' }, BUILD).unavailable).toBe('not-started');
    expect(d.unavailable).toBeNull();
  });

  it('gives the decision when the status is an outcome', () => {
    const won = make(
      [row('2026-12-01', { entry: 600, inview: 300, engaged: 420, card: 30 }, { entry: 600, inview: 300, engaged: 432, card: 120 })],
      { now: '2026-12-02T12:00:00+01:00' },
    );
    const w = toPublicData(won, BUILD);
    expect(w.decision).toBe('ship-b');
    expect(w.decidedOn).toBe(won.live.decidedOn);
    expect(w.frozenAt).toBe('2026-12-01');
  });

  it('withholds the detectable effect at the current size while it would give a small cell away', () => {
    expect(d.detectable.atCurrent).toBeNull();
    expect(d.detectable.atCurrentNote).toBe('small-cell');
    const o = toPublicData(open, BUILD);
    expect(o.detectable.atCurrent).toBe(open.detectable.atCurrent);
    expect(o.detectable.atCurrentNote).toBeNull();
    const none = toPublicData(make([], { now: '2026-12-02T12:00:00+01:00' }), BUILD);
    expect(none.detectable.atCurrentNote).toBe('no-views');
  });

  it('throws a TypeError on a non-finite number, never writing Infinity', () => {
    const bad: ExperimentSnapshot = { ...blinded, detectable: { ...blinded.detectable, points: [{ nPerArm: 50, effect: Infinity }] } };
    expect(() => toPublicData(bad, BUILD)).toThrow(TypeError);
    const nan: ExperimentSnapshot = { ...open, primary: { ...open.primary!, upper: NaN } };
    expect(() => toPublicData(nan, BUILD)).toThrow(TypeError);
  });

  it('is plain JSON', () => {
    const o: PublicData = toPublicData(open, BUILD);
    expect(JSON.parse(JSON.stringify(o))).toEqual(o);
  });
});
