// The Lab's two diagnostics: the split check (`srm`, a chi-square sample-ratio-mismatch test on
// visitor counts the reader sets, against a planned share of half) and exaggeration (`curse`, Gelman
// and Carlin's retrodesign at the ratio of effect to standard error that gives the power the reader
// sets). Both models wrap the statistics library's own srmTest and retrodesign unchanged; these tests
// hold them to it, pin the empty branch (no call into the statistics), the non-finite branch (words,
// never "Infinity" or null), the linear curve over every power the slider reaches and the agreement
// of its selected point, readout and table, and the server preset as rendered HTML.
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
import { SrmEvenLink, SrmFigure } from '@/components/lab/SrmFigure';
import { InertSrmControls } from '@/components/lab/SrmFigureClient';
import { SrmFigureView, srmPlainText } from '@/components/lab/SrmView';
import { readFigureParams } from '@/lib/figure/url-state';
import {
  CURSE_ALPHA,
  CURSE_HEIGHT,
  CURSE_ID,
  CURSE_PRESETS,
  CURSE_SCHEMA,
  CURSE_PRESET_LINK,
  CURSE_TITLE,
  DIAGNOSTICS_REFS,
  SRM_TITLE,
  DOT_CLEARANCE_PX,
  SRM_ID,
  SRM_EVEN_HREF,
  SRM_PRESETS,
  SRM_SCHEMA,
  SRM_SHARE,
  SRM_SMALL_EXPECTED,
  SRM_THRESHOLD,
  curseAxis,
  cursePowers,
  curseY,
  exaggerationTick,
  curseCurve,
  curseModel,
  curseResultText,
  curseTable,
  formatExaggeration,
  formatPower,
  formatWrongSign,
  normalizeCurse,
  normalizeSrm,
  ratioForPower,
  srmAxis,
  srmExpected,
  srmModel,
  srmResultText,
  srmStatText,
  srmTable,
  type CurseDeps,
  type CurseValues,
  type SrmValues,
} from '@/lib/lab/diagnostics';
import { PLANNER_POWER } from '@/lib/lab/planner-values';
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

/** The prose of the method row: its summary and its paragraphs, folded under the Figure. */
const method = (html: string) =>
  [...html.matchAll(/<(summary|p)(?=[\s>])[^>]*>([\s\S]*?)<\/\1>/g)]
    .filter((m) => m[0].includes('data-method') || (m[1] === 'summary' && /^How /.test(text(m[2]!))))
    .map((m) => prose(m[2]!))
    .join(' ');

/** A retrodesign stand-in that returns Infinity for exaggeration, as an extreme ratio can. */
const infiniteRetro: CurseDeps = { retrodesign: () => ({ power: 0.05, typeS: 0.5, exaggeration: Number.POSITIVE_INFINITY }) };

/** The values a shared URL becomes: the static schema read, then the views' own clean-up. */
const srmFromUrl = (query: string) => normalizeSrm(readFigureParams(new URLSearchParams(query), SRM_ID, SRM_SCHEMA, SRM_PRESETS).values);
const curseFromUrl = (query: string) =>
  normalizeCurse(readFigureParams(new URLSearchParams(query), CURSE_ID, CURSE_SCHEMA, CURSE_PRESETS).values);

/** Every property here runs from this seed, so a run is repeatable. */
const PROPERTY_SEED = 20261113;
/** Every power the slider reaches. */
const POWERS = cursePowers();

// ---------------------------------------------------------------------------------------------
// The split check.

