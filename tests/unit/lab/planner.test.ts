// The Home sample-size planner: its arithmetic (integer percentages, so 29% + 5 points is exactly
// 34%), the joint normalization of the two inputs (the target never passes 99%), the static URL
// schema and what a hostile shared URL becomes, the key test that loads the island eagerly, and the
// server-rendered preset view.
import fc from 'fast-check';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { auditHtml } from '../../../scripts/truth-audit.ts';
import { FACTS, FACT_DISPLAYS } from '../../../src/lib/facts/facts.generated.ts';
import { hasFigureKeys } from '@/components/figures/EagerOrIntent';
import { InertPlannerControls } from '@/components/figures/PlannerFigureClient';
import { PlannerFigureView } from '@/components/figures/PlannerView';
import { readFigureParams } from '@/lib/figure/url-state';
import {
  PLANNER_ALPHA,
  PLANNER_POWER,
  PLANNER_PRESETS,
  PLANNER_SCHEMA,
  normalizePlanner,
  planModel,
  plannerTable,
  resultSentence,
  riseMax,
  type PlannerValues,
} from '@/lib/lab/planner';
import { SAMPLE_SIZE_FORMULA, sampleSizePerArm } from '@/lib/stats';

const ID = 'hero-planner';

/** What a shared URL shows: the static schema read, then the joint normalization. */
const fromUrl = (query: string): PlannerValues =>
  normalizePlanner(readFigureParams(new URLSearchParams(query), ID, PLANNER_SCHEMA, PLANNER_PRESETS).values);

describe('planModel', () => {
  it('seeds the preset: 29% plus 5 points needs 1,353 per group, target exactly 34%', () => {
    expect(planModel({ baseline: 0.29, risePoints: 5 })).toEqual({ nPerArm: 1353, target: 0.34 });
  });

  it('reaches exactly 99% at 89% plus 10 points', () => {
    expect(planModel({ baseline: 0.89, risePoints: 10 }).target).toBe(0.99);
  });

  it('uses the shared formula at alpha 0.05 and power 0.8 with the absolute rise', () => {
    expect(PLANNER_ALPHA).toBe(0.05);
    expect(PLANNER_POWER).toBe(0.8);
    for (const v of [{ baseline: 0.1, risePoints: 2 }, { baseline: 0.5, risePoints: 30 }, { baseline: 0.98, risePoints: 1 }]) {
      expect(planModel(v).nPerArm).toBe(
        sampleSizePerArm({ baseline: v.baseline, mde: v.risePoints / 100, mdeType: 'absolute', alpha: 0.05, power: 0.8 }),
      );
    }
  });

  it('normalizes before it computes, so a hostile input still gives a finite plan', () => {
    expect(planModel({ baseline: 0.98, risePoints: 30 })).toEqual(planModel({ baseline: 0.98, risePoints: 1 }));
    expect(planModel({ baseline: Number.NaN, risePoints: Number.NaN })).toEqual({ nPerArm: 1353, target: 0.34 });
  });
});

