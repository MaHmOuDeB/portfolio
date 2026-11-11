// The Lab's two diagnostics: the split check (`srm`, a chi-square sample-ratio-mismatch test on
// visitor counts the reader sets) and exaggeration (`curse`, Gelman and Carlin's retrodesign for a
// true effect and a standard error the reader sets). Both models wrap the statistics library's own
// srmTest and retrodesign unchanged; these tests hold them to it, pin the empty and zero-effect
// branches (no call into the statistics), the non-finite branch (words, never "Infinity" or null),
// the log-scale curve over the whole reachable ratio range and the agreement of its selected point,
// readout and table, and the server preset as rendered HTML.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import fc from 'fast-check';
import { createElement, isValidElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { auditHtml } from '../../../scripts/truth-audit.ts';
import { FACTS, FACT_DISPLAYS } from '../../../src/lib/facts/facts.generated.ts';
import { CurseFigure } from '@/components/lab/CurseFigure';
import { InertCurseControls } from '@/components/lab/CurseFigureClient';
import { CurseFigureView } from '@/components/lab/CurseView';
import { SrmFigure } from '@/components/lab/SrmFigure';
import { InertSrmControls } from '@/components/lab/SrmFigureClient';
import { SrmFigureView } from '@/components/lab/SrmView';
import { readFigureParams } from '@/lib/figure/url-state';
import {
  CURSE_ALPHA,
  CURSE_HEIGHT,
  CURSE_ID,
  CURSE_PRESETS,
  CURSE_SCHEMA,
  CURSE_TITLE,
  CURVE_SAMPLES,
  DIAGNOSTICS_REFS,
  DOT_CLEARANCE_PX,
  RATIO_MAX,
  RATIO_MIN,
  SRM_ID,
  SRM_PRESETS,
  SRM_SCHEMA,
  SRM_SMALL_EXPECTED,
  SRM_THRESHOLD,
  curseAxis,
  curseCurve,
  curseModel,
  curseResultText,
  curseTable,
  formatExaggeration,
  formatPower,
  formatWrongSign,
  normalizeCurse,
  normalizeSrm,
  srmAxis,
  srmExpected,
  srmModel,
  srmResultText,
  srmTable,
  type CurseDeps,
  type CurseValues,
  type SrmValues,
} from '@/lib/lab/diagnostics';
import { retrodesign, srmTest } from '@/lib/stats';

// ---------------------------------------------------------------------------------------------
// Helpers.

const decode = (s: string) =>
  s.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const text = (markup: string) => decode(markup.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const prose = (markup: string) => text(markup).replace(/ ([.,:;)])/g, '$1').replace(/\( /g, '(');
const result = (html: string) => prose(html.match(/<p data-figure-result=""[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? '');
const audit = (html: string) =>
  auditHtml(`<!doctype html><html><head><title>t</title></head><body>${html}</body></html>`, {
    route: '/lab',
    factIds: new Set(Object.keys(FACTS)),
    factDisplays: FACT_DISPLAYS,
    denylist: [],
  });

const srmView = (values: SrmValues) =>
  renderToStaticMarkup(createElement(SrmFigureView, { values, controls: createElement(InertSrmControls, { values }) }));
const curseView = (values: CurseValues, deps?: CurseDeps) =>
  renderToStaticMarkup(createElement(CurseFigureView, { values, deps, controls: createElement(InertCurseControls, { values }) }));

/** A retrodesign stand-in that returns Infinity for exaggeration, as an extreme ratio can. */
const infiniteRetro: CurseDeps = { retrodesign: () => ({ power: 0.05, typeS: 0.5, exaggeration: Number.POSITIVE_INFINITY }) };

/** The values a shared URL becomes: the static schema read, then the views' own clean-up. */
const srmFromUrl = (query: string) => normalizeSrm(readFigureParams(new URLSearchParams(query), SRM_ID, SRM_SCHEMA, SRM_PRESETS).values);
const curseFromUrl = (query: string) =>
  normalizeCurse(readFigureParams(new URLSearchParams(query), CURSE_ID, CURSE_SCHEMA, CURSE_PRESETS).values);

/** Every value on a schema's grid, as the controls can reach it. */
const grid = (spec: { min: number; max: number; step: number }) =>
  Array.from({ length: Math.round((spec.max - spec.min) / spec.step) + 1 }, (_, i) => Number((spec.min + i * spec.step).toPrecision(15)));
const EFFECTS = grid(CURSE_SCHEMA.trueEffect);
const SES = grid(CURSE_SCHEMA.se);

// ---------------------------------------------------------------------------------------------
// The split check.

describe('srmModel', () => {
  it('is empty for no visitors at all, without calling the statistics', () => {
    const spy = vi.fn(srmTest);
    expect(srmModel({ nA: 0, nB: 0, shareA: 0.5 }, { srmTest: spy })).toEqual({ kind: 'empty' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('flags one empty group against an even split', () => {
    const r = srmModel({ nA: 0, nB: 100, shareA: 0.5 });
    expect(r).toEqual({ kind: 'result', ...srmTest(0, 100, 0.5) });
    expect(r.kind === 'result' && r.flagged).toBe(true);
  });

  it('gives p = 1 and no flag for an exact even split', () => {
    expect(srmModel({ nA: 100, nB: 100, shareA: 0.5 })).toEqual({ kind: 'result', chi2: 0, p: 1, flagged: false });
  });

  it('flags 120 against 60', () => {
    const r = srmModel({ nA: 120, nB: 60, shareA: 0.5 });
    expect(r).toEqual({ kind: 'result', ...srmTest(120, 60, 0.5) });
    expect(r.kind === 'result' && r.chi2).toBe(20);
    expect(r.kind === 'result' && r.flagged).toBe(true);
  });

  it('passes the counts and the share to srmTest unchanged, and returns its numbers', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10_000 }),
        fc.integer({ min: 0, max: 10_000 }),
        fc.integer({ min: 1, max: 99 }),
        (nA, nB, percent) => {
          fc.pre(nA + nB > 0);
          const shareA = percent / 100;
          expect(srmModel({ nA, nB, shareA })).toEqual({ kind: 'result', ...srmTest(nA, nB, shareA) });
        },
      ),
    );
  });

  it('names the threshold srmTest uses: flagged exactly when p is below it, on both sides of it', () => {
    expect(SRM_THRESHOLD).toBe(0.001);
    // Against an even split of 1,000 visitors, walk group A's count up to the first flagged split:
    // the last split not flagged has p at or above the threshold, the first flagged one below it.
    let before: ReturnType<typeof srmTest> | null = null;
    let after: ReturnType<typeof srmTest> | null = null;
    for (let a = 500; a <= 1000; a++) {
      const r = srmTest(a, 1000 - a, 0.5);
      if (r.flagged) {
        after = r;
        break;
      }
      before = r;
    }
    expect(before!.p).toBeGreaterThanOrEqual(SRM_THRESHOLD);
    expect(before!.p).toBeLessThan(0.002);
    expect(after!.p).toBeLessThan(SRM_THRESHOLD);
    expect(after!.p).toBeGreaterThan(0.0005);
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10_000 }), fc.integer({ min: 0, max: 10_000 }), fc.integer({ min: 1, max: 99 }), (nA, nB, pc) => {
        fc.pre(nA + nB > 0);
        const r = srmModel({ nA, nB, shareA: pc / 100 });
        expect(r.kind === 'result' && r.flagged).toBe(r.kind === 'result' && r.p < SRM_THRESHOLD);
      }),
    );
  });
});

