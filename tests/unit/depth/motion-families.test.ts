import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The motion families beside the band's Unfold (Drift, Hinge, Turn, Trace): each runs only where
// scroll timelines exist, from lg and with motion allowed, ends on the final layout, keeps a focused
// control out of mid-flight, and stops under reduced motion and in print.
const css = readFileSync(join(__dirname, '..', '..', '..', 'src/app/globals.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

const { AutomationTrack } = await import('@/components/home/AutomationTrack');
const { Vignette } = await import('@/components/frame/Vignette');

/** The body of the first block that starts with `head` (balanced braces). */
function block(head: string, from = 0): string {
  const start = css.indexOf(head, from);
  expect(start, head).toBeGreaterThan(-1);
  const open = css.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}' && --depth === 0) return css.slice(open + 1, i);
  }
  throw new Error(`unclosed block ${head}`);
}

const GATE = '@media screen and (width >= 64rem) and (prefers-reduced-motion: no-preference)';
/** The gated families block: inside the scroll-timeline support check. */
const families = (() => {
  const at = css.indexOf(GATE);
  expect(at).toBeGreaterThan(-1);
  const supports = css.lastIndexOf('@supports (animation-timeline: view())', at);
  expect(css.slice(supports, at)).not.toContain('}');
  return block(GATE);
})();
const still = block('@media (prefers-reduced-motion: reduce), print');

describe('Drift', () => {
  it('arrives from a lower corner out of depth and ends on none, opaque by mid-range', () => {
    for (const [name, x, turn] of [['bl', '-64px', '8deg'], ['br', '64px', '-8deg']] as const) {
      const kf = block(`@keyframes depth-drift-${name}`);
      expect(kf).toMatch(new RegExp(`0%\\s*\\{\\s*opacity:\\s*0;\\s*transform:\\s*translate3d\\(${x}, 72px, -260px\\) rotateY\\(${turn}\\)`));
      expect(kf).toMatch(/50%\s*\{\s*opacity:\s*1;\s*\}/);
      expect(kf).toMatch(/100%\s*\{\s*opacity:\s*1;\s*transform:\s*none;\s*\}/);
    }
  });

  it('runs on its own view, fills backwards only, with the perspective on the immediate parent', () => {
    expect(families).toMatch(/:has\(> \[data-depth-drift\]\)\s*\{\s*perspective:\s*87\.5rem;\s*\}/);
    expect(families).toMatch(/\[data-depth-drift\]\s*\{[^}]*animation:\s*depth-drift-bl linear backwards[^}]*animation-timeline:\s*view\(\)/);
    expect(families).toMatch(/\[data-depth-drift="br"\]\s*\{[^}]*animation-name:\s*depth-drift-br/);
  });

  it('moves the grid wrapper of each automation card, never the card, which does not also rise', () => {
    const html = renderToStaticMarkup(createElement(AutomationTrack));
    const sides = [...html.matchAll(/data-depth-drift="(bl|br)"/g)].map((m) => m[1]);
    expect(sides).toEqual(['bl', 'br', 'bl', 'br']);
    expect(html).not.toMatch(/data-depth-lean=""[^>]*data-depth-drift|data-depth-drift[^>]*data-depth-lean/);
    const cards = [...html.matchAll(/<a [^>]*data-depth-lean=""[^>]*>/g)].map((m) => m[0]);
    expect(cards).toHaveLength(4);
    for (const c of cards) expect(c).not.toContain('data-depth-rise');
  });
});

describe('Hinge', () => {
  it('lifts on its bottom edge from a steep angle and ends on none', () => {
    const kf = block('@keyframes depth-hinge');
    expect(kf).toMatch(/from\s*\{\s*transform:\s*rotateX\(72deg\);\s*\}/);
    expect(kf).toMatch(/to\s*\{\s*transform:\s*none;\s*\}/);
    expect(families).toMatch(/\[data-depth-lean\] \[data-depth-hinge\]\s*\{[^}]*transform-origin:\s*50% 100%[^}]*animation:\s*depth-hinge linear backwards/);
    expect(families).toMatch(/\[data-depth-lean\] > \[data-vignette\]:has\(> \[data-depth-hinge\]\)\s*\{\s*perspective:\s*87\.5rem;\s*\}/);
  });

  it('is the vignette sheet in every sketch', () => {
    const html = renderToStaticMarkup(createElement(Vignette, null, 'x'));
    expect(html).toContain('<div data-vignette-sheet="" data-depth-hinge="">');
  });
});

describe('every family', () => {
  it('jumps to the final layout when a control inside it has focus', () => {
    expect(families).toMatch(/\[data-depth-drift\]:focus-within,\s*\[data-depth-hinge\]:focus-within[^{]*\{\s*animation:\s*none;?\s*\}/);
  });

  it('stops under reduced motion and in print', () => {
    for (const part of ['[data-depth-drift]', '[data-depth-hinge]']) expect(still).toContain(part);
  });

  it('never fills forwards: a finished block is no longer a layer', () => {
    for (const m of families.matchAll(/animation:\s*depth-[a-z-]+ linear (\w+)/g)) expect(m[1]).toBe('backwards');
  });
});
