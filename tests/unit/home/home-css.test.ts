import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The Home motion rules in globals.css that markup tests cannot see: the hero scene pins and turns
// only where scroll timelines exist, motion is allowed and the screen is wide; the proof figures
// keep one line; the ribbon starts in view and fades at both edges; the magnet lands on whole
// pixels; the header cover stays at the share that keeps the muted nav text at 4.5:1.
const tokens = readFileSync(join(__dirname, '..', '..', '..', 'src/styles/tokens.css'), 'utf8');
const css = readFileSync(join(__dirname, '..', '..', '..', 'src/app/globals.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** The body of the first block that starts with `head` (balanced braces). */
function block(head: string): string {
  const start = css.indexOf(head);
  expect(start, head).toBeGreaterThan(-1);
  const open = css.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}' && --depth === 0) return css.slice(open + 1, i);
  }
  throw new Error(`unclosed block ${head}`);
}

describe('the hero scene', () => {
  const pin = block('@media screen and (width >= 64rem) and (height >= 43.75rem) and (prefers-reduced-motion: no-preference)');

  it('pins and turns only inside the scroll-timeline support check, from lg and with motion allowed', () => {
    const supports = block('@supports (animation-timeline: view()) and (position: sticky)');
    expect(supports).toContain('@media screen and (width >= 64rem) and (height >= 43.75rem) and (prefers-reduced-motion: no-preference)');
  });

  it('is a tall scene with a sticky inner under the header, a viewport minus the header tall', () => {
    expect(pin).toMatch(/\[data-depth-scene\]\s*\{[^}]*height:\s*190vh/);
    expect(pin).toMatch(/\[data-hero-pin\]\s*\{[^}]*position:\s*sticky[^}]*top:\s*var\(--header-h\)[^}]*height:\s*calc\(100vh - var\(--header-h\)\)/);
    // A block taller than the pin starts at its top instead of spilling above it under the header.
    expect(pin).toMatch(/\[data-hero-pin\]\s*\{[^}]*align-content:\s*safe center/);
  });

  it('turns the plane and recedes the text on the scene timeline', () => {
    expect(pin).toMatch(/\[data-depth-scene\]\s*\{[^}]*view-timeline:\s*--depth-scene block/);
    expect(pin).toMatch(/\[data-depth-plane\]\s*\{[^}]*animation:\s*depth-plane-face[^}]*animation-timeline:\s*--depth-scene/);
    expect(pin).toMatch(/\[data-depth-recede\]\s*\{[^}]*animation-timeline:\s*--depth-scene/);
  });

  it('starts the turn from the tilted plane', () => {
    expect(block('@keyframes depth-plane-face')).toMatch(/from\s*\{\s*transform:\s*rotateX\(58deg\) rotateZ\(-12deg\) scale\(0\.94\)/);
  });

  it('centres the plane in the field box itself, so the box can reserve the height the plane takes', () => {
    // An auto row would grow to the plane's full 520 px and push the scaled plane below the box.
    expect(css).toMatch(/\[data-depth-field\]\s*\{[^}]*grid-template-rows:\s*minmax\(0, 1fr\)/);
  });

  it('below lg, reserves the measured footprint of the scaled plane and lifts it by its downward skew', () => {
    // Measured in the browser: the tilted plane with its axis words is about 515 px times --k tall,
    // its centre about 46 px times --k below the box centre.
    const narrow = block('@media (width < 64rem)');
    expect(narrow).toMatch(/\[data-depth-field\]\s*\{[^}]*height:\s*calc\(33rem \* var\(--k\)\)/);
    expect(narrow).toMatch(/\[data-depth-tilt\]\s*\{[^}]*translate:\s*0 calc\(-2\.875rem \* var\(--k, 1\)\)/);
    for (const w of ['40rem', '30rem']) expect(block(`@media (width < ${w})`)).not.toMatch(/height:/);
  });

  it('sizes the plane in px, like the rows on it, so a larger root text size never widens it past the screen', () => {
    // Sized in rem, a 200% root text doubled the plane while its px rows stayed put, and the square
    // ran 88 px past a 320 px screen.
    expect(css).toMatch(/\[data-depth-plane\]\s*\{[^}]*width:\s*520px;[^}]*height:\s*520px;/);
  });

  it('ends every fade-in by the middle of its range, so a block whose painted box is in view is never part-faded', () => {
    // Each entrance also moves its block, so the painted box is fully in view before the range ends.
    const fades = [...css.matchAll(/@keyframes\s+([\w-]+)\s*\{/g)]
      .map(([, name]) => ({ name: name!, body: block(`@keyframes ${name}`) }))
      .filter(({ body }) => {
        const from = /(?:from|0%)\s*\{([^}]*)\}/.exec(body)?.[1] ?? '';
        const opacity = /opacity:\s*([\d.]+)/.exec(from);
        return opacity !== null && Number(opacity[1]) < 1;
      });
    expect(fades.map((f) => f.name)).toEqual(expect.arrayContaining(['depth-rise', 'depth-rise-heading', 'depth-book-left', 'depth-book-right', 'depth-scale']));
    for (const { name, body } of fades) expect(body, name).toMatch(/50%\s*\{\s*opacity:\s*1;\s*\}/);
  });

  it('gives the rise a perspective in rem, 1400 px at the default root, so a larger text size never spills a block past the screen', () => {
    expect(tokens).toContain('--perspective-scene: 1300px;');
    expect(css).toMatch(/:has\(> \[data-depth-rise\]\)\s*\{\s*perspective:\s*87\.5rem;\s*\}/);
  });

  it('keeps the axis words at the text-xs size whatever the field scale', () => {
    expect(css).toMatch(/\[data-depth-axis\]\s*\{[^}]*font-size:\s*calc\(var\(--text-xs\) \/ var\(--k, 1\)\)/);
  });

  it('never clips with overflow hidden around the hero controls', () => {
    expect(pin).not.toMatch(/overflow:\s*hidden/);
    expect(pin).not.toMatch(/\[data-hero-pin\]\s*\{[^}]*overflow/);
  });
});

