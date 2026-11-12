import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EXPERIMENT, TAU2, type ExperimentConfig } from '@/experiment.config';
import type { ServerEnv } from '@/lib/env';
import { EVENT_TYPES, REJECT_REASONS, type RejectReason } from '@/lib/experiment/events';
import { NO_FLAGS, type ExperimentFlags } from '@/lib/experiment/flags';
import { fieldName, keys } from '@/lib/experiment/keys';
import { getExperimentSnapshot } from '@/lib/experiment/live';
import { createMemoryRedis } from '@/lib/experiment/memory-redis';
import { toPublicData, type PublicData } from '@/lib/experiment/public-data';
import { buildSnapshot, type ExperimentSnapshot } from '@/lib/experiment/snapshot';
import type { CounterRows, DayCounts, GroupCounts } from '@/lib/experiment/store';
import { mixtureCs } from '@/lib/stats/sequential';

// The public verifier: a standard-library Python script that a reader runs on the published
// /experiment/data.json to recompute what can be recomputed from it. The fixtures are real
// published data, built by the site's own snapshot and publishing code from known counts, so the
// script is tested against the schema the site actually sends. To rewrite them after a deliberate
// change of design or schema:
//   UPDATE_VERIFIER_FIXTURES=1 npx vitest run tests/unit/live-page/verifier.test.ts
const ROOT = join(import.meta.dirname, '../../..');
const SCRIPT = join(ROOT, 'scripts/verify_experiment.py');
const FIXTURES = join(ROOT, 'tests/fixtures/experiment-verifier');
const REFERENCE = join(ROOT, 'stats-ref/reference.json');
const UPDATE = process.env.UPDATE_VERIFIER_FIXTURES === '1';

type Result = 'pass' | 'fail' | 'indeterminate' | 'not-applicable';
type Check = { id: string; result: Result; reason: string };
type Report = { verifier: string; result: 'agrees' | 'indeterminate' | 'disagrees' | 'invalid'; checks: Check[]; errors: string[] };

