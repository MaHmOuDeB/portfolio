import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The Home motion rules in globals.css that markup tests cannot see: the band pins and unfolds
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

describe('the band: the stack that unfolds', () => {
  const PIN = '@media screen and (width >= 64rem) and (height >= 43.75rem) and (prefers-reduced-motion: no-preference)';
  const pin = block(PIN);

  it('pins and unfolds only inside the scroll-timeline support check, from lg, tall enough and with motion allowed', () => {
    const supports = block('@supports (animation-timeline: view()) and (position: sticky)');
    expect(supports).toContain(PIN);
    expect(css.split(PIN)).toHaveLength(2);
  });

  it('is a tall band on its own named view timeline, with a sticky pin under the header', () => {
    expect(pin).toMatch(/\[data-depth-band\]\s*\{[^}]*height:\s*175vh[^}]*view-timeline:\s*--depth-band block[^}]*view-timeline-inset:\s*var\(--header-h\) 0/);
    expect(pin).toMatch(/\[data-depth-pin\]\s*\{[^}]*position:\s*sticky[^}]*top:\s*calc\(var\(--header-h\)/);
  });

  it('unfolds the rig, the three sheets and the two links on the band timeline only', () => {
    expect(pin).toMatch(/\[data-depth-rig\]\s*\{[^}]*animation:\s*depth-rig[^}]*animation-timeline:\s*--depth-band/);
    for (const n of [1, 2, 3]) {
      expect(pin).toMatch(new RegExp(`\\[data-depth-sheet="${n}"\\]\\s*\\{[^}]*animation:\\s*depth-sheet-${n}[^}]*animation-timeline:\\s*--depth-band`));
    }
    expect(pin).toMatch(/\[data-depth-link\]\s*\{[^}]*animation:\s*depth-link[^}]*animation-timeline:\s*--depth-band/);
    // Every scroll-linked animation of the band names the band's timeline, never view() or scroll().
    for (const m of pin.matchAll(/animation-timeline:\s*([^;]+);/g)) expect(m[1]).toBe('--depth-band');
  });

  it('rests, everywhere else on a wide screen, in the isometric pose and leans to the pointer', () => {
    // A shallower tilt and a larger scale than the first pose, so the sheet text reads while stacked.
    expect(css).toMatch(/\[data-depth-rig\]\s*\{[^}]*transform:\s*translate\(-75px, 122px\) rotateX\(52deg\) rotateZ\(-34deg\) scale\(1\.1\)/);
    expect(css).toMatch(/\[data-depth-tilt\]\s*\{[^}]*transform:\s*rotateX\(calc\(var\(--my, 0\) \* -4deg\)\) rotateY\(calc\(var\(--mx, 0\) \* 6deg\)\)/);
    expect(block('@keyframes depth-rig')).toMatch(/to\s*\{\s*transform:\s*none/);
  });

  it('keeps each sheet flat in the rig\'s one 3D context, its edge an offset slab in the same plane that slides back as it unfolds', () => {
    const sheet = /\[data-depth-sheet\]\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(sheet).not.toMatch(/preserve-3d/);
    expect(sheet).toMatch(/isolation:\s*isolate/);
    expect(css).not.toMatch(/translateZ\(-8px\)/);
    expect(css).toMatch(/\[data-depth-sheet\]::after\s*\{[^}]*z-index:\s*-2[^}]*translate:\s*-6px 8px/);
    expect(block('@keyframes depth-slab')).toMatch(/to\s*\{\s*translate:\s*none/);
    expect(pin).toMatch(/\[data-depth-sheet\]::after\s*\{[^}]*animation:\s*depth-slab[^}]*animation-timeline:\s*--depth-band/);
    expect(block('@media (prefers-reduced-motion: reduce), print')).toMatch(/\[data-depth-sheet\]::after\s*\{[^}]*animation:\s*none[^}]*translate:\s*none/);
  });

  it('below lg is a static vertical column: no pin, no pose, no lean, no links', () => {
    const narrow = block('@media (width < 64rem)');
    expect(narrow).toMatch(/\[data-depth-rig\]\s*\{[^}]*flex-direction:\s*column[^}]*transform:\s*none/);
    // Positioned, not static: each sheet's face is an absolute ::before and must resolve against its own sheet.
    expect(narrow).toMatch(/\[data-depth-sheet\]\s*\{[^}]*position:\s*relative[^}]*transform:\s*none/);
    expect(narrow).toMatch(/\[data-depth-tilt\]\s*\{[^}]*transform:\s*none/);
    expect(narrow).toMatch(/\[data-depth-link\]\s*\{[^}]*display:\s*none/);
    expect(narrow).not.toMatch(/sticky|animation-timeline/);
  });

  it('under reduced motion and in print is the flat row, still', () => {
    const still = block('@media (prefers-reduced-motion: reduce), print');
    expect(still).toMatch(/\[data-depth-rig\],\s*\[data-depth-sheet\],\s*\[data-depth-tilt\]\s*\{[^}]*transform:\s*none/);
    expect(still).toMatch(/\[data-depth-link\]\s*\{[^}]*opacity:\s*1[^}]*transform:\s*none/);
    for (const part of ['[data-depth-arrive]', '[data-depth-rig]', '[data-depth-sheet]', '[data-depth-link]', '[data-depth-close]']) {
      expect(still).toContain(part);
    }
    expect(still).toMatch(/animation:\s*none/);
  });

  it('arrives once on load, the sheets in turn', () => {
    expect(css).toMatch(/\[data-depth-arrive\]\s*\{[^}]*animation:\s*depth-sheet-arrive var\(--duration-arrive\)[^}]*animation-delay:\s*calc\(var\(--n, 0\) \* 140ms \+ 200ms\)/);
  });

  it('never clips with overflow hidden on the band, and keeps the old field and hero scene gone', () => {
    expect(css).not.toMatch(/overflow:\s*hidden/);
    for (const gone of ['data-depth-field', 'data-depth-plane', 'data-depth-row', 'data-depth-axis', 'data-depth-scene', 'data-hero-pin', 'data-depth-recede', 'depth-plane-face', 'depth-recede', 'depth-row-arrive']) {
      expect(css, gone).not.toContain(gone);
    }
  });

  it('names every keyframe depth-* (or the scroll moment)', () => {
    for (const [, name] of css.matchAll(/@keyframes\s+([\w-]+)/g)) expect(name).toMatch(/^(depth-|scroll-moment-)/);
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
    expect(fades.map((f) => f.name).sort()).toEqual(['depth-link', 'depth-load', 'depth-rise-heading', 'depth-sheet-arrive']);
    for (const { name, body } of fades) expect(body, name).toMatch(/50%\s*\{\s*opacity:\s*1;\s*\}/);
  });

  it('never fades a card, tile, drift wrapper, book or scale block in: they arrive by transform only', () => {
    // Such a block is taller than its first lines, so its heading is fully in view while the block is
    // still part way in. Every animation applied to one (bar the heading variant of the rise) is read
    // from the rules that name it, and none of its keyframes may touch opacity.
    const blocks = /\[data-(?:depth-lean|tile|depth-drift|depth-book|depth-scale|depth-rise)(?:="(?!heading")[^"]*")?\]/;
    const names = new Set<string>();
    for (const [, selector, body] of css.matchAll(/([^{};]+)\{([^{}]*)\}/g)) {
      if (!selector!.split(',').some((part) => blocks.test(part) && !/\s/.test(part.trim().replace(/:[a-z-]+(\([^)]*\))?/g, '')))) continue;
      for (const [, name] of body!.matchAll(/animation(?:-name)?:\s*(depth-[a-z-]+)/g)) names.add(name!);
    }
    expect([...names].sort()).toEqual(
      expect.arrayContaining(['depth-book-left', 'depth-book-right', 'depth-drift-bl', 'depth-drift-br', 'depth-drift-tl', 'depth-drift-tr', 'depth-rise', 'depth-scale']),
    );
    expect(names).not.toContain('depth-rise-heading');
    for (const name of names) expect(block(`@keyframes ${name} {`), name).not.toContain('opacity');
  });

  it('gives the rise a perspective in rem, 1400 px at the default root, so a larger text size never spills a block past the screen', () => {
    expect(tokens).toContain('--perspective-scene: 1300px;');
    expect(css).toMatch(/:has\(> \[data-depth-rise\]\)\s*\{\s*perspective:\s*87\.5rem;\s*\}/);
  });
});

