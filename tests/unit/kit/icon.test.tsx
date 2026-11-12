import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Icon, type IconName } from '@/components/kit/Icon';

const NAMES: IconName[] = ['mail', 'linkedin', 'github', 'download', 'external', 'menu', 'alert', 'check', 'chevron'];

describe('Icon', () => {
  it.each(NAMES)('%s is a 20 px outline icon stroked in currentColor', (name) => {
    const html = renderToStaticMarkup(<Icon name={name} />);
    expect(html).toMatch(/^<svg /);
    expect(html).toContain('viewBox="0 0 20 20"');
    expect(html).toContain('width="20"');
    expect(html).toContain('height="20"');
    expect(html).toContain('stroke="currentColor"');
    expect(html).toContain('stroke-width="1.5"');
    expect(html).toContain('fill="none"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('focusable="false"');
    // The only colour in the markup is currentColor: no hex, rgb, var() or named fill.
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgb|var\(|fill="(?!none)/);
  });

  it('every icon has drawn geometry', () => {
    for (const name of NAMES) {
      expect(renderToStaticMarkup(<Icon name={name} />)).toMatch(/<(path|circle|rect|line|polyline)/);
    }
  });

  it('draws the status and select shapes on the 20 grid exactly as specified', () => {
    expect(renderToStaticMarkup(<Icon name="alert" />)).toContain('<circle cx="10" cy="10" r="7.5"></circle><path d="M10 6v4.75M10 13.75h.01"></path>');
    expect(renderToStaticMarkup(<Icon name="check" />)).toContain('<circle cx="10" cy="10" r="7.5"></circle><path d="M6.75 10.25l2.25 2.25 4.25-4.5"></path>');
    expect(renderToStaticMarkup(<Icon name="chevron" />)).toContain('<path d="M5.5 8l4.5 4.5L14.5 8"></path>');
  });
});
