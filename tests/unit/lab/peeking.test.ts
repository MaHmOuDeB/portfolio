// The Lab's peeking comparison model: a lookup in the seeded table, never a simulation. It
// normalizes hostile inputs, rebuilds the engine's result (metadata from the manifest and the
// key), gives the 95% Wilson interval for the Monte Carlo uncertainty of the rate (from the whole
// number of flagged runs, never from the rounded standard error), and the planning cost of each
// fix as a ratio. Its static imports never reach the simulation engine or the generator.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import fc from 'fast-check';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DataTable } from '@/components/kit/DataTable';
import {
  PEEK_MAX_LOOKS,
  PEEK_PRESET,
  computePeek,
  normalizePeek,
  peekDomains,
  type PeekValues,
  type PeekView,
} from '@/lib/lab/peeking';
import { PEEK_TABLE, PEEK_TABLE_MANIFEST } from '@/lib/lab/peeking-table.generated';
import { mixtureCs, mixtureRatio, normalQuantile, obfBoundary, optimalTau2, simulatePeeking, wilson } from '@/lib/stats';

const METHODS = ['naive', 'obf', 'cs'] as const;
const Z = normalQuantile(0.975);
const META = { seed: 42, runs: 1000, p: 0.35, alpha: 0.05 } as const;

describe('computePeek: daily looks', () => {
  it('seeds the preset: daily, 20 looks, no fix, 22.1% of 1,000 runs', () => {
    expect(PEEK_PRESET).toEqual({ looks: 20, mode: 'daily', fix: 'naive' });
    const v = computePeek(PEEK_PRESET);
    expect(v.values).toEqual(PEEK_PRESET);
    expect(v.selected.falsePositiveRate).toBe(0.221);
    expect(v.selected).toEqual(v.naive);
    expect(v.cost).toBeNull();
    expect(v.mc).toEqual({ lower: wilson(221, 1000).lower, upper: wilson(221, 1000).upper });
  });

  for (const fix of METHODS) {
    for (const looks of [1, 20, 50]) {
      it(`${fix} at ${looks} look(s): the table row with the engine's metadata, and the naive ghost`, () => {
        const v = computePeek({ looks, mode: 'daily', fix });
        const e = PEEK_TABLE[`daily/${fix}/${looks}`]!;
        expect(v.values).toEqual({ looks, mode: 'daily', fix });
        expect(v.selected).toEqual({
          ...META,
          looks,
          nPerLook: 100,
          method: fix,
          falsePositiveRate: e.falsePositiveRate,
          mcStdError: e.mcStdError,
          cumulativeByLook: e.cumulativeByLook,
        });
        const g = PEEK_TABLE[`daily/naive/${looks}`]!;
        expect(v.naive).toEqual({
          ...META,
          looks,
          nPerLook: 100,
          method: 'naive',
          falsePositiveRate: g.falsePositiveRate,
          mcStdError: g.mcStdError,
          cumulativeByLook: g.cumulativeByLook,
        });
        // Wilson from the whole number of flagged runs
        const x = Math.round(e.falsePositiveRate * 1000);
        expect(Number.isInteger(x)).toBe(true);
        expect(v.mc).toEqual({ lower: wilson(x, 1000, 0.05).lower, upper: wilson(x, 1000, 0.05).upper });
        expect(v.mc.lower).toBeLessThanOrEqual(e.falsePositiveRate);
        expect(v.mc.upper).toBeGreaterThanOrEqual(e.falsePositiveRate);
      });
    }
  }

  it('returns copies: changing a view never changes the table', () => {
    const v = computePeek(PEEK_PRESET);
    v.selected.cumulativeByLook[0] = 9;
    expect(PEEK_TABLE['daily/naive/20']!.cumulativeByLook[0]).not.toBe(9);
    expect(computePeek(PEEK_PRESET).selected.cumulativeByLook[0]).not.toBe(9);
  });

  it('rebuilds the same metadata the engine reports (daily naive at 20 looks)', () => {
    const run = simulatePeeking({ seed: 42, runs: 1000, looks: 20, nPerLook: 100, p: 0.35, alpha: 0.05, method: 'naive' });
    const { falsePositiveRate, mcStdError, cumulativeByLook, ...meta } = run;
    const v = computePeek(PEEK_PRESET).selected;
    expect({ seed: v.seed, runs: v.runs, looks: v.looks, nPerLook: v.nPerLook, p: v.p, alpha: v.alpha, method: v.method }).toEqual(meta);
    expect(v.falsePositiveRate).toBe(falsePositiveRate);
    expect(Math.abs(v.mcStdError - mcStdError)).toBeLessThanOrEqual(0.0005);
    expect(v.cumulativeByLook).toEqual(cumulativeByLook.map((c) => Math.round(c * 1000) / 1000));
  });
});