describe('the live bar', () => {
  it('is an ink strip from rail to rail, its link light on ink with the 44 px target kept', () => {
    expect(css).toMatch(/\[data-live-bar\]\s*\{[^}]*margin-inline:\s*calc\(var\(--frame-pad, 0\) \* -1\)[^}]*background:\s*var\(--color-ink\)[^}]*color:\s*var\(--color-on-ink\)/);
    // Unlayered, so the link's muted utility cannot win on ink.
    expect(css).toMatch(/\[data-live-bar\] a(?::[a-z-]+)?[^{]*\{[^}]*color:\s*var\(--color-surface\)/);
    expect(css).not.toMatch(/\[data-live-bar\] a[^{]*\{[^}]*min-height/);
  });
});

describe('the proof figures', () => {
  it('stay on one line, with the words around the number set smaller', () => {
    expect(css).toMatch(/\[data-proof-figure\]\s*\{[^}]*white-space:\s*nowrap/);
    expect(css).toMatch(/\[data-proof-unit\]\s*\{[^}]*font-size:\s*0\.\d+em/);
  });

  it('are four cells ruled by hairlines, never the old grey line', () => {
    expect(css).toMatch(/\[data-home-proof\]\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/);
    // Four equal columns: the outer two lose one padding each, so their tracks are that much narrower.
    expect(css).toMatch(/\[data-home-proof\]\s*\{[^}]*grid-template-columns:\s*minmax\(0, calc\(25% - var\(--spacing\) \* 3\)\) repeat\(2, minmax\(0, 1fr\)\) minmax\(0, calc\(25% - var\(--spacing\) \* 3\)\)/);
    expect(css).toMatch(/\[data-proof\]\s*\{[^}]*border-left:\s*1px solid var\(--color-hairline\)/);
    expect(css).not.toContain('var(--color-line)');
  });
});

