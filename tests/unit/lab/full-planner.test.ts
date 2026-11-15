// The full sample-size planner: the sizing model (the base planner's arithmetic plus a display unit
// for the rise), the duration model, their static URL schemas and what hostile shared URLs become,
// the relative display on the integer-point grid, the paired eager-loading keys, the Lab's one
// merged Figure (its model, keys and words), the server-rendered presets (the Retention page's pair
// and the Lab's Figure), and the code the page loads at once.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import fc from 'fast-check';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { auditHtml } from '../../../scripts/truth-audit.ts';
import { FACTS, FACT_DISPLAYS } from '../../../src/lib/facts/facts.generated.ts';
import { hasFigureKeys } from '@/components/figures/EagerOrIntent';
import { FullPlanner } from '@/components/lab/FullPlanner';
import { InertDurationControls, InertLabPlannerControls, InertSizingControls } from '@/components/lab/FullPlannerControls';
import { DurationFigureView, LabPlannerView, SizingFigureView } from '@/components/lab/FullPlannerView';
import { readFigureParams } from '@/lib/figure/url-state';
import { getFact } from '@/lib/facts';
import {
  DURATION_ID,
  DURATION_PRESETS,
  DURATION_SCHEMA,
  FULL_PLANNER_ID,
  FULL_PLAN_PRESETS,
  FULL_PLAN_SCHEMA,
  LAB_PLAN_PRESETS,
  LAB_PLAN_SCHEMA,
  PLANNER_POWER_TESTS,
  durationModel,
  durationSentence,
  durationTable,
  fullPlanModel,
  fullPlanSentence,
  pairedSentence,
  fullPlanTable,
  labPlanLead,
  labPlanModel,
  labPlanSentence,
  labPlanTable,
  normalizeFullPlan,
  normalizeLabPlan,
  normalizeTraffic,
  relativePercent,
  relativeSliderBounds,
  risePointsFromRelative,
  type FullPlanValues,
  type LabPlanValues,
} from '@/lib/lab/full-planner';
import { PLANNER_POWER, normalizePlanner, planModel } from '@/lib/lab/planner';
import { PLANNER_COPY } from '../../../content/lab';
import { SAMPLE_SIZE_FORMULA, durationWeeks, sampleSizePerArm } from '@/lib/stats';
import { snapToStep } from '@/lib/figure/snap';

const PRESET: FullPlanValues = { baseline: 0.29, risePoints: 5, mode: 'absolute' };

/** What a shared URL shows: the static schema read, then the joint normalization. */
const planFromUrl = (query: string): FullPlanValues =>
  normalizeFullPlan(readFigureParams(new URLSearchParams(query), FULL_PLANNER_ID, FULL_PLAN_SCHEMA, FULL_PLAN_PRESETS).values);
const trafficFromUrl = (query: string): number =>
  normalizeTraffic(readFigureParams(new URLSearchParams(query), DURATION_ID, DURATION_SCHEMA, DURATION_PRESETS).values.traffic);
/** What a shared URL shows on the Lab's one planner Figure. */
const labFromUrl = (query: string): LabPlanValues =>
  normalizeLabPlan(readFigureParams(new URLSearchParams(query), FULL_PLANNER_ID, LAB_PLAN_SCHEMA, LAB_PLAN_PRESETS).values);
const LAB_PRESET: LabPlanValues = { baseline: 0.29, risePoints: 5, traffic: 100 };

describe('fullPlanModel and durationModel', () => {
  it('seeds the preset: 29% plus 5 points needs 1,353 per group, and 1,353 at 100 a day takes 4 weeks', () => {
    expect(fullPlanModel({ baseline: 0.29, risePoints: 5, mode: 'absolute' }).nPerArm).toBe(1353);
    expect(fullPlanModel(PRESET).target).toBe(0.34);
    expect(durationModel(1353, 100)).toEqual({ weeks: 4 });
  });

  it('delegates to the base planner and to durationWeeks', () => {
    for (const v of [PRESET, { baseline: 0.1, risePoints: 2, mode: 'relative' as const }, { baseline: 0.98, risePoints: 1, mode: 'absolute' as const }]) {
      const home = planModel(normalizePlanner(v));
      expect(fullPlanModel(v).nPerArm).toBe(home.nPerArm);
      expect(fullPlanModel(v).target).toBe(home.target);
    }
    for (const [n, traffic] of [[1353, 100], [1, 1], [39_000, 1], [1353, 10_000], [700, 200]] as const) {
      expect(durationModel(n, traffic).weeks).toBe(durationWeeks({ nPerArm: n, entryViewsPerDay: traffic }));
    }
  });

  it('gives the relative rise as a fraction of the baseline, the one the statistics call relative', () => {
    const plan = fullPlanModel(PRESET);
    expect(plan.relativeRise).toBeCloseTo(5 / 29, 14);
    // the same test sized with a relative effect needs the same visitors
    expect(sampleSizePerArm({ baseline: 0.29, mde: plan.relativeRise, mdeType: 'relative', alpha: 0.05, power: 0.8 })).toBe(1353);
  });

  it('switching the unit keeps the baseline, the rise, the target and the sample exactly', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 98 }), fc.integer({ min: 1, max: 30 }), (b, r) => {
        const absolute = normalizeFullPlan({ baseline: b / 100, risePoints: r, mode: 'absolute' });
        const relative = normalizeFullPlan({ ...absolute, mode: 'relative' });
        expect(relative.baseline).toBe(absolute.baseline);
        expect(relative.risePoints).toBe(absolute.risePoints);
        const a = fullPlanModel(absolute);
        const rel = fullPlanModel(relative);
        expect(rel.nPerArm).toBe(a.nPerArm);
        expect(rel.target).toBe(a.target);
        expect(rel.relativeRise).toBe(a.relativeRise);
      }),
      { numRuns: 300 },
    );
  });
});

