// The table fallback for every chart. Server-rendered, so the numbers are readable without
// JavaScript, by assistive technology and in print. Every cell carries data-derived with the refs
// the caller names, so the truth audit knows where the numbers come from. Server-safe, no hooks.
import { formatValue } from '@/lib/facts/format';
import { formatNumber, formatSignedNumber, formatSignedPoints } from '@/lib/figure/format';
import { derivedAttr, type DerivedRef } from './Derived';

/**
 * How a column's numbers are written. A string cell is always printed as is.
 * - `number`: formatNumber with its defaults (the behaviour when `formats` is absent).
 * - `count`: whole numbers.
 * - `points`: one decimal at most, no sign.
 * - `signedPoints`: one decimal at most with "+" or U+2212, and a bare "0" for zero.
 * - `share`: a raw fraction written as a whole percent by the facts formatter (0.2345 is "23%"),
 *   rounded half away from zero, so a share under 0.5% prints "0%" (a small non-zero share too)
 *   and 99.5% or more prints "100%". Pass the unrounded source fraction: a copy already rounded to
 *   three decimals can print one point off (0.235 is "24%"). A non-finite value throws, as in every
 *   format. A share column is for zero-decimal facts only: a fact with decimals belongs in a string
 *   cell written with its own decimals.
 * - `{ fixed: n }`: exactly n decimals, a whole number from 0 to 20 (a RangeError otherwise), with
 *   trailing zeros kept, through formatNumber's fixed option: at three, 0.71 is "0.710" and 1 is
 *   "1.000". No "+"; U+2212 for a negative; zero, -0 and a value that rounds to zero print the zero
 *   digits without a sign ("0.000"). For a column whose values share one precision, such as scores.
 * A table with `rowDigits` prints the `points` and `signedPoints` cells of row r with exactly that
 * many decimals instead, so a row can follow the digits rule of the interval it belongs to. It never
 * changes a `{ fixed: n }` column, which states its own decimals.
 */
export type ColumnFormat = 'number' | 'count' | 'points' | 'signedPoints' | 'share' | { fixed: number };

function formatCell(v: number, format: ColumnFormat, digits?: number): string {
  if (typeof format === 'object') return formatNumber(v, format.fixed, { fixed: true });
  if (digits !== undefined && (format === 'points' || format === 'signedPoints')) {
    return format === 'points' ? formatNumber(v, digits) : formatSignedPoints(v, digits);
  }
  switch (format) {
    case 'count':
      return formatNumber(v, 0);
    case 'points':
      return formatNumber(v, 1);
    case 'signedPoints':
      return formatSignedNumber(v, 1);
    case 'share':
      return formatValue(v, 'share', { decimals: 0 });
    default:
      return formatNumber(v);
  }
}

export type TableData = {
  columns: string[];
  rows: (string | number)[][];
  /** Optional, one entry per column; a column without an entry uses `number`. */
  formats?: ColumnFormat[];
  /** Optional, one entry per row: the decimals of that row's `points` and `signedPoints` cells. */
  rowDigits?: number[];
  /** A line under the table, such as the unit of the columns. Plain words, no numbers. */
  note?: string;
  /**
   * Optional: the table's own caption (the `<caption>` element, read by assistive technology). Without
   * it the caller's caption is used, which a Figure sets to its title.
   */
  caption?: string;
  /** Where the numbers come from; spread on every cell. Never empty. */
  refs: readonly DerivedRef[];
};

type Props = {
  id: string;
  caption: string;
  table: TableData;
  /**
   * `open` is the bare table. `disclosure` draws the same table once, open without JavaScript and
   * folded behind "Show the numbers as a table" with it (see DataTable).
   */
  mode: 'disclosure' | 'open';
  /** `disclosure` only: one line above the open table without JavaScript ("Controls need JavaScript."). */
  noJsNote?: string;
};

function Table({ id, caption, table }: Omit<Props, 'mode' | 'noJsNote'>) {
  const cell = derivedAttr(table.refs);
  if (table.formats && table.formats.length !== table.columns.length) {
    throw new Error('a table needs one format per column');
  }
  const numeric = table.columns.map((_, i) => table.rows.length > 0 && table.rows.every((r) => typeof r[i] === 'number'));
  // Names read left-aligned and numbers line up on the right, in every column alike.
  const align = (i: number) => (numeric[i] ? 'text-right' : 'text-left');
  return (
    <>
      <div className="overflow-x-auto" tabIndex={0} role="region" aria-labelledby={`${id}-caption`}>
        <table className="w-auto max-w-full text-sm">
          <caption id={`${id}-caption`} className="sr-only">
            {table.caption ?? caption}
          </caption>
          <thead>
            <tr>
              {table.columns.map((c, i) => (
                <th
                  key={c}
                  scope="col"
                  className={`border-b border-line py-2 pr-3 last:pr-0 font-semibold ${align(i)}`}
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, r) => (
              <tr key={r}>
                {row.map((v, i) => (
                  <td key={i} {...cell} {...(typeof v === 'number' ? { 'data-num': '' } : {})} className={`border-b border-line py-2 pr-3 last:pr-0 whitespace-nowrap ${align(i)}`}>
                    {typeof v === 'number' ? formatCell(v, table.formats?.[i] ?? 'number', table.rowDigits?.[r]) : v}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {table.note ? <p className="mt-2 text-xs text-muted">{table.note}</p> : null}
    </>
  );
}

/**
 * `disclosure` draws the table once, as two siblings: a details whose summary is the toggle
 * ([data-js-only], so it exists only with JavaScript) and the table's body after it
 * ([data-nojs-only]). Without JavaScript, and in an island that failed to load, the body is open and
 * the toggle is gone; with JavaScript the body shows only while the details before it is open,
 * directly under its summary (the unlayered rules in globals.css). The details holds no content of
 * its own, so the one table serves both views and the HTML carries it once. The summary names the
 * body it shows with aria-controls. The top margins collapse into the caller's, so the no-JS body
 * sits 12 px down, or 8 px under the note.
 */
export function DataTable({ id, caption, table, mode, noJsNote }: Props) {
  if (mode === 'open') return <Table id={id} caption={caption} table={table} />;
  const body = `${id}-body`;
  return (
    <>
      {noJsNote ? (
        <p data-nojs-only="" className="mt-3 text-sm">
          {noJsNote}
        </p>
      ) : null}
      <details id={id} data-js-only="" data-table-toggle="">
        <summary
          aria-controls={body}
          className="flex min-h-(--size-target) cursor-pointer items-center text-sm text-muted underline decoration-muted hover:text-ink focus-visible:text-ink"
          data-touch-target=""
        >
          Show the numbers as a table
        </summary>
      </details>
      <div id={body} data-nojs-only="" data-table-body="" className={noJsNote ? 'mt-2' : 'mt-3'}>
        <Table id={id} caption={caption} table={table} />
      </div>
    </>
  );
}
