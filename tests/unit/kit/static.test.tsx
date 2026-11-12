import { parseFragment } from 'parse5';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Callout } from '@/components/kit/Callout';
import { DataTable, type TableData } from '@/components/kit/DataTable';
import { ProgressLine, UpdatedLabel } from '@/components/kit/LiveLabels';
import { PhaseLabel } from '@/components/kit/PhaseLabel';
import { ProvenanceBadge } from '@/components/kit/ProvenanceBadge';

type Node = {
  nodeName: string;
  value?: string;
  attrs?: Array<{ name: string; value: string }>;
  childNodes?: Node[];
};

function parse(html: string): Node {
  return parseFragment(html) as unknown as Node;
}
function text(node: Node): string {
  return node.nodeName === '#text' ? (node.value ?? '') : (node.childNodes ?? []).map(text).join('');
}
function find(node: Node, name: string): Node[] {
  const out = node.nodeName === name ? [node] : [];
  return out.concat((node.childNodes ?? []).flatMap((c) => find(c, name)));
}
const attr = (n: Node, name: string) => n.attrs?.find((a) => a.name === name)?.value;
const plain = (html: string) => text(parse(html));
const REFS = ['live'] as const;

describe('ProvenanceBadge', () => {
  it('prints exactly the three allowed words', () => {
    expect(plain(renderToStaticMarkup(<ProvenanceBadge kind="simulated" />))).toBe('Simulated');
    expect(plain(renderToStaticMarkup(<ProvenanceBadge kind="public-data" />))).toBe('Public data');
    expect(plain(renderToStaticMarkup(<ProvenanceBadge kind="live" />))).toBe('Live from this site');
  });

  it('is neutral: ink text-xs, a 1 px muted border, radius-sm, no colour word', () => {
    const html = renderToStaticMarkup(<ProvenanceBadge kind="live" />);
    for (const cls of ['text-ink', 'text-xs', 'border', 'border-muted', 'rounded-sm']) {
      expect(html).toContain(cls);
    }
    expect(html).not.toMatch(/text-(ok|warn|accent)|bg-(ok|warn|accent)/);
  });
});

describe('Callout', () => {
  it('has a left rule in line colour and the title before the body', () => {
    const html = renderToStaticMarkup(
      <Callout title="A limit">
        <p>The data is fictional.</p>
      </Callout>,
    );
    expect(html).toContain('border-l');
    expect(html).toContain('border-line');
    expect(html).toContain('pl-4');
    expect(plain(html)).toBe('A limitThe data is fictional.');
  });

  it('works without a title', () => {
    expect(plain(renderToStaticMarkup(<Callout>Only a note.</Callout>))).toBe('Only a note.');
  });
});

