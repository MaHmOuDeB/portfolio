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
    for (const [name, x, turn] of [['bl', '-32px', '8deg'], ['br', '32px', '-8deg']] as const) {
      const kf = block(`@keyframes depth-drift-${name}`);
      expect(kf).toMatch(new RegExp(`0%\\s*\\{\\s*opacity:\\s*0;\\s*transform:\\s*perspective\\(87\\.5rem\\) translate3d\\(${x}, 72px, -260px\\) rotateY\\(${turn}\\)`));
      expect(kf).toMatch(/50%\s*\{\s*opacity:\s*1;\s*\}/);
      expect(kf).toMatch(/100%\s*\{\s*opacity:\s*1;\s*transform:\s*none;\s*\}/);
    }
  });

  it('runs on its own view, fills backwards only, with the perspective on the immediate parent', () => {
    // Each drift has its own perspective, its vanishing point at its corner: no parent perspective.
    expect(families).not.toMatch(/:has\(> \[data-depth-drift/);
    expect(families).toMatch(/\[data-depth-drift\]\s*\{[^}]*animation:\s*depth-drift-bl linear backwards[^}]*animation-timeline:\s*view\(\)/);
    expect(families).toMatch(/\[data-depth-drift="br"\]\s*\{[^}]*animation-name:\s*depth-drift-br/);
  });

  it('moves the grid wrapper of each automation card, never the card, which does not also rise', () => {
    const html = renderToStaticMarkup(createElement(AutomationTrack));
    const sides = [...html.matchAll(/data-depth-drift="(bl|br)"/g)].map((m) => m[1]);
    expect(sides).toEqual(['bl', 'br', 'bl', 'br']);
    expect(html).not.toMatch(/data-depth-lean=""[^>]*data-depth-drift|data-depth-drift[^>]*data-depth-lean/);
    // The wrapper is a bounded one-column grid: an auto column would let a card's widest sketch row
    // push the page sideways at 320 px with enlarged text.
    for (const m of html.matchAll(/<div[^>]*data-depth-drift="(?:bl|br)"[^>]*>/g)) {
      expect(m[0]).toMatch(/class="[^"]*\bgrid-cols-1\b/);
      expect(m[0]).toMatch(/class="[^"]*\bmin-w-0\b/);
    }
    const cards = [...html.matchAll(/<a [^>]*data-depth-lean=""[^>]*>/g)].map((m) => m[0]);
    expect(cards).toHaveLength(4);
    for (const c of cards) expect(c).not.toContain('data-depth-rise');
  });
});