describe('the split check around the model', () => {
  it('expects the counts srmTest expects: the total times each share', () => {
    expect(srmExpected({ nA: 120, nB: 60, shareA: 0.5 })).toEqual({ a: 90, b: 90 });
    expect(srmExpected({ nA: 0, nB: 0, shareA: 0.3 })).toEqual({ a: 0, b: 0 });
    expect(srmExpected({ nA: 30, nB: 70, shareA: 0.2 })).toEqual({ a: 100 * 0.2, b: 100 * (1 - 0.2) });
  });

  it('tables the observed and expected visitors of each group, with the expected share', () => {
    const t = srmTable({ nA: 120, nB: 60, shareA: 0.5 });
    expect(t.columns).toEqual(['Group', 'Visitors', 'Expected share', 'Expected visitors']);
    expect(t.rows).toEqual([
      ['Group A', 120, 0.5, 90],
      ['Group B', 60, 0.5, 90],
    ]);
    expect(t.formats).toEqual(['number', 'count', 'share', 'number']);
    expect(t.refs).toEqual(DIAGNOSTICS_REFS);
    expect(t.note ?? '').not.toMatch(/\d/);
  });

  it('says there is nothing to test with no visitors, and gives no p-value', () => {
    const s = srmResultText({ nA: 0, nB: 0, shareA: 0.5 });
    expect(s).toBe('No visitors in either group yet, so there is nothing to test and no p-value.');
    expect(s).not.toMatch(/\d/);
  });

  it('prints a flagged p-value as below the threshold, never rounded up to it', () => {
    expect(srmResultText({ nA: 120, nB: 60, shareA: 0.5 })).toBe(
      'Chi-square 20 with one degree of freedom, p-value below 0.001: flagged. A split this far from the expected share would be unlikely if visitors were assigned as planned, so check the assignment and the logging before reading any result.',
    );
    expect(srmResultText({ nA: 100, nB: 100, shareA: 0.5 })).toBe(
      'Chi-square 0 with one degree of freedom, p-value 1: not flagged. This split is consistent with the expected share at this threshold.',
    );
    // no split whose p is just under the threshold prints a p-value of 0.001
    for (let a = 500; a <= 1000; a++) {
      const r = srmTest(a, 1000 - a, 0.5);
      const s = srmResultText({ nA: a, nB: 1000 - a, shareA: 0.5 });
      expect(s.includes('p-value below 0.001')).toBe(r.flagged);
    }
  });

  it('warns when an expected count is under the rule of thumb, and only then', () => {
    expect(SRM_SMALL_EXPECTED).toBe(5);
    const small = srmResultText({ nA: 3, nB: 1, shareA: 0.5 });
    expect(small).toContain('An expected count is below 5, so the chi-square approximation is rough here.');
    expect(srmResultText({ nA: 100, nB: 100, shareA: 0.5 })).not.toContain('below 5');
    // a share of 0.04 of 100 visitors expects 4 in group A
    expect(srmResultText({ nA: 4, nB: 96, shareA: 0.04 })).toContain('below 5');
    expect(srmResultText({ nA: 5, nB: 95, shareA: 0.05 })).not.toContain('below 5');
  });

  it('scales its count axis to hold every bar, with whole-number ticks', () => {
    for (const v of [
      { nA: 0, nB: 0, shareA: 0.5 },
      { nA: 1, nB: 0, shareA: 0.01 },
      { nA: 120, nB: 60, shareA: 0.5 },
      { nA: 10_000, nB: 0, shareA: 0.01 },
      { nA: 0, nB: 10_000, shareA: 0.99 },
    ]) {
      const { top, ticks } = srmAxis(v);
      const e = srmExpected(v);
      expect(top).toBeGreaterThanOrEqual(Math.max(v.nA, v.nB, e.a, e.b));
      for (const layout of [ticks.wide, ticks.narrow]) {
        expect(layout[0]).toBe(0);
        expect(layout.at(-1)).toBeLessThanOrEqual(top);
        expect(layout.every(Number.isInteger)).toBe(true);
      }
    }
  });

  it('keeps a scale on phones: the narrow ticks always hold zero and the top, for every reachable tallest bar', () => {
    // a top of 25 has only 0 and 25 as whole ticks; every other narrow tick alone would leave just 0
    expect(srmAxis({ nA: 22, nB: 3, shareA: 0.5 }).ticks.narrow).toEqual([0, 25]);
    for (let m = 0; m <= 10_000; m++) {
      const { top, ticks } = srmAxis({ nA: m, nB: 0, shareA: 0.5 });
      expect(ticks.narrow.length, String(m)).toBeGreaterThanOrEqual(2);
      expect(ticks.narrow[0]).toBe(0);
      expect(ticks.narrow.at(-1), String(m)).toBe(top);
      expect(ticks.wide.at(-1), String(m)).toBe(top);
      // the narrow ticks are a subset of the wide ones
      expect(ticks.narrow.every((t) => ticks.wide.includes(t))).toBe(true);
    }
  });

  it('reads a hostile URL as the preset or a clamped value on the grid', () => {
    expect(srmFromUrl('srm.nA=__proto__&srm.nB=&srm.shareA=NaN&srm.preset=constructor')).toEqual(SRM_PRESETS.default);
    expect(srmFromUrl('srm.nA=-5&srm.nB=1e9&srm.shareA=2')).toEqual({ nA: 0, nB: 10_000, shareA: 0.99 });
    expect(srmFromUrl('srm.nA=12.6&srm.shareA=0.333')).toEqual({ nA: 13, nB: 100, shareA: 0.33 });
    expect(normalizeSrm({ nA: Number.NaN, nB: 0.4, shareA: 0 })).toEqual({ nA: 100, nB: 0, shareA: 0.01 });
  });
});

