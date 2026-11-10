import { parseFragment } from 'parse5';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { auditHtml } from '../../../scripts/truth-audit.ts';
import type { TableData } from '@/components/kit/DataTable';
import { Figure, FigureErrorFallback, type FallbackBody, type FigureProps } from '@/components/kit/Figure';
import { LoadOnIntent } from '@/components/kit/LoadOnIntent';
import { FACTS, FACT_DISPLAYS } from '@/lib/facts';
import type { LiveAxes } from '@/lib/figure/states';

type Node = {
  nodeName: string;
  value?: string;
  attrs?: Array<{ name: string; value: string }>;
  childNodes?: Node[];
};

const parse = (html: string) => parseFragment(html) as unknown as Node;
const text = (node: Node): string =>
  node.nodeName === '#text' ? (node.value ?? '') : (node.childNodes ?? []).map(text).join('');
const find = (node: Node, test: (n: Node) => boolean): Node[] =>
  (test(node) ? [node] : []).concat((node.childNodes ?? []).flatMap((c) => find(c, test)));
const attr = (n: Node, name: string) => n.attrs?.find((a) => a.name === name)?.value;
const hasAttr = (n: Node, name: string) => n.attrs?.some((a) => a.name === name) ?? false;
const byTag = (root: Node, tag: string) => find(root, (n) => n.nodeName === tag);
const withAttr = (root: Node, name: string) => find(root, (n) => hasAttr(n, name));
/** Every node under `root`, root included. */
const all = (root: Node) => find(root, () => true);

const TABLE: TableData = {
  columns: ['Rise (points)', 'Visitors per group'],
  rows: [
    [1, 30_000],
    [2, 7_500],
  ],
  refs: ['simulated'],
};
const CHART = <svg data-test-chart="" role="img" aria-label="A fictional chart" />;
const LIVE: LiveAxes = { phase: 'ab', data: 'enough-data', freshness: { kind: 'fresh' } };

const SENTENCES: Record<FallbackBody, string> = {
  static: 'This chart could not load. The numbers are in the table below.',
  live: 'This chart could not load. The numbers for both groups are in the table below.',
  diagram: 'This diagram could not load. The text around it describes the same steps.',
};

type ChartOverrides = Partial<Extract<FigureProps, { provenance: unknown }>>;
function chart(overrides: ChartOverrides = {}, children: ReactNode = CHART) {
  return parse(
    renderToStaticMarkup(
      <Figure
        id="demo"
        title="Smaller rises need many more visitors."
        caption="A fictional caption."
        provenance="simulated"
        table={TABLE}
        controls={<button type="button">Fictional control</button>}
        {...overrides}
      >
        {children}
      </Figure>,
    ),
  );
}
const diagram = (state?: FigureProps['state']) =>
  parse(
    renderToStaticMarkup(
      <Figure id="flow" kind="diagram" title="Each step hands its work to the next." caption="A fictional diagram." state={state}>
        <svg data-test-diagram="" role="img" aria-label="A fictional diagram" />
      </Figure>,
    ),
  );
const fallback = (body: FallbackBody) =>
  parse(
    renderToStaticMarkup(
      <FigureErrorFallback id="demo" body={body} preview={CHART} table={body === 'diagram' ? undefined : TABLE} />,
    ),
  );

const figureOf = (root: Node) => byTag(root, 'figure')[0]!;
const nojs = (root: Node) => withAttr(root, 'data-nojs-only');
const jsOnly = (root: Node) => withAttr(root, 'data-js-only');
const groups = (root: Node) => find(root, (n) => attr(n, 'role') === 'group');
const statuses = (root: Node) => find(root, (n) => attr(n, 'role') === 'status');
/** A bare table: a <table> with no <details> above it. */
const openTables = (root: Node): Node[] =>
  root.nodeName === 'details' ? [] : (root.nodeName === 'table' ? [root] : []).concat((root.childNodes ?? []).flatMap(openTables));

