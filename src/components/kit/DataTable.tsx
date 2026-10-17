// The table fallback for every chart. Server-rendered, so the numbers are readable without
// JavaScript, by assistive technology and in print. Every cell carries data-derived with the refs
// the caller names, so the truth audit knows where the numbers come from. Server-safe, no hooks.
import { formatNumber } from '@/lib/figure/format';
import { derivedAttr, type DerivedRef } from './Derived';

export type TableData = {
  columns: string[];
  rows: (string | number)[][];
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
  const numeric = table.columns.map((_, i) => table.rows.length > 0 && table.rows.every((r) => typeof r[i] === 'number'));
  return (
    <div className="overflow-x-auto" tabIndex={0} role="region" aria-labelledby={`${id}-caption`}>
      <table className="w-full text-sm">
        <caption id={`${id}-caption`} className="sr-only">
          {caption}
        </caption>
        <thead>
          <tr>
            {table.columns.map((c, i) => (
              <th
                key={c}
                scope="col"
                className={`border-b border-line py-2 pr-4 font-semibold ${numeric[i] ? 'text-right' : 'text-left'}`}
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
                <td key={i} {...cell} className={`border-b border-line py-2 pr-4 ${numeric[i] ? 'text-right' : 'text-left'}`}>
                  {typeof v === 'number' ? formatNumber(v) : v}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
