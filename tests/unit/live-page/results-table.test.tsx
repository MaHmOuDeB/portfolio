// The results Figure's table before the first look is drawn: the analysed views per group so far,
// group A then group B, as the page prints them, with its note and its source marker, in the
// default, no-JS and error runtimes (the disclosure table, the open table and the error fallback's).
import { renderToStaticMarkup } from 'react-dom/server';
import { parse, type DefaultTreeAdapterTypes as T } from 'parse5';
import { describe, expect, it } from 'vitest';
import { LivePage } from '@/components/live-page/LivePage';
import type { ExperimentSnapshot } from '@/lib/experiment/snapshot';
import { formatNumber } from '@/lib/figure/format';
import { FIXTURE_AB, FIXTURE_CALIBRATION, snapshotFixture } from '@/lib/home/fixtures';
import { narrativeFixture } from '@/lib/home/narrative-fixtures';
import { toLivePageDisplay, toLivePageModel, type LivePageDisplay } from '@/lib/live-page/model';

const RUNTIMES = ['default', 'no-js', 'error'] as const;
const NOTE = 'No look is drawn yet: the analysed views per group so far.';

const displayOf = (s: ExperimentSnapshot): LivePageDisplay =>
  toLivePageDisplay(toLivePageModel(s, { commit: null }, s.configPhase === 'ab' ? FIXTURE_AB : FIXTURE_CALIBRATION));

function elements(node: T.ParentNode, out: T.Element[] = []): T.Element[] {
  for (const c of node.childNodes) {
    if ('tagName' in c) {
      out.push(c as T.Element);
      elements(c as T.Element, out);
    }
  }
  return out;
}
const attr = (el: T.Element, name: string) => el.attrs.find((a) => a.name === name)?.value;
const text = (n: T.Node): string =>
  n.nodeName === '#text' ? (n as T.TextNode).value : 'childNodes' in n ? (n as T.Element).childNodes.map(text).join('') : '';

/** The results Figure's tables: header texts, and each body row's cell texts and source markers. */
function resultsTables(html: string) {
  const figure = elements(parse(`<body>${html}</body>`)).find((e) => e.tagName === 'figure' && attr(e, 'id') === 'live-results');
  if (!figure) throw new Error('no results Figure');
  const tables = elements(figure).filter((e) => e.tagName === 'table');
  return {
    text: text(figure).replace(/\s+/g, ' '),
    tables: tables.map((t) => ({
      heads: elements(t).filter((e) => e.tagName === 'th').map((e) => text(e).trim()),
      rows: elements(t)
        .filter((e) => e.tagName === 'tbody')
        .flatMap((b) => elements(b).filter((e) => e.tagName === 'tr'))
        .map((r) => elements(r).filter((e) => e.tagName === 'td').map((td) => ({ text: text(td).trim(), derived: attr(td, 'data-derived') }))),
    })),
  };
}

const shown = (c: number | '<5') => (typeof c === 'number' ? formatNumber(c, 0) : c);

/** The A/B case with the larger count in group A: 30 analysed views against 20, no look drawn (as ab-zero-sixty is set up). */
function groupAAhead(): ExperimentSnapshot {
  const s = narrativeFixture('ab-under-50');
  return { ...s, live: { ...s.live, nA: 30, nB: 20, series: [] } };
}

const CASES: [string, ExperimentSnapshot][] = [
  ['before-data', snapshotFixture('before-data')],
  ['an A/B test with no look yet (ab-under-50)', narrativeFixture('ab-under-50')],
  ['an A/B test with no look yet and group A ahead', groupAAhead()],
];

describe('the results table before the first look', () => {
  it('the cases are the ones meant: no look drawn, and in the A/B case two different counts', () => {
    for (const [name, s] of CASES) expect(displayOf(s).series, name).toEqual([]);
    expect(displayOf(snapshotFixture('before-data')).mode).toBe('before-data');
    const ab = displayOf(narrativeFixture('ab-under-50'));
    expect(ab.mode).toBe('ab');
    expect(shown(ab.counts.a)).not.toBe(shown(ab.counts.b));
  });

  it('with group A ahead, A still comes first and the larger count is A\'s', () => {
    const d = displayOf(groupAAhead());
    expect(d.series).toEqual([]);
    expect(d.counts.a > d.counts.b).toBe(true);
    expect([shown(d.counts.a), shown(d.counts.b)]).toEqual(['30', '20']);
    const r = resultsTables(renderToStaticMarkup(<LivePage display={d} meta={null} host="site.example" runtime="default" />));
    expect(r.tables[0]!.rows.map((row) => row.map((c) => c.text))).toEqual([
      ['A', '30'],
      ['B', '20'],
    ]);
    expect(r.text).toContain(NOTE);
  });

  for (const [name, s] of CASES) {
    for (const runtime of RUNTIMES) {
      it(`${name}, ${runtime}: Group and Analysed views, group A then group B as printed counts, the note and the source marker`, () => {
        const d = displayOf(s);
        const r = resultsTables(renderToStaticMarkup(<LivePage display={d} meta={null} host="site.example" runtime={runtime} />));
        expect(r.tables.length, 'a table is there').toBeGreaterThan(0);
        for (const t of r.tables) {
          expect(t.heads).toEqual(['Group', 'Analysed views']);
          expect(t.rows.map((row) => row.map((c) => c.text))).toEqual([
            ['A', shown(d.counts.a)],
            ['B', shown(d.counts.b)],
          ]);
          for (const row of t.rows) for (const c of row) expect(c.derived).toBe(d.refs.join(' '));
        }
        expect(r.text).toContain(NOTE);
      });
    }
  }
});