describe('DataTable', () => {
  const table: TableData = {
    columns: ['Group', 'Views', 'Rate'],
    rows: [
      ['Group A', 1353, 0.25],
      ['Group B', -0, 1200.456],
    ],
    refs: ['simulated'],
  };

  it('open mode is the bare table with a screen-reader caption and column headers', () => {
    const html = renderToStaticMarkup(<DataTable id="t1" caption="Views by group" table={table} mode="open" />);
    expect(html).not.toContain('<details');
    const root = parse(html);
    const [caption] = find(root, 'caption');
    expect(attr(caption!, 'class')).toContain('sr-only');
    expect(text(caption!)).toBe('Views by group');
    const heads = find(root, 'th');
    expect(heads.map(text)).toEqual(['Group', 'Views', 'Rate']);
    expect(heads.every((h) => attr(h, 'scope') === 'col')).toBe(true);
  });

  it('disclosure mode draws the table once: a closed details with a 44 px summary, then the body it folds', () => {
    const html = renderToStaticMarkup(<DataTable id="t1" caption="Views by group" table={table} mode="disclosure" />);
    const root = parse(html);
    expect(find(root, 'table')).toHaveLength(1);
    const [details] = find(root, 'details');
    expect(details).toBeDefined();
    expect(attr(details!, 'id')).toBe('t1');
    expect(attr(details!, 'data-js-only')).toBeDefined();
    expect(attr(details!, 'data-table-toggle')).toBeDefined();
    expect(attr(details!, 'open')).toBeUndefined();
    // The details holds only its summary; the table is its next sibling.
    expect(find(details!, 'table')).toHaveLength(0);
    const [summary] = find(details!, 'summary');
    expect(text(summary!)).toBe('Show the numbers as a table');
    expect(attr(summary!, 'class')).toContain('min-h-(--size-target)');
    expect(attr(summary!, 'data-touch-target')).toBeDefined();
    expect(attr(summary!, 'aria-controls')).toBe('t1-body');
    const body = find(root, 'div').find((n) => attr(n, 'data-table-body') !== undefined)!;
    expect(attr(body, 'id')).toBe('t1-body');
    expect(attr(body, 'data-nojs-only')).toBeDefined();
    expect(attr(body, 'class')).toBe('mt-3');
    expect(find(body, 'table')).toHaveLength(1);
    expect(html.indexOf('<details')).toBeLessThan(html.indexOf('data-table-body'));
    expect(html).not.toContain('Controls need JavaScript.');
  });

  it('disclosure mode puts a no-JS note above the open table and closes the gap under it', () => {
    const html = renderToStaticMarkup(
      <DataTable id="t1" caption="Views by group" table={table} mode="disclosure" noJsNote="Controls need JavaScript." />,
    );
    const root = parse(html);
    const note = find(root, 'p').find((n) => text(n) === 'Controls need JavaScript.')!;
    expect(attr(note, 'data-nojs-only')).toBeDefined();
    expect(attr(note, 'class')).toBe('mt-3 text-sm');
    const body = find(root, 'div').find((n) => attr(n, 'data-table-body') !== undefined)!;
    expect(attr(body, 'class')).toBe('mt-2');
    expect(html.indexOf('Controls need JavaScript.')).toBeLessThan(html.indexOf('<details'));
  });

  it('every cell carries the refs from the caller and numbers go through formatNumber', () => {
    const html = renderToStaticMarkup(<DataTable id="t1" caption="c" table={table} mode="open" />);
    const cells = find(parse(html), 'td');
    expect(cells).toHaveLength(6);
    expect(cells.every((c) => attr(c, 'data-derived') === 'simulated')).toBe(true);
    expect(cells.map(text)).toEqual(['Group A', '1,353', '0.25', 'Group B', '0', '1,200.46']);
  });

  it('does not print a small non-zero rate as zero', () => {
    const rates: TableData = { columns: ['Rate'], rows: [[0.004], [-0.004], [0.0123], [0.0456]], refs: ['simulated'] };
    const cells = find(parse(renderToStaticMarkup(<DataTable id="r" caption="c" table={rates} mode="open" />)), 'td');
    expect(cells.map(text)).toEqual(['0.004', '\u22120.004', '0.0123', '0.0456']);
  });

  it('formats each column as asked: count, points and signedPoints', () => {
    const formatted: TableData = {
      columns: ['Label', 'Count', 'Points', 'Difference'],
      rows: [
        ['x', 1353.4, 2.25, 5],
        ['y', 12, -0.04, -0.4],
        ['z', 0, 0, 0],
      ],
      formats: ['number', 'count', 'points', 'signedPoints'],
      refs: ['simulated'],
    };
    const cells = find(parse(renderToStaticMarkup(<DataTable id="f" caption="c" table={formatted} mode="open" />)), 'td');
    expect(cells.map(text)).toEqual([
      'x', '1,353', '2.3', '+5',
      'y', '12', '0', '\u22120.4',
      'z', '0', '0', '0',
    ]);
  });

  it('without formats, integers and ordinary values print as before', () => {
    const plain: TableData = { columns: ['A', 'B'], rows: [[1353, 12.5]], refs: ['simulated'] };
    const cells = find(parse(renderToStaticMarkup(<DataTable id="p" caption="c" table={plain} mode="open" />)), 'td');
    expect(cells.map(text)).toEqual(['1,353', '12.5']);
  });

  it('refuses formats that do not match the columns', () => {
    expect(() =>
      renderToStaticMarkup(<DataTable id="m" caption="c" table={{ ...table, formats: ['count'] }} mode="open" />),
    ).toThrow();
  });

  it('passes several refs through unchanged', () => {
    const html = renderToStaticMarkup(
      <DataTable id="t2" caption="c" table={{ ...table, refs: ['simulated', 'live'] }} mode="open" />,
    );
    expect(html).toContain('data-derived="simulated live"');
  });

  it('refuses a table with no refs rather than rendering an empty data-derived', () => {
    expect(() =>
      renderToStaticMarkup(<DataTable id="t3" caption="c" table={{ ...table, refs: [] }} mode="open" />),
    ).toThrow();
  });
});

