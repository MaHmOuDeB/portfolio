import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DataTable } from '@/components/kit/DataTable';
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
      const t = confidenceTable(s);
      const last = t.rows[t.rows.length - 1]!;
      const html = renderToStaticMarkup(<DataTable id="t" caption="c" table={{ ...t, rows: [last], rowDigits: [t.rowDigits![t.rows.length - 1]!] }} mode="open" />);
      const printed = cells(html);
      const now = formatIntervalPoints(last[2] as number, last[4] as number);
      expect(`${printed[2]} to ${printed[4]}`, phase).toBe(now);
    }
  });
});