describe('normalizeFullPlan', () => {
  it('keeps a valid triple and caps the rise at min(30, 99 minus the baseline percent), at least 1', () => {
    expect(normalizeFullPlan(PRESET)).toEqual(PRESET);
    expect(normalizeFullPlan({ baseline: 0.98, risePoints: 5, mode: 'relative' })).toEqual({ baseline: 0.98, risePoints: 1, mode: 'relative' });
    expect(normalizeFullPlan({ baseline: 0.7, risePoints: 30, mode: 'absolute' })).toEqual({ baseline: 0.7, risePoints: 29, mode: 'absolute' });
    expect(normalizeFullPlan({ baseline: 0.2, risePoints: 99, mode: 'absolute' })).toEqual({ baseline: 0.2, risePoints: 30, mode: 'absolute' });
    expect(normalizeFullPlan({ baseline: 0.5, risePoints: 0, mode: 'absolute' })).toEqual({ baseline: 0.5, risePoints: 1, mode: 'absolute' });
  });

  it('falls back to the preset for NaN, clamps infinities and treats an unknown unit as points', () => {
    expect(normalizeFullPlan({ baseline: Number.NaN, risePoints: Number.NaN, mode: 'absolute' })).toEqual(PRESET);
    expect(normalizeFullPlan({ baseline: Number.POSITIVE_INFINITY, risePoints: Number.NEGATIVE_INFINITY, mode: 'relative' })).toEqual({
      baseline: 0.98,
      risePoints: 1,
      mode: 'relative',
    });
    expect(normalizeFullPlan({ ...PRESET, mode: 'toString' as never })).toEqual(PRESET);
  });

  it('property: any input stays in bounds, on the grid, idempotent and computable', () => {
    const anyNumber = fc.oneof(fc.double(), fc.double({ min: -2, max: 2 }), fc.integer({ min: -100, max: 200 }));
    const anyMode = fc.oneof(fc.constantFrom('absolute', 'relative'), fc.string()) as fc.Arbitrary<FullPlanValues['mode']>;
    fc.assert(
      fc.property(anyNumber, anyNumber, anyMode, (baseline, risePoints, mode) => {
        const v = normalizeFullPlan({ baseline, risePoints, mode });
        const percent = Math.round(v.baseline * 100);
        expect(v.baseline).toBe(percent / 100);
        expect(percent).toBeGreaterThanOrEqual(1);
        expect(percent).toBeLessThanOrEqual(98);
        expect(Number.isInteger(v.risePoints)).toBe(true);
        expect(v.risePoints).toBeGreaterThanOrEqual(1);
        expect(v.risePoints).toBeLessThanOrEqual(Math.min(30, 99 - percent));
        expect(['absolute', 'relative']).toContain(v.mode);
        expect(normalizeFullPlan(v)).toEqual(v);
        const plan = fullPlanModel(v);
        expect(Number.isSafeInteger(plan.nPerArm)).toBe(true);
        expect(plan.target).toBeGreaterThan(v.baseline);
        expect(plan.target).toBeLessThanOrEqual(0.99);
        expect(Number.isFinite(plan.relativeRise) && plan.relativeRise > 0).toBe(true);
      }),
      { numRuns: 500 },
    );
  });
});

describe('the relative display on the integer-point grid', () => {
  it('shows 100 x (rise / 100) / baseline percent of the baseline', () => {
    expect(relativePercent(0.29, 5)).toBeCloseTo((100 * (5 / 100)) / 0.29, 12);
    expect(relativePercent(0.5, 10)).toBe(20);
    expect(relativePercent(0.01, 30)).toBe(3000);
  });

  it('maps an edited percent to the nearest whole point, then normalizes', () => {
    expect(risePointsFromRelative(0.29, 17.2)).toBe(5);
    expect(risePointsFromRelative(0.29, 20)).toBe(6); // 20% of 29% is 5.8 points
    expect(risePointsFromRelative(0.5, 21)).toBe(11); // 10.5 points rounds half up
    expect(risePointsFromRelative(0.98, 50)).toBe(1); // capped at 99%
    expect(risePointsFromRelative(0.29, 0)).toBe(1);
    expect(risePointsFromRelative(0.29, -40)).toBe(1);
    expect(risePointsFromRelative(0.29, Number.NaN)).toBe(5);
    expect(risePointsFromRelative(0.29, Number.POSITIVE_INFINITY)).toBe(30);
  });

  it("steps one canonical point per step, so the slider's own snapping never shows a second effect", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 98 }), fc.double({ min: -1e4, max: 1e4, noNaN: true }), (b, typed) => {
        const baseline = b / 100;
        const { min, max, step } = relativeSliderBounds(baseline);
        const cap = Math.min(30, 99 - b);
        expect(min).toBeCloseTo(100 / b, 12);
        expect(step).toBeCloseTo(100 / b, 12);
        expect(max).toBeCloseTo((100 * cap) / b, 9);
        // every value the slider can hold is exactly one whole point's percent, and maps back to it
        const shown = snapToStep(typed, min, max, step);
        const points = risePointsFromRelative(baseline, shown);
        expect(shown).toBeCloseTo(relativePercent(baseline, points), 9);
        // each grid position is its own point
        for (let k = 1; k <= cap; k++) {
          expect(risePointsFromRelative(baseline, snapToStep(relativePercent(baseline, k), min, max, step))).toBe(k);
        }
      }),
      { numRuns: 200 },
    );
  });
});

