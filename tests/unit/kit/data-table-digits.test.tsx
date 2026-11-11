import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DataTable, type TableData } from '@/components/kit/DataTable';
import { Figure } from '@/components/kit/Figure';
import { formatValue } from '@/lib/facts/format';
import { formatNumber, formatSignedNumber } from '@/lib/figure/format';
import { confidenceTable, formatIntervalPoints, type LiveSnapshot } from '@/lib/figure/cs-band';
import { liveFixture } from '@/app/kitchen-sink/_parts/live-fixtures';

const cells = (html: string) => [...html.matchAll(/<td[^>]*>([^<]*)<\/td>/g)].map((m) => m[1]!);

describe('DataTable rowDigits', () => {
  it('prints the interval cells with the digits of their row', () => {
    const table = { columns: ['A', 'Low', 'High'], rows: [[1, -12.2, 31], [2, 2.25, 7.4]], formats: ['count', 'signedPoints', 'signedPoints'] as const, rowDigits: [0, 1], refs: ['simulated'] as const };
    const html = renderToStaticMarkup(<DataTable id="t" caption="c" table={{ ...table, formats: [...table.formats], refs: [...table.refs] }} mode="open" />);
    expect(cells(html)).toEqual(['1', '−12', '+31', '2', '+2.3', '+7.4']);
  });
});

describe('the table and the Now row agree', () => {
  it('for the current interval of every enough-data fixture', () => {
    for (const phase of ['ab', 'ship-b', 'stop-for-harm', 'inconclusive', 'calibration'] as const) {
      const s: LiveSnapshot = liveFixture(phase, 'enough-data', 'fresh');
      const t = confidenceTable(s, ['simulated']);
      const last = t.rows[t.rows.length - 1]!;
      const html = renderToStaticMarkup(<DataTable id="t" caption="c" table={{ ...t, rows: [last], rowDigits: [t.rowDigits![t.rows.length - 1]!] }} mode="open" />);
      const printed = cells(html);
      const now = formatIntervalPoints(last[2] as number, last[4] as number);
      expect(`${printed[2]} to ${printed[4]}`, phase).toBe(now);
    }
  });
});

const rowsOf = (html: string) =>
  [...html.matchAll(/<td([^>]*)>([^<]*)<\/td>/g)].map((m) => ({ attrs: m[1]!, text: m[2]! }));
const headers = (html: string) => [...html.matchAll(/<th([^>]*)>([^<]*)<\/th>/g)].map((m) => ({ attrs: m[1]!, text: m[2]! }));

const SHARES: TableData = {
  columns: ['Segment', 'Share of customers'],
  rows: [
    ['Champions', 0.2345],
    ['Loyal', 0.212],
    ['Lost', 0],
  ],
  formats: ['number', 'share'],
  refs: ['source:retention', 'simulated'],
};

