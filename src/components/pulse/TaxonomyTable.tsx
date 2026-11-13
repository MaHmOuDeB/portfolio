// The Pulse event taxonomy as a page-owned text table. The kit DataTable keeps every cell on one
// line in a sideways-scrolling region, which suits numbers; these cells are sentences, so here they
// wrap. From md up it is a plain table at the figure width, each cell top-aligned. Below md each row
// stacks: the event name first, then each other cell under its column name (drawn by a ::before
// rule in globals.css from data-label, so a cell's text stays exactly the export's words). The
// explicit roles keep the table semantics that a display change would drop in some browsers.
// Server-safe; every cell carries data-derived with the taxonomy's refs.
import { derivedAttr } from '@/components/kit/Derived';
import type { TableData } from '@/components/kit/DataTable';

type Props = { id: string; caption: string; table: TableData };

export function TaxonomyTable({ id, caption, table }: Props) {
  const cell = derivedAttr(table.refs);
  const captionId = `${id}-caption`;
  return (
    <>
      <table id={id} role="table" aria-labelledby={captionId} data-stacked-table="" className="w-full text-sm max-md:block">
        <caption id={captionId} className="sr-only">
          {caption}
        </caption>
        <thead role="rowgroup" className="max-md:sr-only">
          <tr role="row">
            {table.columns.map((c) => (
              <th key={c} role="columnheader" scope="col" className="border-b border-line py-2 pr-4 text-left align-bottom font-semibold last:pr-0">
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
                  {...(i > 0 ? { 'data-label': table.columns[i] } : {})}
                  className={`text-left align-top max-md:block md:border-b md:border-line md:py-2 md:pr-4 md:last:pr-0 ${
                    i === 0 ? 'font-semibold md:whitespace-nowrap' : 'max-md:mt-2'
                  }`}
                >
                  {v}
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
