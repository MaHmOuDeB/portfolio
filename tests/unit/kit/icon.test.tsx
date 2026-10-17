import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Icon, type IconName } from '@/components/kit/Icon';

const NAMES: IconName[] = ['mail', 'linkedin', 'github', 'download', 'external', 'menu'];

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
});