function run(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync('python3', ['-I', SCRIPT, ...args], { encoding: 'utf8', cwd: ROOT });
  if (r.error) throw r.error;
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

function report(args: string[]): { status: number | null; report: Report; stdout: string } {
  const r = run([...args, '--json']);
  let parsed: Report;
  try {
    parsed = JSON.parse(r.stdout) as Report;
  } catch {
    throw new Error(`no JSON report (exit ${r.status}):\n${r.stdout}\n${r.stderr}`);
  }
  return { status: r.status, report: parsed, stdout: r.stdout };
}

const tmp = mkdtempSync(join(tmpdir(), 'verifier-'));
let written = 0;
function writeTmp(value: unknown, raw?: string | Buffer): string {
  const file = join(tmp, `payload-${(written += 1)}.json`);
  writeFileSync(file, raw ?? JSON.stringify(value, null, 2));
  return file;
}

/** The raw bytes of a run, both modes, for checks on what reaches the terminal. */
function runBytes(args: string[]): { status: number | null; stdout: Buffer; stderr: string } {
  const r = spawnSync('python3', ['-I', SCRIPT, ...args], { cwd: ROOT });
  if (r.error) throw r.error;
  return { status: r.status, stdout: r.stdout, stderr: r.stderr.toString('utf8') };
}
const NON_ASCII_OR_CONTROL = /[^\n\x20-\x7e]/;

const check = (r: Report, id: string): Check => {
  const found = r.checks.find((c) => c.id === id);
  if (!found) throw new Error(`no check ${id} in ${r.checks.map((c) => c.id).join(', ')}`);
  return found;
};
const failures = (r: Report) => r.checks.filter((c) => c.result === 'fail');

// --- scenarios: known counts in, the site's own published data out ---------------------------

const START = '2026-11-02T00:00:00+01:00';
const BUILD = { commit: '0123456789abcdef0123456789abcdef01234567' };
const AB: ExperimentConfig = { ...EXPERIMENT, phase: 'ab', namespace: 'ab-v1', ab: { ...EXPERIMENT.ab, startedOn: '2026-12-01T00:00:00+01:00' } } as ExperimentConfig;
/** An A/B whose 6-month cap passed before the scenario's clock. */
const AB_ENDED: ExperimentConfig = { ...AB, ab: { ...AB.ab, startedOn: '2026-05-04T00:00:00+02:00' } } as ExperimentConfig;
const AA: ExperimentConfig = { ...EXPERIMENT, calibration: { ...EXPERIMENT.calibration, startedOn: START } } as ExperimentConfig;

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

type Scenario = { days: DayCounts[]; now: string; config: ExperimentConfig; start?: string; source?: ExperimentSnapshot['source']; rejectionsByDay?: CounterRows['rejectionsByDay'] };
function publish(s: Scenario): PublicData {
  let snap = buildSnapshot({ counters: counters(s.days, s.rejectionsByDay), flags: NO_FLAGS, now: s.now, start: s.start ?? START, source: s.source ?? 'store', config: s.config });
  if (snap.source === 'unavailable') snap = { ...snap, unavailable: 'not-started' };
  return toPublicData(snap, BUILD, s.config);
}

const quiet = (entry: number, inview: number, engaged: number, card: number, secondary = 0): G => ({ entry, inview, engaged, card, secondary });

/** A daily A/A row with every count small. */
const aaDay = (day: string) => row(day, quiet(6, 5, 4, 1), quiet(6, 5, 4, 1));
const aaDays = Array.from({ length: 15 }, (_, i) => aaDay(`2026-11-${String(i + 2).padStart(2, '0')}`));

/** The small-card scenario: group A's card count at the one evaluated look is `hidden` (1 to 4). */
const smallCard = (hidden: number): Scenario => ({
  config: AB,
  now: '2026-12-02T12:00:00+01:00',
  days: [row('2026-12-01', quiet(60, 55, 50, hidden), quiet(62, 58, 52, 9)), row('2026-12-02', quiet(3, 2, 2, 0), quiet(4, 3, 3, 1))],
});

/** Group A's engaged views at the one evaluated look are `hidden` (1 to 4). */
const smallEngaged = (hidden: number): Scenario => ({
  config: AB,
  now: '2026-12-02T12:00:00+01:00',
  days: [row('2026-12-01', quiet(60, 55, hidden, 8), quiet(62, 58, 52, 9)), row('2026-12-02', quiet(3, 2, 2, 0), quiet(4, 3, 3, 1))],
});

/** Group A's card count is hidden at two evaluated looks: `first` then the running total `second`. */
const twoSmallCards = ([first, second]: [number, number]): Scenario => ({
  config: AB,
  now: '2026-12-03T12:00:00+01:00',
  days: [
    row('2026-12-01', quiet(60, 55, 50, first), quiet(62, 58, 52, 9)),
    row('2026-12-02', quiet(10, 8, 8, second - first), quiet(10, 9, 9, 2)),
    row('2026-12-03', quiet(1, 1, 1, 0), quiet(1, 1, 1, 0)),
  ],
});

const SCENARIOS: Record<string, Scenario> = {
  // Blinded: small cells of every size, a running day, rejections in the funnel.
  blinded: {
    config: AB,
    now: '2026-12-03T12:00:00+01:00',
    days: [
      row('2026-12-01', { entry: 7, inview: 3, engaged: 2, card: 1, cv: 1 }, { entry: 6, inview: 4, engaged: 4, contact: 2 }),
      row('2026-12-02', { entry: 5, inview: 1 }, { entry: 9, inview: 6, engaged: 5, card: 3, secondary: 1 }),
      row('2026-12-03', { entry: 2 }, { entry: 1 }),
    ],
    rejectionsByDay: { '2026-12-01': { bot: 3, not_entry: 12 }, '2026-12-02': { forced: 1 } },
  },
  // Unblinded and running: three evaluated looks, so the interval is a running intersection.
  open: {
    config: AB,
    now: '2026-12-04T12:00:00+01:00',
    days: [
      row('2026-12-01', quiet(120, 100, 100, 14, 6), quiet(118, 98, 99, 17, 7)),
      row('2026-12-02', quiet(110, 95, 92, 15, 5), quiet(112, 97, 95, 18, 6)),
      row('2026-12-03', quiet(105, 90, 88, 12, 4), quiet(108, 93, 90, 16, 5)),
      row('2026-12-04', quiet(40, 30, 30, 5, 1), quiet(38, 31, 29, 4, 1)),
    ],
  },
  // Ship B at the second look; the third day is counted but never feeds a look.
  'ship-b': {
    config: AB,
    now: '2026-12-04T12:00:00+01:00',
    days: [
      row('2026-12-01', quiet(45, 40, 44, 4), quiet(44, 40, 43, 20)),
      row('2026-12-02', quiet(355, 260, 336, 26), quiet(356, 260, 337, 130)),
      row('2026-12-03', quiet(100, 90, 95, 9), quiet(100, 90, 95, 45)),
    ],
  },
  'stop-for-harm': {
    config: AB,
    now: '2026-12-03T12:00:00+01:00',
    days: [row('2026-12-01', quiet(400, 300, 380, 150), quiet(400, 300, 380, 30)), row('2026-12-02', quiet(10, 9, 9, 3), quiet(10, 9, 9, 0))],
  },
  'small-card': smallCard(3),
  // The split fails on the first day: group A's entry and analysed views are small cells.
  'srm-small': {
    config: AB,
    now: '2026-12-02T12:00:00+01:00',
    days: [row('2026-12-01', { entry: 2, inview: 1 }, { entry: 30, inview: 20, engaged: 18 })],
  },
  // A data fault on the second look, which also fails the split: held, nothing after look one.
  'held-fault': {
    config: AB,
    now: '2026-12-03T12:00:00+01:00',
    days: [
      row('2026-12-01', quiet(120, 100, 100, 15), quiet(120, 100, 100, 16)),
      row('2026-12-02', quiet(10, 10, 10, 150), quiet(300, 290, 280, 40)),
    ],
  },
  // Ship B on the first look, then a split flag on a later look: a note only.
  'late-srm': {
    config: AB,
    now: '2026-12-04T12:00:00+01:00',
    days: [
      row('2026-12-01', quiet(400, 300, 380, 30), quiet(400, 300, 380, 150)),
      row('2026-12-02', quiet(10, 10, 10, 1), quiet(400, 380, 380, 60)),
      row('2026-12-03', quiet(10, 10, 10, 1), quiet(10, 10, 10, 1)),
    ],
  },
  // The cap passed with nothing counted: inconclusive, no data.
  'no-data-cap': { config: AB_ENDED, now: '2026-11-10T12:00:00+01:00', days: [], start: '2026-04-01T00:00:00+02:00' },
  // The A/A after its minimum days: ready to switch.
  'aa-ready': { config: AA, now: '2026-11-17T12:00:00+01:00', days: aaDays },
  // Nothing has started: the no-data placeholder.
  placeholder: { config: EXPERIMENT, now: '2026-11-01T12:00:00+01:00', days: [], source: 'unavailable', start: '2026-11-01T12:00:00+01:00' },
};

// States only the site's store reader produces: an A/A stopped by a stored closed marker. Built
// through the real read path (getExperimentSnapshot) over an in-memory store, as the live page
// would read it, then published by toPublicData.
const STORE_ENV: ServerEnv = { vercelEnv: 'production', fakeStore: false, kvUrl: 'https://store.invalid', kvToken: 'write', kvReadOnlyToken: 'read' };
const STORE_NOW = new Date('2026-11-20T10:00:00Z');
async function storedAaClosure(flags: ExperimentFlags): Promise<PublicData> {
  const redis = createMemoryRedis({ now: () => STORE_NOW.getTime() });
  // The last completed look has 45 analysed views a group; today's partial row lifts the current
  // counts past 50, so the analysis is unblinded on today's counts, not on the last look.
  const rows = [
    { day: '2026-11-04', a: quiet(54, 45, 40, 6), b: quiet(54, 45, 41, 7) },
    { day: '2026-11-20', a: quiet(12, 10, 9, 1), b: quiet(12, 10, 9, 2) },
  ];
  for (const r of rows) {
    for (const arm of ['a', 'b'] as const) {
      for (const [metric, n] of Object.entries(r[arm]) as [keyof GroupCounts, number][]) {
        if (n > 0) await redis.command(['HINCRBY', keys.counters(AA.namespace), fieldName({ kind: 'day', day: r.day, arm, metric }), n]);
      }
    }
  }
  await redis.command(['SET', keys.closed(AA.namespace), JSON.stringify({ kind: 'aa-failed', day: '2026-11-06' })]);
  const s = await getExperimentSnapshot({
    env: STORE_ENV, mode: 'store', read: redis, write: null, flags: async () => flags, now: () => STORE_NOW, log: () => {}, config: AA, schedule: () => {},
  });
  return toPublicData(s, BUILD, AA);
}
const STORED: Record<string, () => Promise<PublicData>> = {
  // The stored stop is the only explanation left (no flag, no failure in the looks).
  'aa-stored-closure': () => storedAaClosure(NO_FLAGS),
  // A flag on another day disagrees with the stored stop.
  'aa-closure-mismatch': () => storedAaClosure({ ...NO_FLAGS, aaFailed: { on: '2026-11-07T09:00:00+01:00', reason: 'a beacon fault' } }),
};
const ALL_FIXTURES = [...Object.keys(SCENARIOS), ...Object.keys(STORED)];

const fixturePath = (name: string) => join(FIXTURES, `${name}.json`);
const fixture = (name: string) => JSON.parse(readFileSync(fixturePath(name), 'utf8')) as PublicData;

if (UPDATE) {
  mkdirSync(FIXTURES, { recursive: true });
  for (const [name, s] of Object.entries(SCENARIOS)) writeFileSync(fixturePath(name), `${JSON.stringify(publish(s), null, 2)}\n`);
  for (const [name, make] of Object.entries(STORED)) writeFileSync(fixturePath(name), `${JSON.stringify(await make(), null, 2)}\n`);
}

// --- tests ------------------------------------------------------------------------------------

describe('the saved fixtures', () => {
  it.each(Object.keys(SCENARIOS))('%s is exactly what the site publishes for its scenario', (name) => {
    expect(fixture(name)).toEqual(publish(SCENARIOS[name]!));
  });

  it.each(Object.keys(STORED))('%s is exactly what the site reads from its store and publishes', async (name) => {
    expect(fixture(name)).toEqual(await STORED[name]!());
  });

  it('hold the stored A/A closure states', () => {
    const stored = fixture('aa-stored-closure');
    expect(stored).toMatchObject({ status: 'aa-failed', frozenAt: '2026-11-06', blinded: false });
    expect(stored.calibration).toMatchObject({ failed: null, ready: false });
    expect(stored).not.toHaveProperty('closureMismatch');
    expect(stored.looks.at(-1)!.a.inview).toBeLessThan(50);
    expect(fixture('aa-closure-mismatch')).toMatchObject({ status: 'aa-failed', frozenAt: '2026-11-06', closureMismatch: true });
  });

  it('cover the cases the verifier must handle', () => {
    expect(fixture('blinded').blinded).toBe(true);
    expect(fixture('open').looks).toHaveLength(3);
    expect(fixture('open').primary).not.toBeNull();
    expect(fixture('ship-b').decision).toBe('ship-b');
    expect(fixture('ship-b').frozenAt).toBe('2026-12-02');
    expect(fixture('stop-for-harm').decision).toBe('stop-for-harm');
    expect(fixture('small-card').looks[0]!.a.card).toBe('<5');
    expect(fixture('small-card').primary).not.toBeNull();
    expect(fixture('srm-small').status).toBe('srm-suppressed');
    expect(fixture('srm-small').looks[0]!.a.entry).toBe('<5');
    expect(fixture('held-fault').held).toEqual({ on: '2026-12-02', reason: 'inconsistent-counts' });
    expect(fixture('held-fault').srm.flaggedLook?.day).toBe('2026-12-02');
    expect(fixture('late-srm').srm.afterDecision).toBe(true);
    expect(fixture('late-srm').decision).toBe('ship-b');
    expect(fixture('no-data-cap').decision).toBe('inconclusive');
    expect(fixture('no-data-cap').looks).toEqual([]);
    expect(fixture('aa-ready').calibration?.ready).toBe(true);
    expect(fixture('placeholder').unavailable).toBe('not-started');
  });
});

describe('the verifier against the frozen reference values', () => {
  it('reproduces every reference value it uses within 1e-8', () => {
    const { status, report: r } = report(['--reference', REFERENCE]);
    expect(failures(r)).toEqual([]);
    expect(r.checks.map((c) => c.id)).toEqual(['reference-mixture-ratio', 'reference-mixture-cs', 'reference-split-check', 'reference-detectable-effect']);
    expect(r.checks.every((c) => c.result === 'pass')).toBe(true);
    expect(status).toBe(0);
  });

  it('blocks on a reference value it does not reproduce', () => {
    const ref = JSON.parse(readFileSync(REFERENCE, 'utf8')) as { mixtureCs: { lower: number }[] };
    ref.mixtureCs[3]!.lower += 1e-6;
    const { status, report: r } = report(['--reference', writeTmp(ref)]);
    expect(check(r, 'reference-mixture-cs').result).toBe('fail');
    expect(r.result).toBe('disagrees');
    expect(status).toBe(1);
  });
});

describe('the verifier on published data', () => {
  it.each(ALL_FIXTURES)('finds no disagreement in %s and exits 0', (name) => {
    const { status, report: r } = report([fixturePath(name)]);
    expect(failures(r)).toEqual([]);
    expect(r.errors).toEqual([]);
    expect(status).toBe(0);
    for (const c of r.checks) expect(c.reason.length, c.id).toBeGreaterThan(0);
  });

  it('recomputes the intervals of the cumulative looks, the mixing variances and the decision', () => {
    for (const name of ['open', 'ship-b', 'stop-for-harm']) {
      const r = report([fixturePath(name)]).report;
      for (const id of ['mixing-variance', 'looks-cumulative', 'looks-consistent', 'small-cells', 'primary-interval', 'guardrail-interval', 'decision', 'split-check-entry', 'split-check-analysed', 'detectable-effect', 'detectable-at-current', 'itt', 'blinding']) {
        expect(check(r, id).result, `${name} ${id}`).toBe('pass');
      }
      expect(r.result, name).toBe('agrees');
    }
  });

  it('treats looks as cumulative totals, never as daily values to add up', () => {
    // The published interval of the last look is reproduced from that look's own totals; summing
    // the looks would give other counts and a different interval.
    const d = fixture('open');
    const last = d.looks[2]!;
    const own = mixtureCs({ xA: last.a.card as number, nA: last.a.inview as number, xB: last.b.card as number, nB: last.b.inview as number }, { tau2: TAU2.primary, alpha: EXPERIMENT.alpha });
    expect(d.primary!.estimate).toBeCloseTo(own.estimate, 12);
    const summed = structuredClone(d);
    summed.looks[2]!.a.card = (d.looks[0]!.a.card as number) + (d.looks[1]!.a.card as number) + (last.a.card as number);
    const r = report([writeTmp(summed)]);
    expect(check(r.report, 'primary-interval').result).toBe('fail');
    expect(r.status).toBe(1);
  });

  it('fails a look whose cumulative count goes down', () => {
    const d = fixture('open');
    d.looks[1]!.b.entry = (d.looks[0]!.b.entry as number) - 1;
    const r = report([writeTmp(d)]);
    expect(check(r.report, 'looks-cumulative').result).toBe('fail');
    expect(r.status).toBe(1);
  });

  it('reports, rather than crashes on, outcome counts that are not running totals', () => {
    const d = fixture('open');
    d.looks[1]!.a.card = (d.looks[0]!.a.card as number) - 1;
    const r = report([writeTmp(d)]);
    expect(check(r.report, 'looks-cumulative').result).toBe('fail');
    expect(check(r.report, 'primary-interval').result).toBe('fail');
    expect(check(r.report, 'decision').result).toBe('fail');
    expect(r.status).toBe(1);
  });

  it('checks which split failed at the flagged look', () => {
    expect(check(report([fixturePath('held-fault')]).report, 'flagged-base').result).toBe('pass');
    const d = fixture('held-fault');
    d.srm.flaggedBase = 'entry';
    const r = report([writeTmp(d)]);
    expect(check(r.report, 'flagged-base').result).toBe('fail');
    expect(r.status).toBe(1);
    expect(check(report([fixturePath('open')]).report, 'flagged-base').result).toBe('not-applicable');
  });

  it('checks when the final CV and contact counts must be present', () => {
    expect(check(report([fixturePath('ship-b')]).report, 'final-descriptive').result).toBe('pass');
    expect(check(report([fixturePath('open')]).report, 'final-descriptive').result).toBe('pass');
    const missing = fixture('ship-b');
    missing.finalDescriptive = null;
    expect(check(report([writeTmp(missing)]).report, 'final-descriptive').result).toBe('fail');
    const early = fixture('open');
    early.finalDescriptive = { day: early.looks[2]!.day, a: { cv: 0, contact: 0 }, b: { cv: 0, contact: 0 } };
    expect(check(report([writeTmp(early)]).report, 'final-descriptive').result).toBe('fail');
  });

  it('fails an A/A published as calibrating with nothing counted', () => {
    const d = fixture('placeholder');
    d.status = 'calibration';
    expect(check(report([writeTmp(d)]).report, 'calibration-rule').result).toBe('fail');
  });

  it('agrees within 1e-8 and fails beyond it', () => {
    const near = fixture('open');
    near.primary!.lower += 1e-10;
    expect(report([writeTmp(near)]).status).toBe(0);
    const far = fixture('open');
    far.primary!.lower += 1e-6;
    const r = report([writeTmp(far)]);
    expect(check(r.report, 'primary-interval').result).toBe('fail');
    expect(r.report.result).toBe('disagrees');
    expect(r.status).toBe(1);
  });

  it('fails a decision the looks do not support', () => {
    const d = fixture('ship-b');
    d.decision = 'stop-for-harm';
    d.status = 'stop-for-harm';
    const r = report([writeTmp(d)]);
    expect(check(r.report, 'decision').result).toBe('fail');
    expect(r.status).toBe(1);
    const early = fixture('open');
    early.decision = 'ship-b';
    early.status = 'ship-b';
    early.frozenAt = '2026-12-03';
    expect(check(report([writeTmp(early)]).report, 'decision').result).toBe('fail');
  });

  it('fails a split statistic it does not reproduce', () => {
    const d = fixture('open');
    d.srm.assignment!.chi2 = d.srm.assignment!.chi2! + 0.5;
    const r = report([writeTmp(d)]);
    expect(check(r.report, 'split-check-entry').result).toBe('fail');
    expect(r.status).toBe(1);
  });

  it('fails a count from 1 to 4 printed as itself', () => {
    const d = fixture('blinded');
    d.looks[0]!.a.inview = 3;
    const r = report([writeTmp(d)]);
    expect(check(r.report, 'small-cells').result).toBe('fail');
    expect(r.status).toBe(1);
  });

  it('fails an outcome published while blinded', () => {
    const d = fixture('blinded');
    d.looks[1]!.b.card = 0;
    const r = report([writeTmp(d)]);
    expect(check(r.report, 'outcomes-withheld').result).toBe('fail');
    expect(r.status).toBe(1);
  });

  it('says what it cannot recompute while blinded or with no data', () => {
    const blinded = report([fixturePath('blinded')]).report;
    expect(check(blinded, 'primary-interval').result).toBe('not-applicable');
    expect(check(blinded, 'primary-interval').reason).toMatch(/blinded/);
    expect(check(blinded, 'outcomes-withheld').result).toBe('pass');
    const cap = report([fixturePath('no-data-cap')]).report;
    expect(check(cap, 'decision').result).toBe('pass');
    expect(check(cap, 'primary-interval').result).toBe('not-applicable');
    const placeholder = report([fixturePath('placeholder')]).report;
    expect(check(placeholder, 'placeholder').result).toBe('pass');
    expect(check(placeholder, 'decision').result).toBe('not-applicable');
  });
});

describe('suppressed cells', () => {
  it('reports indeterminate when the allowed completions give different results, never verified', () => {
    const { status, report: r } = report([fixturePath('small-card')]);
    const primary = check(r, 'primary-interval');
    expect(primary.result).toBe('indeterminate');
    expect(primary.reason).toMatch(/"<5"/);
    expect(check(r, 'guardrail-interval').result).toBe('pass');
    expect(r.result).toBe('indeterminate');
    expect(status).toBe(0);
  });

  it('passes a check that every allowed completion reproduces', () => {
    const r = report([fixturePath('srm-small')]).report;
    // Group A's entry views are 1 to 4 against 30: the split fails for each of them.
    expect(check(r, 'split-check-entry').result).toBe('pass');
    expect(check(r, 'split-check-entry').reason).toMatch(/every allowed value/);
    // On analysed views (1 to 4 against 20) the flag depends on the hidden value.
    expect(check(r, 'split-check-analysed').result).toBe('indeterminate');
    // Its entry and analysed views are both "<5", so their order cannot be confirmed: the walk
    // cannot rule out a data fault there.
    expect(check(r, 'looks-consistent').result).toBe('indeterminate');
    expect(check(r, 'decision').result).toBe('indeterminate');
    expect(check(r, 'decision').reason).toMatch(/order/);
  });

  it('fails when no allowed completion reproduces the published value', () => {
    const d = fixture('small-card');
    d.primary!.upper += 0.05;
    const r = report([writeTmp(d)]);
    expect(check(r.report, 'primary-interval').result).toBe('fail');
    expect(r.status).toBe(1);
  });

  it('gives the same report whatever count lies behind "<5", so it discloses none', () => {
    const outputs = [1, 2, 3, 4].map((hidden) => {
      const file = writeTmp(publish(smallCard(hidden)));
      return [run([file]).stdout, report([file]).stdout];
    });
    for (const o of outputs) expect(o).toEqual(outputs[0]);
  });

  it('gives the same report whatever engaged count lies behind "<5"', () => {
    const outputs = [1, 2, 3, 4].map((hidden) => {
      const file = writeTmp(publish(smallEngaged(hidden)));
      return [run([file]).stdout, report([file]).stdout];
    });
    expect(fixture('open').looks[0]!.a.engaged).not.toBe('<5');
    expect(publish(smallEngaged(2)).looks[0]!.a.engaged).toBe('<5');
    for (const o of outputs) expect(o).toEqual(outputs[0]);
  });

  it('gives the same report whatever running totals lie behind "<5" cells at several looks', () => {
    const pairs: [number, number][] = [[1, 1], [1, 4], [2, 3], [4, 4]];
    const outputs = pairs.map((pair) => {
      const d = publish(twoSmallCards(pair));
      expect(d.looks.slice(0, 2).map((l) => l.a.card)).toEqual(['<5', '<5']);
      const file = writeTmp(d);
      return [run([file]).stdout, report([file]).stdout];
    });
    for (const o of outputs) expect(o).toEqual(outputs[0]);
  });

  it('never prints the counts it enumerates', () => {
    const text = run([fixturePath('small-card')]).stdout;
    expect(text).not.toMatch(/completion[^.\n]*\b[1-4]\b/i);
    expect(text).not.toMatch(/hidden|inferred|recovered/i);
  });
});

describe('faults, late flags and calibration', () => {
  it('states that a held look cannot be recomputed and checks the published flagged look', () => {
    const r = report([fixturePath('held-fault')]).report;
    expect(check(r, 'held').result).toBe('indeterminate');
    expect(check(r, 'held').reason).toMatch(/not published/);
    expect(check(r, 'split-check-entry').result).toBe('pass');
    expect(check(r, 'decision').result).toBe('pass');
  });

  it('keeps the decision and states that a late split flag cannot be recomputed', () => {
    const r = report([fixturePath('late-srm')]).report;
    expect(check(r, 'decision').result).toBe('pass');
    expect(check(r, 'after-decision').result).toBe('indeterminate');
  });

  it('reports a stop recorded only as a stored closure, rather than recomputing or failing it', () => {
    const stored = report([fixturePath('aa-stored-closure')]).report;
    expect(check(stored, 'calibration-rule').result).toBe('indeterminate');
    expect(check(stored, 'calibration-rule').reason).toMatch(/recorded closure/);
    // The site's blinding and detectable effect rest on today's counts: the stop does not end the
    // analysis it reports on.
    expect(check(stored, 'blinding').result).toBe('pass');
    expect(check(stored, 'detectable-at-current').result).toBe('pass');
    const mismatch = report([fixturePath('aa-closure-mismatch')]).report;
    for (const id of ['calibration-rule', 'blinding', 'detectable-at-current', 'final-descriptive']) {
      expect(check(mismatch, id).result, id).toBe('indeterminate');
    }
  });

  it('recomputes the A/A rule', () => {
    const r = report([fixturePath('aa-ready')]).report;
    expect(check(r, 'calibration-rule').result).toBe('pass');
    expect(check(r, 'primary-interval').result).toBe('pass');
    expect(check(r, 'decision').result).toBe('not-applicable');
    const failed = fixture('aa-ready');
    failed.calibration!.failed = { day: failed.looks[3]!.day, reason: 'srm' };
    expect(check(report([writeTmp(failed)]).report, 'calibration-rule').result).toBe('fail');
  });
});

describe('invalid payloads', () => {
  const invalid = (file: string) => {
    const { status, report: r } = report([file]);
    expect(r.result).toBe('invalid');
    expect(r.errors.length).toBeGreaterThan(0);
    expect(status).toBe(2);
    return r;
  };

  it('rejects non-finite numbers, written as NaN, Infinity or an overflowing literal', () => {
    const text = readFileSync(fixturePath('open'), 'utf8');
    invalid(fixturePath('malformed-nan'));
    invalid(writeTmp(null, text.replace(/"lower": [-0-9.e]+/, '"lower": Infinity')));
    invalid(writeTmp(null, text.replace(/"upper": [-0-9.e]+/, '"upper": 1e999')));
  });

  it('rejects a payload that is not the published schema', () => {
    invalid(fixturePath('malformed-schema'));
    invalid(writeTmp({ ...fixture('open'), schema: 'experiment-data/2' }));
    invalid(writeTmp(null, '[]'));
    invalid(writeTmp(null, '{"schema": "experiment-data/1"'));
    const cell = fixture('open');
    (cell.looks[0]!.a as Record<string, unknown>).entry = '<6';
    invalid(writeTmp(cell));
    const negative = fixture('open');
    negative.looks[0]!.a.entry = -1;
    invalid(writeTmp(negative));
    const fraction = fixture('open');
    fraction.current.a.inview = 5.5;
    invalid(writeTmp(fraction));
  });

  it('exits 2 when the file cannot be read', () => {
    expect(run([join(tmp, 'missing.json')]).status).toBe(2);
  });

  /** Exit 2 with no traceback, in both modes, and only printable ASCII on stdout. */
  const cleanlyInvalid = (file: string, message: RegExp) => {
    for (const mode of [[], ['--json']]) {
      const r = runBytes([file, ...mode]);
      expect(r.status, r.stderr).toBe(2);
      expect(r.stderr).not.toMatch(/Traceback/);
      expect(r.stdout.toString('latin1')).not.toMatch(NON_ASCII_OR_CONTROL);
      expect(r.stdout.toString('utf8')).toMatch(message);
    }
    const { report: rep } = report([file]);
    expect(rep.result).toBe('invalid');
  };

  it('rejects a file that is not UTF-8 text, such as Latin-1 or unexpanded gzip', () => {
    cleanlyInvalid(writeTmp(null, Buffer.from('{"schema": "caf\xe9"}', 'latin1')), /not UTF-8/);
    cleanlyInvalid(writeTmp(null, Buffer.from([0x1f, 0x8b, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x03])), /not UTF-8/);
  });

  it('rejects JSON nested too deeply to read', () => {
    cleanlyInvalid(writeTmp(null, `${'['.repeat(200_000)}${']'.repeat(200_000)}`), /nested too deeply/);
  });

  it('rejects an integer too long to read, and one too large for a float', () => {
    cleanlyInvalid(writeTmp(null, `{"schema": ${'9'.repeat(5000)}}`), /too long/);
    const text = readFileSync(fixturePath('open'), 'utf8');
    cleanlyInvalid(writeTmp(null, text.replace(/"alpha": [0-9.e-]+/, `"alpha": 1${'0'.repeat(400)}`)), /config\.alpha/);
  });

  it('prints a key holding a lone surrogate escaped, in both modes', () => {
    const text = readFileSync(fixturePath('open'), 'utf8').replace('"entry": 120,', '"entry": 120, "\\ud800": 1,');
    expect(text).toContain('"\\ud800": 1');
    cleanlyInvalid(writeTmp(null, text), /is not a published count/);
  });

  it('rejects a minimum per group below 5, which a "<5" cell could not be compared with', () => {
    const d = fixture('open');
    d.config.minPerGroup = 1;
    d.looks[0]!.a.inview = '<5';
    d.looks[0]!.a.card = '<5';
    cleanlyInvalid(writeTmp(d), /minPerGroup/);
  });

  it('rejects a reference case too large to compute', () => {
    const text = readFileSync(REFERENCE, 'utf8').replace(/"nA": 500,/, `"nA": 1${'0'.repeat(400)},`);
    expect(text).toContain('"nA": 10000');
    const file = writeTmp(null, text);
    for (const mode of [[], ['--json']]) {
      const r = runBytes(['--reference', file, ...mode]);
      expect(r.status, r.stderr).toBe(2);
      expect(r.stderr).not.toMatch(/Traceback/);
    }
  });

  it('maps any unexpected error to exit 2 with a one-line message, never exit 1', () => {
    for (const mode of [[], ['--json']]) {
      const code = [
        'import sys',
        `sys.path.insert(0, ${JSON.stringify(join(ROOT, 'scripts'))})`,
        'import verify_experiment as v',
        'def boom(d):',
        '    raise TypeError("boom")',
        'v.verify_data = boom',
        `sys.exit(v.main(${JSON.stringify([fixturePath('open'), ...mode])}))`,
      ].join('\n');
      const r = spawnSync('python3', ['-I', '-c', code], { encoding: 'utf8', cwd: ROOT });
      expect(r.status, r.stderr).toBe(2);
      expect(r.stderr).not.toMatch(/Traceback/);
      expect(`${r.stdout}${r.stderr}`).toMatch(/internal error \(TypeError\)/);
    }
  });
});

describe('a closed output pipe', () => {
  /** Runs main with a stdout that raises BrokenPipeError, as `| head -1` would after it exits. */
  const brokenPipe = (fail: boolean, mode: string[]) => {
    const code = [
      'import sys',
      `sys.path.insert(0, ${JSON.stringify(join(ROOT, 'scripts'))})`,
      'import verify_experiment as v',
      'class Closed:',
      '    def write(self, s):',
      '        raise BrokenPipeError(32, "Broken pipe")',
      '    def flush(self):',
      '        raise BrokenPipeError(32, "Broken pipe")',
      ...(fail ? ['def boom(d):', '    raise TypeError("boom")', 'v.verify_data = boom'] : []),
      'sys.stdout = Closed()',
      `sys.exit(v.main(${JSON.stringify([fixturePath('open'), ...mode])}))`,
    ].join('\n');
    return spawnSync('python3', ['-I', '-c', code], { encoding: 'utf8', cwd: ROOT });
  };

  it.each([[[]], [['--json']]])('exits 2 quietly when the report cannot be written (%j)', (mode) => {
    const r = brokenPipe(false, mode);
    expect(r.status, r.stderr).toBe(2);
    expect(r.stderr).not.toMatch(/Traceback|Exception ignored/);
  });

  it.each([[[]], [['--json']]])('exits 2 quietly when the internal-error message cannot be written (%j)', (mode) => {
    const r = brokenPipe(true, mode);
    expect(r.status, r.stderr).toBe(2);
    expect(r.stderr).not.toMatch(/Traceback|Exception ignored/);
  });
});

describe('text from the payload', () => {
  it('escapes control characters before printing them', () => {
    const d = fixture('open');
    d.prereg.tag = '\u001b[31mRED\u001b[0m';
    for (const mode of [[], ['--json']]) {
      const r = runBytes([writeTmp(d), ...mode]);
      expect(r.status).toBe(0);
      expect(r.stdout.includes(0x1b)).toBe(false);
      expect(r.stdout.toString('latin1')).not.toMatch(NON_ASCII_OR_CONTROL);
    }
    expect(runBytes([writeTmp(d)]).stdout.toString('utf8')).toContain('\\x1b[31mRED');
  });
});

describe('the human-readable output', () => {
  it('prints one line per check and a summary, and needs no network', () => {
    const { status, stdout } = run([fixturePath('small-card'), '--reference', REFERENCE]);
    expect(status).toBe(0);
    expect(stdout).toMatch(/^INDETERMINATE {2}primary-interval: /m);
    expect(stdout).toMatch(/^PASS {11}guardrail-interval: /m);
    expect(stdout).toMatch(/^Result: indeterminate/m);
    const source = readFileSync(SCRIPT, 'utf8');
    expect(source).not.toMatch(/^\s*(?:import|from)\s+(?:urllib|http|socket|requests|numpy|scipy|statsmodels)\b/m);
  });
});