describe('URL state', () => {
  it('has two static schemas with their own default presets, with no param named preset', () => {
    expect(FULL_PLANNER_ID).toBe('planner');
    expect(DURATION_ID).toBe('duration');
    expect(FULL_PLAN_SCHEMA).toEqual({
      baseline: { kind: 'number', min: 0.01, max: 0.98, step: 0.01 },
      risePoints: { kind: 'number', min: 1, max: 30, step: 1 },
      mode: { kind: 'enum', values: ['absolute', 'relative'] },
    });
    expect(FULL_PLAN_PRESETS).toEqual({ default: PRESET });
    expect(DURATION_SCHEMA).toEqual({ traffic: { kind: 'number', min: 1, max: 10_000, step: 1 } });
    expect(DURATION_PRESETS).toEqual({ default: { traffic: 100 } });
  });

  it('reads hostile shared URLs into a valid plan and traffic', () => {
    expect(planFromUrl('')).toEqual(PRESET);
    expect(planFromUrl('planner.baseline=0.98&planner.risePoints=30&planner.mode=relative')).toEqual({ baseline: 0.98, risePoints: 1, mode: 'relative' });
    expect(planFromUrl('planner.baseline=abc&planner.risePoints=&planner.mode=RELATIVE')).toEqual(PRESET);
    expect(planFromUrl('planner.baseline=-1&planner.risePoints=1e9&planner.mode=__proto__')).toEqual({ baseline: 0.01, risePoints: 30, mode: 'absolute' });
    expect(planFromUrl('planner.baseline=0.4&planner.baseline=0.9&planner.mode=relative&planner.mode=absolute')).toEqual({
      baseline: 0.4,
      risePoints: 5,
      mode: 'relative',
    });
    expect(planFromUrl('planner.preset=toString&planner.unknown=1&duration.traffic=5')).toEqual(PRESET);
    expect(trafficFromUrl('')).toBe(100);
    expect(trafficFromUrl('duration.traffic=NaN')).toBe(100);
    expect(trafficFromUrl('duration.traffic=-5')).toBe(1);
    expect(trafficFromUrl('duration.traffic=Infinity')).toBe(10_000);
    expect(trafficFromUrl('duration.traffic=250.6&duration.traffic=3')).toBe(251);
    expect(trafficFromUrl('planner.traffic=7&duration.preset=__proto__')).toBe(100);
  });

  it('normalizes any traffic, including values that never came through the URL', () => {
    expect(normalizeTraffic(Number.NaN)).toBe(100);
    expect(normalizeTraffic(0)).toBe(1);
    expect(normalizeTraffic(Number.NEGATIVE_INFINITY)).toBe(1);
    expect(normalizeTraffic(1e12)).toBe(10_000);
    expect(normalizeTraffic(99.5)).toBe(100);
    expect(durationModel(1353, Number.NaN)).toEqual({ weeks: 4 });
  });

  it('property: any query string gives a finite plan and a finite whole number of weeks', () => {
    const value = fc.oneof(fc.string(), fc.double().map(String), fc.constantFrom('NaN', 'Infinity', '-Infinity', '-0', '1e308', ' 0.5 ', 'relative'));
    fc.assert(
      fc.property(value, value, value, value, value, (b, r, m, t, p) => {
        const query = new URLSearchParams([
          ['planner.baseline', b],
          ['planner.risePoints', r],
          ['planner.mode', m],
          ['planner.preset', p],
          ['duration.traffic', t],
          ['duration.traffic', b],
        ]).toString();
        const plan = planFromUrl(query);
        expect(normalizeFullPlan(plan)).toEqual(plan);
        const { nPerArm } = fullPlanModel(plan);
        const traffic = trafficFromUrl(query);
        expect(Number.isInteger(traffic) && traffic >= 1 && traffic <= 10_000).toBe(true);
        const { weeks } = durationModel(nPerArm, traffic);
        expect(Number.isSafeInteger(weeks) && weeks >= 1).toBe(true);
      }),
      { numRuns: 300 },
    );
  });

  it('loads the paired island at once for a key of either Figure, and for no other key', () => {
    const has = (query: string) => hasFigureKeys(new URLSearchParams(query), [FULL_PLANNER_ID, DURATION_ID]);
    expect(has('planner.mode=relative')).toBe(true);
    expect(has('duration.traffic=500')).toBe(true);
    expect(has('winback.baseline=0.3')).toBe(false);
    expect(has('planner-x.baseline=0.3&plannerx.mode=relative&duration=5&traffic=5')).toBe(false);
    expect(hasFigureKeys(new URLSearchParams('winback-duration.traffic=9'), ['winback', 'winback-duration'])).toBe(true);
  });
});