describe('computePeek: looking once', () => {
  for (const looks of [1, 20, 50]) {
    it(`once after ${looks} looks' worth: one naive look at the same total sample, ghost = daily naive`, () => {
      const v = computePeek({ looks, mode: 'once', fix: 'naive' });
      const e = PEEK_TABLE[`once/${looks}`]!;
      expect(v.selected).toEqual({
        ...META,
        looks: 1,
        nPerLook: 100 * looks,
        method: 'naive',
        falsePositiveRate: e.falsePositiveRate,
        mcStdError: e.mcStdError,
        cumulativeByLook: e.cumulativeByLook,
      });
      // the total sample per group is the daily schedule's
      expect(v.selected.looks * v.selected.nPerLook).toBe(v.naive.looks * v.naive.nPerLook);
      expect(v.naive).toEqual(computePeek({ looks, mode: 'daily', fix: 'naive' }).naive);
      expect(v.cost).toBeNull();
      const x = Math.round(e.falsePositiveRate * 1000);
      expect(v.mc).toEqual({ lower: wilson(x, 1000).lower, upper: wilson(x, 1000).upper });
    });
  }

  it('once 20 and once 50 end at 2,000 and 5,000 visitors per group', () => {
    expect(computePeek({ looks: 20, mode: 'once', fix: 'naive' }).selected.nPerLook).toBe(2000);
    expect(computePeek({ looks: 50, mode: 'once', fix: 'naive' }).selected.nPerLook).toBe(5000);
  });

  it('keeps the chosen fix in the values but ignores it for the lookup and the cost', () => {
    const base = computePeek({ looks: 30, mode: 'once', fix: 'naive' });
    for (const fix of METHODS) {
      const v = computePeek({ looks: 30, mode: 'once', fix });
      expect(v.values).toEqual({ looks: 30, mode: 'once', fix });
      expect(v.selected).toEqual(base.selected);
      expect(v.naive).toEqual(base.naive);
      expect(v.mc).toEqual(base.mc);
      expect(v.cost).toBeNull();
      expect(v.table).toEqual(base.table);
    }
  });

  it('rebuilds the same metadata the engine reports (once at 50 looks)', () => {
    const run = simulatePeeking({ seed: 42, runs: 1000, looks: 1, nPerLook: 5000, p: 0.35, alpha: 0.05, method: 'naive' });
    const v = computePeek({ looks: 50, mode: 'once', fix: 'cs' }).selected;
    expect(v).toEqual({
      ...run,
      falsePositiveRate: Math.round(run.falsePositiveRate * 1000) / 1000,
      mcStdError: Math.round(run.mcStdError * 1000) / 1000,
      cumulativeByLook: run.cumulativeByLook.map((c) => Math.round(c * 1000) / 1000),
    });
  });
});

describe('the cost of a fix (planning ratios, not measured power or extra sample)', () => {
  it("O'Brien-Fleming: the last look's boundary over the one-look 1.96", () => {
    for (let looks = 1; looks <= PEEK_MAX_LOOKS; looks += 1) {
      const v = computePeek({ looks, mode: 'daily', fix: 'obf' });
      expect(v.cost).toEqual({ kind: 'boundary', ratio: obfBoundary(looks, looks) / Z });
    }
    // one look is the fixed test; more looks raise the final bar
    expect(computePeek({ looks: 1, mode: 'daily', fix: 'obf' }).cost!.ratio).toBeCloseTo(1, 9);
    expect(computePeek({ looks: 20, mode: 'daily', fix: 'obf' }).cost!.ratio).toBeCloseTo(2.12590739903 / 1.959963984540054, 9);
    expect(computePeek({ looks: 50, mode: 'daily', fix: 'obf' }).cost!.ratio).toBeGreaterThan(1.08);
  });

  it('confidence sequence: half-width at the planning sample over the fixed 95% half-width', () => {
    for (let looks = 1; looks <= PEEK_MAX_LOOKS; looks += 1) {
      const n = looks * 100;
      const x = Math.round(n * 0.35);
      const tau2 = optimalTau2({ baseline: 0.35, nCapPerArm: n, alpha: 0.05 });
      const half = mixtureCs({ xA: x, nA: n, xB: x, nB: n }, { tau2, alpha: 0.05 }).halfWidth;
      const v = computePeek({ looks, mode: 'daily', fix: 'cs' });
      expect(v.cost).toEqual({ kind: 'width', ratio: half / (Z * Math.sqrt((2 * 0.35 * 0.65) / n)) });
      // closed form at the tuned variance: sqrt((1 + 1/r)(-2 ln alpha + ln(1 + r))) / z, about 1.55;
      // the floored plug-in variance moves it only in the third decimal
      const r = mixtureRatio(0.05);
      expect(v.cost!.ratio).toBeCloseTo(Math.sqrt((1 + 1 / r) * (-2 * Math.log(0.05) + Math.log1p(r))) / Z, 2);
    }
  });

  it('no fix, or one look at the end, has no cost', () => {
    expect(computePeek({ looks: 20, mode: 'daily', fix: 'naive' }).cost).toBeNull();
    expect(computePeek({ looks: 20, mode: 'once', fix: 'obf' }).cost).toBeNull();
    expect(computePeek({ looks: 20, mode: 'once', fix: 'cs' }).cost).toBeNull();
  });
});

