// The full sample-size planner: the sizing model (the Home planner's arithmetic plus a display unit
// for the rise), the duration model, their static URL schemas and what hostile shared URLs become,
// the relative display on the integer-point grid, the paired eager-loading keys, the server-rendered
// preset views in both contexts, and the code the page loads at once.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import fc from 'fast-check';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { auditHtml } from '../../../scripts/truth-audit.ts';
import { FACTS, FACT_DISPLAYS } from '../../../src/lib/facts/facts.generated.ts';
import { hasFigureKeys } from '@/components/figures/EagerOrIntent';
import { InertDurationControls, InertSizingControls } from '@/components/lab/FullPlannerControls';
import { DurationFigureView, SizingFigureView } from '@/components/lab/FullPlannerView';
import { readFigureParams } from '@/lib/figure/url-state';
import { getFact } from '@/lib/facts';
import {
  DURATION_ID,
  DURATION_PRESETS,
  DURATION_SCHEMA,
  FULL_PLANNER_ID,
  FULL_PLAN_PRESETS,
  FULL_PLAN_SCHEMA,
  durationModel,
  durationSentence,
  durationTable,
  fullPlanModel,
  fullPlanSentence,
  fullPlanTable,
  normalizeFullPlan,
  normalizeTraffic,
  relativePercent,
  relativeSliderBounds,
  risePointsFromRelative,
  type FullPlanValues,
} from '@/lib/lab/full-planner';
import { normalizePlanner, planModel } from '@/lib/lab/planner';
import { PLANNER_COPY } from '../../../content/lab';
import { SAMPLE_SIZE_FORMULA, durationWeeks, sampleSizePerArm } from '@/lib/stats';
import { snapToStep } from '@/lib/figure/snap';

const PRESET: FullPlanValues = { baseline: 0.29, risePoints: 5, mode: 'absolute' };

/** What a shared URL shows: the static schema read, then the joint normalization. */
const planFromUrl = (query: string): FullPlanValues =>
  normalizeFullPlan(readFigureParams(new URLSearchParams(query), FULL_PLANNER_ID, FULL_PLAN_SCHEMA, FULL_PLAN_PRESETS).values);
const trafficFromUrl = (query: string): number =>
  normalizeTraffic(readFigureParams(new URLSearchParams(query), DURATION_ID, DURATION_SCHEMA, DURATION_PRESETS).values.traffic);