describe('normalizePlanner', () => {
  it('keeps a valid pair as it is', () => {
    expect(normalizePlanner({ baseline: 0.29, risePoints: 5 })).toEqual({ baseline: 0.29, risePoints: 5 });
    expect(normalizePlanner({ baseline: 0.5, risePoints: 30 })).toEqual({ baseline: 0.5, risePoints: 30 });
  });

  it('clamps the baseline to 1% to 98% and the rise to 1 to 30 points', () => {
    expect(normalizePlanner({ baseline: 0, risePoints: 0 })).toEqual({ baseline: 0.01, risePoints: 1 });
    expect(normalizePlanner({ baseline: -3, risePoints: -5 })).toEqual({ baseline: 0.01, risePoints: 1 });
    expect(normalizePlanner({ baseline: 0.2, risePoints: 99 })).toEqual({ baseline: 0.2, risePoints: 30 });
    expect(normalizePlanner({ baseline: 1.5, risePoints: 5 })).toEqual({ baseline: 0.98, risePoints: 1 });
  });

  it('caps the rise so the target is at most 99%', () => {
    expect(normalizePlanner({ baseline: 0.98, risePoints: 30 })).toEqual({ baseline: 0.98, risePoints: 1 });
    expect(normalizePlanner({ baseline: 0.7, risePoints: 30 })).toEqual({ baseline: 0.7, risePoints: 29 });
    expect(normalizePlanner({ baseline: 0.89, risePoints: 10 })).toEqual({ baseline: 0.89, risePoints: 10 });
    expect(normalizePlanner({ baseline: 0.89, risePoints: 11 })).toEqual({ baseline: 0.89, risePoints: 10 });
    expect(riseMax(0.29)).toBe(30);
    expect(riseMax(0.7)).toBe(29);
    expect(riseMax(0.98)).toBe(1);
  });

  it('snaps to whole percentages and whole points', () => {
    expect(normalizePlanner({ baseline: 0.2949, risePoints: 5.4 })).toEqual({ baseline: 0.29, risePoints: 5 });
    expect(normalizePlanner({ baseline: 0.2951, risePoints: 5.6 })).toEqual({ baseline: 0.3, risePoints: 6 });
  });

  it('falls back to the preset for NaN and clamps an infinity', () => {
    expect(normalizePlanner({ baseline: Number.NaN, risePoints: Number.NaN })).toEqual({ baseline: 0.29, risePoints: 5 });
    expect(normalizePlanner({ baseline: Number.POSITIVE_INFINITY, risePoints: Number.NEGATIVE_INFINITY })).toEqual({
      baseline: 0.98,
      risePoints: 1,
    });
  });

  it('property: any input gives baseline < target <= 99%, on the grid, finite, idempotent', () => {
    const anyNumber = fc.oneof(fc.double(), fc.double({ min: -2, max: 2 }), fc.integer({ min: -100, max: 200 }));
    fc.assert(
      fc.property(anyNumber, anyNumber, (baseline, risePoints) => {
        const v = normalizePlanner({ baseline, risePoints });
        const percent = Math.round(v.baseline * 100);
        expect(v.baseline).toBe(percent / 100);
        expect(percent).toBeGreaterThanOrEqual(1);
        expect(percent).toBeLessThanOrEqual(98);
        expect(Number.isInteger(v.risePoints)).toBe(true);
        expect(v.risePoints).toBeGreaterThanOrEqual(1);
        expect(v.risePoints).toBeLessThanOrEqual(Math.min(30, 99 - percent));
        const plan = planModel(v);
        expect(plan.target).toBe((percent + v.risePoints) / 100);
        expect(plan.target).toBeGreaterThan(v.baseline);
        expect(plan.target).toBeLessThanOrEqual(0.99);
        expect(Number.isSafeInteger(plan.nPerArm)).toBe(true);
        expect(plan.nPerArm).toBeGreaterThanOrEqual(1);
        expect(normalizePlanner(v)).toEqual(v);
      }),
      { numRuns: 500 },
    );
  });
});

describe('URL state', () => {
  it('has one static schema and a default preset, with no param named preset', () => {
    expect(PLANNER_SCHEMA).toEqual({
      baseline: { kind: 'number', min: 0.01, max: 0.98, step: 0.01 },
      risePoints: { kind: 'number', min: 1, max: 30, step: 1 },
    });
    expect(PLANNER_PRESETS).toEqual({ default: { baseline: 0.29, risePoints: 5 } });
  });

  it('reads hostile shared URLs into a valid pair', () => {
    expect(fromUrl('')).toEqual({ baseline: 0.29, risePoints: 5 });
    expect(fromUrl('hero-planner.baseline=0.98&hero-planner.risePoints=30')).toEqual({ baseline: 0.98, risePoints: 1 });
    expect(fromUrl('hero-planner.baseline=abc&hero-planner.risePoints=')).toEqual({ baseline: 0.29, risePoints: 5 });
    expect(fromUrl('hero-planner.baseline=1e9&hero-planner.risePoints=-5')).toEqual({ baseline: 0.98, risePoints: 1 });
    expect(fromUrl('hero-planner.baseline=Infinity&hero-planner.risePoints=Infinity')).toEqual({ baseline: 0.98, risePoints: 1 });
    expect(fromUrl('hero-planner.baseline=0.4&hero-planner.baseline=0.9&hero-planner.risePoints=5.6')).toEqual({
      baseline: 0.4,
      risePoints: 6,
    });
    expect(fromUrl('hero-planner.preset=toString&hero-planner.preset=__proto__')).toEqual({ baseline: 0.29, risePoints: 5 });
    expect(fromUrl('other.baseline=0.9&hero-plannerx.risePoints=20&baseline=0.5')).toEqual({ baseline: 0.29, risePoints: 5 });
  });

  it('property: any query string reads into a valid pair', () => {
    const value = fc.oneof(fc.string(), fc.double().map(String), fc.constantFrom('NaN', 'Infinity', '-0', '1e308', ' 0.5 '));
    fc.assert(
      fc.property(value, value, value, (b, r, p) => {
        const query = new URLSearchParams([
          ['hero-planner.baseline', b],
          ['hero-planner.risePoints', r],
          ['hero-planner.preset', p],
        ]).toString();
        const v = fromUrl(query);
        expect(normalizePlanner(v)).toEqual(v);
        expect(Number.isFinite(planModel(v).nPerArm)).toBe(true);
      }),
      { numRuns: 300 },
    );
  });
});

