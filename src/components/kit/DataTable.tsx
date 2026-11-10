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
 * - `share`: a raw fraction written as a whole percent by the facts formatter (0.2345 is "23%").
 * A table with `rowDigits` prints the `points` and `signedPoints` cells of row r with exactly that
 * many decimals instead, so a row can follow the digits rule of the interval it belongs to.
 */
export type ColumnFormat = 'number' | 'count' | 'points' | 'signedPoints' | 'share';

function formatCell(v: number, format: ColumnFormat, digits?: number): string {
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
  /** Where the numbers come from; spread on every cell. Never empty. */
  refs: readonly DerivedRef[];
};

type Props = {
  id: string;
  caption: string;
  table: TableData;
  /** `disclosure` folds the table into a <details>; `open` is the bare table. */
  mode: 'disclosure' | 'open';
};

function Table({ id, caption, table }: Omit<Props, 'mode'>) {
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
            {caption}
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

export function DataTable({ id, caption, table, mode }: Props) {
  if (mode === 'open') return <Table id={id} caption={caption} table={table} />;
  return (
    <details id={id}>
      <summary
        className="flex min-h-(--size-target) cursor-pointer items-center text-sm text-muted underline decoration-muted hover:text-ink focus-visible:text-ink"
        data-touch-target=""
      >
        Show the numbers as a table
      </summary>
      <Table id={id} caption={caption} table={table} />
    </details>
  );
}