describe('fullPlanModel and durationModel', () => {
  it('seeds the preset: 29% plus 5 points needs 1,353 per group, and 1,353 at 100 a day takes 4 weeks', () => {
    expect(fullPlanModel({ baseline: 0.29, risePoints: 5, mode: 'absolute' }).nPerArm).toBe(1353);
    expect(fullPlanModel(PRESET).target).toBe(0.34);
    expect(durationModel(1353, 100)).toEqual({ weeks: 4 });
  });

  it('delegates to the Home planner and to durationWeeks', () => {
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
    expect(has('hero-planner.baseline=0.3&plannerx.mode=relative&duration=5&traffic=5')).toBe(false);
    expect(hasFigureKeys(new URLSearchParams('winback-duration.traffic=9'), ['winback', 'winback-duration'])).toBe(true);
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
});

// ---------------------------------------------------------------------------------------------
// The server-rendered preset views, as FullPlanner draws them.

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
      controls: createElement(InertSizingControls, { id, values }),
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
const textOf = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ');
const audit = (html: string) =>
  auditHtml(`<!doctype html><html><body>${html}</body></html>`, {
    route: '/kitchen-sink/lab',
    factIds: new Set(Object.keys(FACTS)),
    factDisplays: FACT_DISPLAYS,
    denylist: [],
  });

describe('the server-rendered preset views', () => {
  it.each(['hypothetical', 'retention'] as const)('%s: preset readouts, both badges Simulated, open tables and no stray number', (context) => {
    const { sizing, duration, html } = render(context);
    const s = textOf(sizing);
    const d = textOf(duration);
    expect(s).toContain('1,353');
    expect(s).toContain(context === 'retention' ? 'customers per group' : 'visitors per group');
    expect(s).toContain('To detect a rise of 5 points, from 29% to 34%.');
    expect(d).toMatch(/\b4 weeks\b/);
    for (const part of [sizing, duration]) {
      expect(part).toContain('Controls need JavaScript.');
      expect(part.match(/data-badge="simulated"|>Simulated</g)?.length ?? 0).toBeGreaterThan(0);
      expect(part).not.toMatch(/Public data|Live from this site/);
    }
    expect(audit(html)).toEqual([]);
  });

  it('names the controls the brief names, and the inner groups by each Figure title', () => {
    const { sizing, duration } = render('hypothetical');
    expect(sizing).toContain('>Baseline conversion<');
    expect(sizing).toContain('>Rise to detect<');
    expect(sizing).toContain('>MDE unit<');
    expect(sizing).toContain('>Reset<');
    expect(duration).toContain('>Total visitors per day<');
    expect(duration).toContain('>Reset<');
    expect(sizing).toMatch(/role="group" aria-labelledby="planner-title" data-planner-controls=""/);
    expect(duration).toMatch(/role="group" aria-labelledby="duration-title" data-planner-controls=""/);
  });

  it('shows the formula in code marked simulated, with alpha 5%, power 80% and the stated assumptions', () => {
    const { sizing } = render('hypothetical');
    const formula = SAMPLE_SIZE_FORMULA.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    expect(sizing).toMatch(new RegExp(`<code[^>]*data-derived="simulated"[^>]*>${formula}</code>`));
    const s = textOf(sizing);
    expect(s).toContain("Cohen's h");
    expect(s).toContain('two-sided');
    expect(s).toContain('significance level of 5%');
    expect(s).toContain('power of 80%');
    expect(s).toContain('split equally between the two groups');
    expect(s).toContain('read once, at the end');
  });

  it('the duration caption plans with hypothetical traffic, in whole weeks rounded up, with no promise of real visitors', () => {
    const d = textOf(render('hypothetical').duration);
    expect(d).toContain('If a page gets 100 visitors a day, split equally between groups');
    expect(d).toContain('whole weeks');
    expect(d).toContain('rounded up');
    expect(d).toContain('not a promise');
    const r = textOf(render('retention').duration);
    expect(r).toContain('100 customers a day');
    expect(r).toContain('split equally between groups');
  });

  it('hypothetical: the inputs are hypothetical, not results from a test or the case studies', () => {
    const s = textOf(render('hypothetical').sizing);
    expect(s).toContain('Hypothetical test');
    expect(s).toContain('not results from a real test');
    expect(s).not.toMatch(/lapsed|win-back|offer/i);
  });

  it('retention: a hypothetical uplift on the observed baseline, with the source facts and the 34% target derived from them', () => {
    const { sizing } = render('retention');
    const s = textOf(sizing);
    expect(s).toContain('Hypothetical uplift');
    expect(s).toContain('observed baseline');
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

  it('every fact id and derived ref on both views exists', () => {
    for (const context of ['hypothetical', 'retention'] as const) {
      const { html } = render(context);
      for (const [, id] of html.matchAll(/data-fact="([^"]+)"/g)) expect(Object.hasOwn(FACTS, id!), id).toBe(true);
      for (const [, refs] of html.matchAll(/data-derived="([^"]*)"/g)) {
        expect(refs!.trim(), 'an empty ref').not.toBe('');
        for (const ref of refs!.split(' ')) expect(ref === 'simulated' || Object.hasOwn(FACTS, ref), ref).toBe(true);
      }
    }
  });

  it('says "group", never "arm", prints no arrow or middle dot outside the formula, and keeps digits out of the titles', () => {
    for (const context of ['hypothetical', 'retention'] as const) {
      const { html } = render(context);
      const outsideCode = textOf(html).replace(SAMPLE_SIZE_FORMULA, '');
      expect(outsideCode).not.toMatch(/[←-⇿·]/);
      expect(outsideCode).not.toMatch(/\barms?\b/i);
      const titles = [...html.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>/g)].map((m) => m[1]!);
      expect(titles).toHaveLength(2);
      for (const title of titles) expect(title).not.toMatch(/\d/);
    }
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
    expect([...seen].some((f) => f.endsWith('FullPlannerClient.tsx') || f.endsWith('DurationFigure.tsx'))).toBe(false);
  });

  it('the server composition never statically imports the paired island', () => {
    const seen = reachable([join(SRC, 'components/lab/FullPlanner.tsx')]);
    expect([...seen].some((f) => f.endsWith('FullPlannerClient.tsx'))).toBe(false);
    expect([...seen].some((f) => f.endsWith('FullPlannerControls.tsx'))).toBe(true);
    expect(readFileSync(eager, 'utf8')).toMatch(/lazy\(\(\) => import\('\.\/FullPlannerClient'\)\)/);
  });

  it('the statistics side does reach the statistics, so the walk would catch a leak', () => {
    expect([...reachable([join(SRC, 'lib/lab/full-planner.ts')])].some((f) => f.startsWith(STATS))).toBe(true);
  });
});