// ---------------------------------------------------------------------------------------------
// Exaggeration.

describe('curseModel', () => {
  it('has a zero-effect branch that never calls retrodesign', () => {
    const spy = vi.fn(retrodesign);
    expect(curseModel({ trueEffect: 0, se: 1 }, { retrodesign: spy })).toEqual({ kind: 'zero-effect' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('equals retrodesign at effect 1 and standard error 1, at the fixed significance level', () => {
    expect(CURSE_ALPHA).toBe(0.05);
    expect(curseModel({ trueEffect: 1, se: 1 })).toEqual({ kind: 'result', ...retrodesign({ trueEffect: 1, se: 1, alpha: 0.05 }) });
    expect(curseModel({ trueEffect: 1, se: 1 })).toEqual({ kind: 'result', ...retrodesign({ trueEffect: 1, se: 1 }) });
  });

  it('equals retrodesign at every setting the controls can reach', () => {
    for (const trueEffect of EFFECTS.filter((e) => e > 0)) {
      for (const se of SES) {
        expect(curseModel({ trueEffect, se })).toEqual({ kind: 'result', ...retrodesign({ trueEffect, se, alpha: 0.05 }) });
      }
    }
  });

  it('exaggerates more as the effect shrinks against its standard error', () => {
    const at = (trueEffect: number, se: number) => {
      const r = curseModel({ trueEffect, se });
      if (r.kind !== 'result') throw new Error('expected a result');
      return r.exaggeration;
    };
    // a smaller ratio never exaggerates less, and up to a ratio of 5 it exaggerates strictly more
    const settings = EFFECTS.filter((e) => e > 0).flatMap((e) => SES.map((s) => ({ e, s, ratio: e / s })));
    fc.assert(
      fc.property(fc.constantFrom(...settings), fc.constantFrom(...settings), (x, y) => {
        fc.pre(x.ratio < y.ratio);
        expect(at(x.e, x.s)).toBeGreaterThanOrEqual(at(y.e, y.s));
        if (y.ratio <= 5) expect(at(x.e, x.s)).toBeGreaterThan(at(y.e, y.s));
      }),
    );
    // the same effect with a growing standard error
    const bySe = SES.map((se) => at(1, se));
    for (let i = 1; i < bySe.length; i++) expect(bySe[i]).toBeGreaterThan(bySe[i - 1]!);
  });

  it('turns any non-finite retrodesign result into the unbounded branch, before anything is formatted', () => {
    expect(curseModel({ trueEffect: 1, se: 1 }, infiniteRetro)).toEqual({ kind: 'unbounded' });
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      for (const key of ['power', 'typeS', 'exaggeration'] as const) {
        const deps: CurseDeps = { retrodesign: () => ({ power: 0.5, typeS: 0.1, exaggeration: 2, [key]: bad }) };
        expect(curseModel({ trueEffect: 1, se: 1 }, deps)).toEqual({ kind: 'unbounded' });
      }
    }
  });
});

describe('the exaggeration curve', () => {
  it('runs over the whole reachable ratio range: both ends exactly, 200 log-spaced samples between, sorted and unique', () => {
    expect(RATIO_MIN).toBe(0.02);
    expect(RATIO_MAX).toBe(50);
    expect(CURVE_SAMPLES).toBe(200);
    // the reachable ends: the smallest effect over the largest error, and the reverse
    expect(CURSE_SCHEMA.trueEffect.step / CURSE_SCHEMA.se.max).toBe(RATIO_MIN);
    expect(CURSE_SCHEMA.trueEffect.max / CURSE_SCHEMA.se.min).toBe(RATIO_MAX);
    const { points, selected } = curseCurve({ trueEffect: 0, se: 1 });
    expect(selected).toBeNull();
    expect(points).toHaveLength(CURVE_SAMPLES + 2);
    expect(points[0]!.ratio).toBe(RATIO_MIN);
    expect(points.at(-1)!.ratio).toBe(RATIO_MAX);
    for (let i = 1; i < points.length; i++) expect(points[i]!.ratio).toBeGreaterThan(points[i - 1]!.ratio);
    // the interior samples are evenly spaced in log10
    const step = (Math.log10(RATIO_MAX) - Math.log10(RATIO_MIN)) / (CURVE_SAMPLES + 1);
    for (let i = 1; i < points.length; i++) expect(points[i]!.x - points[i - 1]!.x).toBeCloseTo(step, 12);
  });

  it('maps every x through log10 and evaluates retrodesign at the ratio over a standard error of 1', () => {
    for (const p of curseCurve({ trueEffect: 1, se: 1 }).points) {
      expect(p.x).toBe(Math.log10(p.ratio));
      expect(p.exaggeration).toBe(retrodesign({ trueEffect: p.ratio, se: 1, alpha: 0.05 }).exaggeration);
    }
  });

  it('adds the exact current ratio once, and selects that datum', () => {
    const v = { trueEffect: 0.3, se: 0.7 };
    const { points, selected } = curseCurve(v);
    expect(points).toHaveLength(CURVE_SAMPLES + 3);
    expect(points.filter((p) => p.ratio === 0.3 / 0.7)).toHaveLength(1);
    expect(selected).toEqual(points.find((p) => p.ratio === 0.3 / 0.7));
    const model = curseModel(v);
    expect(model.kind === 'result' && model.exaggeration).toBe(selected!.exaggeration);
    // a ratio already on the curve (an end) is not added twice
    expect(curseCurve({ trueEffect: 5, se: 0.1 }).points).toHaveLength(CURVE_SAMPLES + 2);
  });

  it('keeps the zero-effect branch off the log axis: no selected dot, and no log of zero', () => {
    const log10 = vi.spyOn(Math, 'log10');
    try {
      const { points, selected } = curseCurve({ trueEffect: 0, se: 2.5 });
      expect(selected).toBeNull();
      expect(log10.mock.calls.every(([v]) => v > 0)).toBe(true);
      expect(points.every((p) => p.ratio > 0 && Number.isFinite(p.x))).toBe(true);
    } finally {
      log10.mockRestore();
    }
  });

  it('drops a non-finite sample and selects nothing for an unbounded setting', () => {
    const { points, selected } = curseCurve({ trueEffect: 1, se: 1 }, infiniteRetro);
    expect(points).toEqual([]);
    expect(selected).toBeNull();
    // the axis still holds zero, with room above it
    const { top, ticks } = curseAxis(points, null);
    expect(top).toBeGreaterThan(0);
    expect(ticks.wide[0]).toBe(0);
  });

  it('at effect 0.1 and standard error 5: ratio 0.02, exaggeration about 116.8962012, inside the axis with room for the ring', () => {
    const v = { trueEffect: 0.1, se: 5 };
    expect(v.trueEffect / v.se).toBe(0.02);
    const model = curseModel(v);
    if (model.kind !== 'result') throw new Error('expected a result');
    expect(model.exaggeration).toBeCloseTo(116.8962012, 7);
    expect(model).toEqual({ kind: 'result', ...retrodesign({ trueEffect: 0.1, se: 5, alpha: 0.05 }) });
    const { points, selected } = curseCurve(v);
    expect(selected).not.toBeNull();
    expect(selected!.ratio).toBe(0.02);
    expect(selected!.exaggeration).toBe(model.exaggeration);
    expect(points).toContainEqual(selected);
    const { top } = curseAxis(points, selected);
    expect(top).toBeGreaterThan(model.exaggeration);
    // the dot and its ring sit wholly below the top of the plot, in both layouts
    for (const h of [CURSE_HEIGHT.narrow, CURSE_HEIGHT.wide]) expect(((top - model.exaggeration) / top) * h).toBeGreaterThanOrEqual(DOT_CLEARANCE_PX);
  });

  it('at effect 5 and standard error 0.1: ratio 50, the upper end, selected and inside the axis', () => {
    const v = { trueEffect: 5, se: 0.1 };
    expect(v.trueEffect / v.se).toBe(50);
    const model = curseModel(v);
    if (model.kind !== 'result') throw new Error('expected a result');
    const { points, selected } = curseCurve(v);
    expect(selected).toEqual(points.at(-1));
    expect(selected!.x).toBe(Math.log10(50));
    expect(selected!.exaggeration).toBe(model.exaggeration);
    expect(model.exaggeration).toBeGreaterThanOrEqual(1);
    expect(curseAxis(points, selected).top).toBeGreaterThan(model.exaggeration);
  });

  it('holds zero, every finite sample and the selected value on every setting the controls reach', () => {
    for (const trueEffect of [0, 0.1, 0.5, 1, 5]) {
      for (const se of [0.1, 1, 5]) {
        const { points, selected } = curseCurve({ trueEffect, se });
        const { top, ticks } = curseAxis(points, selected);
        const max = Math.max(...points.map((p) => p.exaggeration));
        expect(top).toBeGreaterThan(max);
        for (const h of [CURSE_HEIGHT.narrow, CURSE_HEIGHT.wide]) expect(((top - max) / top) * h).toBeGreaterThanOrEqual(DOT_CLEARANCE_PX);
        expect(ticks.wide[0]).toBe(0);
        expect(ticks.wide.at(-1)).toBeLessThanOrEqual(top);
      }
    }
  });
});

describe('the exaggeration readout and table', () => {
  it('formats power, the wrong-sign rate and exaggeration without overstating a rounded value', () => {
    expect(formatPower(0.17007504575308757)).toBe('17%');
    expect(formatPower(0.05004582137777116)).toBe('5%');
    expect(formatPower(0.9988172507035044)).toBe('over 99%');
    expect(formatPower(1)).toBe('over 99%');
    expect(formatWrongSign(0.47663895243707505)).toBe('47.7%');
    expect(formatWrongSign(0.009045271962580554)).toBe('0.9%');
    expect(formatWrongSign(0.00007263595109056916)).toBe('below 0.1%');
    expect(formatWrongSign(0)).toBe('below 0.1%');
    expect(formatExaggeration(116.89620120244182)).toBe('116.9');
    expect(formatExaggeration(2.49092844250335)).toBe('2.5');
    expect(formatExaggeration(1)).toBe('1.0');
  });

  it('says the preset result in one sentence', () => {
    expect(curseResultText({ trueEffect: 1, se: 1 })).toBe(
      'At a true effect of 1.0 and a standard error of 1.0, a ratio of 1, power is 17%. Of the estimates that pass the threshold, 0.9% have the wrong sign, and on average their size is 2.5 times the true effect.',
    );
  });

  it('names the undefined quantity at zero effect, and the unbounded one, in words', () => {
    const zero = curseResultText({ trueEffect: 0, se: 1 });
    expect(zero).toContain('Exaggeration is undefined when the true effect is zero.');
    expect(zero).toContain('zero, not undefined');
    expect(zero).toContain('logarithmic');
    expect(zero).not.toMatch(/ratio (is )?undefined/i);
    const unbounded = curseResultText({ trueEffect: 1, se: 1 }, infiniteRetro);
    expect(unbounded).toContain('Exaggeration is unbounded at this setting');
    for (const s of [zero, unbounded]) expect(s).not.toMatch(/Infinity|NaN|null|\d/);
  });

  it('tables plain ratios with their results, the current setting marked, in the readout’s own words', () => {
    const t = curseTable({ trueEffect: 0.1, se: 5 });
    expect(t.columns).toEqual([
      'True effect ÷ standard error',
      'Power',
      'Wrong sign among significant estimates',
      'Exaggeration among significant estimates',
      'Your setting',
    ]);
    expect(t.refs).toEqual(DIAGNOSTICS_REFS);
    const mine = t.rows.filter((r) => r[4] === 'Yes');
    expect(mine).toEqual([[0.02, '5%', '47.7%', '116.9', 'Yes']]);
    // plain ratios, ascending, both ends included
    const ratios = t.rows.map((r) => r[0] as number);
    expect(ratios[0]).toBe(RATIO_MIN);
    expect(ratios.at(-1)).toBe(RATIO_MAX);
    for (let i = 1; i < ratios.length; i++) expect(ratios[i]).toBeGreaterThan(ratios[i - 1]!);
    // a setting off the reference ratios adds its own row
    const off = curseTable({ trueEffect: 0.3, se: 0.7 });
    expect(off.rows).toHaveLength(t.rows.length + 1);
    expect(off.rows.filter((r) => r[4] === 'Yes').map((r) => r[0])).toEqual([0.3 / 0.7]);
    // 0.3 / 1.5 is 0.19999999999999998, not the reference 0.2: the exact ratio takes that row's
    // place, so no two rows print "0.2"
    const noisy = curseTable({ trueEffect: 0.3, se: 1.5 });
    expect(0.3 / 1.5).not.toBe(0.2);
    expect(noisy.rows).toHaveLength(t.rows.length);
    expect(noisy.rows.map((r) => r[0])).not.toContain(0.2);
    expect(noisy.rows.filter((r) => r[4] === 'Yes').map((r) => r[0])).toEqual([0.3 / 1.5]);
    // zero effect marks no row; an unbounded one says so in words
    expect(curseTable({ trueEffect: 0, se: 1 }).rows.some((r) => r[4] === 'Yes')).toBe(false);
    const bad = curseTable({ trueEffect: 1, se: 1 }, infiniteRetro);
    expect(JSON.stringify(bad.rows)).not.toMatch(/Infinity|NaN|null/);
    expect(bad.rows.every((r) => r[3] === 'no finite value')).toBe(true);
  });

  it('reads a hostile URL as the preset or a clamped value on the grid', () => {
    expect(curseFromUrl('curse.trueEffect=Infinity&curse.se=0')).toEqual({ trueEffect: 5, se: 0.1 });
    expect(curseFromUrl('curse.trueEffect=&curse.se=abc&curse.preset=__proto__')).toEqual(CURSE_PRESETS.default);
    expect(curseFromUrl('curse.trueEffect=-1&curse.se=99')).toEqual({ trueEffect: 0, se: 5 });
    expect(curseFromUrl('curse.trueEffect=0.149&curse.se=0.26')).toEqual({ trueEffect: 0.1, se: 0.3 });
    expect(normalizeCurse({ trueEffect: Number.NaN, se: Number.NaN })).toEqual(CURSE_PRESETS.default);
  });
});

// ---------------------------------------------------------------------------------------------
// The server's preset and the views.

/** The dot, the readout and the current table row of a rendered exaggeration Figure. */
function curseParts(html: string) {
  const wide = html.match(/<svg[^>]*data-layout="wide"[\s\S]*?<\/svg>(?=\s*<svg|\s*<\/div>|\s*<style)/)?.[0] ?? '';
  const dots = [...wide.matchAll(/<circle[^>]*data-curse-dot=""[^>]*>/g)].map((m) => m[0]);
  const attr = (el: string, name: string) => el.match(new RegExp(`${name}="([^"]*)"`))?.[1];
  const readout = (key: string) => text(html.match(new RegExp(`<span[^>]*data-curse-${key}=""[^>]*>([^<]*)</span>`))?.[1] ?? '');
  // The Figure prints its table twice (open without JavaScript, folded with it): read the first.
  const table = html.match(/<table[\s\S]*?<\/table>/)?.[0] ?? '';
  const rows = [...table.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((m) => [...m[1]!.matchAll(/<td[^>]*>([^<]*)<\/td>/g)].map((c) => decode(c[1]!)));
  return {
    dots,
    dotRatio: dots[0] ? Number(attr(dots[0], 'data-ratio')) : null,
    dotValue: dots[0] ? Number(attr(dots[0], 'data-exaggeration')) : null,
    readout: { power: readout('power'), wrongSign: readout('wrong-sign'), exaggeration: readout('exaggeration') },
    mine: rows.filter((r) => r.at(-1) === 'Yes'),
    yTicks: [...wide.matchAll(/<text[^>]*data-tick="y"[^>]*>(?:<tspan>)?([^<]*)/g)].map((m) => m[1]),
    xTicks: [...wide.matchAll(/<text[^>]*data-tick="x"[^>]*>([^<]*)/g)].map((m) => m[1]),
  };
}

describe('the split Figure as the server draws it', () => {
  const SERVER = renderToStaticMarkup(createElement(SrmFigure));

  it('states the relationship, badges it Simulated and draws the preset: an even split, not flagged', () => {
    expect(SERVER).toMatch(new RegExp(`<h3 id="${SRM_ID}-title"[^>]*>A split far from the expected share is flagged for a closer look</h3>`));
    expect(text(SERVER)).toContain('Simulated');
    expect(result(SERVER)).toBe(srmResultText(SRM_PRESETS.default));
    expect(result(SERVER)).toContain('not flagged');
  });

  it('explains the threshold, the warning, the approximation and that these are not live results', () => {
    const t = prose(SERVER);
    expect(t).toContain('below 0.001');
    expect(t).toContain('a warning to investigate');
    expect(t).toContain('not proof of what caused it');
    expect(t).toContain('approximation');
    expect(t).toContain('fewer than 5 expected visitors');
    expect(t).toContain('simulated diagnostics');
    expect(t).toContain('not results from this site’s live test');
    expect(t).toContain('independently');
    expect(t).toContain('guarantees no business outcome');
  });

  it('draws observed and expected bars for both groups, as two series', () => {
    const wide = SERVER.match(/<svg[^>]*data-layout="wide"[\s\S]*?<\/svg>/)?.[0] ?? '';
    const bars = [...wide.matchAll(/<rect[^>]*data-series="(observed|expected)"[^>]*data-group="(A|B)"[^>]*data-value="([^"]+)"/g)].map((m) => [m[1], m[2], Number(m[3])]);
    expect(bars).toEqual([
      ['observed', 'A', 100],
      ['expected', 'A', 100],
      ['observed', 'B', 100],
      ['expected', 'B', 100],
    ]);
  });

  it('names a flagged chart no more strongly than its copy: flagged for a closer look, not a verdict', () => {
    const names = (html: string) => [...html.matchAll(/<svg[^>]*role="img"[^>]*aria-label="([^"]*)"/g)].map((m) => m[1]);
    const flagged = names(srmView({ nA: 120, nB: 60, shareA: 0.5 }));
    expect(flagged.length).toBeGreaterThan(0);
    for (const n of flagged) {
      expect(n).toContain('the split is flagged for a closer look');
      expect(n).not.toMatch(/mismatch|proof|caused/i);
    }
    for (const n of names(SERVER)) expect(n).toContain('the split is not flagged');
  });

  it('has no stray number, no digit in a chart name and no non-finite text', () => {
    expect(audit(SERVER)).toEqual([]);
    for (const m of SERVER.matchAll(/aria-label="([^"]*)"/g)) expect(m[1]).not.toMatch(/\d/);
    expect(SERVER).not.toMatch(/Infinity|NaN/);
  });

  it('hands the island no data: the client part gets only its preview and the test seam', () => {
    const element = SrmFigure({}) as ReactElement<Record<string, unknown>>;
    expect(isValidElement(element)).toBe(true);
    expect(Object.keys(element.props).sort()).toEqual(['faultAfterChange', 'preview']);
    expect(element.props.faultAfterChange).toBeUndefined();
  });

  it('with no visitors draws no inference: the empty sentence, no p-value, no chi-square', () => {
    const html = srmView({ nA: 0, nB: 0, shareA: 0.5 });
    expect(result(html)).toBe('No visitors in either group yet, so there is nothing to test and no p-value.');
    expect(result(html)).not.toMatch(/chi-square|flagged/i);
    expect(audit(html)).toEqual([]);
  });

  it('flags one empty group, and says so in words', () => {
    const html = srmView({ nA: 0, nB: 100, shareA: 0.5 });
    expect(result(html)).toContain('p-value below 0.001: flagged.');
    expect(audit(html)).toEqual([]);
  });
});

describe('the exaggeration Figure as the server draws it', () => {
  const SERVER = renderToStaticMarkup(createElement(CurseFigure));

  it('has its title, a Simulated badge and the preset at effect 1 and standard error 1', () => {
    expect(CURSE_TITLE).toBe('Low power exaggerates the effects that pass the threshold');
    expect(SERVER).toMatch(new RegExp(`<h3 id="${CURSE_ID}-title"[^>]*>${CURSE_TITLE}</h3>`));
    expect(text(SERVER)).toContain('Simulated');
    expect(result(SERVER)).toBe(curseResultText(CURSE_PRESETS.default));
  });

  it('says what is assumed and what is not claimed: analytic, normal, independent, arbitrary units, selection', () => {
    const t = prose(SERVER);
    expect(t).toContain('An exact calculation from Gelman and Carlin’s retrodesign formulas on hypothetical values you set; no random draws are involved.');
    // the Simulated badge marks hypothetical values: the caption must not deny it
    expect(t).not.toMatch(/not a simulation/i);
    expect(t).toContain('normally distributed');
    expect(t).toContain('independent observations');
    expect(t).toContain('arbitrary units');
    expect(t).toContain('only the estimates that pass the threshold');
    expect(t).toContain('guarantees no business outcome');
    expect(t).not.toMatch(/seed/i);
    expect(t).not.toMatch(/audible|revenue|listening|churn|iltv/i);
  });

  it('labels a log x-axis with plain ratios and a y-axis from zero', () => {
    const parts = curseParts(SERVER);
    expect(parts.xTicks).toEqual(['0.1', '1', '10']);
    expect(parts.yTicks[0]).toBeDefined();
    expect(parts.yTicks).toContain('0');
    expect(SERVER).toContain('>True effect ÷ standard error (log scale)</text>');
    expect(SERVER).not.toContain('divided by');
  });

  it('agrees with itself at the preset: dot, readout and table row', () => {
    const parts = curseParts(SERVER);
    const model = curseModel(CURSE_PRESETS.default);
    if (model.kind !== 'result') throw new Error('expected a result');
    expect(parts.dots).toHaveLength(1);
    expect(parts.dotRatio).toBe(1);
    expect(parts.dotValue).toBe(model.exaggeration);
    expect(parts.readout).toEqual({ power: '17%', wrongSign: '0.9%', exaggeration: '2.5' });
    expect(parts.mine).toEqual([['1', '17%', '0.9%', '2.5', 'Yes']]);
  });

  it('agrees with itself at the boundary, effect 0.1 and standard error 5', () => {
    const parts = curseParts(curseView({ trueEffect: 0.1, se: 5 }));
    const model = curseModel({ trueEffect: 0.1, se: 5 });
    if (model.kind !== 'result') throw new Error('expected a result');
    expect(parts.dotRatio).toBe(0.02);
    expect(parts.dotValue).toBe(model.exaggeration);
    expect(parts.readout).toEqual({ power: '5%', wrongSign: '47.7%', exaggeration: '116.9' });
    expect(parts.mine).toEqual([['0.02', '5%', '47.7%', '116.9', 'Yes']]);
  });

  it('keeps the readout’s three items in every branch, so its height does not change after hydration', () => {
    const items = (html: string) => {
      const dl = html.match(/<dl[^>]*data-curse-readout=""[^>]*>([\s\S]*?)<\/dl>/)?.[1] ?? '';
      return [...dl.matchAll(/<dt[^>]*>([^<]*)<\/dt><dd[^>]*>([\s\S]*?)<\/dd>/g)].map((m) => [m[1], text(m[2]!)]);
    };
    const labels = ['Power', 'Wrong sign, among significant estimates', 'Exaggeration, among significant estimates'];
    expect(items(curseView(CURSE_PRESETS.default)).map((i) => i[0])).toEqual(labels);
    expect(items(curseView({ trueEffect: 0, se: 1 }))).toEqual([
      [labels[0], 'not shown'],
      [labels[1], 'undefined'],
      [labels[2], 'undefined'],
    ]);
    expect(items(curseView({ trueEffect: 1, se: 1 }, infiniteRetro))).toEqual([
      [labels[0], 'not shown'],
      [labels[1], 'not shown'],
      [labels[2], 'no finite value'],
    ]);
  });

  it('at zero effect: the undefined sentence, no dot, no log evaluation of zero, no number in its words', () => {
    const html = curseView({ trueEffect: 0, se: 1 });
    const parts = curseParts(html);
    expect(parts.dots).toEqual([]);
    expect(result(html)).toContain('Exaggeration is undefined when the true effect is zero.');
    expect(parts.mine).toEqual([]);
    expect(audit(html)).toEqual([]);
  });

  it('an injected non-finite result renders the unbounded words, never Infinity, NaN or null', () => {
    const html = curseView({ trueEffect: 1, se: 1 }, infiniteRetro);
    expect(result(html)).toContain('Exaggeration is unbounded at this setting');
    expect(curseParts(html).dots).toEqual([]);
    expect(html).not.toMatch(/Infinity|NaN|\bnull\b/);
    expect(audit(html)).toEqual([]);
  });

  it('has no stray number and no digit in a chart name, at the preset and both ends', () => {
    for (const html of [SERVER, curseView({ trueEffect: 0.1, se: 5 }), curseView({ trueEffect: 5, se: 0.1 })]) {
      expect(audit(html)).toEqual([]);
      for (const m of html.matchAll(/aria-label="([^"]*)"/g)) expect(m[1]).not.toMatch(/\d/);
      expect(html).not.toMatch(/Infinity|NaN/);
    }
  });

  it('hands the island no data: the client part gets only its preview and the test seam', () => {
    const element = CurseFigure({}) as ReactElement<Record<string, unknown>>;
    expect(Object.keys(element.props).sort()).toEqual(['faultAfterChange', 'preview']);
  });
});

// ---------------------------------------------------------------------------------------------
// What the page loads at once.

const SRC = resolve(import.meta.dirname, '../../../src');
const STATS = join(SRC, 'lib/stats') + '/';

/** Static value imports and re-exports only: `import type` is erased, and import() is its own chunk. */
function staticSpecifiers(source: string): string[] {
  return [...source.matchAll(/^\s*(?:import|export)\s+(?!type\b)(?:[^'"`;]*?\sfrom\s+)?['"]([^'"]+)['"]/gm)].map((m) => m[1]!);
}

function resolveSpecifier(from: string, spec: string): string | null {
  const base = spec.startsWith('@/') ? join(SRC, spec.slice(2)) : spec.startsWith('.') ? resolve(dirname(from), spec) : null;
  if (base === null) return null;
  for (const c of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]) {
    if (existsSync(c) && statSync(c).isFile()) return c;
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

describe('the diagnostics code the page loads at once', () => {
  const ROOTS = ['components/lab/SrmFigureClient.tsx', 'components/lab/CurseFigureClient.tsx'].map((f) => join(SRC, f));

  it('reaches no statistics code and no island through static imports', () => {
    const seen = [...reachable(ROOTS)];
    expect(seen.filter((f) => f.startsWith(STATS))).toEqual([]);
    expect(seen.filter((f) => /(Srm|Curse)Interactive\.tsx$/.test(f))).toEqual([]);
    expect(seen.some((f) => f.endsWith('lib/lab/diagnostics-values.ts'))).toBe(true);
  });

  it('would catch a leak: the statistics side does reach the statistics', () => {
    expect([...reachable([join(SRC, 'lib/lab/diagnostics.ts')])].some((f) => f.startsWith(STATS))).toBe(true);
  });
});
