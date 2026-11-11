// The Lab's peeking comparison, as a lookup: the seeded A/A simulations are precomputed in
// peeking-table.generated.ts, so the browser never simulates. This module normalizes the control
// values, rebuilds the engine's result for the chosen schedule and for the naive daily ghost, and
// adds two pieces of arithmetic: the 95% Wilson interval for the Monte Carlo uncertainty of the
// rate (how much the rate itself could move with other seeds, not a treatment effect), and the
// planning cost of a fix as a ratio (a boundary or an interval width, never measured power or an
// extra sample). It reaches the statistics through their own files, never the barrel, so neither
// the simulation engine nor the random number generator is bundled with it. It imports the table,
// so only the lazy island and the server preview may import it, never a loader the page loads at once.
import type { TableData } from '@/components/kit/DataTable';
import type { DerivedRef } from '@/components/kit/Derived';
import { snapToStep } from '@/lib/figure/snap';
import { normalQuantile } from '@/lib/stats/normal';
import type { PeekResult } from '@/lib/stats/peeking';
import { wilson } from '@/lib/stats/proportions';
import { mixtureCs, obfBoundary, optimalTau2 } from '@/lib/stats/sequential';
import { PEEK_TABLE, PEEK_TABLE_MANIFEST, type PeekTableEntry } from './peeking-table.generated';

export type PeekValues = { looks: number; mode: 'daily' | 'once'; fix: 'naive' | 'obf' | 'cs' };
/** A planning ratio: `boundary` is O'Brien-Fleming's last-look bar over one look's, `width` the confidence sequence's half-width over the fixed interval's. */
export type PeekCost = { kind: 'boundary' | 'width'; ratio: number };
export type PeekView = {
  /** The normalized values; in `once` mode `fix` is kept (for a switch back to daily) but not used. */
  values: PeekValues;
  /** The chosen schedule's result, rebuilt from the table: daily with the fix, or one naive look at the same total sample. */
  selected: PeekResult;
  /** The ghost: daily looks with no fix, at the same number of looks. */
  naive: PeekResult;
  /** The 95% Wilson interval of the selected rate over the simulated runs (Monte Carlo uncertainty). */
  mc: { lower: number; upper: number };
  /** Null with no fix, and when looking once (one look needs no fix). */
  cost: PeekCost | null;
  table: TableData;
};

type Mode = PeekValues['mode'];
type Fix = PeekValues['fix'];

export const PEEK_MAX_LOOKS = 50;
/** The default and interview preset: peek daily for 20 looks with no fix. */
export const PEEK_PRESET: PeekValues = { looks: 20, mode: 'daily', fix: 'naive' };
/** Every number the model gives is simulated. */
export const PEEK_REFS: readonly DerivedRef[] = ['simulated'];

const MODES: readonly Mode[] = ['daily', 'once'];
const FIXES: readonly Fix[] = ['naive', 'obf', 'cs'];
/** The Monte Carlo interval is a 95% interval. */
const MC_ALPHA = 0.05;
/** The two-sided 95% critical value of one fixed look. */
const Z_975 = normalQuantile(0.975);
/** The y axis shows 0 to 40% unless a plotted share is higher. */
const Y_MAX = 0.4;

const M = PEEK_TABLE_MANIFEST;

/**
 * Whole looks from 1 to 50 (snapped and clamped, so Infinity is 50); NaN or a value that is not a
 * number gives the preset. An unknown mode or fix gives the preset's. Never throws.
 */
export function normalizePeek(v: PeekValues): PeekValues {
  const raw: Partial<Record<keyof PeekValues, unknown>> = v ?? {};
  const looks =
    typeof raw.looks === 'number' && !Number.isNaN(raw.looks) ? snapToStep(raw.looks, 1, PEEK_MAX_LOOKS, 1) : PEEK_PRESET.looks;
  const mode = MODES.find((m) => m === raw.mode) ?? PEEK_PRESET.mode;
  const fix = FIXES.find((f) => f === raw.fix) ?? PEEK_PRESET.fix;
  return { looks, mode, fix };
}

function entry(key: string): PeekTableEntry {
  const e = PEEK_TABLE[key];
  if (e === undefined) throw new Error(`the peeking table has no entry ${key}`);
  return e;
}

/** The engine's result for a key, with its metadata rebuilt from the manifest and the key. */
function result(e: PeekTableEntry, looks: number, nPerLook: number, method: Fix): PeekResult {
  return {
    seed: M.seed,
    runs: M.runs,
    looks,
    nPerLook,
    p: M.p,
    alpha: M.alpha,
    method,
    falsePositiveRate: e.falsePositiveRate,
    mcStdError: e.mcStdError,
    cumulativeByLook: [...e.cumulativeByLook],
  };
}

