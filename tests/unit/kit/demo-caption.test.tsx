import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PRESETS } from '@/app/kitchen-sink/_demo/DemoControls';
import { DemoChart, DemoFigureView, demoModel } from '@/app/kitchen-sink/_demo/demo-view';

const caption = (html: string) => /<figcaption[\s\S]*?<\/p>/.exec(html)![0].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');

describe('the planner Figure without its controls', () => {
  it('states the baseline conversion and the power in its caption, so a reader can reproduce the number', () => {
    const html = renderToStaticMarkup(<DemoFigureView id="demo" values={PRESETS.default} state={{ runtime: 'no-js' }} />);
    expect(html).not.toContain('data-figure-controls');
    expect(caption(html)).toContain('a baseline conversion of 10% and a power of 80%');
    expect(caption(html)).toContain('significance level of 0.05');
  });

  it('follows the values it is given, each number marked as simulated', () => {
    const html = renderToStaticMarkup(<DemoFigureView id="demo" values={{ baseline: 0.25, power: '0.9' }} />);
    expect(caption(html)).toContain('a baseline conversion of 25% and a power of 90%');
    expect(html).toMatch(/<span data-derived="simulated">25%<\/span>/);
    expect(html).toMatch(/<span data-derived="simulated">90%<\/span>/);
  });
});


describe('the demo error preview datasets', () => {
  it('labels the preset plot outside both responsive variants and identifies the current table before its rows', () => {
    const html = renderToStaticMarkup(
      <DemoFigureView
        id="fragile"
        values={{ baseline: 0.11, power: '0.8' }}
        state={{ runtime: 'error' }}
        preview={<DemoChart id="fragile-preview" model={demoModel(PRESETS.default)} presetPreview />}
      />,
    );
    const outsideSvg = html.replace(/<svg[\s\S]*?<\/svg>/g, '');
    const preset = /<p data-demo-preset=""[^>]*>([\s\S]*?)<\/p>/.exec(outsideSvg);
    const current = /<p data-demo-current-inputs=""[^>]*>([\s\S]*?)<\/p>/.exec(outsideSvg);
    expect(preset).not.toBeNull();
    expect(current).not.toBeNull();
    const text = (value: string) => value.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');
    expect(text(preset![1]!)).toBe('Preset plot at 10% baseline conversion and 80% power.');
    expect(text(current![1]!)).toBe(
      'Table for current inputs of 11% baseline conversion and 80% power. Its values can differ from the preset plot above.',
    );
    expect(preset![0]).toContain('data-derived="simulated"');
    expect(current![0]).toContain('data-derived="simulated"');
    expect(preset!.index).toBeLessThan(html.indexOf('data-chart="fragile-preview-chart"'));
    expect(html.indexOf('data-demo-current-inputs')).toBeGreaterThan(html.lastIndexOf('</svg>'));
    expect(html.indexOf('data-demo-current-inputs')).toBeLessThan(html.indexOf('<table'));
    expect(html).toContain('4,138');
    expect(html).toContain('3,835');
    expect(html).toContain('This chart could not load.');
  });
});
