// A table can carry its own caption. Without one, every Figure's table is captioned as before.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DataTable, type TableData } from '@/components/kit/DataTable';
import { Figure } from '@/components/kit/Figure';

const BASE: TableData = { columns: ['Group', 'Views'], rows: [['A', 3]], refs: ['simulated'] };
const captionOf = (html: string) => [...html.matchAll(/<caption[^>]*>([^<]*)<\/caption>/g)].map((m) => m[1]);
const figure = (table: TableData, runtime?: 'default' | 'no-js' | 'error') =>
  renderToStaticMarkup(
    <Figure id="demo" title="Smaller rises need many more visitors." caption="A fictional caption." provenance="simulated" table={table} state={runtime ? { runtime } : undefined}>
      <svg role="img" aria-label="A fictional chart" />
    </Figure>,
  );

describe('TableData caption', () => {
  it('DataTable prints the table caption in the caption element, in both modes', () => {
    for (const mode of ['open', 'disclosure'] as const) {
      const html = renderToStaticMarkup(<DataTable id="t" caption="fallback" table={{ ...BASE, caption: 'Views per group so far' }} mode={mode} />);
      expect(captionOf(html), mode).toEqual(['Views per group so far']);
      expect(html).toContain('aria-labelledby="t-caption"');
    }
  });

  it('DataTable without one prints the caption prop, as before', () => {
    expect(captionOf(renderToStaticMarkup(<DataTable id="t" caption="fallback" table={BASE} mode="open" />))).toEqual(['fallback']);
  });

  it('Figure passes the caption through, in every runtime, and falls back to its title without one', () => {
    for (const runtime of ['default', 'no-js', 'error'] as const) {
      expect(captionOf(figure({ ...BASE, caption: 'Views per group so far' }, runtime)), runtime).toEqual(['Views per group so far']);
      expect(captionOf(figure(BASE, runtime)), runtime).toEqual(['Smaller rises need many more visitors.']);
    }
  });

  it('a Figure whose table has no caption renders exactly as one whose caption is undefined', () => {
    expect(figure({ ...BASE, caption: undefined })).toBe(figure(BASE));
  });
});