describe('srmModel', () => {
  it('is empty for no visitors at all, without calling the statistics', () => {
    const spy = vi.fn(srmTest);
    expect(srmModel({ nA: 0, nB: 0 }, { srmTest: spy })).toEqual({ kind: 'empty' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('flags one empty group against an even split', () => {
    const r = srmModel({ nA: 0, nB: 100 });
    expect(r).toEqual({ kind: 'result', ...srmTest(0, 100, 0.5) });
    expect(r.kind === 'result' && r.flagged).toBe(true);
  });

  it('gives p = 1 and no flag for an exact even split', () => {
    expect(srmModel({ nA: 100, nB: 100 })).toEqual({ kind: 'result', chi2: 0, p: 1, flagged: false });
  });

  it('flags 120 against 60', () => {
    const r = srmModel({ nA: 120, nB: 60 });
    expect(r).toEqual({ kind: 'result', ...srmTest(120, 60, 0.5) });
    expect(r.kind === 'result' && r.chi2).toBe(20);
    expect(r.kind === 'result' && r.flagged).toBe(true);
  });

  it('passes the counts and the planned share of half to srmTest unchanged, and returns its numbers', () => {
    expect(SRM_SHARE).toBe(0.5);
    const spy = vi.fn(srmTest);
    srmModel({ nA: 7, nB: 3 }, { srmTest: spy });
    expect(spy).toHaveBeenCalledWith(7, 3, 0.5);
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10_000 }), fc.integer({ min: 0, max: 10_000 }), (nA, nB) => {
        fc.pre(nA + nB > 0);
        expect(srmModel({ nA, nB })).toEqual({ kind: 'result', ...srmTest(nA, nB, 0.5) });
      }),
      { seed: PROPERTY_SEED },
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
      fc.property(fc.integer({ min: 0, max: 10_000 }), fc.integer({ min: 0, max: 10_000 }), (nA, nB) => {
        fc.pre(nA + nB > 0);
        const r = srmModel({ nA, nB });
        expect(r.kind === 'result' && r.flagged).toBe(r.kind === 'result' && r.p < SRM_THRESHOLD);
      }),
      { seed: PROPERTY_SEED },
    );
  });
});