describe('normalizePeek: hostile inputs', () => {
  it('keeps valid values', () => {
    expect(normalizePeek({ looks: 7, mode: 'once', fix: 'cs' })).toEqual({ looks: 7, mode: 'once', fix: 'cs' });
  });

  it('snaps and clamps looks to whole looks from 1 to 50; NaN or a non-number gives the preset 20', () => {
    const looks = (l: unknown) => normalizePeek({ ...PEEK_PRESET, looks: l as number }).looks;
    expect(looks(0)).toBe(1);
    expect(looks(-5)).toBe(1);
    expect(looks(51)).toBe(50);
    expect(looks(1e9)).toBe(50);
    expect(looks(Infinity)).toBe(50);
    expect(looks(-Infinity)).toBe(1);
    expect(looks(20.4)).toBe(20);
    expect(looks(20.6)).toBe(21);
    expect(looks(Number.NaN)).toBe(20);
    expect(looks('20')).toBe(20);
    expect(looks('7')).toBe(20);
    expect(looks(undefined)).toBe(20);
    expect(looks(null)).toBe(20);
  });

  it('falls back to daily and no fix for unknown modes and fixes, including prototype names', () => {
    for (const bad of ['weekly', '', 'toString', '__proto__', 'constructor', undefined, null, 1]) {
      expect(normalizePeek({ ...PEEK_PRESET, mode: bad as 'daily' }).mode).toBe('daily');
      expect(normalizePeek({ ...PEEK_PRESET, fix: bad as 'naive' }).fix).toBe('naive');
    }
  });

  it('survives a missing or empty object', () => {
    expect(normalizePeek(undefined as unknown as PeekValues)).toEqual(PEEK_PRESET);
    expect(normalizePeek({} as PeekValues)).toEqual(PEEK_PRESET);
  });

  it('property: any input gives a finite, matching view', () => {
    const anyValue = fc.oneof(fc.double(), fc.integer(), fc.string(), fc.constant(undefined), fc.constant(null));
    fc.assert(
      fc.property(
        fc.record({ looks: anyValue, mode: fc.oneof(fc.constantFrom('daily', 'once'), anyValue), fix: fc.oneof(fc.constantFrom(...METHODS), anyValue) }),
        (raw) => {
          const v = computePeek(raw as unknown as PeekValues);
          expect(Number.isInteger(v.values.looks) && v.values.looks >= 1 && v.values.looks <= 50).toBe(true);
          expect(['daily', 'once']).toContain(v.values.mode);
          expect(METHODS).toContain(v.values.fix);
          expect(v).toEqual(computePeek(v.values));
          for (const x of [v.selected.falsePositiveRate, v.naive.falsePositiveRate, v.mc.lower, v.mc.upper]) {
            expect(Number.isFinite(x) && x >= 0 && x <= 1).toBe(true);
          }
          if (v.cost) expect(Number.isFinite(v.cost.ratio) && v.cost.ratio > 0).toBe(true);
        },
      ),
      { numRuns: 300 },
    );
  });
});

/** Every value combination the controls can produce. */
function allValues(): PeekValues[] {
  const out: PeekValues[] = [];
  for (let looks = 1; looks <= 50; looks += 1) {
    for (const mode of ['daily', 'once'] as const) for (const fix of METHODS) out.push({ looks, mode, fix });
  }
  return out;
}

