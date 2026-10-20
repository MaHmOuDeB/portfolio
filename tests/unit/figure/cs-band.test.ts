import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  confidenceModel,
  confidenceTable,
  confidenceYDomain,
  contentBody,
  ceilAt,
  csPointFromInterval,
  formatIntervalPoints,
  intervalDigits,
  liveFigureState,
  MAX_POINTS,
  runningIntersection,
  shownSeries,
  type CsPoint,
  type LiveSnapshot,
} from '@/lib/figure/cs-band';
import { MIN_PER_GROUP, resolveFigureBody } from '@/lib/figure/states';
import { mixtureCs } from '@/lib/stats';
import { ref } from '../stats/reference';

// Review Focus 4: extreme live data. Every difference is B − A in percentage points.

const BASE: LiveSnapshot = {
  phase: 'ab',
  freshness: { kind: 'fresh' },
  nA: 180,
  nB: 176,
  series: [
    { n: 50, lower: -76, upper: 84, estimate: 4 },
    { n: 176, lower: -12.2, upper: 31, estimate: 9.4 },
  ],
  capPerArm: 230,
  projectedHalfWidthAtCap: 12,
  plannedEnd: '2026-12-01T10:00:00Z',
};

const point = fc.record({
  n: fc.integer({ min: 0, max: 5000 }),
  lower: fc.double({ min: -150, max: 150, noNaN: true }),
  upper: fc.double({ min: -150, max: 150, noNaN: true }),
  estimate: fc.double({ min: -150, max: 150, noNaN: true }),
});
// Anything a broken store could send, NaN and the infinities included.
const wild = fc.oneof(fc.double(), fc.constantFrom(Number.NaN, Infinity, -Infinity, -0, 0, 1e308, -1e308));
const wildPoint = fc.record({ n: wild, lower: wild, upper: wild, estimate: wild });
const clampPts = (v: number) => Math.min(MAX_POINTS, Math.max(-MAX_POINTS, v));

describe('runningIntersection', () => {
  it('sorts by views and keeps the tightest bounds so far', () => {
    const out = runningIntersection([
      { n: 100, lower: -20, upper: 40, estimate: 10 },
      { n: 50, lower: -60, upper: 80, estimate: 10 },
      // The band would grow back here.
      { n: 150, lower: -30, upper: 50, estimate: 10 },
    ]);
    expect(out.map((p) => p.n)).toEqual([50, 100, 150]);
    expect(out.map((p) => [p.lower, p.upper])).toEqual([
      [-60, 80],
      [-20, 40],
      [-20, 40],
    ]);
  });

  it('never lets the band grow back: width non-increasing, lower non-decreasing, upper non-increasing', () => {
    fc.assert(
      fc.property(fc.array(point, { maxLength: 40 }), (points) => {
        const out = runningIntersection(points);
        expect(out).toHaveLength(points.length);
        for (let i = 1; i < out.length; i++) {
          const [a, b] = [out[i - 1]!, out[i]!];
          expect(b.n).toBeGreaterThanOrEqual(a.n);
          expect(b.lower).toBeGreaterThanOrEqual(a.lower);
          expect(b.upper).toBeLessThanOrEqual(a.upper);
          expect(b.upper - b.lower).toBeLessThanOrEqual(a.upper - a.lower + 1e-9);
        }
        for (const p of out) expect(p.lower).toBeLessThanOrEqual(p.upper);
      }),
    );
  });

  it('collapses to a point inside the last band when the bounds cross, and stays monotone', () => {
    const out = runningIntersection([
      { n: 50, lower: -10, upper: 5, estimate: 0 },
      { n: 100, lower: 6, upper: 20, estimate: 13 },
    ]);
    expect(out[1]).toMatchObject({ lower: 5, upper: 5, estimate: 13 });
  });

  it('drops points that are not numbers and swaps inverted bounds', () => {
    const out = runningIntersection([
      { n: Number.NaN, lower: 0, upper: 1, estimate: 0 },
      { n: 60, lower: 30, upper: -30, estimate: 2 },
      { n: 70, lower: Number.NaN, upper: 1, estimate: 0 },
    ]);
    expect(out).toEqual([{ n: 60, lower: -30, upper: 30, estimate: 2 }]);
  });
});