describe('the Lab’s one planner Figure: model, URL state and words', () => {
  it('has one static schema with the pair’s two inputs and the traffic, no unit and no param named preset', () => {
    expect(LAB_PLAN_SCHEMA).toEqual({
      baseline: { kind: 'number', min: 0.01, max: 0.98, step: 0.01 },
      risePoints: { kind: 'number', min: 1, max: 30, step: 1 },
      traffic: { kind: 'number', min: 1, max: 10_000, step: 1 },
    });
    expect(Object.keys(LAB_PLAN_SCHEMA)).not.toContain('mode');
    expect(LAB_PLAN_PRESETS).toEqual({ default: LAB_PRESET });
  });

  it('is the same model as the pair: 1,353 per group, a 34% target and 4 weeks at the preset', () => {
    expect(labPlanModel(LAB_PRESET)).toEqual({ nPerArm: 1353, target: 0.34, weeks: 4 });
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 98 }), fc.integer({ min: 1, max: 30 }), fc.integer({ min: 1, max: 10_000 }), (b, r, t) => {
        const v = normalizeLabPlan({ baseline: b / 100, risePoints: r, traffic: t });
        const pair = fullPlanModel({ baseline: v.baseline, risePoints: v.risePoints, mode: 'absolute' });
        const lab = labPlanModel(v);
        expect(lab.nPerArm).toBe(pair.nPerArm);
        expect(lab.target).toBe(pair.target);
        expect(lab.weeks).toBe(durationModel(pair.nPerArm, v.traffic).weeks);
      }),
      { numRuns: 200 },
    );
  });

  it('reads the new keys, and ignores the old ones (the pair’s traffic and unit) for the preset, never throwing', () => {
    expect(labFromUrl('')).toEqual(LAB_PRESET);
    expect(labFromUrl('planner.traffic=500')).toEqual({ ...LAB_PRESET, traffic: 500 });
    expect(labFromUrl('planner.baseline=0.05&planner.risePoints=1&planner.traffic=1000')).toEqual({ baseline: 0.05, risePoints: 1, traffic: 1000 });
    // the old keys: the duration Figure's traffic and the unit toggle are not in the schema
    expect(labFromUrl('duration.traffic=500')).toEqual(LAB_PRESET);
    expect(labFromUrl('planner.mode=relative')).toEqual(LAB_PRESET);
    expect(labFromUrl('duration.traffic=500&planner.mode=relative&planner.risePoints=4')).toEqual({ ...LAB_PRESET, risePoints: 4 });
    // hostile values
    expect(labFromUrl('planner.baseline=0.98&planner.risePoints=30&planner.traffic=-Infinity')).toEqual({ baseline: 0.98, risePoints: 1, traffic: 1 });
    expect(labFromUrl('planner.traffic=NaN&planner.preset=toString&planner.__proto__=1')).toEqual(LAB_PRESET);
    expect(labFromUrl('planner.traffic=1e12')).toEqual({ ...LAB_PRESET, traffic: 10_000 });
  });

  it('property: any query string gives a valid triple with finite readouts', () => {
    const value = fc.oneof(fc.string(), fc.double().map(String), fc.constantFrom('NaN', 'Infinity', '-Infinity', '-0', '1e308', ' 0.5 ', 'relative'));
    fc.assert(
      fc.property(value, value, value, value, (b, r, t, m) => {
        const v = labFromUrl(
          new URLSearchParams([
            ['planner.baseline', b],
            ['planner.risePoints', r],
            ['planner.traffic', t],
            ['planner.mode', m],
            ['duration.traffic', t],
          ]).toString(),
        );
        expect(normalizeLabPlan(v)).toEqual(v);
        const { nPerArm, weeks } = labPlanModel(v);
        expect(Number.isSafeInteger(nPerArm) && nPerArm >= 1).toBe(true);
        expect(Number.isSafeInteger(weeks) && weeks >= 1).toBe(true);
        expect(() => labPlanSentence(v)).not.toThrow();
      }),
      { numRuns: 300 },
    );
  });

  it('loads the Lab island at once for its own keys only; the old duration key no longer loads it', () => {
    const has = (query: string) => hasFigureKeys(new URLSearchParams(query), [FULL_PLANNER_ID]);
    expect(has('planner.traffic=500')).toBe(true);
    expect(has('planner.baseline=0.3')).toBe(true);
    expect(has('duration.traffic=500')).toBe(false);
    expect(has('winback.baseline=0.3&planner-x.traffic=3&traffic=5')).toBe(false);
  });

  it('puts power in plain words, from the planner’s own constant', () => {
    expect(PLANNER_POWER_TESTS).toEqual({ hits: Math.round(PLANNER_POWER * 10), of: 10 });
    expect(PLANNER_POWER_TESTS.hits / PLANNER_POWER_TESTS.of).toBe(PLANNER_POWER);
  });

  it('the result line, the announcement and the table say what was computed, in the Lab’s words', () => {
    expect(labPlanLead(LAB_PRESET)).toBe('To catch a real rise from 29% to 34% in 8 tests out of 10, you need:');
    expect(labPlanSentence(LAB_PRESET)).toBe('To catch a real rise from 29% to 34% in 8 tests out of 10, you need: 1,353 visitors per group and 4 weeks');
    expect(labPlanSentence({ baseline: 0.29, risePoints: 30, traffic: 10_000 })).toMatch(/, you need: [\d,]+ visitors per group and 1 week$/);
    // the line holds one idea: the traffic is on its own control and in the method row, never in the line
    for (const traffic of [1, 100, 10_000]) expect(labPlanLead({ ...LAB_PRESET, traffic })).toBe(labPlanLead(LAB_PRESET));
    expect(labPlanSentence({ ...LAB_PRESET, traffic: 1 })).not.toMatch(/a day/);
    // the announcement is normalized like the Figure
    expect(labPlanSentence({ baseline: Number.NaN, risePoints: Number.NaN, traffic: Number.NaN })).toBe(labPlanSentence(LAB_PRESET));
    const table = labPlanTable(LAB_PRESET);
    expect(table.columns).toEqual(['Input or result', 'Value']);
    expect(table.rows).toEqual([
      ['Sign-up rate today (%)', 29],
      ['Smallest rise worth acting on (percentage points)', 5],
      ['Smallest rise worth acting on (% of the rate today)', relativePercent(0.29, 5)],
      ['Target sign-up rate (%)', 34],
      ['Visitors per day, both groups together', 100],
      ['Visitors per group', 1353],
      ['Visitors in all', 2706],
      ['Weeks, rounded up', 4],
    ]);
    expect(table.formats).toEqual(['number', 'points']);
    expect(table.rowDigits).toEqual([0, 0, 1, 0, 0, 0, 0, 0]);
    expect(table.refs).toEqual(['simulated']);
  });
});