describe('the split check around the model', () => {
  it('expects the counts srmTest expects: half the total in each group', () => {
    expect(srmExpected({ nA: 120, nB: 60 })).toEqual({ a: 90, b: 90 });
    expect(srmExpected({ nA: 0, nB: 0 })).toEqual({ a: 0, b: 0 });
    expect(srmExpected({ nA: 30, nB: 71 })).toEqual({ a: 50.5, b: 50.5 });
  });

  it('tables the observed and expected visitors of each group, with the planned share', () => {
    const t = srmTable({ nA: 120, nB: 60 });
    expect(t.columns).toEqual(['Group', 'Visitors', 'Planned share', 'Expected visitors']);
    expect(t.rows).toEqual([
      ['Group A', 120, 0.5, 90],
      ['Group B', 60, 0.5, 90],
    ]);
    expect(t.formats).toEqual(['number', 'count', 'share', 'number']);
    expect(t.refs).toEqual(DIAGNOSTICS_REFS);
    expect(t.note ?? '').not.toMatch(/\d/);
  });

  it('says there is nothing to check with no visitors, and gives no p-value', () => {
    const s = srmResultText({ nA: 0, nB: 0 });
    expect(s).toBe('No visitors yet, so there is nothing to check.');
    expect(s).not.toMatch(/\d|p-value/);
  });

  it('says the verdict in plain words, as odds of a fair split, the exact complement on each side', () => {
    expect(srmResultText({ nA: 120, nB: 60 })).toBe('Flagged: a fair split leaves a gap at least this big less than 1 time in 1,000.');
    expect(srmResultText({ nA: 100, nB: 100 })).toBe('Not flagged: a fair split leaves a gap this big or bigger at least 1 time in 1,000.');
    // the odds are the threshold's, never typed
    expect(1 / SRM_THRESHOLD).toBe(1000);
    // no statistics words in the line a reader sees first: they are in the method row
    for (const s of [srmResultText({ nA: 120, nB: 60 }), srmResultText({ nA: 100, nB: 100 })]) expect(s).not.toMatch(/chi-square|p-value|degree/);
  });

  it('prints a flagged p-value as below the threshold in the method row, never rounded up to it', () => {
    expect(srmStatText({ ...srmTest(120, 60, 0.5) })).toBe('chi-square 20, one degree of freedom, p-value below 0.001');
    expect(srmStatText({ ...srmTest(100, 100, 0.5) })).toBe('chi-square 0, one degree of freedom, p-value 1');
    // no split whose p is just under the threshold prints a p-value of 0.001
    for (let a = 500; a <= 1000; a++) {
      const r = srmTest(a, 1000 - a, 0.5);
      expect(srmStatText(r).includes('p-value below 0.001')).toBe(r.flagged);
      expect(srmResultText({ nA: a, nB: 1000 - a }).startsWith(r.flagged ? 'Flagged:' : 'Not flagged:')).toBe(true);
    }
  });

  it('warns when an expected count is under the rule of thumb, and only then', () => {
    expect(SRM_SMALL_EXPECTED).toBe(5);
    const small = srmResultText({ nA: 3, nB: 1 });
    expect(small).toContain('With so few visitors, this check is only rough.');
    expect(srmResultText({ nA: 100, nB: 100 })).not.toContain('only rough');
    // half of 9 visitors is 4.5, under the rule of thumb; half of 10 is 5, at it
    expect(srmResultText({ nA: 5, nB: 4 })).toContain('only rough');
    expect(srmResultText({ nA: 5, nB: 5 })).not.toContain('only rough');
  });

  it('scales its count axis to hold every bar, with whole-number ticks', () => {
    for (const v of [
      { nA: 0, nB: 0 },
      { nA: 1, nB: 0 },
      { nA: 120, nB: 60 },
      { nA: 10_000, nB: 0 },
      { nA: 0, nB: 10_000 },
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
    expect(srmAxis({ nA: 22, nB: 3 }).ticks.narrow).toEqual([0, 25]);
    for (let m = 0; m <= 10_000; m++) {
      const { top, ticks } = srmAxis({ nA: m, nB: 0 });
      expect(ticks.narrow.length, String(m)).toBeGreaterThanOrEqual(2);
      expect(ticks.narrow[0]).toBe(0);
      expect(ticks.narrow.at(-1), String(m)).toBe(top);
      expect(ticks.wide.at(-1), String(m)).toBe(top);
      // the narrow ticks are a subset of the wide ones
      expect(ticks.narrow.every((t) => ticks.wide.includes(t))).toBe(true);
    }
  });

  it('reads a hostile URL as the preset or a clamped value on the grid', () => {
    expect(srmFromUrl('srm.nA=__proto__&srm.nB=&srm.preset=constructor')).toEqual(SRM_PRESETS.default);
    expect(srmFromUrl('srm.nA=-5&srm.nB=1e9')).toEqual({ nA: 0, nB: 10_000 });
    expect(srmFromUrl('srm.nA=12.6')).toEqual({ nA: 13, nB: 4830 });
    expect(normalizeSrm({ nA: Number.NaN, nB: 0.4 })).toEqual({ nA: 5170, nB: 0 });
    // the even preset by name, and an unknown one gives the default
    expect(srmFromUrl('srm.preset=even')).toEqual({ nA: 5000, nB: 5000 });
    expect(srmFromUrl('srm.preset=odd')).toEqual(SRM_PRESETS.default);
  });

  it('ignores an old link that set the planned share: the share stays half and nothing throws', () => {
    expect(Object.keys(SRM_SCHEMA)).toEqual(['nA', 'nB']);
    expect(srmFromUrl('srm.shareA=0.9')).toEqual(SRM_PRESETS.default);
    expect(srmFromUrl('srm.nA=120&srm.nB=60&srm.shareA=0.67')).toEqual({ nA: 120, nB: 60 });
    expect(srmModel(srmFromUrl('srm.nA=120&srm.nB=60&srm.shareA=0.67'))).toEqual({ kind: 'result', ...srmTest(120, 60, 0.5) });
  });
});

// ---------------------------------------------------------------------------------------------
// Exaggeration.

describe('curseModel', () => {
  it('equals retrodesign at the preset, at the ratio its power implies and the fixed significance level', () => {
    expect(CURSE_ALPHA).toBe(0.05);
    const ratio = ratioForPower(0.17);
    expect(curseModel({ power: 0.17 })).toEqual({ kind: 'result', ratio, ...retrodesign({ trueEffect: ratio, se: 1, alpha: 0.05 }) });
  });

  it('equals retrodesign at every power the slider reaches, and its power is the one set', () => {
    expect(POWERS).toHaveLength(90);
    expect(POWERS[0]).toBe(0.1);
    expect(POWERS.at(-1)).toBe(0.99);
    for (const power of POWERS) {
      const r = curseModel({ power });
      const ratio = ratioForPower(power);
      expect(r).toEqual({ kind: 'result', ratio, ...retrodesign({ trueEffect: ratio, se: 1, alpha: 0.05 }) });
      expect(r.kind === 'result' && r.power).toBeCloseTo(power, 9);
    }
  });

  it('exaggerates strictly more as power falls', () => {
    const at = (power: number) => {
      const r = curseModel({ power });
      if (r.kind !== 'result') throw new Error('expected a result');
      return r.exaggeration;
    };
    for (let i = 1; i < POWERS.length; i++) expect(at(POWERS[i - 1]!)).toBeGreaterThan(at(POWERS[i]!));
  });

  it('turns any non-finite retrodesign result into the unbounded branch, before anything is formatted', () => {
    expect(curseModel({ power: 0.17 }, infiniteRetro)).toEqual({ kind: 'unbounded' });
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      for (const key of ['power', 'typeS', 'exaggeration'] as const) {
        const deps: CurseDeps = { retrodesign: () => ({ power: 0.5, typeS: 0.1, exaggeration: 2, [key]: bad }) };
        expect(curseModel({ power: 0.17 }, deps)).toEqual({ kind: 'unbounded' });
      }
    }
  });
});

describe('the exaggeration curve', () => {
  it('runs over every power the slider reaches, sorted and unique, and selects the setting', () => {
    const { points, selected } = curseCurve({ power: 0.42 });
    expect(points.map((p) => p.power)).toEqual(POWERS);
    for (let i = 1; i < points.length; i++) expect(points[i]!.ratio).toBeGreaterThan(points[i - 1]!.ratio);
    expect(selected).toEqual(points.find((p) => p.power === 0.42));
    const model = curseModel({ power: 0.42 });
    expect(model.kind === 'result' && model.exaggeration).toBe(selected!.exaggeration);
  });

  it('evaluates retrodesign at the ratio each power implies, over a standard error of 1', () => {
    for (const p of curseCurve({ power: 0.17 }).points) {
      expect(p.ratio).toBe(ratioForPower(p.power));
      expect(p.exaggeration).toBe(retrodesign({ trueEffect: p.ratio, se: 1, alpha: 0.05 }).exaggeration);
    }
  });

  it('drops a non-finite sample and selects nothing for an unbounded setting', () => {
    const { points, selected } = curseCurve({ power: 0.17 }, infiniteRetro);
    expect(points).toEqual([]);
    expect(selected).toBeNull();
    // the axis still holds its floor, one times the real effect, with room above it
    const { top, domain, ticks } = curseAxis(points, null);
    expect(top).toBeGreaterThan(1);
    expect(domain).toEqual([0, top - 1]);
    expect(ticks.wide[0]).toBe(1);
  });

  it('fits on a linear axis from one to four times the real effect: about 3.7 at the lowest power, with room for the ring', () => {
    const { points, selected } = curseCurve({ power: 0.1 });
    const model = curseModel({ power: 0.1 });
    if (model.kind !== 'result') throw new Error('expected a result');
    expect(model.exaggeration).toBeCloseTo(3.71, 2);
    expect(selected!.exaggeration).toBe(model.exaggeration);
    const { top, domain, ticks } = curseAxis(points, selected);
    expect(top).toBe(4);
    expect(domain).toEqual([0, 3]);
    // ticks in curseY's units: one times the effect is the zero line, then 2, 3 and 4
    expect(ticks.wide.map((t) => exaggerationTick(t))).toEqual(['2', '3', '4']);
    expect(ticks.narrow.map((t) => exaggerationTick(t))).toEqual(['2', '4']);
    expect(exaggerationTick(0)).toBe('1');
    for (const h of [CURSE_HEIGHT.narrow, CURSE_HEIGHT.wide]) {
      expect(((domain[1] - curseY(model.exaggeration)) / domain[1]) * h).toBeGreaterThanOrEqual(DOT_CLEARANCE_PX);
    }
  });

  it('lifts the preset dot clear of the floor: about 2.5 times sits half way up', () => {
    const { points, selected } = curseCurve(CURSE_PRESETS.default);
    const { domain } = curseAxis(points, selected);
    const share = curseY(selected!.exaggeration) / domain[1];
    expect(share).toBeGreaterThan(0.4);
    expect(share * CURSE_HEIGHT.narrow).toBeGreaterThan(25);
  });

  it('keeps a well-sized test near the floor: at the planner power a win overstates by about 1.1 times', () => {
    const model = curseModel({ power: PLANNER_POWER });
    if (model.kind !== 'result') throw new Error('expected a result');
    expect(formatExaggeration(model.exaggeration)).toBe('1.1');
    expect(model.exaggeration).toBeCloseTo(1.125, 3);
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

  it('says the preset result in one plain sentence, with no statistics words', () => {
    expect(curseResultText({ power: 0.17 })).toBe(
      'At this size, results that clear the bar are on average 2.5 times the real effect, and 0.9% of them point the wrong way.',
    );
    expect(curseResultText({ power: 0.17 })).not.toMatch(/standard error|ratio|power|threshold|estimate/i);
  });

  it('names the unbounded result in words, never Infinity, NaN, null or a digit', () => {
    const unbounded = curseResultText({ power: 0.17 }, infiniteRetro);
    expect(unbounded).toBe('At this setting the calculation has no finite answer, so no number is shown.');
    expect(unbounded).not.toMatch(/Infinity|NaN|null|\d/);
  });

  it('tables the reference powers with their ratio and results, the current setting marked, in the readout’s own words', () => {
    const t = curseTable({ power: 0.17 });
    expect(t.columns).toEqual([
      'How often the test clears the bar (power)',
      'Ratio of effect to noise',
      'Results that clear the bar in the wrong direction',
      'Overstatement among results that clear the bar',
      'Your setting',
    ]);
    expect(t.refs).toEqual(DIAGNOSTICS_REFS);
    expect(t.note ?? '').not.toMatch(/\d/);
    const mine = t.rows.filter((r) => r[4] === 'Yes');
    expect(mine).toEqual([[0.17, ratioForPower(0.17), '0.9%', '2.5', 'Yes']]);
    // powers ascending, both slider ends included
    const powers = t.rows.map((r) => r[0] as number);
    expect(powers[0]).toBe(0.1);
    expect(powers.at(-1)).toBe(0.99);
    for (let i = 1; i < powers.length; i++) expect(powers[i]).toBeGreaterThan(powers[i - 1]!);
    // a setting on a reference power adds no row
    expect(curseTable({ power: 0.8 }).rows).toHaveLength(t.rows.length - 1);
    expect(curseTable({ power: 0.8 }).rows.filter((r) => r[4] === 'Yes').map((r) => r[0])).toEqual([0.8]);
    // an unbounded one says so in words
    const bad = curseTable({ power: 0.17 }, infiniteRetro);
    expect(JSON.stringify(bad.rows)).not.toMatch(/Infinity|NaN|null/);
    expect(bad.rows.every((r) => r[3] === 'no finite value')).toBe(true);
  });

  it('reads a hostile URL as the preset or a clamped value on the grid', () => {
    expect(curseFromUrl('curse.power=Infinity')).toEqual({ power: 0.99 });
    expect(curseFromUrl('curse.power=&curse.preset=__proto__')).toEqual(CURSE_PRESETS.default);
    expect(curseFromUrl('curse.power=-1')).toEqual({ power: 0.1 });
    expect(curseFromUrl('curse.power=0.456')).toEqual({ power: 0.46 });
    expect(normalizeCurse({ power: Number.NaN })).toEqual(CURSE_PRESETS.default);
  });

  it('ignores an old link that set the effect and the noise: it falls back to the preset and never throws', () => {
    expect(Object.keys(CURSE_SCHEMA)).toEqual(['power']);
    expect(curseFromUrl('curse.trueEffect=3')).toEqual(CURSE_PRESETS.default);
    expect(curseFromUrl('curse.trueEffect=0.1&curse.se=5')).toEqual(CURSE_PRESETS.default);
    expect(() => curseResultText(curseFromUrl('curse.trueEffect=0&curse.se=0'))).not.toThrow();
  });

  it('links to a test sized as the planner sizes one: the planner power, set as a full page load', () => {
    expect(CURSE_PRESET_LINK).toEqual({ href: `?curse.power=${PLANNER_POWER}#exaggeration`, label: 'See a test sized as in check 1' });
    expect(curseFromUrl(CURSE_PRESET_LINK.href.slice(1, CURSE_PRESET_LINK.href.indexOf('#')))).toEqual({ power: PLANNER_POWER });
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
    dotPower: dots[0] ? Number(attr(dots[0], 'data-power')) : null,
    dotValue: dots[0] ? Number(attr(dots[0], 'data-exaggeration')) : null,
    readout: { exaggeration: readout('exaggeration'), wrongSign: readout('wrong-sign') },
    mine: rows.filter((r) => r.at(-1) === 'Yes'),
    yTicks: [...wide.matchAll(/<text[^>]*data-tick="y"[^>]*>(?:<tspan[^>]*>)?([^<]*)/g)].map((m) => m[1]),
    xTicks: [...wide.matchAll(/<text[^>]*data-tick="x"[^>]*>([^<]*)/g)].map((m) => m[1]),
  };
}

describe('the split Figure as the server draws it', () => {
  const SERVER = renderToStaticMarkup(createElement(SrmFigure));

  it('states the relationship, badges it Simulated and draws the preset: a real case, 5,170 to 4,830 against an even split, flagged', () => {
    expect(SRM_TITLE).toBe('The bigger the gap, the rarer it is by chance');
    expect(SERVER).toMatch(new RegExp(`<h3 id="${SRM_ID}-title"[^>]*>${SRM_TITLE}</h3>`));
    expect(text(SERVER)).toContain('Simulated');
    expect(SRM_PRESETS.default).toEqual({ nA: 5170, nB: 4830 });
    // the verdict first, in plain words; the announcement says the same words
    expect(result(SERVER)).toBe(srmPlainText(SRM_PRESETS.default));
    expect(result(SERVER)).toBe('Flagged: a fair split leaves a gap at least this big less than 1 time in 1,000.');
    expect(srmPlainText({ nA: 5000, nB: 5000 })).toBe('Not flagged: a fair split leaves a gap this big or bigger at least 1 time in 1,000.');
    expect(srmPlainText({ nA: 0, nB: 0 })).toBe(srmResultText({ nA: 0, nB: 0 }));
  });

  it('has two count sliders and Reset, and no planned-share control', () => {
    expect(SERVER).toContain(`id="${SRM_ID}-nA"`);
    expect(SERVER).toContain(`id="${SRM_ID}-nB"`);
    expect(SERVER).not.toContain(`id="${SRM_ID}-shareA"`);
    expect(text(SERVER)).not.toMatch(/Expected share/);
  });

  it('keeps the even split one link away: the even preset is the same total, not flagged', () => {
    expect(SRM_PRESETS.even).toEqual({ nA: 5000, nB: 5000 });
    expect(srmModel(SRM_PRESETS.even!)).toEqual({ kind: 'result', chi2: 0, p: 1, flagged: false });
    expect(SRM_EVEN_HREF).toBe('/lab?srm.preset=even#split-check');
    const link = renderToStaticMarkup(createElement(SrmEvenLink));
    expect(link).toMatch(/^<p data-js-only=""[^>]*><a href="\/lab\?srm\.preset=even#split-check" data-touch-target="" data-full-load="" class="[^"]*min-h-\(--size-target\)[^"]*"><span>See an even split pass<\/span><\/a><\/p>$/);
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
    expect(t).toContain('The Lab fixes the planned share at half; the check works against any planned share.');
  });

  it('moves the live statistic into the method row, for the setting on screen', () => {
    expect(method(SERVER)).toContain('For your setting: chi-square 11.56, one degree of freedom, p-value below 0.001.');
    expect(method(srmView({ nA: 5000, nB: 5000 }))).toContain('For your setting: chi-square 0, one degree of freedom, p-value 1.');
    expect(method(srmView({ nA: 0, nB: 0 }))).not.toContain('For your setting');
    expect(result(SERVER)).not.toMatch(/chi-square|p-value/);
  });

  it('has a short caption, a legend in plain words and a takeaway that ends in my decision', () => {
    const t = prose(SERVER);
    expect(t).toContain('Made-up visitor counts. Each group was meant to get half.');
    expect(t).toContain('Visitors who arrived (filled)');
    expect(t).toContain('Half of all visitors, the planned share (outlined)');
    expect(t).toContain('Each group should get half the visitors. Here group A got 5,170 and group B 4,830. That looks close. Is it? Move the counts and watch the verdict.');
    expect(t).toContain(
      'It is not close enough. A fair split would almost never leave a gap this big. So I read no result until I find what broke the assignment or the counting. Otherwise a winner may only reflect who ended up in each group.',
    );
    expect(t).toContain('How the split check works');
  });

  it('draws observed and expected bars for both groups, as two series', () => {
    const wide = SERVER.match(/<svg[^>]*data-layout="wide"[\s\S]*?<\/svg>/)?.[0] ?? '';
    const bars = [...wide.matchAll(/<rect[^>]*data-series="(observed|expected)"[^>]*data-group="(A|B)"[^>]*data-value="([^"]+)"/g)].map((m) => [m[1], m[2], Number(m[3])]);
    expect(bars).toEqual([
      ['observed', 'A', 5170],
      ['expected', 'A', 5000],
      ['observed', 'B', 4830],
      ['expected', 'B', 5000],
    ]);
  });

  it('names a flagged chart no more strongly than its copy: flagged for a closer look, not a verdict', () => {
    const names = (html: string) => [...html.matchAll(/<svg[^>]*role="img"[^>]*aria-label="([^"]*)"/g)].map((m) => m[1]);
    const flagged = names(srmView({ nA: 120, nB: 60 }));
    expect(flagged.length).toBeGreaterThan(0);
    for (const n of flagged) {
      expect(n).toContain('the split is flagged for a closer look');
      expect(n).toContain('The visitors who arrived and half of all visitors');
      expect(n).not.toMatch(/mismatch|proof|caused|observed|expected/i);
    }
    for (const n of names(srmView(SRM_PRESETS.even!))) expect(n).toContain('the split is not flagged');
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
    const html = srmView({ nA: 0, nB: 0 });
    expect(result(html)).toBe('No visitors yet, so there is nothing to check.');
    expect(result(html)).not.toMatch(/chi-square|flagged|p-value/i);
    expect(audit(html)).toEqual([]);
  });

  it('flags one empty group, and says so in words', () => {
    const html = srmView({ nA: 0, nB: 100 });
    expect(result(html)).toMatch(/^Flagged: /);
    expect(method(html)).toContain('p-value below 0.001.');
    expect(audit(html)).toEqual([]);
  });

  it('warns with few visitors in the result line, in plain words', () => {
    const html = srmView({ nA: 3, nB: 1 });
    expect(result(html)).toContain('With so few visitors, this check is only rough.');
    expect(result(html)).toBe(srmPlainText({ nA: 3, nB: 1 }));
  });
});

describe('the exaggeration Figure as the server draws it', () => {
  const SERVER = renderToStaticMarkup(createElement(CurseFigure));

  it('has its title, a Simulated badge and the preset at a power of 17%', () => {
    expect(CURSE_TITLE).toBe('The smaller the test, the more its wins overstate the effect');
    expect(SERVER).toMatch(new RegExp(`<h3 id="${CURSE_ID}-title"[^>]*>${CURSE_TITLE}</h3>`));
    expect(text(SERVER)).toContain('Simulated');
    expect(result(SERVER)).toBe(curseResultText(CURSE_PRESETS.default));
  });

  it('has one power slider and Reset: no effect or noise slider', () => {
    expect(SERVER).toContain(`id="${CURSE_ID}-power"`);
    expect(SERVER).not.toContain(`id="${CURSE_ID}-trueEffect"`);
    expect(SERVER).not.toContain(`id="${CURSE_ID}-se"`);
    expect(text(SERVER)).toContain('How often the test clears the bar (power)');
    expect(SERVER).toContain('aria-valuetext="17% of the time"');
  });

  it('says what is assumed and what is not claimed: analytic, normal, independent, arbitrary units, selection', () => {
    const t = prose(SERVER);
    expect(t).toContain('An exact calculation on made-up values, with no random draws.');
    // the Simulated badge marks hypothetical values: the caption must not deny it
    expect(t).not.toMatch(/not a simulation/i);
    expect(t).toContain('normally distributed');
    expect(t).toContain('independent observations');
    expect(t).toContain('arbitrary units');
    expect(t).toContain('only the estimates that clear the bar');
    expect(t).toContain('guarantee no business outcome');
    expect(t).toContain('Gelman and Carlin');
    expect(t).toContain('type M');
    expect(t).not.toMatch(/seed/i);
  });

  it('moves the ratio into the method row, for the setting on screen', () => {
    expect(method(SERVER)).toContain('your setting is a ratio of 1.00.');
    expect(method(curseView({ power: 0.8 }))).toContain(`your setting is a ratio of ${ratioForPower(0.8).toFixed(2)}.`);
    expect(method(SERVER)).toContain('How the overstatement is calculated');
  });

  it('labels a linear power axis in percent and a linear axis from one times the real effect', () => {
    const parts = curseParts(SERVER);
    expect(parts.xTicks).toEqual(['10%', '30%', '50%', '70%', '90%']);
    // the zero line is 1x: no exaggeration; the ticks are plain multiples
    expect([...parts.yTicks].sort()).toEqual(['1', '2', '3', '4']);
    expect(SERVER).toContain('>Times the real effect</text>');
    expect(SERVER).toContain('>How often the test clears the bar (power)</text>');
    expect(SERVER).not.toMatch(/log scale|÷/);
  });

  it('agrees with itself at the preset: dot, readout and table row', () => {
    const parts = curseParts(SERVER);
    const model = curseModel(CURSE_PRESETS.default);
    if (model.kind !== 'result') throw new Error('expected a result');
    expect(parts.dots).toHaveLength(1);
    expect(parts.dotPower).toBe(0.17);
    expect(parts.dotValue).toBe(model.exaggeration);
    expect(parts.readout).toEqual({ exaggeration: '2.5', wrongSign: '0.9%' });
    expect(parts.mine).toEqual([['17%', '1.00', '0.9%', '2.5', 'Yes']]);
  });

  it('agrees with itself at both ends of the slider', () => {
    for (const [power, readout] of [
      [0.1, { exaggeration: '3.7', wrongSign: formatWrongSign((curseModel({ power: 0.1 }) as { typeS: number }).typeS) }],
      [0.99, { exaggeration: '1.0', wrongSign: 'below 0.1%' }],
    ] as const) {
      const parts = curseParts(curseView({ power }));
      const model = curseModel({ power });
      if (model.kind !== 'result') throw new Error('expected a result');
      expect(parts.dotPower).toBe(power);
      expect(parts.dotValue).toBe(model.exaggeration);
      expect(parts.readout).toEqual(readout);
      expect(parts.mine).toHaveLength(1);
    }
  });

  it('keeps the readout’s two items in every branch, the overstatement first, so its height does not change after hydration', () => {
    const items = (html: string) => {
      const dl = html.match(/<dl[^>]*data-curse-readout=""[^>]*>([\s\S]*?)<\/dl>/)?.[1] ?? '';
      return [...dl.matchAll(/<dt[^>]*>([^<]*)<\/dt><dd[^>]*>([\s\S]*?)<\/dd>/g)].map((m) => [m[1], text(m[2]!)]);
    };
    const labels = ['Results that clear the bar overstate the effect by', 'Results that clear the bar in the wrong direction'];
    expect(items(curseView(CURSE_PRESETS.default))).toEqual([
      [labels[0], '2.5 times'],
      [labels[1], '0.9%'],
    ]);
    expect(items(curseView({ power: 0.17 }, infiniteRetro))).toEqual([
      [labels[0], 'no finite value'],
      [labels[1], 'not shown'],
    ]);
  });

  it('never prints a bare undefined, null or NaN as a value, in any branch', () => {
    // an element or text whose whole content is one of these words reads as a leaked JavaScript value
    const bare = (html: string) =>
      [...html.matchAll(/>\s*(undefined|null|NaN)\s*</g)].map((m) => m[1]).concat([...text(html).matchAll(/\b(null|NaN|undefined)\b/g)].map((m) => m[1]));
    for (const html of [
      renderToStaticMarkup(createElement(CurseFigure)),
      curseView({ power: 0.17 }, infiniteRetro),
      curseView({ power: 0.1 }),
      renderToStaticMarkup(createElement(SrmFigure)),
      srmView({ nA: 0, nB: 0 }),
    ]) {
      expect(bare(html)).toEqual([]);
    }
  });

  it('an injected non-finite result renders the unbounded words, never Infinity, NaN or null', () => {
    const html = curseView({ power: 0.17 }, infiniteRetro);
    expect(result(html)).toBe('At this setting the calculation has no finite answer, so no number is shown.');
    expect(curseParts(html).dots).toEqual([]);
    expect(html).not.toMatch(/Infinity|NaN|\bnull\b/);
    expect(audit(html)).toEqual([]);
  });

  it('has no stray number and no digit in a chart name, at the preset and both ends', () => {
    for (const html of [SERVER, curseView({ power: 0.1 }), curseView({ power: 0.99 })]) {
      expect(audit(html)).toEqual([]);
      for (const m of html.matchAll(/aria-label="([^"]*)"/g)) expect(m[1]).not.toMatch(/\d/);
      expect(html).not.toMatch(/Infinity|NaN/);
    }
  });

  it('says the point and my decision under the Figure, from the preset model', () => {
    const t = prose(SERVER);
    expect(t).toContain('Picture a change with a real but small effect. Make the test bigger or smaller, and watch how much its wins overstate the effect.');
    expect(t).toContain(
      'At the start, the test clears the bar only 17% of the time. To win at all, it needs a lucky reading well above the truth. On average its wins report 2.5 times the real effect. A forecast built on that number is likely to overpromise. So I treat a surprising win from a small test as a lead. I run it again before anyone plans on that number.',
    );
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

describe('the exaggeration chart name', () => {
  it('says what the line shows in words, on linear axes', () => {
    const html = renderToStaticMarkup(createElement(CurseFigure));
    expect(html).toContain('large for a test that rarely clears it and close to the real effect for one that nearly always does, with your setting marked');
    expect(html).not.toContain('log scale');
  });
});