describe('confidenceYDomain', () => {
  const contains = (d: [number, number], v: number) => d[0] <= v && v <= d[1];

  it('holds a first interval ±80 points wide and zero', () => {
    const d = confidenceYDomain([{ n: 50, lower: -80, upper: 85, estimate: 2 }], 10);
    expect(contains(d, -80) && contains(d, 85) && contains(d, 0)).toBe(true);
  });

  it('holds zero when every bound is above it', () => {
    const d = confidenceYDomain([{ n: 300, lower: 4, upper: 9, estimate: 6 }], 2);
    expect(contains(d, 0)).toBe(true);
    expect(contains(d, 9)).toBe(true);
  });

  it('holds the last estimate ± the projected half-width, even outside the band', () => {
    const d = confidenceYDomain([{ n: 120, lower: 20, upper: 25, estimate: 30 }], 40);
    expect(contains(d, -10) && contains(d, 70)).toBe(true);
  });

  it('pads, rounds to nice values and is never zero-width', () => {
    const d = confidenceYDomain([{ n: 60, lower: 0, upper: 0, estimate: 0 }], 0);
    expect(d[0]).toBeLessThan(0);
    expect(d[1]).toBeGreaterThan(0);
    expect(confidenceYDomain([], Number.NaN)[1]).toBeGreaterThan(0);
    const wide = confidenceYDomain([{ n: 50, lower: -80, upper: 80, estimate: 0 }], 0);
    // 10% padding: the bounds never touch the frame edge.
    expect(wide[0]).toBeLessThan(-80);
    expect(wide[1]).toBeGreaterThan(80);
  });

  it('always holds every (clamped) bound, every estimate and zero, finite and ordered', () => {
    fc.assert(
      fc.property(fc.array(wildPoint, { maxLength: 20 }), wild, (points, h) => {
        const d = confidenceYDomain(points as CsPoint[], h);
        expect(Number.isFinite(d[0]) && Number.isFinite(d[1])).toBe(true);
        expect(d[0]).toBeLessThan(d[1]);
        expect(contains(d, 0)).toBe(true);
        for (const p of points) {
          for (const v of [p.lower, p.upper, p.estimate]) {
            if (!Number.isNaN(v)) expect(contains(d, clampPts(v))).toBe(true);
          }
        }
      }),
    );
  });
});

describe('liveFigureState', () => {
  it('reads zero views in both groups as low data, without dividing by zero', () => {
    const state = liveFigureState({ ...BASE, nA: 0, nB: 0 });
    expect(state.live?.data).toBe('low-data');
    expect(resolveFigureBody(state)).toBe('low-data');
  });

  it('reads counts that are not numbers or negative as low data', () => {
    for (const [nA, nB] of [
      [Number.NaN, 200],
      [Infinity, Infinity],
      [-5, 200],
      [200, -Infinity],
    ] as const) {
      expect(liveFigureState({ ...BASE, nA, nB }).live?.data).toBe('low-data');
    }
  });

  it('passes the phase, the freshness and the runtime through', () => {
    const paused = { kind: 'paused', pausedOn: '2026-10-14T09:00:00Z', reason: 'a fictional fault' } as const;
    const state = liveFigureState({ ...BASE, phase: 'calibration', freshness: paused }, 'no-js');
    expect(state).toEqual({ runtime: 'no-js', live: { phase: 'calibration', data: 'enough-data', freshness: paused } });
    expect(liveFigureState(BASE)).not.toHaveProperty('runtime');
  });

  it('hides the estimate below 50 per group: enough counts but no point at 50 or more is low data', () => {
    const s = { ...BASE, series: [{ n: MIN_PER_GROUP - 1, lower: -9, upper: 9, estimate: 0 }] };
    expect(shownSeries(s)).toEqual([]);
    expect(liveFigureState(s).live?.data).toBe('low-data');
  });

  it('contentBody ignores the runtime and a pause', () => {
    const paused = { kind: 'paused', pausedOn: '2026-10-14T09:00:00Z', reason: 'x' } as const;
    expect(contentBody({ ...BASE, freshness: paused })).toBe('ab');
    expect(contentBody({ ...BASE, phase: 'srm-suppressed', freshness: paused })).toBe('srm-suppressed');
    expect(contentBody({ ...BASE, nA: 12, nB: 14 })).toBe('low-data');
  });
});

describe('shownSeries', () => {
  it('clamps bounds to ±100 points, keeps an estimate outside its band and sorts', () => {
    const out = shownSeries({
      ...BASE,
      series: [
        { n: 80, lower: -20, upper: 30, estimate: 40 },
        { n: 50, lower: -Infinity, upper: 1e9, estimate: 2 },
      ],
    });
    expect(out).toEqual([
      { n: 50, lower: -100, upper: 100, estimate: 2 },
      { n: 80, lower: -20, upper: 30, estimate: 40 },
    ]);
  });
});