describe('DataTable share format', () => {
  it('prints a raw fraction as a whole percent: .2345 is 23%, .212 is 21%, zero is 0%', () => {
    const html = renderToStaticMarkup(<DataTable id="t" caption="c" table={SHARES} mode="open" />);
    expect(cells(html)).toEqual(['Champions', '23%', 'Loyal', '21%', 'Lost', '0%']);
  });

  it('writes the percent through the facts formatter with zero decimals', () => {
    const html = renderToStaticMarkup(<DataTable id="t" caption="c" table={SHARES} mode="open" />);
    const printed = cells(html).filter((_, i) => i % 2 === 1);
    expect(printed).toEqual([0.2345, 0.212, 0].map((v) => formatValue(v, 'share', { decimals: 0 })));
  });

  it('right-aligns the share cells and their header, marks them data-num and spreads the refs', () => {
    const html = renderToStaticMarkup(<DataTable id="t" caption="c" table={SHARES} mode="open" />);
    const [nameHead, shareHead] = headers(html);
    expect(nameHead!.attrs).toContain('text-left');
    expect(shareHead!.attrs).toContain('text-right');
    const tds = rowsOf(html);
    for (const share of tds.filter((_, i) => i % 2 === 1)) {
      expect(share.attrs).toContain('text-right');
      expect(share.attrs).toContain('data-num=""');
      expect(share.attrs).toContain('data-derived="source:retention simulated"');
    }
    for (const name of tds.filter((_, i) => i % 2 === 0)) {
      expect(name.attrs).toContain('text-left');
      expect(name.attrs).not.toContain('data-num');
      expect(name.attrs).toContain('data-derived="source:retention simulated"');
    }
  });

  it('prints a string cell in a share column as is', () => {
    const table: TableData = { columns: ['Share'], rows: [['about a fifth'], [0.2345]], formats: ['share'], refs: ['simulated'] };
    const html = renderToStaticMarkup(<DataTable id="t" caption="c" table={table} mode="open" />);
    expect(cells(html)).toEqual(['about a fifth', '23%']);
  });

  it('leaves number, count, points and signedPoints output unchanged', () => {
    const table: TableData = {
      columns: ['Number', 'Count', 'Points', 'Signed', 'Default'],
      rows: [
        [1234.5678, 1234.5678, 2.25, 2.25, 0.2345],
        [-0.4, 7.6, 0, 0, 0],
      ],
      formats: ['number', 'count', 'points', 'signedPoints', 'number'],
      refs: ['simulated'],
    };
    const html = renderToStaticMarkup(<DataTable id="t" caption="c" table={table} mode="open" />);
    expect(cells(html)).toEqual([
      formatNumber(1234.5678), formatNumber(1234.5678, 0), formatNumber(2.25, 1), formatSignedNumber(2.25, 1), formatNumber(0.2345),
      formatNumber(-0.4), formatNumber(7.6, 0), formatNumber(0, 1), formatSignedNumber(0, 1), formatNumber(0),
    ]);
    const withoutFormats = renderToStaticMarkup(<DataTable id="t" caption="c" table={{ ...table, formats: undefined }} mode="open" />);
    expect(cells(withoutFormats)).toEqual([1234.5678, 1234.5678, 2.25, 2.25, 0.2345, -0.4, 7.6, 0, 0, 0].map((v) => formatNumber(v)));
  });

  it('ignores rowDigits in a share column', () => {
    const html = renderToStaticMarkup(<DataTable id="t" caption="c" table={{ ...SHARES, rowDigits: [3, 3, 3] }} mode="open" />);
    expect(cells(html)).toEqual(['Champions', '23%', 'Loyal', '21%', 'Lost', '0%']);
  });

  it('renders the share column in the no-JS open table of a Figure', () => {
    const figure = (runtime?: 'no-js') =>
      renderToStaticMarkup(
        <Figure id="shares" title="Champions are about a fifth of customers." caption="A fictional caption." provenance="simulated" table={SHARES} state={runtime ? { runtime } : undefined}>
          <svg role="img" aria-label="A fictional chart" />
        </Figure>,
      );
    for (const html of [figure(), figure('no-js')]) {
      const open = html.slice(html.indexOf('id="shares-table-open-caption"'));
      expect(open.length).toBeLessThan(html.length);
      expect(cells(open).slice(0, 6)).toEqual(['Champions', '23%', 'Loyal', '21%', 'Lost', '0%']);
    }
  });
});

describe('DataTable formats, pinned as printed before fixed decimals were added', () => {
  it('prints the same strings for number, count, points, signedPoints, share and no format', () => {
    const table: TableData = {
      columns: ['Number', 'Count', 'Points', 'Signed', 'Share', 'AUC'],
      rows: [
        [1234.5678, 1234.5678, 2.25, 2.25, 0.2345, 0.71],
        [-0.4, 7.6, 0, 0, 0, 0.685],
      ],
      formats: ['number', 'count', 'points', 'signedPoints', 'share', 'number'],
      refs: ['simulated'],
    };
    const html = renderToStaticMarkup(<DataTable id="t" caption="c" table={table} mode="open" />);
    expect(cells(html)).toEqual(['1,234.57', '1,235', '2.3', '+2.3', '23%', '0.71', '−0.4', '8', '0', '0', '0%', '0.685']);
    const withoutFormats = renderToStaticMarkup(<DataTable id="t" caption="c" table={{ ...table, formats: undefined }} mode="open" />);
    expect(cells(withoutFormats)).toEqual(['1,234.57', '1,234.57', '2.25', '2.25', '0.235', '0.71', '−0.4', '7.6', '0', '0', '0', '0.685']);
    const digits = renderToStaticMarkup(<DataTable id="t" caption="c" table={{ ...table, rowDigits: [2, 0] }} mode="open" />);
    expect(cells(digits)).toEqual(['1,234.57', '1,235', '2.25', '+2.25', '23%', '0.71', '−0.4', '8', '0', '0', '0%', '0.685']);
  });
});