describe('tables and sentences', () => {
  it('the sizing table follows the values, the relative row on its own decimal', () => {
    const table = fullPlanTable(PRESET);
    expect(table.refs).toEqual(['simulated']);
    expect(table.columns).toEqual(['Input or result', 'Value']);
    expect(table.rows).toEqual([
      ['Baseline conversion (%)', 29],
      ['Rise to detect (percentage points)', 5],
      ['Rise to detect (% of baseline)', relativePercent(0.29, 5)],
      ['Target conversion (%)', 34],
      ['Visitors per group', 1353],
    ]);
    expect(table.formats).toEqual(['number', 'points']);
    expect(table.rowDigits).toEqual([0, 0, 1, 0, 0]);
    // the unit does not change the numbers
    expect(fullPlanTable({ ...PRESET, mode: 'relative' })).toEqual(table);
    expect(fullPlanTable(PRESET, 'customers').rows.at(-1)).toEqual(['Customers per group', 1353]);
  });

  it('the duration table and the sentences say what was computed', () => {
    expect(durationTable(1353, 100)).toEqual({
      columns: ['Input or result', 'Value'],
      rows: [
        ['Visitors per day, both groups together', 100],
        ['Visitors per group', 1353],
        ['Visitors in all', 2706],
        ['Weeks, rounded up', 4],
      ],
      formats: ['number', 'count'],
      refs: ['simulated'],
    });
    expect(fullPlanSentence(PRESET)).toBe('1,353 visitors per group to detect a rise of 5 points, from 29% to 34%');
    expect(fullPlanSentence({ ...PRESET, mode: 'relative' })).toBe('1,353 visitors per group to detect a rise of 17.2% of the baseline, from 29% to 34%');
    expect(fullPlanSentence({ baseline: 0.98, risePoints: 1, mode: 'absolute' }, 'customers')).toMatch(/^[\d,]+ customers per group to detect a rise of 1 point, from 98% to 99%$/);
    expect(durationSentence(1353, 100)).toBe('4 weeks at 100 visitors a day to reach 1,353 visitors per group');
    expect(durationSentence(1, 10_000)).toBe('1 week at 10,000 visitors a day to reach 1 visitor per group');
  });

  it('the sizing announcement also says the weeks at the current traffic, since a sizing change moves them', () => {
    expect(pairedSentence(PRESET, 100)).toBe('1,353 visitors per group to detect a rise of 5 points, from 29% to 34%; both groups fill in 4 weeks at 100 visitors a day');
    expect(pairedSentence({ ...PRESET, mode: 'relative' }, 500, 'customers')).toBe(
      '1,353 customers per group to detect a rise of 17.2% of the baseline, from 29% to 34%; both groups fill in 1 week at 500 customers a day',
    );
    // the traffic is normalized like the duration Figure's own
    expect(pairedSentence(PRESET, Number.NaN)).toBe(pairedSentence(PRESET, 100));
  });
});

// ---------------------------------------------------------------------------------------------
// The server-rendered preset views, as FullPlanner draws them: the Retention page's pair, and the
// Lab's one Figure.

function render(context: 'hypothetical' | 'retention') {
  const id = context === 'retention' ? 'winback' : FULL_PLANNER_ID;
  const durationId = context === 'retention' ? 'winback-duration' : DURATION_ID;
  const values = FULL_PLAN_PRESETS.default;
  const n = fullPlanModel(values).nPerArm;
  const traffic = DURATION_PRESETS.default.traffic;
  const sizing = renderToStaticMarkup(
    createElement(SizingFigureView, {
      id,
      context,
      values,
      controls: createElement(InertSizingControls, { id, context, values }),
    }),
  );
  const duration = renderToStaticMarkup(
    createElement(DurationFigureView, {
      id: durationId,
      context,
      nPerArm: n,
      traffic,
      controls: createElement(InertDurationControls, { id: durationId, context, label: PLANNER_COPY[context].trafficLabel, traffic }),
    }),
  );
  return { sizing, duration, html: sizing + duration };
}
/** The Lab's planner as the server draws it, at the preset or at other values. */
function renderLab(values: LabPlanValues = LAB_PLAN_PRESETS.default) {
  return renderToStaticMarkup(
    createElement(LabPlannerView, { id: FULL_PLANNER_ID, values, controls: createElement(InertLabPlannerControls, { id: FULL_PLANNER_ID, values }) }),
  );
}
/** The Lab's server-rendered page section: FullPlanner in its default (Lab) context. */
const renderLabPlanner = () => renderToStaticMarkup(createElement(FullPlanner));
const textOf = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ');
const audit = (html: string) =>
  auditHtml(`<!doctype html><html><body>${html}</body></html>`, {
    route: '/kitchen-sink/lab',
    factIds: new Set(Object.keys(FACTS)),
    factDisplays: FACT_DISPLAYS,
    denylist: [],
  });
/** The method row's content: the details after its summary. */
const methodOf = (html: string) => html.match(/<details data-method=""[\s\S]*?<\/summary>([\s\S]*?)<\/details>/)?.[1] ?? '';
const summaryOf = (html: string) => textOf(html.match(/<details data-method=""[^>]*>\s*<summary[^>]*>([\s\S]*?)<\/summary>/)?.[1] ?? '').trim();

