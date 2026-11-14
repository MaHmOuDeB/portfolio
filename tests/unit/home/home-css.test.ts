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
  const pin = block('@media (width >= 64rem) and (height >= 43.75rem) and (prefers-reduced-motion: no-preference)');

  it('pins and turns only inside the scroll-timeline support check, from lg and with motion allowed', () => {
    const supports = block('@supports (animation-timeline: view()) and (position: sticky)');
    expect(supports).toContain('@media (width >= 64rem) and (height >= 43.75rem) and (prefers-reduced-motion: no-preference)');
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

describe('the magnet and the header', () => {
  it('moves the magnet in whole pixels', () => {
    expect(css).toMatch(/\[data-depth-magnet\]\s*\{[^}]*translate:\s*round\(var\(--tx\), 1px\) round\(var\(--ty\), 1px\)/);
  });

  it('keeps the header cover at 96 percent (80 percent fails 4.5:1 over the ink tile)', () => {
    expect(css).toContain('background-color: var(--color-header-cover);');
    expect(tokens).toContain('--color-header-cover: color-mix(in srgb, var(--color-bg) 96%, transparent);');
  });
});