// A fictional model comparison: the ranking scores of three methods, to three decimals.
const SCORES: TableData = {
  columns: ['Method', 'Score, all', 'Score, lapsed'],
  rows: [
    ['Rule', 0.762, 0.685],
    ['Model', 0.793, 0.71],
    ['Other', 1, 0],
  ],
  formats: ['number', { fixed: 3 }, { fixed: 3 }],
  refs: ['simulated'],
};

describe('DataTable fixed-decimals format', () => {
  it('prints exactly the given decimals, trailing zeros kept: 0.71 is "0.710", 1 is "1.000", 0 is "0.000"', () => {
    const html = renderToStaticMarkup(<DataTable id="t" caption="c" table={SCORES} mode="open" />);
    expect(cells(html)).toEqual(['Rule', '0.762', '0.685', 'Model', '0.793', '0.710', 'Other', '1.000', '0.000']);
  });

  it('prints through formatNumber with fixed decimals', () => {
    const table: TableData = { columns: ['A', 'B'], rows: [[1, 0.71], [2.25, 1353]], formats: [{ fixed: 1 }, { fixed: 2 }], refs: ['simulated'] };
    const html = renderToStaticMarkup(<DataTable id="t" caption="c" table={table} mode="open" />);
    expect(cells(html)).toEqual(['1.0', '0.71', '2.3', '1,353.00']);
    expect(cells(html)).toEqual([formatNumber(1, 1, { fixed: true }), formatNumber(0.71, 2, { fixed: true }), formatNumber(2.25, 1, { fixed: true }), formatNumber(1353, 2, { fixed: true })]);
  });

  it('uses U+2212 for a negative cell and no sign on a value that rounds to zero', () => {
    const table: TableData = { columns: ['Change'], rows: [[-0.71], [-0.0004], [-0], [0.0004]], formats: [{ fixed: 3 }], refs: ['simulated'] };
    const html = renderToStaticMarkup(<DataTable id="t" caption="c" table={table} mode="open" />);
    expect(cells(html)).toEqual(['−0.710', '0.000', '0.000', '0.000']);
  });

  it('right-aligns the fixed cells and their header, marks them data-num and spreads the refs', () => {
    const html = renderToStaticMarkup(<DataTable id="t" caption="c" table={SCORES} mode="open" />);
    const [, all, lapsed] = headers(html);
    expect(all!.attrs).toContain('text-right');
    expect(lapsed!.attrs).toContain('text-right');
    const tds = rowsOf(html);
    for (const score of tds.filter((_, i) => i % 3 !== 0)) {
      expect(score.attrs).toContain('text-right');
      expect(score.attrs).toContain('data-num=""');
      expect(score.attrs).toContain('data-derived="simulated"');
    }
  });

  it('ignores rowDigits in a fixed column: the column states its own decimals', () => {
    const html = renderToStaticMarkup(<DataTable id="t" caption="c" table={{ ...SCORES, rowDigits: [0, 1, 5] }} mode="open" />);
    expect(cells(html)).toEqual(['Rule', '0.762', '0.685', 'Model', '0.793', '0.710', 'Other', '1.000', '0.000']);
  });

  it('prints a string cell in a fixed column as is', () => {
    const table: TableData = { columns: ['Score'], rows: [['not scored'], [0.71]], formats: [{ fixed: 3 }], refs: ['simulated'] };
    const html = renderToStaticMarkup(<DataTable id="t" caption="c" table={table} mode="open" />);
    expect(cells(html)).toEqual(['not scored', '0.710']);
  });

  it('throws on a cell that is not finite, and on decimals that are not a whole number from 0 to 20', () => {
    const render = (rows: (string | number)[][], fixed: number) =>
      renderToStaticMarkup(<DataTable id="t" caption="c" table={{ columns: ['Score'], rows, formats: [{ fixed }], refs: ['simulated'] }} mode="open" />);
    expect(() => render([[Number.NaN]], 3)).toThrow(TypeError);
    expect(() => render([[Number.POSITIVE_INFINITY]], 3)).toThrow(TypeError);
    expect(() => render([[0.71]], 1.5)).toThrow(RangeError);
    expect(() => render([[0.71]], -1)).toThrow(RangeError);
  });
});