describe('the Retention page’s pair, server-rendered at its presets', () => {
  it('preset readouts, both badges Simulated, open tables and no stray number', () => {
    const { sizing, duration, html } = render('retention');
    const s = textOf(sizing);
    const d = textOf(duration);
    expect(s).toContain('1,353');
    expect(s).toContain('customers per group');
    expect(s).toContain('To detect a rise of 5 points, from 29% to 34%.');
    expect(d).toMatch(/\b4 weeks\b/);
    for (const part of [sizing, duration]) {
      expect(part).toContain('Controls need JavaScript.');
      expect(part.match(/>Simulated</g)?.length ?? 0).toBe(1);
      expect(part).not.toMatch(/Public data|Live from this site/);
    }
    expect(audit(html)).toEqual([]);
  });

  it('keeps its own terms and the points or percent toggle, and names the inner groups by each Figure title', () => {
    const { sizing, duration } = render('retention');
    expect(sizing).toContain('>Baseline conversion<');
    expect(sizing).toContain('>Rise to detect<');
    expect(sizing).toContain('>Rise to detect, in<');
    expect(sizing).toContain('>Points<');
    expect(sizing).toContain('>Percent of baseline<');
    expect(sizing).not.toContain('Sign-up rate today');
    expect(sizing).not.toContain('worth acting on');
    expect(sizing).not.toContain('MDE');
    expect(sizing).toContain('>Reset<');
    expect(duration).toContain('>Total customers per day<');
    expect(duration).toContain('>Reset<');
    expect(sizing).toMatch(/role="group" aria-labelledby="winback-title" data-planner-controls=""/);
    expect(duration).toMatch(/role="group" aria-labelledby="winback-duration-title" data-planner-controls=""/);
    // none of the Lab's reading model: no lead-in, takeaway or method row of its own
    expect(sizing + duration).not.toMatch(/data-lead-in|data-takeaway|<details data-method/);
  });

  // The island draws the same control rows, so the loader hands focus from a preview control to
  // the island's by these ids.
  it('gives each unit radio and both Resets an id, unique on the pair, for the focus handoff', () => {
    const { sizing, duration, html } = render('retention');
    expect(sizing).toMatch(/<input type="radio" id="winback-mode-absolute"[^>]*value="absolute"/);
    expect(sizing).toMatch(/<input type="radio" id="winback-mode-relative"[^>]*value="relative"/);
    expect(sizing).toMatch(/<button type="button" id="winback-reset"[^>]*>Reset<\/button>/);
    expect(duration).toMatch(/<button type="button" id="winback-duration-reset"[^>]*>Reset<\/button>/);
    const ids = [...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('shows the formula in code marked simulated, with alpha 5%, power 80% and the stated assumptions', () => {
    const { sizing } = render('retention');
    const formula = SAMPLE_SIZE_FORMULA.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    expect(sizing).toMatch(new RegExp(`<code[^>]*data-derived="simulated"[^>]*>${formula}</code>`));
    // On a line of its own (a block, no scrolling region), wrapping at its spaces, with its full stop after it.
    expect(sizing).toMatch(new RegExp(`<span data-formula="" class="my-2 block"><code data-derived="simulated">${formula}</code>\\.</span>`));
    expect(sizing).not.toMatch(/<code[^>]*class="[^"]*(wrap-anywhere|overflow|whitespace-nowrap)/);
    const s = textOf(sizing);
    expect(s).toContain("Cohen's h");
    expect(s).toContain('two-sided');
    expect(s).toContain('significance level of 5%');
    expect(s).toContain('power of 80%');
    expect(s).toContain('customers split equally between the two groups');
    expect(s).toContain('read once, at the end');
  });

  it('the duration caption plans with hypothetical traffic, in whole weeks rounded up, with no promise of real customers', () => {
    const r = textOf(render('retention').duration);
    expect(r).toContain('If 100 customers a day enter the test, split equally between groups');
    expect(r).toContain('whole weeks');
    expect(r).toContain('rounded up');
    expect(r).toContain('not a promise');
    // a win-back result is known only after the window for ordering again
    expect(r).toContain("Each customer's result is known only once their window for ordering again has passed, so the test runs that much longer after the last one enters.");
    const titles = (html: string) => [...html.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>/g)].map((m) => m[1]!);
    expect(titles(render('retention').duration)).toEqual(['The fewer customers a day, the more weeks it takes to fill both groups']);
    expect(titles(render('retention').sizing)).toEqual(['Smaller rises need more customers per group']);
  });

  it('a hypothetical uplift on the observed baseline, with the source facts and the 34% target derived from them', () => {
    const { sizing } = render('retention');
    const s = textOf(sizing);
    // the label beside the live result says only what stays true when the baseline moves
    const result = sizing.match(/<p data-figure-result=""[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? '';
    expect(textOf(result)).toContain('Hypothetical uplift');
    expect(textOf(result)).not.toContain('observed');
    // the caption scopes "observed" to the preset, and the share to the window
    const tight = s.replace(/ ([,;.])/g, '$1');
    expect(tight).toContain('The preset is a hypothetical uplift on an observed baseline. Its baseline, 29%, is the share of lapsed customers');
    expect(tight).toContain('who ordered again within the window;');
    expect(s).toContain('Nobody was contacted and no test was run.');
    expect(sizing).toContain('data-fact="retention.winback.baseline_rate"');
    expect(sizing).toContain('data-fact="retention.winback.uplift_pp"');
    expect(sizing).toMatch(/<data value="0.34" data-derived="retention.winback.baseline_rate retention.winback.uplift_pp">34%<\/data>/);
    // the presets are the sourced values
    expect(FULL_PLAN_PRESETS.default.baseline).toBe(getFact('retention.winback.baseline_rate').value);
    expect(FULL_PLAN_PRESETS.default.risePoints).toBe(getFact('retention.winback.uplift_pp').value);
    expect(fullPlanModel(FULL_PLAN_PRESETS.default).nPerArm).toBe(getFact('retention.winback.n_per_arm').value);
    expect(s).not.toMatch(/\b(designed|ran|run a|my test)\b/i);
  });
});

describe('the Lab’s planner, server-rendered', () => {
  it('FullPlanner on the Lab draws one Figure, the merged planner, and no pair', () => {
    const html = renderLabPlanner();
    expect(html.match(/<figure[^>]*data-figure="/g)).toHaveLength(1);
    expect(html).toContain('data-figure="planner"');
    expect(html).not.toContain('data-figure="duration"');
    expect(html).not.toContain('data-full-planner');
    expect(html).toContain('data-island="idle"');
    expect(html).toBe(renderToStaticMarkup(createElement(FullPlanner, { context: 'hypothetical' })));
  });

  it('preset: one title, the result line in plain words, both readouts, one Simulated badge, an open table and no stray number', () => {
    const html = renderLab();
    const t = textOf(html);
    expect([...html.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>/g)].map((m) => m[1])).toEqual(['Smaller rises need more visitors and more weeks']);
    const result = textOf(html.match(/<p data-figure-result=""[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? '').trim();
    expect(result).toBe('To catch a real rise from 29% to 34% in 8 tests out of 10, you need:');
    expect(html).toMatch(/<data data-planner-n="" data-num="" value="1353"[^>]*data-derived="simulated"[^>]*>1,353<\/data>/);
    expect(html).toMatch(/<data data-duration-weeks="" data-num="" value="4"[^>]*data-derived="simulated"[^>]*>4<\/data>/);
    expect(t).toContain('1,353 visitors per group');
    expect(t).toMatch(/\b4 weeks\b/);
    // the readouts' units: "weeks" alone, the rounding is in the method row
    const units = [...html.matchAll(/<div data-planner-readout="">[\s\S]*?<p class="mt-1 text-base">([^<]*)<\/p><\/div>/g)].map((m) => m[1]);
    expect(units).toEqual(['visitors per group', 'weeks']);
    expect(html.match(/>Simulated</g)).toHaveLength(1);
    expect(html).toContain('Controls need JavaScript.');
    expect(html).not.toMatch(/Public data|Live from this site/);
    expect(audit(html)).toEqual([]);
  });

  it('has no unit toggle and no tag beside the result: three sliders and Reset, in plain words', () => {
    const html = renderLab();
    const controls = html.match(/<div role="group" aria-labelledby="planner-title" data-planner-controls=""[\s\S]*?>Reset<\/button>/)?.[0] ?? '';
    expect(controls).not.toBe('');
    expect(controls.match(/type="range"/g)).toHaveLength(3);
    expect(controls).not.toContain('type="radio"');
    expect(controls.match(/<button/g)).toHaveLength(1);
    expect(controls).toContain('>Sign-up rate today<');
    expect(controls).toContain('>Smallest rise worth acting on<');
    expect(controls).toContain('>Visitors per day<');
    expect(controls).toContain('>29% of visitors<');
    expect(controls).toContain('>Up 5 points, to 34%<');
    expect(controls).toContain('>100 a day<');
    expect(controls).toContain('aria-valuetext="100 visitors a day, both groups together"');
    expect(controls).toContain('aria-valuetext="Up 5 points, to 34%"');
    for (const gone of ['Rise to detect, in', 'Percent of baseline', '>Points<', 'Baseline conversion', 'Smallest rise worth detecting', 'Total visitors per day', 'Hypothetical test']) {
      expect(html, gone).not.toContain(gone);
    }
    for (const control of ['planner-baseline', 'planner-rise', 'planner-traffic', 'planner-reset']) expect(html).toContain(`id="${control}"`);
    const ids = [...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('reads as one exhibit: the lead-in, the caption, the takeaway and one method row', () => {
    const html = renderLab();
    const t = textOf(html);
    expect(html.match(/data-lab-exhibit=""/g)).toHaveLength(1);
    expect(t).toContain('Try it Make the smallest rise smaller and watch the visitors climb. Halve the rise, and each group needs about four times as many.');
    expect(t).toContain('What I do about it Before a test, I agree on the smallest rise worth acting on. Some pages get too few visitors to show it within weeks.');
    expect(t).toContain('For those, I test a bolder change or a busier page instead of waiting months.');
    const caption = textOf(html.match(/<figcaption[^>]*>([\s\S]*?)<\/figcaption>/)?.[1] ?? '');
    expect(caption).toContain('Made-up numbers to plan with. Visitors are split evenly between the two groups.');
    expect(caption).not.toContain('If a page gets');
    expect(html.match(/<details data-method=""/g)).toHaveLength(1);
    expect(summaryOf(html)).toBe('How I worked out the size and the weeks');
    expect(t).not.toMatch(/What to look at|What it means/);
  });

  it('the method row holds the terms, the formula, the assumptions and the weeks rounded up', () => {
    const method = methodOf(renderLab());
    const formula = SAMPLE_SIZE_FORMULA.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    expect(method).toMatch(new RegExp(`<span data-formula="" class="my-2 block"><code data-derived="simulated">${formula}</code>\\.</span>`));
    const m = textOf(method);
    for (const part of [
      'Sample size',
      'Minimum detectable effect',
      'the smallest rise worth acting on',
      'Power',
      '80% means 8 times in 10',
      'Significance level',
      'the risk of a false winner',
      '5% means 1 time in 20',
      "Cohen's h",
      'two-sided',
      'significance level of 5%',
      'power of 80%',
      'visitors split equally between the two groups',
      'read once, at the end',
      'as a percent of the baseline',
      'at 100 visitors a day',
      'in whole weeks, rounded up',
      'not a promise',
      'the same number arrives every day',
    ]) {
      expect(m.replace(/ ([,;.:])/g, '$1'), part).toContain(part);
    }
    expect(m).not.toContain('window for ordering again');
  });

  it('follows the values it is given: the result line, the readouts, the method traffic and the table', () => {
    const v = { baseline: 0.05, risePoints: 1, traffic: 1000 };
    const html = renderLab(v);
    const plan = labPlanModel(v);
    const result = textOf(html.match(/<p data-figure-result=""[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? '').trim();
    expect(result).toBe('To catch a real rise from 5% to 6% in 8 tests out of 10, you need:');
    expect(html).toContain(`value="${plan.nPerArm}"`);
    expect(html).toContain(`value="${plan.weeks}"`);
    expect(textOf(methodOf(html))).toContain('at 1,000 visitors a day');
    expect(audit(html)).toEqual([]);
    // one week is singular, and so is one visitor a day in the method row
    expect(textOf(renderLab({ baseline: 0.29, risePoints: 30, traffic: 10_000 }))).toMatch(/\b1 week\b/);
    expect(textOf(methodOf(renderLab({ ...v, traffic: 1 })))).toContain('at 1 visitor a day');
  });

  it('says "group", never "arm", prints no arrow, dash or middle dot outside the formula, and keeps digits out of the title', () => {
    const html = renderLab();
    const outsideCode = textOf(html).replace(SAMPLE_SIZE_FORMULA, '');
    expect(outsideCode).not.toMatch(/[←-⇿·–—]/);
    expect(outsideCode).not.toMatch(/\barms?\b/i);
    for (const [, title] of html.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>/g)) expect(title).not.toMatch(/\d/);
  });

  it('every fact id and derived ref on both planners exists', () => {
    for (const html of [render('retention').html, renderLab()]) {
      for (const [, id] of html.matchAll(/data-fact="([^"]+)"/g)) expect(Object.hasOwn(FACTS, id!), id).toBe(true);
      for (const [, refs] of html.matchAll(/data-derived="([^"]*)"/g)) {
        expect(refs!.trim(), 'an empty ref').not.toBe('');
        for (const ref of refs!.split(' ')) expect(ref === 'simulated' || Object.hasOwn(FACTS, ref), ref).toBe(true);
      }
    }
  });

  it('says "group", never "arm", on the Retention pair, and keeps digits out of its two titles', () => {
    const { html } = render('retention');
    const outsideCode = textOf(html).replace(SAMPLE_SIZE_FORMULA, '');
    expect(outsideCode).not.toMatch(/[←-⇿·]/);
    expect(outsideCode).not.toMatch(/\barms?\b/i);
    const titles = [...html.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>/g)].map((m) => m[1]!);
    expect(titles).toHaveLength(2);
    for (const title of titles) expect(title).not.toMatch(/\d/);
  });
});

// ---------------------------------------------------------------------------------------------
// The code the page loads at once never reaches the statistics, and the server never statically
// imports the island.

const SRC = resolve(import.meta.dirname, '../../../src');
const STATS = join(SRC, 'lib/stats') + '/';

function staticSpecifiers(text: string): string[] {
  const found: string[] = [];
  for (const m of text.matchAll(/^\s*(?:import|export)\s+(?!type\b)(?:[^'"`;]*?\sfrom\s+)?['"]([^'"]+)['"]/gm)) found.push(m[1]!);
  return found;
}

function resolveSpecifier(from: string, spec: string): string | null {
  const base = spec.startsWith('@/') ? join(SRC, spec.slice(2)) : spec.startsWith('.') ? resolve(dirname(from), spec) : null;
  if (base === null) return null;
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

function reachable(roots: string[]): Set<string> {
  const seen = new Set<string>();
  const queue = [...roots];
  while (queue.length > 0) {
    const file = queue.shift()!;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const spec of staticSpecifiers(readFileSync(file, 'utf8'))) {
      const next = resolveSpecifier(file, spec);
      if (next !== null) queue.push(next);
    }
  }
  return seen;
}

describe('the full planner code the page loads at once', () => {
  const eager = join(SRC, 'components/lab/FullPlannerControls.tsx');

  it('is a client file that reaches no statistics code through static imports', () => {
    expect(readFileSync(eager, 'utf8')).toMatch(/^'use client';/);
    const seen = reachable([eager, join(SRC, 'components/figures/EagerOrIntent.tsx')]);
    expect([...seen].filter((f) => f.startsWith(STATS))).toEqual([]);
    // nor the copy and the facts data, which only the server and the lazy island need
    expect([...seen].filter((f) => f.endsWith('facts.generated.ts') || f.endsWith('content/lab.tsx'))).toEqual([]);
    expect([...seen].some((f) => f.endsWith('lib/lab/full-planner-values.ts'))).toBe(true);
    expect([...seen].some((f) => f.endsWith('FullPlannerClient.tsx') || f.endsWith('DurationFigure.tsx') || f.endsWith('LabPlannerClient.tsx'))).toBe(false);
  });

  it('the server composition never statically imports either island', () => {
    const seen = reachable([join(SRC, 'components/lab/FullPlanner.tsx')]);
    expect([...seen].some((f) => f.endsWith('FullPlannerClient.tsx'))).toBe(false);
    expect([...seen].some((f) => f.endsWith('LabPlannerClient.tsx'))).toBe(false);
    expect([...seen].some((f) => f.endsWith('FullPlannerControls.tsx'))).toBe(true);
    expect(readFileSync(eager, 'utf8')).toMatch(/lazy\(\(\) => import\('\.\/FullPlannerClient'\)\)/);
    expect(readFileSync(eager, 'utf8')).toMatch(/lazy\(\(\) => import\('\.\/LabPlannerClient'\)\)/);
    expect(readFileSync(join(SRC, 'components/lab/LabPlannerClient.tsx'), 'utf8')).toMatch(/^'use client';/);
  });

  it('the statistics side does reach the statistics, so the walk would catch a leak', () => {
    expect([...reachable([join(SRC, 'lib/lab/full-planner.ts')])].some((f) => f.startsWith(STATS))).toBe(true);
  });
});
