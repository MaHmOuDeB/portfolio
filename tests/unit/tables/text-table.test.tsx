// The page-owned TextTable prints every number as a grouped whole count. It refuses any other column
// format, so a caller that passes shares or points gets an error, never a wrong number.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ColumnFormat, TableData } from '@/components/kit/DataTable';
import { TextTable } from '@/components/tables/TextTable';

const table = (formats?: ColumnFormat[]): TableData => ({
  columns: ['Reason', 'Entries', 'What it means'],
  rows: [['A reason', 1234, 'A sentence that wraps.']],
  ...(formats ? { formats } : {}),
  refs: ['simulated'],
});
const render = (t: TableData) => renderToStaticMarkup(<TextTable id="t" caption="A caption" table={t} />);

describe('TextTable formats', () => {
  it('prints counts as grouped whole numbers, with or without formats', () => {
    expect(render(table())).toContain('>1,234</td>');
    expect(render(table(['number', 'count', 'number']))).toContain('>1,234</td>');
  });

  for (const format of ['points', 'signedPoints', 'share', { fixed: 1 }] as ColumnFormat[]) {
    it(`throws on the format ${JSON.stringify(format)}`, () => {
      expect(() => render(table(['number', format, 'number']))).toThrow(/TextTable/);
    });
  }

  it('throws when formats does not have one entry per column', () => {
    expect(() => render(table(['number', 'count']))).toThrow(/TextTable/);
  });

  it('throws on rowDigits, which only points columns use', () => {
    expect(() => render({ ...table(), rowDigits: [1] })).toThrow(/TextTable/);
  });
});