describe('the ribbon', () => {
  it('fades both edges with a mask and keeps its first item in view at the start', () => {
    expect(css).toMatch(/\[data-depth-ribbon\]\s*\{[^}]*mask-image:\s*linear-gradient\(\s*to right,\s*var\(--color-clear\)/);
    expect(block('@keyframes depth-ribbon')).toMatch(/from\s*\{\s*translate:\s*0 0/);
  });

  it('runs on one line only from sm up where it can move, so it stays readable and static otherwise', () => {
    const moving = block('@media screen and (width >= 40rem) and (prefers-reduced-motion: no-preference)');
    expect(moving).toMatch(/\[data-depth-ribbon\] > ul\s*\{[^}]*flex-wrap:\s*nowrap/);
    expect(css).not.toContain('@media screen and (prefers-reduced-motion: no-preference) {\n    @layer components {\n      [data-depth-ribbon] > ul');
    expect(css).toMatch(/\[data-depth-ribbon\] ul\s*\{[^}]*flex-wrap:\s*wrap/);
  });

  it('wraps the still question rows two chips to a line, so no chip is left alone, and lifts the cap where they slide', () => {
    expect(css).toMatch(/\[data-home-questions\] \[data-depth-ribbon\] > ul\s*\{[^}]*max-width:\s*46rem/);
    const moving = block('@media screen and (width >= 40rem) and (prefers-reduced-motion: no-preference)');
    expect(moving).toMatch(/\[data-home-questions\] \[data-depth-ribbon\] > ul\s*\{[^}]*max-width:\s*none/);
  });

  it('never lets one item be wider than its row: a long question wraps its own text instead of being clipped', () => {
    expect(css).toMatch(/\[data-depth-ribbon\] li\s*\{[^}]*max-width:\s*100cqi/);
  });
});

describe('accessibility guards', () => {
  it('lets every large heading break a long word, so text-only enlargement never overflows at 320 px', () => {
    expect(css).toMatch(/\[data-hero\] h1\s*\{[^}]*overflow-wrap:\s*anywhere/);
    expect(css).toMatch(/\[data-section-head\] h2,\s*\[data-page-head\] h1\s*\{[^}]*overflow-wrap:\s*anywhere/);
    expect(css).toMatch(/:is\(h1, h2, h3\):is\(\[class\*="text-display"\], \[class\*="text-h2"\]\)\s*\{[^}]*overflow-wrap:\s*anywhere/);
  });

  // The reduced-motion and print block, the last one in the file.
  const still = block('@media (prefers-reduced-motion: reduce), print');
  // The scroll-timeline block that holds rise, book, scale and reveal.
  const timelines = block('@supports (animation-timeline: view()) {\n  @layer components {\n    :has(> [data-depth-rise])');

  it('keeps the lean card glint light, so muted text on a hovered card keeps its contrast', () => {
    expect(tokens).toContain('--color-glint: color-mix(in srgb, var(--color-surface) 70%, transparent);');
  });

  it('never leaves a focused control inside a scroll-linked entrance at opacity 0', () => {
    expect(timelines).toMatch(
      /\[data-depth-rise\]:focus-within,\s*\[data-depth-book\]:focus-within,\s*\[data-depth-scale\]:focus-within\s*\{\s*animation:\s*none;?\s*\}/,
    );
  });

  it('never leaves a focused hero button inside the load sequence at opacity 0', () => {
    expect(css).toMatch(/\[data-depth-load\]:focus-within\s*\{\s*animation:\s*none;?\s*\}/);
  });

  it('ends the ribbon slide a little before mid-screen, so every tool has been in full view while the ribbon is still low', () => {
    expect(timelines).toMatch(/\[data-depth-ribbon\] > ul\s*\{[^}]*animation-range:\s*cover 0% cover 45%/);
  });

  it('keeps the lean card one flat plane: no 3D context under its clip and no part standing off its face', () => {
    const card = /\[data-depth-lean\]\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(card).toMatch(/overflow:\s*clip/);
    expect(card).not.toMatch(/preserve-3d/);
    expect(css).not.toMatch(/translateZ\(\d+px\)/);
  });

  it('animates no clip-path on the main thread: the old reveal is gone', () => {
    expect(css).not.toContain('depth-reveal');
  });

  it('lets an entrance that ends on the final layout stop applying once it is done (backwards, not both)', () => {
    for (const name of ['depth-rise', 'depth-draw', 'depth-book-left', 'depth-book-right', 'depth-scale']) {
      expect(timelines, name).toContain(`animation: ${name} linear backwards;`);
    }
  });

  it('pins the band on screens only, never in print', () => {
    expect(css).toContain('@media screen and (width >= 64rem) and (height >= 43.75rem) and (prefers-reduced-motion: no-preference)');
    expect(css).not.toContain('@media (width >= 64rem) and (height >= 43.75rem)');
  });
});

describe('the magnet and the header', () => {
  it('moves the magnet in whole pixels', () => {
    expect(css).toMatch(/\[data-depth-magnet\]\s*\{[^}]*translate:\s*round\(var\(--tx\), 1px\) round\(var\(--ty\), 1px\)/);
  });

  it('keeps the header opaque, with no backdrop filter anywhere (it would cost every page its subpixel text)', () => {
    expect(css).toMatch(/\[data-site-header\]\s*\{\s*background-color:\s*var\(--color-bg\);/);
    expect(css).not.toMatch(/backdrop-filter\s*:/);
    expect(tokens).not.toContain('--color-header-cover');
  });
});