describe('PhaseLabel', () => {
  const href = '/live';

  function resultsParagraph(html: string): Node {
    const doc = parse(html);
    expect(find(doc, 'a')).toHaveLength(1);
    const siblings = doc.childNodes?.[0]?.childNodes ?? [];
    expect(siblings.map(({ nodeName }) => nodeName)).toEqual(['p', 'a']);
    const [paragraph, action] = siblings;
    expect(attr(action!, 'href')).toBe(href);
    expect(text(action!)).toBe('See the live results');
    return paragraph!;
  }

  it('ab with a small smaller group names the group and omits the view count', () => {
    const html = renderToStaticMarkup(<PhaseLabel note={{ mode: 'ab', arm: 'b', nA: 49, nB: 49 }} href={href} refs={REFS} />);
    expect(text(resultsParagraph(html))).toBe(
      'This site runs an A/B test on its visitors, and you are in group B.',
    );
    expect(html).not.toContain('views so far');
  });

  it('ab names group A for arm a', () => {
    const html = renderToStaticMarkup(<PhaseLabel note={{ mode: 'ab', arm: 'a', nA: 3, nB: 4 }} href={href} refs={REFS} />);
    expect(plain(html)).toContain('you are in group A.');
  });

  it('ab with 50 in the smaller group puts the derived total before the action', () => {
    const html = renderToStaticMarkup(<PhaseLabel note={{ mode: 'ab', arm: 'b', nA: 50, nB: 162 }} href={href} refs={REFS} />);
    expect(plain(html)).toContain('group B');
    expect(text(resultsParagraph(html))).toContain('There have been 212 views so far.');
    expect(html).toContain('<data value="212" data-derived="live">212</data>');
  });

  it('uses the smaller of the two counts for the threshold, whichever arm it is', () => {
    expect(plain(renderToStaticMarkup(<PhaseLabel note={{ mode: 'ab', arm: 'a', nA: 162, nB: 49 }} href={href} refs={REFS} />))).not.toContain(
      'views so far',
    );
  });

  it('links the results, and the derived refs can be set by the caller', () => {
    const html = renderToStaticMarkup(
      <PhaseLabel note={{ mode: 'ab', arm: 'a', nA: 60, nB: 60 }} href={href} refs={['simulated']} />,
    );
    const [a] = find(parse(html), 'a');
    expect(attr(a!, 'href')).toBe('/live');
    expect(text(a!)).toBe('See the live results');
    expect(html).toContain('data-derived="simulated"');
  });

  it('calibration copy is verbatim', () => {
    const html = renderToStaticMarkup(<PhaseLabel note={{ mode: 'calibration' }} href={href} refs={REFS} />);
    expect(text(resultsParagraph(html))).toBe(
      'This site runs a live experiment on its own visitors. It is calibrating first, so everyone sees the same page.',
    );
  });

  it('paused copy is verbatim and the link has a descriptive visible label', () => {
    const html = renderToStaticMarkup(<PhaseLabel note={{ mode: 'paused' }} href={href} refs={REFS} />);
    const doc = parse(html);
    expect(text(find(doc, 'p')[0]!)).toBe('The experiment on this site is paused.');
    const links = find(doc, 'a');
    expect(links).toHaveLength(1);
    expect(attr(links[0]!, 'href')).toBe(href);
    expect(text(links[0]!)).toBe('See why the experiment is paused');
  });

  it('is one paragraph in text-sm', () => {
    const html = renderToStaticMarkup(<PhaseLabel note={{ mode: 'calibration' }} href={href} refs={REFS} />);
    expect(find(parse(html), 'p')).toHaveLength(1);
    expect(html).toContain('text-sm');
  });
});