describe('Figure, chart kind', () => {
  it('is a figure named by its title, with the id, body and runtime on its root', () => {
    const root = chart();
    const figure = figureOf(root);
    expect(attr(figure, 'id')).toBe('demo');
    expect(attr(figure, 'data-figure')).toBe('demo');
    expect(attr(figure, 'data-body')).toBe('default');
    expect(attr(figure, 'data-runtime')).toBe('default');
    expect(attr(figure, 'class')).toContain('max-w-figure');
    const title = byTag(root, 'h3')[0]!;
    expect(attr(figure, 'aria-labelledby')).toBe(attr(title, 'id'));
    expect(attr(title, 'id')).toBe('demo-title');
    expect(attr(title, 'class')).toContain('text-xl');
    expect(attr(title, 'class')).toContain('font-semibold');
    expect(text(title)).toBe('Smaller rises need many more visitors.');
  });

  it('takes the heading level it is given', () => {
    const root = chart({ titleLevel: 2 });
    expect(byTag(root, 'h3')).toHaveLength(0);
    expect(attr(byTag(root, 'h2')[0]!, 'id')).toBe('demo-title');
    expect(byTag(chart({ titleLevel: 4 }), 'h4')).toHaveLength(1);
  });

  it('shows the controls in one JS-only group, then the result, the chart and the caption', () => {
    const root = chart({ result: <span>A fictional result.</span> });
    const [group] = groups(root);
    expect(group && attr(group, 'aria-label')).toBe('Controls');
    expect(group && hasAttr(group, 'data-js-only')).toBe(true);
    expect(text(byTag(root, 'p').find((p) => hasAttr(p, 'data-figure-result'))!)).toBe('A fictional result.');
    expect(withAttr(root, 'data-test-chart')).toHaveLength(1);
    const caption = byTag(root, 'figcaption')[0]!;
    expect(text(caption)).toContain('A fictional caption.');
    expect(text(caption)).toContain('Simulated');
    // figcaption is the figure's last child, as HTML requires.
    const kids = (figureOf(root).childNodes ?? []).filter((n) => n.nodeName !== '#text');
    expect(kids.at(-1)?.nodeName).toBe('figcaption');
  });

  it('holds the announcement in a polite, hidden live region marked with the table refs', () => {
    const root = chart({ announcement: '7,500 visitors per group to detect a rise of 2 points' });
    const [region] = find(root, (n) => attr(n, 'aria-live') === 'polite');
    expect(region).toBeDefined();
    expect(attr(region!, 'class')).toContain('sr-only');
    expect(attr(region!, 'data-derived')).toBe('simulated');
    expect(text(region!)).toBe('7,500 visitors per group to detect a rise of 2 points');
    // Nothing is said at load time: the region starts empty.
    const quiet = find(chart(), (n) => attr(n, 'aria-live') === 'polite')[0]!;
    expect(text(quiet)).toBe('');
  });

  it('gives the table twice: open without JavaScript, below "Controls need JavaScript.", and folded with it', () => {
    const root = chart();
    const [noScript] = nojs(root);
    expect(noScript).toBeDefined();
    expect(text(noScript!)).toContain('Controls need JavaScript.');
    expect(byTag(noScript!, 'details')).toHaveLength(0);
    expect(openTables(noScript!)).toHaveLength(1);
    const folded = jsOnly(root).filter((n) => byTag(n, 'details').length > 0);
    expect(folded).toHaveLength(1);
    expect(text(byTag(folded[0]!, 'summary')[0]!)).toBe('Show the numbers as a table');
    // The two copies of the table do not share element ids.
    const ids = all(root).map((n) => attr(n, 'id')).filter(Boolean);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('says "Controls need JavaScript." only when there are controls', () => {
    const root = chart({ controls: undefined });
    expect(groups(root)).toHaveLength(0);
    expect(text(root)).not.toContain('Controls need JavaScript.');
    expect(openTables(nojs(root)[0]!)).toHaveLength(1);
  });

  it('forced no-js shows the open table ungated, with no controls and no disclosure', () => {
    const root = chart({ state: { runtime: 'no-js' }, result: <span>A fictional result.</span> });
    expect(attr(figureOf(root), 'data-runtime')).toBe('no-js');
    expect(groups(root)).toHaveLength(0);
    expect(byTag(root, 'details')).toHaveLength(0);
    expect(nojs(root)).toHaveLength(0);
    expect(jsOnly(root)).toHaveLength(0);
    expect(text(root)).toContain('Controls need JavaScript.');
    expect(openTables(root)).toHaveLength(1);
    expect(withAttr(root, 'data-test-chart')).toHaveLength(1);
  });

  it('shows "Updated" with the time when the data is stale, and nothing when it is fresh', () => {
    const stale = chart({
      provenance: 'live',
      state: {
        live: { ...LIVE, freshness: { kind: 'stale', updatedAt: '2026-10-24T22:30:00Z', renderedAt: '2026-10-26T08:00:00Z' } },
      },
    });
    const caption = byTag(stale, 'figcaption')[0]!;
    expect(text(caption)).toContain('Updated 25.10, 00:30');
    expect(attr(byTag(caption, 'time')[0]!, 'datetime')).toBe('2026-10-24T22:30:00Z');
    expect(text(byTag(chart({ state: { live: LIVE } }), 'figcaption')[0]!)).not.toContain('Updated');
  });

  it('sets data-body from the state precedence', () => {
    expect(attr(figureOf(chart({ state: { live: LIVE } })), 'data-body')).toBe('ab');
    expect(attr(figureOf(chart({ state: { live: { ...LIVE, data: 'low-data' } } })), 'data-body')).toBe('low-data');
    expect(attr(figureOf(chart({ state: { runtime: 'error', live: LIVE } })), 'data-body')).toBe('error');
  });

  it('forced error shows the fallback in place of the chart: the preview, the live sentence and the open table', () => {
    const root = chart(
      { state: { runtime: 'error', live: LIVE }, preview: <svg data-test-preview="" role="img" aria-label="A preview" /> },
      <svg data-test-chart="" role="img" aria-label="A fictional chart" />,
    );
    expect(attr(figureOf(root), 'data-runtime')).toBe('error');
    expect(text(byTag(root, 'h3')[0]!)).toBe('Smaller rises need many more visitors.');
    expect(withAttr(root, 'data-test-chart')).toHaveLength(0);
    expect(withAttr(root, 'data-test-preview')).toHaveLength(1);
    expect(statuses(root).map(text)).toEqual([SENTENCES.live]);
    expect(openTables(root)).toHaveLength(1);
    // The errored Figure has nothing to control and no second table.
    expect(groups(root)).toHaveLength(0);
    expect(byTag(root, 'details')).toHaveLength(0);
    expect(byTag(root, 'a')).toHaveLength(0);
  });

  it('forced error without live axes uses the static sentence and the children as the preview', () => {
    const root = chart({ state: { runtime: 'error' } });
    expect(statuses(root).map(text)).toEqual([SENTENCES.static]);
    expect(withAttr(root, 'data-test-chart')).toHaveLength(1);
  });

  it('refuses an id that would break the URL namespace', () => {
    expect(() => chart({ id: 'Demo' })).toThrow();
    expect(() => chart({ id: 'a.b' })).toThrow();
  });

  it('passes the truth audit: every number it prints sits under a marker', () => {
    const page = (body: string) => `<!DOCTYPE html><html lang="en"><head><title>Page</title></head><body>${body}</body></html>`;
    const ctx = { route: '/lab', factIds: new Set(Object.keys(FACTS)), factDisplays: FACT_DISPLAYS, denylist: [] };
    const markup = renderToStaticMarkup(
      <Figure
        id="demo"
        title="Smaller rises need many more visitors."
        caption="A fictional caption."
        provenance="simulated"
        table={TABLE}
        announcement="7,500 visitors per group to detect a rise of 2 points"
      >
        {CHART}
      </Figure>,
    );
    expect(auditHtml(page(markup), ctx)).toEqual([]);
  });
});

describe('Figure lead', () => {
  const LEAD = <p data-test-lead="">A fictional readout.</p>;
  const LEAD_HTML = '<div data-figure-lead="" class="mt-4"><p data-test-lead="">A fictional readout.</p></div>';
  const RESULT = <span>A fictional result.</span>;
  const markup = (overrides: ChartOverrides = {}) =>
    renderToStaticMarkup(
      <Figure
        id="demo"
        title="Smaller rises need many more visitors."
        caption="A fictional caption."
        provenance="simulated"
        table={TABLE}
        controls={<button type="button">Fictional control</button>}
        result={RESULT}
        {...overrides}
      >
        {CHART}
      </Figure>,
    );
  /** The figure's element children, each named by its tag and its data-figure-* marker. */
  const outline = (html: string) =>
    (figureOf(parse(html)).childNodes ?? [])
      .filter((n) => n.nodeName !== '#text')
      .map((n) => [n.nodeName, ...(n.attrs ?? []).filter((a) => a.name.startsWith('data-figure-')).map((a) => a.name)].join(' '));
  const RUNTIMES = ['default', 'no-js', 'error'] as const;

  it.each(RUNTIMES)('without a lead, %s draws no lead and no extra wrapper', (runtime) => {
    const html = markup({ state: { runtime } });
    expect(html).not.toContain('data-figure-lead');
    const expected = {
      default: ['h3', 'div data-figure-controls', 'p data-figure-result', 'p data-figure-announcement', 'div data-figure-body', 'figcaption'],
      'no-js': ['h3', 'p data-figure-result', 'div data-figure-body', 'figcaption'],
      error: ['h3', 'div data-figure-body', 'figcaption'],
    }[runtime];
    expect(outline(html)).toEqual(expected);
    // An empty lead is no lead.
    expect(markup({ state: { runtime }, lead: undefined })).toBe(html);
    expect(markup({ state: { runtime }, lead: null })).toBe(html);
  });

  it.each(['default', 'no-js'] as const)('in %s, the lead is one div between the title and the control row, and nothing else changes', (runtime) => {
    const without = markup({ state: { runtime } });
    const html = markup({ state: { runtime }, lead: LEAD });
    // The only bytes the prop adds are its own wrapper, right after the title.
    expect(html.replace(LEAD_HTML, '')).toBe(without);
    expect(html).toContain(`</h3>${LEAD_HTML}`);
    const kids = outline(html);
    expect(kids.slice(0, 2)).toEqual(['h3', 'div data-figure-lead']);
    if (runtime === 'default') expect(kids[2]).toBe('div data-figure-controls');
    else expect(kids[2]).toBe('p data-figure-result');
    expect(withAttr(parse(html), 'data-test-lead')).toHaveLength(1);
  });

  it('is not drawn beside a forced error fallback, like the result line', () => {
    const without = markup({ state: { runtime: 'error' } });
    const html = markup({ state: { runtime: 'error' }, lead: LEAD });
    expect(html).toBe(without);
    expect(html).not.toContain('data-figure-lead');
    expect(html).not.toContain('A fictional readout.');
  });

  it('is a chart-kind prop only: a diagram does not take it', () => {
    const html = renderToStaticMarkup(
      // @ts-expect-error a diagram has no lead
      <Figure id="flow" kind="diagram" title="Each step hands its work to the next." caption="A fictional diagram." lead={LEAD}>
        <svg />
      </Figure>,
    );
    expect(html).not.toContain('data-figure-lead');
  });
});

describe('Figure, diagram kind', () => {
  it('has a title, the drawing and a caption, and no badge, table or controls', () => {
    const root = diagram();
    const figure = figureOf(root);
    expect(attr(figure, 'aria-labelledby')).toBe('flow-title');
    expect(withAttr(root, 'data-test-diagram')).toHaveLength(1);
    expect(text(byTag(root, 'figcaption')[0]!)).toBe('A fictional diagram.');
    expect(text(root)).not.toMatch(/Simulated|Public data|Live from this site/);
    expect(byTag(root, 'table')).toHaveLength(0);
    expect(groups(root)).toHaveLength(0);
    expect(find(root, (n) => hasAttr(n, 'aria-live'))).toHaveLength(0);
  });

  it('forced error shows the diagram sentence and no table', () => {
    const root = diagram({ runtime: 'error' });
    expect(statuses(root).map(text)).toEqual([SENTENCES.diagram]);
    expect(byTag(root, 'table')).toHaveLength(0);
    expect(withAttr(root, 'data-test-diagram')).toHaveLength(0);
  });
});

describe('FigureErrorFallback', () => {
  it.each(['static', 'live', 'diagram'] as const)('says exactly its ruled sentence for %s, with no link', (body) => {
    const root = fallback(body);
    const [status, ...rest] = statuses(root);
    expect(rest).toHaveLength(0);
    expect(text(status!)).toBe(SENTENCES[body]);
    expect(attr(status!, 'tabindex')).toBe('-1');
    expect(byTag(root, 'a')).toHaveLength(0);
    // The heading is the Figure's own title, so the fallback adds none.
    expect(find(root, (n) => /^h[1-6]$/.test(n.nodeName))).toHaveLength(0);
  });

  it('opens the table for the chart kinds and has none for a diagram', () => {
    expect(openTables(fallback('static'))).toHaveLength(1);
    expect(openTables(fallback('live'))).toHaveLength(1);
    expect(byTag(fallback('diagram'), 'table')).toHaveLength(0);
    expect(byTag(fallback('static'), 'details')).toHaveLength(0);
  });

  it('draws the preview above the sentence for the chart kinds only', () => {
    const root = fallback('static');
    expect(withAttr(root, 'data-test-chart')).toHaveLength(1);
    expect(withAttr(fallback('diagram'), 'data-test-chart')).toHaveLength(0);
  });
});

describe('LoadOnIntent', () => {
  it('renders the preview, marked idle, and not the island, in the static HTML', () => {
    const root = parse(
      renderToStaticMarkup(
        <LoadOnIntent preview={<p data-test-preview="">The preview</p>}>
          <p data-test-island="">The island</p>
        </LoadOnIntent>,
      ),
    );
    const [island] = withAttr(root, 'data-island');
    expect(attr(island!, 'data-island')).toBe('idle');
    expect(withAttr(root, 'data-test-preview')).toHaveLength(1);
    expect(withAttr(root, 'data-test-island')).toHaveLength(0);
  });
});