describe('Hinge', () => {
  it('lifts on its bottom edge from a steep angle and ends on none', () => {
    const kf = block('@keyframes depth-hinge {');
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

describe('the portraits', () => {
  it('pulls the call to action portrait into focus: the one clip-path animation, with the photo settling inside', () => {
    expect(block('@keyframes depth-focus')).toMatch(/from\s*\{\s*clip-path:\s*inset\(10% round 12px\);\s*\}\s*to\s*\{\s*clip-path:\s*inset\(0 round 12px\);/);
    expect(block('@keyframes depth-focus-in')).toMatch(/from\s*\{\s*transform:\s*scale\(1\.08\);\s*\}\s*to\s*\{\s*transform:\s*none;/);
    expect(families).toMatch(/\[data-depth-focus\]\s*\{[^}]*animation:\s*depth-focus linear backwards/);
    expect(families).toMatch(/\[data-depth-focus\] > img\s*\{[^}]*animation:\s*depth-focus-in linear backwards/);
    // Only one element animates a clip-path.
    const clipFrames = [...css.matchAll(/@keyframes ([a-z-]+)\s*\{[^@]*?clip-path/g)].map((m) => m[1]);
    expect(clipFrames).toEqual(['depth-focus']);
  });

  it('drifts the call to action media from the top right with a fade, and About\'s portrait from the top left once on load, by transform only', () => {
    const tr = block('@keyframes depth-drift-tr');
    expect(tr).toMatch(/0%\s*\{\s*opacity:\s*0;\s*transform:\s*perspective\(87\.5rem\) translate3d\(32px, -32px, -200px\) rotateY\(-8deg\)/);
    expect(tr).toMatch(/50%\s*\{\s*opacity:\s*1;\s*\}/);
    const tl = block('@keyframes depth-drift-tl');
    expect(tl).not.toContain('opacity');
    // No turn: the portrait keeps its 4 by 5 shape at every frame (depth scales it evenly).
    expect(tl).toMatch(/from\s*\{\s*transform:\s*perspective\(87\.5rem\) translate3d\(-32px, -32px, -200px\);/);
    expect(tl).not.toMatch(/rotate/);
    expect(tl).toMatch(/to\s*\{\s*transform:\s*none;/);
    expect(families).toMatch(/\[data-depth-drift="tl"\]\s*\{[^}]*animation:\s*depth-drift-tl var\(--duration-arrive\) var\(--ease-standard\) backwards/);
  });

  it('marks the call to action a pointer scene only when it has media, the media drifting', async () => {
    const { CallToAction } = await import('@/components/frame/CallToAction');
    const base = { id: 'x', title: 't', line: 'l', primary: { label: 'p', href: '/p' }, secondary: { label: 's', href: '/s' } };
    const plain = renderToStaticMarkup(createElement(CallToAction, base));
    expect(plain).not.toContain('data-depth-follow');
    expect(plain).not.toContain('data-depth-drift');
    const withMedia = renderToStaticMarkup(createElement(CallToAction, { ...base, media: createElement('img', { alt: '' }) }));
    expect(withMedia).toMatch(/<section [^>]*data-depth-follow=""/);
    expect(withMedia).toContain('<div data-cta-media="" data-depth-drift="tr">');
    const { HomeCallToAction } = await import('@/components/home/HomeCallToAction');
    expect(renderToStaticMarkup(createElement(HomeCallToAction))).toMatch(/<div data-depth-focus=""[^>]*><img /);
  });

  it('shifts the portrait and the text as two planes only on a fine pointer, the text in whole pixels, and never under reduced motion', () => {
    const pointer = block('@media (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)');
    expect(pointer).toMatch(/\[data-depth-follow\] \[data-cta-media\]\s*\{[^}]*translate:\s*calc\(var\(--mx\) \* 6px\) calc\(var\(--my\) \* 4px\)/);
    expect(pointer).toMatch(/\[data-depth-follow\] \[data-cta-text\]\s*\{[^}]*translate:\s*round\(calc\(var\(--mx\) \* -2px\), 1px\)/);
    expect(still).toMatch(/\[data-depth-follow\] :is\(\[data-cta-media\], \[data-cta-text\]\),[^{]*\{\s*translate:\s*none;/);
    for (const part of ['[data-depth-focus]', '[data-depth-focus] > img']) expect(still).toContain(part);
    expect(families).toMatch(/\[data-depth-focus\]:focus-within/);
  });
});

describe('Turn', () => {
  it('turns the site-test sketch in on its centre to its own resting tilt, never drawing its band on', async () => {
    const kf = block('@keyframes depth-turn');
    expect(kf).toMatch(/from\s*\{\s*transform:\s*perspective\(56rem\) rotateY\(-28deg\) rotateX\(10deg\) translateZ\(-120px\);\s*\}/);
    expect(kf).not.toMatch(/\bto\b|100%/);
    expect(families).toMatch(/\[data-depth-turn\]\s*\{[^}]*transform-origin:\s*50% 50%[^}]*animation:\s*depth-turn linear backwards[^}]*animation-range:\s*entry 10% cover 45%/);
    const { SiteTile } = await import('@/components/home/SiteTile');
    const html = renderToStaticMarkup(createElement(SiteTile));
    expect(html).toMatch(/<div data-depth-turn="" data-depth-follow=""[^>]*rotateY\(-14deg\)[^>]*><div data-site-sketch=""/);
    expect(html).not.toMatch(/<path[^>]*data-depth/);
  });

  it('leans the sketch to a fine pointer with a sheen, and stops both under reduced motion', () => {
    const pointer = block('@media (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)');
    expect(pointer).toMatch(/\[data-depth-follow\] > \[data-site-sketch\]\s*\{[^}]*transform:\s*rotateY\(calc\(var\(--mx\) \* 4deg\)\)/);
    expect(pointer).toMatch(/\[data-depth-follow\] > \[data-site-sketch\]::after\s*\{[^}]*radial-gradient\(18rem circle at var\(--gx, 50%\) var\(--gy, -20%\)/);
    expect(still).toMatch(/\[data-depth-follow\] > \[data-site-sketch\]\s*\{\s*transform:\s*none;/);
    expect(still).toMatch(/\[data-depth-follow\] > \[data-site-sketch\]::after\s*\{\s*content:\s*none;/);
    expect(still).toContain('[data-depth-turn]');
    expect(families).toMatch(/\[data-depth-turn\]:focus-within/);
  });
});

describe('Trace', () => {
  it('draws hairlines and dots by scale alone, ending on none', () => {
    expect(block('@keyframes depth-trace-x')).toMatch(/from\s*\{\s*transform:\s*scaleX\(0\);\s*\}\s*to\s*\{\s*transform:\s*none;/);
    expect(block('@keyframes depth-trace-y')).toMatch(/from\s*\{\s*transform:\s*scaleY\(0\);\s*\}\s*to\s*\{\s*transform:\s*none;/);
    expect(block('@keyframes depth-dot')).toMatch(/from\s*\{\s*transform:\s*scale\(0\);\s*\}\s*to\s*\{\s*transform:\s*none;/);
  });

  it('runs its pseudo-elements on the container\'s own view timeline, the timeline dots on their row\'s', () => {
    expect(families).toMatch(/\[data-depth-trace\]\s*\{\s*view-timeline:\s*--depth-trace block;/);
    expect(families).toMatch(/\[data-depth-trace="timeline"\] > li\s*\{\s*view-timeline:\s*--depth-row block;/);
    expect(families).toMatch(/\[data-depth-trace="timeline"\] > li::before\s*\{[^}]*animation:\s*depth-dot linear backwards[^}]*animation-timeline:\s*--depth-row/);
    expect(families).toMatch(/\[data-depth-trace="timeline"\]::before\s*\{[^}]*animation:\s*depth-trace-y linear backwards[^}]*animation-range:\s*cover 10% cover 55%/);
    expect(families).toMatch(/\[data-experience-rule\]\s*\{[^}]*transform-origin:\s*50% 50%[^}]*animation:\s*depth-trace-x linear backwards/);
  });

  it('hides a real border only where its drawn rule replaces it, so the border is the fallback', () => {
    expect(families).toMatch(/\[data-depth-trace="proof"\] > \[data-proof\]:not\(:first-child\)\s*\{\s*border-left-color:\s*transparent;/);
    // The row's borders are utilities, so the rule that hides them is unlayered, inside the same gate.
    const gated = [...css.matchAll(new RegExp(GATE.replace(/[()[\]]/g, '\\$&'), 'g'))].map((m) => block(GATE, m.index));
    expect(gated.some((b) => /^\s*\[data-depth-trace="row"\] > li \+ li\s*\{\s*border-left-color:\s*transparent;/.test(b))).toBe(true);
    // Outside the gate the proof cells keep their real hairlines.
    expect(css).toMatch(/\[data-proof\]\s*\{[^}]*border-left:\s*1px solid var\(--color-hairline\)/);
  });

  it('marks the proof row, the experience groups, the ruled row and the About timeline', async () => {
    const { ProofRow } = await import('@/components/home/ProofRow');
    const { ExperienceBand } = await import('@/components/home/ExperienceBand');
    expect(renderToStaticMarkup(createElement(ProofRow))).toMatch(/<section data-home-proof="" data-rule="" data-depth-trace="proof"/);
    const band = renderToStaticMarkup(createElement(ExperienceBand));
    expect(band).toContain('<div data-experience-groups="" data-depth-trace="experience">');
    expect([...band.matchAll(/<span data-experience-rule="" aria-hidden="true"><\/span>/g)]).toHaveLength(2);
    expect(renderToStaticMarkup(createElement(AutomationTrack))).toContain('<ul role="list" data-depth-trace="row"');
  });

  it('keeps the static spine and dots in the base style and stops every draw under reduced motion and in print', () => {
    expect(css).toMatch(/\[data-depth-trace="timeline"\]::before\s*\{[^}]*content:\s*""[^}]*background:\s*var\(--color-hairline-strong\)/);
    for (const part of ['[data-experience-rule]', '[data-depth-trace]::before', '[data-depth-trace] > li::before', '[data-depth-trace] > [data-proof]::before']) {
      expect(still).toContain(part);
    }
    expect(families).toMatch(/\[data-depth-trace\]:focus-within::before,\s*\[data-depth-trace\]:focus-within > \*::before/);
  });
});

describe('the light on the band\'s ink sheet', () => {
  it('is a disc under the content, clipped to the sheet, that follows the stack\'s pointer values from lg, and is gone under reduced motion', async () => {
    const pointer = block('@media (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)');
    expect(pointer).toMatch(/\[data-depth-sheet\] > \[data-depth-glow\]\s*\{[^}]*z-index:\s*-1[^}]*overflow:\s*clip/);
    expect(pointer).toMatch(/\[data-depth-glow\]::before\s*\{[^}]*translate:\s*calc\(var\(--mx\) \* 6rem\) calc\(var\(--my\) \* 4rem\)/);
    expect(css).toMatch(/\[data-depth-glow\]\s*\{\s*display:\s*none;\s*\}/);
    expect(still).toMatch(/\[data-depth-glow\]\s*\{\s*display:\s*none;/);
    const { StackBand } = await import('@/components/depth/StackBand');
    expect(renderToStaticMarkup(createElement(StackBand))).toMatch(/<div data-depth-sheet="3"><span data-depth-glow=""><\/span>/);
  });
});

describe('"How I test"', () => {
  it('drifts the sketch panel in from the bottom right, the tabs still, and shifts its rows as layers on a fine pointer', async () => {
    const { HowITest } = await import('@/components/home/HowITest');
    const html = renderToStaticMarkup(createElement(HowITest));
    expect(html).toMatch(/<div data-depth-drift="br" data-depth-follow="" class="relative min-h-60[^"]*"><div data-how-panel="plan"/);
    expect(html).not.toMatch(/<label[^>]*data-depth/);
    const pointer = block('@media (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)');
    expect(pointer).toMatch(/\[data-depth-follow\] \[data-how-panel\] \[data-sketch\] > \*\s*\{[^}]*translate:\s*round\(calc\(var\(--mx\) \* var\(--z\) \* 2px\), 1px\)/);
    expect(still).toMatch(/\[data-depth-follow\] \[data-how-panel\] \[data-sketch\] > \*\s*\{\s*translate:\s*none;/);
  });
});

describe('the case study glance card', () => {
  it('lifts once on load by transform only, then its four facts settle in turn, from lg with motion allowed', () => {
    const kf = block('@keyframes depth-hinge-load');
    expect(kf).toMatch(/from\s*\{\s*transform:\s*perspective\(87\.5rem\) rotateX\(24deg\) translateZ\(-80px\);\s*\}\s*to\s*\{\s*transform:\s*none;/);
    expect(kf).not.toContain('opacity');
    const at = css.indexOf('[data-depth-hinge="load"] {');
    const media = css.lastIndexOf('@media', at);
    expect(css.slice(media, css.indexOf('{', media))).toBe(GATE + ' ');
    const load = block(GATE, media);
    expect(load).toMatch(/\[data-depth-hinge="load"\]\s*\{[^}]*transform-origin:\s*50% 100%[^}]*animation:\s*depth-hinge-load var\(--duration-arrive\) var\(--ease-standard\) backwards[^}]*animation-delay:\s*180ms/);
    const delays = [...load.matchAll(/\[data-glance-facts\] > div(?::nth-child\(\d\))?\s*\{[^}]*animation-delay:\s*(\d+)ms/g)].map((m) => Number(m[1]));
    expect(delays).toEqual([360, 420, 480, 540]);
    expect(load).toMatch(/\[data-depth-hinge="load"\]:focus-within,[^{]*\{\s*animation:\s*none;/);
    expect(still).toContain('[data-depth-hinge] [data-glance-facts] > div');
  });
});

describe('About\'s language cards', () => {
  it('open like pages on their outer edge, at 18 degrees, while every other book keeps 14', async () => {
    expect(block('@keyframes depth-book-left')).toMatch(/rotate:\s*y var\(--book-angle, 14deg\)/);
    expect(block('@keyframes depth-book-right')).toMatch(/rotate:\s*y calc\(var\(--book-angle, 14deg\) \* -1\)/);
    const { AboutPage } = await import('@/components/about/AboutPage');
    const html = renderToStaticMarkup(createElement(AboutPage));
    const dl = html.slice(html.indexOf('<dl data-about-languages'), html.indexOf('</dl>', html.indexOf('<dl data-about-languages')));
    const sides = [...dl.matchAll(/data-depth-book="(left|right)" class="[^"]*\[--book-angle:18deg\]/g)].map((m) => m[1]);
    expect(sides.length).toBeGreaterThan(1);
    expect(sides[0]).toBe('right');
    expect(sides.at(-1)).toBe('left');
  });
});