describe('UpdatedLabel', () => {
  it('renders the Berlin time inside a <time> with the original instant', () => {
    const html = renderToStaticMarkup(
      <UpdatedLabel updatedAt="2026-07-01T12:05:00Z" renderedAt="2026-07-01T20:00:00Z" refs={REFS} />,
    );
    const [time] = find(parse(html), 'time');
    expect(attr(time!, 'datetime')).toBe('2026-07-01T12:05:00Z');
    expect(text(time!)).toBe('Updated 14:05');
    expect(attr(time!, 'data-derived')).toBe('live');
  });

  it('adds the date when the Berlin day differs', () => {
    const html = renderToStaticMarkup(
      <UpdatedLabel updatedAt="2026-10-24T21:30:00Z" renderedAt="2026-10-24T22:30:00Z" refs={['build']} />,
    );
    expect(plain(html)).toBe('Updated 24.10, 23:30');
    expect(html).toContain('data-derived="build"');
  });
});

describe('ProgressLine', () => {
  it('at zero renders value 0 and names the group it counts', () => {
    const html = renderToStaticMarkup(<ProgressLine nSmaller={0} target={50} plannedEnd="2026-11-15T10:00:00Z" plannedEndKind="fixed" refs={REFS} />);
    const root = parse(html);
    const [progress] = find(root, 'progress');
    expect(attr(progress!, 'value')).toBe('0');
    expect(attr(progress!, 'max')).toBe('50');
    const labelledBy = attr(progress!, 'aria-labelledby');
    expect(labelledBy).toBeTruthy();
    expect(plain(html)).toContain('Progress: 0 of 50 in the smaller group');
    const label = find(root, 'span').find((s) => attr(s, 'id') === labelledBy);
    expect(text(label!)).toBe('Progress: 0 of 50 in the smaller group');
  });

  it('caps the value at the target and keeps the real count in the text', () => {
    const html = renderToStaticMarkup(<ProgressLine nSmaller={70} target={50} plannedEnd="2026-11-15T10:00:00Z" plannedEndKind="fixed" refs={REFS} />);
    const [progress] = find(parse(html), 'progress');
    expect(attr(progress!, 'value')).toBe('50');
    expect(plain(html)).toContain('Progress: 70 of 50');
  });

  it('shows the planned end as dd.mm in Berlin time inside <time>', () => {
    const html = renderToStaticMarkup(<ProgressLine nSmaller={12} target={50} plannedEnd="2026-10-24T22:30:00Z" plannedEndKind="fixed" refs={REFS} />);
    const [time] = find(parse(html), 'time');
    expect(attr(time!, 'datetime')).toBe('2026-10-24T22:30:00Z');
    expect(text(time!)).toBe('25.10');
    expect(plain(html)).toContain('Planned end: 25.10.');
  });

  it('marks every number as derived with the caller refs', () => {
    const html = renderToStaticMarkup(
      <ProgressLine nSmaller={12} target={50} plannedEnd="2026-11-15T10:00:00Z" plannedEndKind="fixed" refs={['simulated']} />,
    );
    expect(html).toContain('<data value="12" data-derived="simulated">12</data>');
    expect(html).toContain('<data value="50" data-derived="simulated">50</data>');
    expect(html).toContain('<time dateTime="2026-11-15T10:00:00Z" data-derived="simulated">');
  });

  it('does not collide ids when two lines are on one page', () => {
    const html = renderToStaticMarkup(
      <>
        <ProgressLine nSmaller={1} target={50} plannedEnd="2026-11-15T10:00:00Z" plannedEndKind="fixed" refs={REFS} />
        <ProgressLine nSmaller={2} target={50} plannedEnd="2026-11-15T10:00:00Z" plannedEndKind="fixed" refs={REFS} />
      </>,
    );
    const ids = find(parse(html), 'span')
      .map((s) => attr(s, 'id'))
      .filter(Boolean);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThanOrEqual(2);
  });
});
