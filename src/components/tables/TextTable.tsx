// A page-owned text table, for tables whose cells are sentences (the Pulse event taxonomy, the Live
// test's exclusion reasons). The kit DataTable keeps every cell on one line in a sideways-scrolling
// region, which suits numbers; here the sentences wrap. From md up it is a plain table at the width
// it is given, each cell top-aligned. Below md each row stacks: the first cell first, then each other
// cell under its column name (drawn by a ::before rule in globals.css from data-label, so a cell's
// text stays exactly the source's words). The explicit roles keep the table semantics that a display
// change would drop in some browsers. A number cell is a count: grouped digits, data-num, right-aligned
// from md up. Server-safe; every cell carries data-derived with the table's refs.
import { derivedAttr } from '@/components/kit/Derived';
import type { TableData } from '@/components/kit/DataTable';
import { formatNumber } from '@/lib/figure/format';

type Props = { id: string; caption: string; table: TableData };

export function TextTable({ id, caption, table }: Props) {
  const cell = derivedAttr(table.refs);
  const captionId = `${id}-caption`;
  const numeric = table.columns.map((_, i) => table.rows.length > 0 && table.rows.every((r) => typeof r[i] === 'number' || r[i] === '<5'));
  const align = (i: number) => (numeric[i] ? 'text-left md:text-right' : 'text-left');
  return (
    <>
      <table id={id} role="table" aria-labelledby={captionId} data-stacked-table="" className="w-full text-sm max-md:block">
        <caption id={captionId} className="sr-only">
          {caption}
        </caption>
        <thead role="rowgroup" className="max-md:sr-only">
          <tr role="row">
            {table.columns.map((c, i) => (
              <th key={c} role="columnheader" scope="col" className={`border-b border-line py-2 pr-4 align-bottom font-semibold last:pr-0 ${align(i)}`}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody role="rowgroup" className="max-md:block">
          {table.rows.map((row, r) => (
            <tr key={r} role="row" className="max-md:block max-md:border-b max-md:border-line max-md:py-3">
              {row.map((v, i) => (
                <td
                  key={i}
                  role="cell"
                  {...cell}
                  {...(typeof v === 'number' || v === '<5' ? { 'data-num': '' } : {})}
                  {...(i > 0 ? { 'data-label': table.columns[i] } : {})}
                  className={`align-top max-md:block md:border-b md:border-line md:py-2 md:pr-4 md:last:pr-0 ${align(i)} ${
                    i === 0 ? 'font-semibold md:whitespace-nowrap' : 'max-md:mt-2'
                  }`}
                >
                  {typeof v === 'number' ? formatNumber(v, 0) : v}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {table.note ? <p className="mt-2 text-xs text-muted">{table.note}</p> : null}
    </>
  );
}
