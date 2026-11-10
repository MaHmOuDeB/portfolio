// The cohort Figure's pure model: its URL schema and preset, its table, its axis and its colour
// scale. It takes the vendored cohort rows as an argument and imports nothing that holds data, so
// the client island can use it with the rows the server hands it (the export itself stays on the
// server). The server's table is cohortTable in ./tables; cohortTableFrom builds the same table
// from the rows, and a unit test holds the two equal.
//
// A cohort is the customers whose first order in the data fell in one month. Month zero is that
// month, so every member orders in it by definition; each later month is the share of the cohort
// who ordered in that month. It is not survival: a share can rise again, and nothing here smooths
// or sorts it.
import type { ColumnFormat, TableData } from '@/components/kit/DataTable';
import type { DerivedRef } from '@/components/kit/Derived';
import type { Presets } from '@/lib/figure/url-state';
import type { Cohort } from './data';
import { monthLabel } from './returns';

export type { Cohort };
export { monthLabel };

export const COHORTS_ID = 'cohorts';
export const COHORTS_TITLE = 'Repeat ordering varies by cohort and month';
export const COHORTS_REFS: readonly DerivedRef[] = ['source:retention'];

/** The months after the first order that the export holds for each cohort. */
export const LATER_MONTHS = 12;
/** The later months, 1 to 12: what the charts plot (month zero is in the table only). */
export const MONTHS: readonly number[] = Array.from({ length: LATER_MONTHS }, (_, i) => i + 1);

export type CohortSchema = { cohort: { kind: 'enum'; values: readonly string[] } };

/**
 * The rows as the charts need them, or it throws: months in order and unique, a positive whole
 * cohort size, month zero exactly the whole cohort and every share a finite fraction.
 */
export function checkCohorts(rows: readonly Cohort[]): void {
  if (rows.length === 0) throw new RangeError('cohorts: no cohort rows');
  let previous = '';
  for (const c of rows) {
    if (!/^\d{4}-\d{2}$/.test(c.cohort_month) || c.cohort_month <= previous) {
      throw new Error(`cohorts: months malformed or out of order at ${JSON.stringify(c.cohort_month)}`);
    }
    previous = c.cohort_month;
    if (!Number.isInteger(c.cohort_size) || c.cohort_size <= 0) throw new RangeError(`cohorts: ${c.cohort_month} has no customers`);
    if (c.retention.length !== LATER_MONTHS + 1) throw new RangeError(`cohorts: ${c.cohort_month} has ${c.retention.length} months`);
    if (c.retention[0] !== 1) throw new RangeError(`cohorts: month zero of ${c.cohort_month} must be the whole cohort`);
    c.retention.forEach((v, i) => {
      if (!Number.isFinite(v) || v < 0 || v > 1) throw new RangeError(`cohorts: ${c.cohort_month} month ${i} is not a share: ${String(v)}`);
    });
  }
}

/** The URL schema: one enum of the cohort months the export holds. Build it once per Figure. */
export function cohortSchema(rows: readonly Cohort[]): CohortSchema {
  checkCohorts(rows);
  return { cohort: { kind: 'enum', values: rows.map((c) => c.cohort_month) } };
}

/** The preset: the first cohort of the export. */
export function cohortPresets(rows: readonly Cohort[]): Presets<CohortSchema> {
  checkCohorts(rows);
  return { default: { cohort: rows[0]!.cohort_month } };
}

/** The row of a cohort month, or it throws (the URL state only ever holds a month of the schema). */
export function cohortAt(rows: readonly Cohort[], month: string): { row: Cohort; index: number } {
  const index = rows.findIndex((c) => c.cohort_month === month);
  if (index < 0) throw new RangeError(`cohorts: no cohort ${JSON.stringify(month)}`);
  return { row: rows[index]!, index };
}

const longMonth = new Intl.DateTimeFormat('en-GB', { month: 'long', timeZone: 'UTC' });
const yearOf = (month: string) => month.slice(0, 4);
const monthName = (month: string) => longMonth.format(Date.parse(`${month}-01T00:00:00Z`));

/** "January", the month of a cohort in words with no digit, for an accessible chart name. */
export function cohortMonthWord(month: string): string {
  return monthName(month);
}

/** "January to November 2010": the months the cohorts span, read from the rows. */
export function cohortSpan(rows: readonly Cohort[]): string {
  const first = rows[0]?.cohort_month;
  const last = rows.at(-1)?.cohort_month;
  if (!first || !last) throw new RangeError('cohorts: no cohort rows');
  if (first === last) return `${monthName(first)} ${yearOf(first)}`;
  return yearOf(first) === yearOf(last)
    ? `${monthName(first)} to ${monthName(last)} ${yearOf(last)}`
    : `${monthName(first)} ${yearOf(first)} to ${monthName(last)} ${yearOf(last)}`;
}

const MONTH_WORDS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];

/** The same table as cohortTable() in ./tables, from the rows the Figure was given. */
export function cohortTableFrom(rows: readonly Cohort[]): TableData {
  checkCohorts(rows);
  return {
    columns: ['Cohort', 'Customers', 'Formation month', ...MONTH_WORDS.map((w) => `Month ${w}`)],
    rows: rows.map((c) => [monthLabel(c.cohort_month), c.cohort_size, ...c.retention]),
    formats: ['number', 'count', ...Array<ColumnFormat>(LATER_MONTHS + 1).fill('share')],
    note:
      'Customers are grouped by the month of their first order in the data. Each later month counts the cohort members who ordered in that month, so a share can rise again; it is not the share who kept buying every month since.',
    refs: COHORTS_REFS,
  };
}

/** The tick step of the share axis: ten points. */
const STEP_TENTHS = 1;

/**
 * The share axis of the line, the same for every cohort so a change never rescales it: from zero to
 * the first tenth at or above the largest later-month share of any cohort, and its ticks.
 */
export function cohortAxis(rows: readonly Cohort[]): { top: number; ticks: number[] } {
  checkCohorts(rows);
  const max = Math.max(...rows.flatMap((c) => c.retention.slice(1)));
  // In whole tenths, so a tick is 0.3 and never 0.30000000000000004.
  const tenths = Math.max(STEP_TENTHS, Math.ceil(max * 10 - 1e-9));
  return { top: tenths / 10, ticks: Array.from({ length: tenths + 1 }, (_, i) => i / 10) };
}

/**
 * The darkest cell's opacity: dark enough to read the scale, light enough for ink text on it. Ink on
 * the darkest possible cell is 6.2:1 (tokens.css: ink on series-1 at this opacity over bg).
 */
export const HEAT_MAX_OPACITY = 0.6;

/** A cell's opacity: proportional to its share, on the axis top shared by every cohort. */
export function cellOpacity(value: number, top: number): number {
  if (!Number.isFinite(value) || value < 0 || !(top > 0)) throw new RangeError(`cohorts: no opacity for ${String(value)} of ${String(top)}`);
  return Math.round((Math.min(value, top) / top) * HEAT_MAX_OPACITY * 1000) / 1000;
}