describe('the table fallback', () => {
  const pct = (share: number) => Math.round(share * 1000) / 10;

  it('daily, no fix: one row per look with the share flagged so far, in percent', () => {
    const v = computePeek(PEEK_PRESET);
    expect(v.table.refs).toEqual(['simulated']);
    expect(v.table.columns).toHaveLength(2);
    expect(v.table.formats).toEqual(['count', { fixed: 1 }]);
    expect(v.table.rows).toHaveLength(20);
    expect(v.table.rows[0]).toEqual([1, pct(v.naive.cumulativeByLook[0]!)]);
    expect(v.table.rows[19]).toEqual([20, 22.1]);
  });

  it('daily with a fix: the naive ghost and the chosen method side by side', () => {
    for (const fix of ['obf', 'cs'] as const) {
      const v = computePeek({ looks: 50, mode: 'daily', fix });
      expect(v.table.columns).toHaveLength(3);
      expect(v.table.formats).toEqual(['count', { fixed: 1 }, { fixed: 1 }]);
      expect(v.table.rows).toEqual(
        v.naive.cumulativeByLook.map((g, i) => [i + 1, pct(g), pct(v.selected.cumulativeByLook[i]!)]),
      );
    }
  });

  // Every numeric column holds a number in every row (an empty cell would make the table left-align
  // that column): the daily looks with no fix, one row per look, then the one look at the end.
  it('once: the daily ghost by look, then the one look at the end as its own row, with no empty cell', () => {
    const v = computePeek({ looks: 20, mode: 'once', fix: 'obf' });
    expect(v.table.columns).toEqual(['Look', 'Schedule', 'False winners so far (%)']);
    expect(v.table.formats).toEqual(['count', 'number', { fixed: 1 }]);
    expect(v.table.rows).toEqual([
      ...v.naive.cumulativeByLook.map((g, i) => [i + 1, 'Peeking daily, no fix', pct(g)]),
      [20, 'One look at the end', pct(v.selected.falsePositiveRate)],
    ]);
    for (const looks of [1, 50]) {
      const rows = computePeek({ looks, mode: 'once', fix: 'naive' }).table.rows;
      expect(rows).toHaveLength(looks + 1);
      expect(rows.every((r) => typeof r[0] === 'number' && typeof r[1] === 'string' && typeof r[2] === 'number')).toBe(true);
    }
  });

  it('prints every percent with exactly one decimal, so no column mixes "22" with "22.1"', () => {
    const views = [
      { looks: 20, mode: 'daily', fix: 'naive' },
      { looks: 50, mode: 'daily', fix: 'obf' },
      { looks: 10, mode: 'daily', fix: 'cs' },
      { looks: 50, mode: 'once', fix: 'naive' },
    ] as const;
    for (const values of views) {
      const html = renderToStaticMarkup(createElement(DataTable, { id: 't', caption: 'c', table: computePeek(values).table, mode: 'open' }));
      const rows = [...html.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((m) => [...m[1]!.matchAll(/<td[^>]*>([^<]*)<\/td>/g)].map((c) => c[1]!)).filter((r) => r.length > 0);
      expect(rows.length).toBeGreaterThan(0);
      const percents = rows.flatMap((r) => r.slice(1).filter((c) => /\d/.test(c)));
      expect(percents.length, JSON.stringify(values)).toBeGreaterThan(0);
      for (const p of percents) expect(p, JSON.stringify(values)).toMatch(/^\d+\.\d$/);
    }
    // the preset's last look, 22.1%, and once/50's one look at the end, 5.0%
    expect(renderToStaticMarkup(createElement(DataTable, { id: 't', caption: 'c', table: computePeek({ looks: 50, mode: 'once', fix: 'naive' }).table, mode: 'open' }))).toMatch(
      />One look at the end<\/td><td[^>]*>5\.0<\/td><\/tr><\/tbody>/,
    );
  });

  it('keeps its words free of numerals (numbers live in the cells, marked simulated), and never says 25%', () => {
    for (const values of allValues()) {
      const v = computePeek(values);
      expect(v.table.refs).toEqual(['simulated']);
      expect(v.table.formats).toHaveLength(v.table.columns.length);
      for (const words of [...v.table.columns, v.table.note ?? '']) expect(words).not.toMatch(/\d/);
      expect(JSON.stringify(v)).not.toContain('25%');
    }
  });
});

describe('chart domains', () => {
  it('a single look gets the nondegenerate x domain [0, 1]; more looks run from 1 to the last', () => {
    expect(peekDomains(computePeek({ looks: 1, mode: 'daily', fix: 'naive' })).x).toEqual([0, 1]);
    expect(peekDomains(computePeek({ looks: 1, mode: 'once', fix: 'naive' })).x).toEqual([0, 1]);
    expect(peekDomains(computePeek({ looks: 20, mode: 'daily', fix: 'cs' })).x).toEqual([1, 20]);
    expect(peekDomains(computePeek({ looks: 50, mode: 'once', fix: 'naive' })).x).toEqual([1, 50]);
  });

  it('y runs from 0 to 40% and never clips a plotted value', () => {
    for (const values of allValues()) {
      const v = computePeek(values);
      const d = peekDomains(v);
      expect(d.x[1]).toBeGreaterThan(d.x[0]);
      expect(d.y[0]).toBe(0);
      const plotted = [...v.naive.cumulativeByLook, ...v.selected.cumulativeByLook];
      const top = Math.max(...plotted);
      expect(top).toBeLessThanOrEqual(d.y[1]);
      if (top <= 0.4) expect(d.y[1]).toBe(0.4);
      else expect(d.y[1] - top).toBeLessThan(0.1);
    }
  });

  it('extends to the next tenth above a rate over 40%', () => {
    const v = computePeek(PEEK_PRESET);
    const high: PeekView = { ...v, selected: { ...v.selected, cumulativeByLook: [0.1, 0.43] } };
    expect(peekDomains(high).y).toEqual([0, 0.5]);
    // a share exactly on a tenth is the top itself, and every whole thousandth rounds up correctly
    for (const tenth of [0.5, 0.6, 0.7, 0.8, 0.9, 1]) {
      const edge: PeekView = { ...v, selected: { ...v.selected, cumulativeByLook: [0.1, tenth] } };
      expect(peekDomains(edge).y).toEqual([0, tenth]);
    }
    for (let k = 401; k <= 1000; k += 1) {
      const share: PeekView = { ...v, selected: { ...v.selected, cumulativeByLook: [k / 1000] } };
      expect(peekDomains(share).y[1], String(k)).toBe(Math.ceil(k / 100) / 10);
    }
    const ghost: PeekView = { ...v, naive: { ...v.naive, cumulativeByLook: [0.2, 0.401] } };
    expect(peekDomains(ghost).y).toEqual([0, 0.5]);
  });
});

describe('the table module', () => {
  it('records the simulation the model rebuilds its metadata from', () => {
    expect(PEEK_TABLE_MANIFEST).toEqual({ schemaVersion: 1, seed: 42, runs: 1000, p: 0.35, alpha: 0.05, nPerLook: 100 });
  });
});

// The model is what the browser loads: its static imports must never reach the simulation engine
// or the random number generator (nor the statistics barrel, which re-exports both).
const SRC = resolve(import.meta.dirname, '../../../src');
const FORBIDDEN = ['lib/stats/peeking.ts', 'lib/stats/rng.ts', 'lib/stats/index.ts'].map((f) => join(SRC, f));

/** Static value imports and re-exports only: `import type` is erased, and a dynamic import() is a separate chunk. */
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
  throw new Error(`unresolved local import ${spec} in ${from}`);
}

function reachable(root: string): Set<string> {
  const seen = new Set<string>();
  const queue = [root];
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

describe('what the model loads in the browser', () => {
  it('never reaches simulatePeeking or the random number generator through static imports', () => {
    const seen = reachable(join(SRC, 'lib/lab/peeking.ts'));
    expect([...seen].filter((f) => FORBIDDEN.includes(f))).toEqual([]);
    // the walk is real: it reaches the table and the statistics it does use
    for (const f of ['lib/lab/peeking-table.generated.ts', 'lib/stats/proportions.ts', 'lib/stats/sequential.ts', 'lib/stats/normal.ts']) {
      expect(seen.has(join(SRC, f)), f).toBe(true);
    }
  });

  it('would catch a leak: the statistics barrel does reach the engine', () => {
    const seen = reachable(join(SRC, 'lib/stats/index.ts'));
    expect(seen.has(join(SRC, 'lib/stats/peeking.ts'))).toBe(true);
    expect(seen.has(join(SRC, 'lib/stats/rng.ts'))).toBe(true);
  });
});