describe('hasFigureKeys: what loads the island at once', () => {
  const has = (query: string, ids: readonly string[]) => hasFigureKeys(new URLSearchParams(query), ids);

  it('is true for any key in one of the namespaces', () => {
    expect(has('hero-planner.baseline=0.4', [ID])).toBe(true);
    expect(has('hero-planner.unknown=1', [ID])).toBe(true);
    expect(has('hero-planner.preset=default', [ID])).toBe(true);
    expect(has('other.a=1&second.b=2', ['first', 'second'])).toBe(true);
  });

  it('is false for foreign keys, near misses and an empty query', () => {
    expect(has('', [ID])).toBe(false);
    expect(has('other.baseline=0.4', [ID])).toBe(false);
    expect(has('hero-plannerx.baseline=0.4', [ID])).toBe(false);
    expect(has('hero-planner=0.4', [ID])).toBe(false);
    expect(has('baseline=0.4', [ID])).toBe(false);
    expect(has('hero-planner.baseline=0.4', [])).toBe(false);
  });
});

describe('the server-rendered preset view', () => {
  // As PlannerFigure draws it: the preset with the inert control row.
  const values = PLANNER_PRESETS.default;
  const html = renderToStaticMarkup(
    createElement(PlannerFigureView, { id: ID, values, controls: createElement(InertPlannerControls, { id: ID, values }) }),
  );
  const text = html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ');

  it('shows the preset result, the simulated badge and the hypothetical label beside it', () => {
    expect(text).toContain('1,353');
    expect(text).toContain('visitors per group');
    const result = html.match(/<p data-figure-result=""[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? '';
    expect(result).toContain('Simulated');
    expect(result).toContain('Hypothetical sign-up test');
  });

  it('says the baseline is hypothetical and names Cohen\u2019s h, two-sided, with the formula in code', () => {
    // The preset's numbers are the Retention win-back sizing's, so the note claims no independence from the case studies.
    expect(text).toContain('The baseline is a hypothetical sign-up conversion rate. Sample sizes');
    expect(text).not.toMatch(/case stud/i);
    expect(text).toContain("Cohen's h");
    expect(text).toContain('two-sided');
    expect(html).toContain(`<code`);
    expect(html).toMatch(new RegExp(`<code[^>]*>${SAMPLE_SIZE_FORMULA.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</code>`));
  });

  it('has the open table without JavaScript and no stray number for the truth audit', () => {
    expect(html).toContain('Controls need JavaScript.');
    expect(html).toContain(`id="${ID}-table-open-caption"`);
    const findings = auditHtml(`<!doctype html><html><body>${html}</body></html>`, {
      route: '/kitchen-sink/home',
      factIds: new Set(Object.keys(FACTS)),
      factDisplays: FACT_DISPLAYS,
      denylist: [],
    });
    expect(findings).toEqual([]);
  });

  it('names no group, prints no arrow or middle dot outside the formula, and uses no digit in the title', () => {
    const outsideCode = text.replace(SAMPLE_SIZE_FORMULA, '');
    expect(outsideCode).not.toMatch(/[←-⇿·]/);
    expect(outsideCode).not.toMatch(/\barm\b/i);
    const title = html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/)?.[1] ?? '';
    expect(title).not.toBe('');
    expect(title).not.toMatch(/\d/);
  });

  it('table and result sentence follow the values', () => {
    const v = { baseline: 0.89, risePoints: 10 };
    expect(resultSentence(v)).toBe(`${planModel(v).nPerArm.toLocaleString('en-GB')} visitors per group to detect a rise from 89% to 99%`);
    expect(resultSentence(PLANNER_PRESETS.default)).toBe('1,353 visitors per group to detect a rise from 29% to 34%');
    const table = plannerTable(PLANNER_PRESETS.default);
    expect(table.refs).toEqual(['simulated']);
    expect(table.rows).toEqual([
      ['Baseline conversion (%)', 29],
      ['Rise to detect (percentage points)', 5],
      ['Target conversion (%)', 34],
      ['Visitors per group', 1353],
    ]);
  });
});
