// The returns-cleaning Figure's pure model: its URL schema, its table and its fixed axis. It takes
// the vendored monthly rows as an argument and imports nothing that holds data, so the client island
// can use it with the rows the server hands it (the export itself stays on the server). The server's
// table comes from returnsTable in ./tables; returnsTableFrom builds the same table from the rows
// the island receives, and a unit test holds the two equal for both modes.
import type { TableData } from '@/components/kit/DataTable';
import type { DerivedRef } from '@/components/kit/Derived';
import type { Provenance } from '@/components/kit/ProvenanceBadge';
import type { ParamSchema, Presets } from '@/lib/figure/url-state';
import type { RETAIL, ReturnMode } from './data';

export type { ReturnMode };
export type RetailMonth = (typeof RETAIL.tables.monthly)[number];

export const RETURNS_ID = 'returns';
export const RETURNS_TITLE = 'Removing reversed orders changes the returns story';

export const RETURNS_SCHEMA = {
  mode: { kind: 'enum', values: ['raw', 'clean'] },
} as const satisfies ParamSchema;

export const RETURNS_PRESETS: Presets<typeof RETURNS_SCHEMA> = { default: { mode: 'clean' } };

export const RETURNS_REFS: readonly DerivedRef[] = ['source:retail'];

/**
 * The reversal window of the cleaning rule, in hours: sql/01_clean.sql in the retail repository
 * matches a cancellation to an order line placed up to `INTERVAL 1 DAY` before it. The export does
 * not carry it, so it is a code constant printed through <Derived> with the retail source ref.
 */
export const RULE_HOURS = 24;

const monthFormat = new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });

/** "Jan 2010" for "2010-01". */
export function monthLabel(month: string): string {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new TypeError(`expected a YYYY-MM month, got ${JSON.stringify(month)}`);
  return monthFormat.format(Date.parse(`${month}-01T00:00:00Z`));
}

/** The returned-order value of a month in the chosen mode, checked to be a finite, non-negative number. */
export function returnsValue(row: RetailMonth, mode: ReturnMode): number {
  const v = mode === 'raw' ? row.returns_gbp_raw : row.returns_gbp_clean;
  if (!Number.isFinite(v) || v < 0) throw new TypeError(`returns ${row.month}: expected a finite non-negative number, got ${String(v)}`);
  return v;
}

/** The same table as returnsTable(mode) in ./tables, from the rows the Figure was given. */
export function returnsTableFrom(rows: readonly RetailMonth[], mode: ReturnMode): TableData {
  return {
    columns: ['Month', 'Returned-order value (GBP)', 'Partial month'],
    rows: rows.map((m) => [monthLabel(m.month), returnsValue(m, mode), m.partial ? 'Yes' : 'No']),
    formats: ['number', 'count', 'number'],
    note:
      mode === 'raw'
        ? 'Without the reversal rule: a cancellation that reverses an order counts as a returned order. The last month is partial: the data ends early in December.'
        : 'With the reversal rule: an order and the cancellation that reverses it are both removed. The last month is partial: the data ends early in December.',
    refs: RETURNS_REFS,
  };
}

/** The tick step of the value axis, in pounds. */
const VALUE_STEP = 50_000;

/**
 * The value axis, the same in both modes so a toggle never rescales it: from zero to the first
 * step at or above the largest value of either mode (the partial month included), and its ticks.
 */
export function returnsAxis(rows: readonly RetailMonth[]): { top: number; ticks: number[] } {
  if (rows.length === 0) throw new RangeError('returns: no monthly rows to draw');
  const max = Math.max(...rows.flatMap((r) => [returnsValue(r, 'raw'), returnsValue(r, 'clean')]));
  const top = Math.max(VALUE_STEP, Math.ceil(max / VALUE_STEP) * VALUE_STEP);
  return { top, ticks: Array.from({ length: top / VALUE_STEP + 1 }, (_, i) => i * VALUE_STEP) };
}

/** The months as they run, with exactly one partial month and it last, or it throws. */
export function checkMonths(rows: readonly RetailMonth[]): void {
  const partial = rows.map((r, i) => (r.partial ? i : -1)).filter((i) => i >= 0);
  if (partial.length > 1 || (partial.length === 1 && partial[0] !== rows.length - 1)) {
    throw new Error('returns: only the last month may be partial');
  }
  for (let i = 1; i < rows.length; i++) {
    if (rows[i]!.month <= rows[i - 1]!.month) throw new Error(`returns: months out of order at ${rows[i]!.month}`);
  }
}

/** What the server reads from the export for the island, besides the rows it plots. */
export type ReturnsEvidence = {
  /** The badge, from the export's metadata. */
  provenance: Provenance;
  /** The date of the reversed order behind most of the change, from the export's reversal table. */
  januaryReversalDate: string;
};

const shortMonth = new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' });

/**
 * The growth comparison's window, read from the rows: the full months of the last year with data
 * (the partial last month left out), against the same months a year earlier, such as
 * "Jan–Nov 2011 versus Jan–Nov 2010". Throws when a month of either window is missing or partial.
 */
export function comparisonPeriod(rows: readonly RetailMonth[]): string {
  const lastFull = rows.findLast((r) => !r.partial);
  if (!lastFull) throw new Error('returns: no full month');
  const [year, endMonth] = lastFull.month.split('-').map(Number) as [number, number];
  const full = new Set(rows.filter((r) => !r.partial).map((r) => r.month));
  for (const y of [year - 1, year]) {
    for (let m = 1; m <= endMonth; m++) {
      const key = `${y}-${String(m).padStart(2, '0')}`;
      if (!full.has(key)) throw new Error(`returns: the comparison needs the full month ${key}`);
    }
  }
  const name = (m: number) => shortMonth.format(Date.UTC(2000, m - 1, 1));
  const span = endMonth === 1 ? name(1) : `${name(1)}–${name(endMonth)}`;
  return `${span} ${year} versus ${span} ${year - 1}`;
}