const daily = (fix: Fix, looks: number) => result(entry(`daily/${fix}/${looks}`), looks, M.nPerLook, fix);
const once = (looks: number) => result(entry(`once/${looks}`), 1, M.nPerLook * looks, 'naive');

/**
 * The planning cost of a fix at `looks` daily looks. O'Brien-Fleming: the |z| bar at the last
 * look over the one-look 1.96. Confidence sequence: at the planning sample n = looks * nPerLook per
 * group and the simulated conversion rate, its half-width over the fixed-sample 95% half-width
 * z * sqrt(2 p (1 - p) / n), with the mixture tuned for n as in the simulation.
 */
function costOf(v: PeekValues): PeekCost | null {
  if (v.mode === 'once' || v.fix === 'naive') return null;
  if (v.fix === 'obf') return { kind: 'boundary', ratio: obfBoundary(v.looks, v.looks) / Z_975 };
  const n = v.looks * M.nPerLook;
  const x = Math.round(n * M.p);
  const tau2 = optimalTau2({ baseline: M.p, nCapPerArm: n, alpha: M.alpha });
  const { halfWidth } = mixtureCs({ xA: x, nA: n, xB: x, nB: n }, { tau2, alpha: M.alpha });
  return { kind: 'width', ratio: halfWidth / (Z_975 * Math.sqrt((2 * M.p * (1 - M.p)) / n)) };
}

/** A share of runs as a percent with one decimal; exact, since a share is a whole number of runs. */
const percent = (share: number) => Math.round(share * M.runs) / (M.runs / 100);

const FIX_NAME: Record<Fix, string> = { naive: 'no fix', obf: "O'Brien-Fleming", cs: 'confidence sequence' };

function tableOf(v: PeekValues, selected: PeekResult, naive: PeekResult): TableData {
  const ghost = naive.cumulativeByLook.map(percent);
  if (v.mode === 'once') {
    // One row per daily look with no fix, then the one look at the end as its own row, so every
    // numeric column holds a number in every row.
    return {
      columns: ['Look', 'Schedule', 'False winners so far (%)'],
      rows: [
        ...ghost.map((g, i): (string | number)[] => [i + 1, 'Peeking daily, no fix', g]),
        [v.looks, 'One look at the end', percent(selected.falsePositiveRate)],
      ],
      formats: ['count', 'number', 'points'],
      note: 'Shares of the simulated runs. Looking once means a single check, made after as many visitors as the daily schedule has at its last look.',
      refs: PEEK_REFS,
    };
  }
  if (v.fix === 'naive') {
    return {
      columns: ['Look', 'False winners so far, no fix (%)'],
      rows: ghost.map((g, i) => [i + 1, g]),
      formats: ['count', 'points'],
      note: 'Shares of the simulated runs flagged as a winner at or before each look.',
      refs: PEEK_REFS,
    };
  }
  const chosen = selected.cumulativeByLook.map(percent);
  return {
    columns: ['Look', 'False winners so far, no fix (%)', `False winners so far, ${FIX_NAME[v.fix]} (%)`],
    rows: ghost.map((g, i) => [i + 1, g, chosen[i]!]),
    formats: ['count', 'points', 'points'],
    note: 'Shares of the simulated runs flagged as a winner at or before each look.',
    refs: PEEK_REFS,
  };
}

/** The whole comparison for one set of control values: one consistent tuple for chart, readout and table. */
export function computePeek(v: PeekValues): PeekView {
  const values = normalizePeek(v);
  const naive = daily('naive', values.looks);
  const selected = values.mode === 'once' ? once(values.looks) : daily(values.fix, values.looks);
  // Wilson from the whole number of flagged runs, never from the rounded standard error.
  const flagged = Math.round(selected.falsePositiveRate * selected.runs);
  const { lower, upper } = wilson(flagged, selected.runs, MC_ALPHA);
  return { values, selected, naive, mc: { lower, upper }, cost: costOf(values), table: tableOf(values, selected, naive) };
}

/**
 * The chart's domains. x runs from look 1 to the last look; a single look gets [0, 1], so no scale
 * divides by looks - 1. y runs from 0 to 40%, or to the next tenth above the highest plotted share
 * (the ghost and the selected schedule), so no mark is ever clipped.
 */
export function peekDomains(view: PeekView): { x: [number, number]; y: [number, number] } {
  const looks = view.values.looks;
  const top = Math.max(...view.naive.cumulativeByLook, ...view.selected.cumulativeByLook);
  return { x: looks === 1 ? [0, 1] : [1, looks], y: [0, top > Y_MAX ? Math.ceil(top * 10) / 10 : Y_MAX] };
}