describe('the proof figures', () => {
  it('stay on one line, with the words around the number set smaller', () => {
    expect(css).toMatch(/\[data-proof-figure\]\s*\{[^}]*white-space:\s*nowrap/);
    expect(css).toMatch(/\[data-proof-unit\]\s*\{[^}]*font-size:\s*0\.\d+em/);
  });
});

describe('the ribbon', () => {
  it('fades both edges with a mask and keeps its first item in view at the start', () => {
    expect(css).toMatch(/\[data-depth-ribbon\]\s*\{[^}]*mask-image:\s*linear-gradient\(\s*to right,\s*var\(--color-clear\)/);
    expect(block('@keyframes depth-ribbon')).toMatch(/from\s*\{\s*translate:\s*0 0/);
  });

  it('runs on one line only where it can move, so it stays readable and static otherwise', () => {
    const moving = block('@media screen and (prefers-reduced-motion: no-preference)');
    expect(moving).toMatch(/\[data-depth-ribbon\] > ul\s*\{[^}]*flex-wrap:\s*nowrap/);
    expect(css).toMatch(/\[data-depth-ribbon\] ul\s*\{[^}]*flex-wrap:\s*wrap/);
  });
});

describe('accessibility guards', () => {
  // The reduced-motion and print block, the last one in the file.
  const still = block('@media (prefers-reduced-motion: reduce), print');
  // The scroll-timeline block that holds rise, book, scale and reveal.
  const timelines = block('@supports (animation-timeline: view()) {\n  @layer components {\n    :has(> [data-depth-rise])');

  it('keeps the lean card glint light, so muted text on a hovered card keeps its contrast', () => {
    expect(tokens).toContain('--color-glint: color-mix(in srgb, var(--color-bg) 70%, transparent);');
  });

  it('never leaves a focused control inside a scroll-linked entrance at opacity 0', () => {
    expect(timelines).toMatch(
      /\[data-depth-rise\]:focus-within,\s*\[data-depth-book\]:focus-within,\s*\[data-depth-scale\]:focus-within,\s*\[data-depth-reveal\]:focus-within\s*\{\s*animation:\s*none;?\s*\}/,
    );
  });

  it('never leaves a focused hero button inside the load sequence at opacity 0', () => {
    expect(css).toMatch(/\[data-depth-load\]:focus-within\s*\{\s*animation:\s*none;?\s*\}/);
  });

  it('ends the ribbon slide a little before mid-screen, so every tool has been in full view while the ribbon is still low', () => {
    expect(timelines).toMatch(/\[data-depth-ribbon\] > ul\s*\{[^}]*animation-range:\s*cover 0% cover 45%/);
  });

  it('flattens the card parts that stand off the face under reduced motion', () => {
    expect(still).toMatch(/\[data-depth-lean\] :is\(h3, p, \[data-depth-meta\], \[data-depth-go\]\)\s*\{\s*transform:\s*none;?\s*\}/);
  });

  it('pins the hero on screens only, never in print', () => {
    expect(css).toContain('@media screen and (width >= 64rem) and (height >= 43.75rem) and (prefers-reduced-motion: no-preference)');
    expect(css).not.toContain('@media (width >= 64rem) and (height >= 43.75rem)');
  });
});

describe('the magnet and the header', () => {
  it('moves the magnet in whole pixels', () => {
    expect(css).toMatch(/\[data-depth-magnet\]\s*\{[^}]*translate:\s*round\(var\(--tx\), 1px\) round\(var\(--ty\), 1px\)/);
  });

  it('keeps the header cover at 96 percent (80 percent fails 4.5:1 over the ink tile)', () => {
    expect(css).toContain('background-color: var(--color-header-cover);');
    expect(tokens).toContain('--color-header-cover: color-mix(in srgb, var(--color-bg) 96%, transparent);');
  });
});