describe('intervalDigits and formatIntervalPoints', () => {
  // The rule: one decimal below ten points of width, none above; then more decimals (up to three)
  // until every bound that is not exactly zero shows a non-zero digit. Only a bound smaller than
  // 0.0005 points can still print "0", and only where no sign is claimed: a verdict sentence
  // rounds it away from zero to the smallest shown unit.
  it('gives a decimal to narrow intervals, so −0.4 to +0.3 never prints as zero to zero', () => {
    expect(intervalDigits(-12, 31)).toBe(0);
    expect(intervalDigits(-0.4, 0.3)).toBe(1);
    expect(intervalDigits(0, 26)).toBe(0);
  });

  it('adds decimals until no bound that is not zero prints "0"', () => {
    expect(formatIntervalPoints(0.3, 26.3)).toBe('+0.3 to +26.3');
    expect(formatIntervalPoints(-26.3, -0.4)).toBe('−26.3 to −0.4');
    expect(formatIntervalPoints(0.04, 9.9)).toBe('+0.04 to +9.90');
    expect(formatIntervalPoints(-0.04, 0.03)).toBe('−0.04 to +0.03');
    expect(formatIntervalPoints(-12.2, 31)).toBe('−12 to +31');
    expect(formatIntervalPoints(0, 26)).toBe('0 to +26');
  });

  it('prints a bound below the display floor as "0", or rounds it away from zero where a sign is claimed', () => {
    expect(intervalDigits(0.0001, 20)).toBe(3);
    expect(formatIntervalPoints(-0.0001, 0.0002)).toBe('0 to 0');
    expect(formatIntervalPoints(0.0001, 20, { awayFromZero: true })).toBe('+0.001 to +20.000');
    expect(formatIntervalPoints(-20, -0.0001, { awayFromZero: true })).toBe('−20.000 to −0.001');
  });

  it('never prints a bound that is not zero as "0" above the floor (property)', () => {
    const bound = fc.double({ min: -100, max: 100, noNaN: true }).filter((v) => v === 0 || Math.abs(v) >= 0.0005);
    fc.assert(
      fc.property(bound, bound, (a, b) => {
        const [lower, upper] = [Math.min(a, b), Math.max(a, b)];
        const [lo, hi] = formatIntervalPoints(lower, upper).split(' to ');
        if (lower !== 0) expect(lo).not.toBe('0');
        if (upper !== 0) expect(hi).not.toBe('0');
        expect(`${lo} ${hi}`).not.toMatch(/[−+]0(\.0+)?(?!\.?\d)/);
      }),
    );
  });
});

describe('ceilAt', () => {
  it('rounds up at the given decimals without float artefacts', () => {
    expect(ceilAt(0.07, 2)).toBe(0.07);
    expect(ceilAt(0.1, 1)).toBe(0.1);
    expect(ceilAt(0.29, 2)).toBe(0.29);
    expect(ceilAt(22, 0)).toBe(22);
    expect(ceilAt(22.4, 0)).toBe(23);
    expect(ceilAt(0.071, 2)).toBe(0.08);
  });

  it('never rounds down and never by a whole unit or more (property)', () => {
    // The snap before the ceiling forgives a gap under 1e-9 of a unit (a float artefact), so the
    // lower bound is v less that tolerance.
    fc.assert(
      fc.property(fc.double({ min: 0, max: 100, noNaN: true }), fc.integer({ min: 0, max: 3 }), (v, d) => {
        const r = ceilAt(v, d);
        expect(r).toBeGreaterThanOrEqual(v - 1e-9 / 10 ** d);
        expect(r).toBeLessThan(v + 10 ** -d);
      }),
    );
  });
});

describe('csPointFromInterval', () => {
  it('turns a mixtureCs interval in proportions into percentage points (a reference case)', () => {
    // stats-ref: 0 of 100 in A, 5 of 100 in B.
    const c = ref.mixtureCs.find((r) => r.xA === 0 && r.nA === 100 && r.xB === 5 && r.nB === 100)!;
    const p = csPointFromInterval(100, mixtureCs(c, { tau2: c.tau2, alpha: c.alpha }));
    expect(p.n).toBe(100);
    expect(p.estimate).toBeCloseTo(5, 9);
    expect(p.lower).toBeCloseTo(c.lower * 100, 9);
    expect(p.upper).toBeCloseTo(c.upper * 100, 9);
    expect(p.lower).toBeCloseTo(-2.21764241671, 6);
    expect(p.upper).toBeCloseTo(12.2176424167, 6);
  });

  it('clamps the unclamped half-width of a tiny sample to ±100 points', () => {
    const p = csPointFromInterval(1, { estimate: 0, lower: -15.7, upper: 15.7 });
    expect(p).toEqual({ n: 1, estimate: 0, lower: -100, upper: 100 });
  });
});

