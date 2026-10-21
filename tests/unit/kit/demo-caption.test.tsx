import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PRESETS } from '@/app/kitchen-sink/_demo/DemoControls';
import { DemoFigureView } from '@/app/kitchen-sink/_demo/demo-view';

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