describe('confidenceTable', () => {
  it('lists both groups\' views and the running interval at each look, with live refs by default', () => {
    const t = confidenceTable(BASE);
    expect(t.columns).toEqual(['Views in A', 'Views in B', 'Lower', 'Estimate', 'Upper']);
    // BASE has no recorded split, so each look shows the smaller group's count in both columns.
    expect(t.rows).toEqual([
      [50, 50, -76, 4, 84],
      [176, 176, -12.2, 9.4, 31],
    ]);
    expect(t.formats).toEqual(['count', 'count', 'signedPoints', 'signedPoints', 'signedPoints']);
    expect(t.note).toBe('Lower, estimate and upper are B − A in percentage points.');
    expect(t.refs).toEqual(['live']);
    expect(confidenceTable(BASE, ['simulated']).refs).toEqual(['simulated']);
  });

  it('uses the recorded split of each look', () => {
    const s = { ...BASE, series: [{ n: 176, nA: 180, nB: 176, lower: -12.2, upper: 31, estimate: 9.4 }] };
    expect(confidenceTable(s).rows).toEqual([[180, 176, -12.2, 9.4, 31]]);
  });

  it('shows no interval in low data or when the split check failed, but both groups\' counts', () => {
    expect(confidenceTable({ ...BASE, nA: 12, nB: 14 }).rows).toEqual([[12, 14, 'Not shown yet', 'Not shown yet', 'Not shown yet']]);
    expect(confidenceTable({ ...BASE, phase: 'srm-suppressed' }).rows).toEqual([[180, 176, 'Not shown', 'Not shown', 'Not shown']]);
    expect(confidenceTable({ ...BASE, nA: Number.NaN }).rows[0]![0]).toBe(0);
  });

  it('prints each row with the digits of its own interval, so the table agrees with the Now row', () => {
    const t = confidenceTable(BASE);
    expect(t.rowDigits).toEqual([0, 0]);
    const last = t.rows[t.rows.length - 1]!;
    const digits = t.rowDigits![t.rows.length - 1]!;
    expect(digits).toBe(intervalDigits(-12.2, 31));
    // "−12 to +31" in the Now row is the lower and upper cells of the table row.
    expect(formatIntervalPoints(last[2] as number, last[4] as number)).toBe('−12 to +31');
    // A narrow interval keeps one decimal in every cell of its row.
    const narrow = { ...BASE, series: [{ n: 176, lower: 2.2, upper: 7.4, estimate: 4.8 }] };
    expect(confidenceTable(narrow).rowDigits).toEqual([1]);
  });
});

describe('confidenceModel', () => {
  it('runs the x-axis to the cap and projects the band there, narrowing to estimate ± half-width', () => {
    const m = confidenceModel(BASE)!;
    expect(m.x.domain).toEqual([0, 230]);
    expect(m.current).toEqual({ n: 176, lower: -12.2, upper: 31, estimate: 9.4 });
    expect(m.projection).toMatchObject({ fromN: 176, toN: 230, fromLower: -12.2, fromUpper: 31 });
    expect(m.projection!.toLower).toBeCloseTo(-2.6, 9);
    expect(m.projection!.toUpper).toBeCloseTo(21.4, 9);
    expect(m.includesZero).toBe(true);
  });

  it('keeps the projection inside the last band when the estimate lies outside it', () => {
    const m = confidenceModel({ ...BASE, series: [{ n: 100, lower: 5, upper: 10, estimate: 30 }], projectedHalfWidthAtCap: 3 })!;
    expect(m.projection).toMatchObject({ toLower: 7, toUpper: 10 });
  });

  it('has no projection once the series reaches the cap, and stretches the axis to a point past it', () => {
    const m = confidenceModel({ ...BASE, capPerArm: 150 })!;
    // A sliver of room past the last look, so its dot is never cut by the frame edge.
    expect(m.x.domain[1]).toBeCloseTo(176 * 1.02, 9);
    expect(m.projection).toBeUndefined();
    expect(confidenceModel({ ...BASE, capPerArm: 176 })!.x.domain[1]).toBeCloseTo(176 * 1.02, 9);
  });

  it('is null when nothing may be drawn', () => {
    expect(confidenceModel({ ...BASE, series: [] })).toBeNull();
    expect(confidenceModel({ ...BASE, nA: 12 })).toBeNull();
  });

  it('chooses tick digits from the step for any data, so no two labels collide', () => {
    let drawn = 0;
    fc.assert(
      fc.property(fc.array(fc.oneof(point, wildPoint), { maxLength: 12 }), fc.oneof(wild, fc.integer({ min: 1, max: 1e6 })), wild, (series, cap, h) => {
        const m = confidenceModel({ ...BASE, series: series as CsPoint[], capPerArm: cap, projectedHalfWidthAtCap: h });
        if (m === null) return;
        drawn += 1;
        for (const axis of [m.x, m.y]) {
          for (const ticks of [axis.ticks.narrow, axis.ticks.wide]) {
            const labels = ticks.map(axis.format);
            expect(new Set(labels).size).toBe(labels.length);
            ticks.forEach((v, i) => {
              if (v !== 0) expect(labels[i]).not.toBe(axis.format(0));
            });
          }
        }
      }),
      { numRuns: 300 },
    );
    expect(drawn).toBeGreaterThan(100);
  }, 30_000);
});
