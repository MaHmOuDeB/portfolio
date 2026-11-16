import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Motion below lg (phones and tablets): the Home band's sheets fan out and settle into the static
// column on the stack's own view timeline; Drift, Hinge (the on-load lid too) and Trace run at
// smaller amplitudes; a touch press sinks a clickable card or button a little. All of it only where
// scroll timelines exist and motion is allowed, on screens. Every entrance ends on the static layout
// and fills backwards only, so reduced motion, print and browsers without scroll timelines keep the
// still page, and the end state is exactly it. The desktop blocks are pinned by their own tests.
const css = readFileSync(join(import.meta.dirname, '../../../src/app/globals.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** The body of the first block that starts with `head` at or after `from` (balanced braces). */
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

const NARROW = '@media screen and (width < 64rem) and (prefers-reduced-motion: no-preference)';
const narrow = (() => {
  const at = css.indexOf(NARROW);
  expect(at, 'the narrow motion block').toBeGreaterThan(-1);
  // Directly inside the scroll-timeline support check.
  const supports = css.lastIndexOf('@supports (animation-timeline: view())', at);
  expect(supports).toBeGreaterThan(-1);
  expect(css.slice(supports, at).replace(/@supports \(animation-timeline: view\(\)\)\s*\{\s*/, '')).toBe('');
  return block(NARROW);
})();
const still = block('@media (prefers-reduced-motion: reduce), print');
const PRESS = '@media (hover: none) and (width < 64rem) and (prefers-reduced-motion: no-preference)';

/** The from-keyframe's transform functions, by name, with their numeric arguments. */
function fromTransform(name: string): Record<string, number[]> {
  const kf = block(`@keyframes ${name} {`);
  const from = /(?:from|0%)\s*\{\s*transform:\s*([^;]+);/.exec(kf)?.[1];
  expect(from, name).toBeDefined();
  const out: Record<string, number[]> = {};
  for (const [, fn, args] of from!.matchAll(/([a-zA-Z0-9]+)\(([^)]*)\)/g)) out[fn!] = args!.split(',').map((a) => parseFloat(a));
  return out;
}

describe('the fan of the band below lg', () => {
  it('settles the three sheets on the stack\'s own view timeline, while the stack enters', () => {
    expect(narrow).toMatch(/\[data-depth-stack\]\s*\{\s*view-timeline:\s*--depth-fan block;\s*\}/);
    expect(narrow).toMatch(/\[data-depth-sheet\]\s*\{[^}]*animation:\s*depth-fan-1 linear backwards;[^}]*animation-timeline:\s*--depth-fan;[^}]*animation-range:\s*entry 0% entry 100%/);
    expect(narrow).toMatch(/\[data-depth-sheet="2"\]\s*\{\s*animation-name:\s*depth-fan-2;\s*\}/);
    expect(narrow).toMatch(/\[data-depth-sheet="3"\]\s*\{\s*animation-name:\s*depth-fan-3;\s*\}/);
  });

  it('ends each sheet on none, by transform only, so its end state is the static column', () => {
    for (const n of [1, 2, 3]) {
      const kf = block(`@keyframes depth-fan-${n} {`);
      expect(kf).toMatch(/to\s*\{\s*transform:\s*none;\s*\}/);
      expect(kf).not.toContain('opacity');
    }
    // The column itself stays the static layout: the motion is only in the gated block.
    // (Other blocks below lg come first, such as the text wrapping in base: find the band's own.)
    const columns: string[] = [];
    for (let at = css.indexOf('@media (width < 64rem)'); at > -1; at = css.indexOf('@media (width < 64rem)', at + 1)) columns.push(block('@media (width < 64rem)', at));
    const column = columns.find((b) => /\[data-depth-sheet\]\s*\{/.test(b))!;
    expect(column, 'the static column below lg').toBeDefined();
    expect(column).toMatch(/\[data-depth-sheet\]\s*\{[^}]*transform:\s*none/);
    expect(column).not.toMatch(/animation/);
  });

  it('is a deck: tilted back, turned, overlapping like tiles, the test in front and each later sheet further back', () => {
    const [one, two, three] = [1, 2, 3].map((n) => fromTransform(`depth-fan-${n}`));
    for (const t of [one!, two!, three!]) expect(t.rotateX![0]).toBe(one!.rotateX![0]);
    expect(one!.rotateX![0]).toBeGreaterThan(0);
    expect(one!.translate3d![1]).toBeGreaterThan(0);
    expect(two!.translate3d![1]).toBe(0);
    expect(three!.translate3d![1]).toBe(-one!.translate3d![1]!);
    // The rig keeps its one 3D context below lg, so the sheets are sorted by depth, not by paint order.
    // The tilt brings a sheet's lower edge forward, so the sheet above must be the nearer one: then
    // the band where it overlaps the next sheet (its lower part over that sheet's upper part) is in
    // front however the in-plane turn lifts a corner. Each overlap is under half a sheet.
    const tilt = (one!.rotateX![0]! * Math.PI) / 180;
    const pitch = 210 + 12;
    for (const [upper, lower] of [[one!, two!], [two!, three!]] as const) {
      const turn = (Math.max(Math.abs(upper.rotateZ![0]!), Math.abs(lower.rotateZ![0]!)) * Math.PI) / 180;
      const lift = 160 * Math.sin(turn) * Math.sin(tilt);
      expect(upper.translate3d![2]! - lower.translate3d![2]!).toBeGreaterThan(2 * lift);
      expect(pitch - (upper.translate3d![1]! - lower.translate3d![1]!)).toBeGreaterThan(105);
    }
  });

  it('never reaches past the page gutter: no sideways travel, every corner behind the screen, a small turn', () => {
    const GUTTER = 16;
    for (const n of [1, 2, 3]) {
      const t = fromTransform(`depth-fan-${n}`);
      const [x, , z] = t.translate3d!;
      expect(x, `sheet ${n} travels sideways`).toBe(0);
      const tilt = (t.rotateX![0]! * Math.PI) / 180;
      const turn = (Math.abs(t.rotateZ![0]!) * Math.PI) / 180;
      // A 320 by 210 sheet (the column's widest), turned in its plane then tilted: its lowest corner
      // comes forward by the tilt; it must stay behind z = 0, so perspective only ever shrinks it.
      const reach = 105 * Math.cos(turn) + 160 * Math.sin(turn);
      expect(z! + reach * Math.sin(tilt), `sheet ${n} nearest corner`).toBeLessThanOrEqual(0);
      // The turn widens its box on each side by this much at most, at 288 px (a 320 px screen) and 320 px.
      for (const width of [288, 320]) {
        expect((width * Math.cos(turn) + 210 * Math.sin(turn) - width) / 2, `sheet ${n} at ${width}`).toBeLessThan(GUTTER);
      }
    }
  });

  it('is gone under reduced motion and in print, where every sheet is flat and still', () => {
    expect(still).toMatch(/\[data-depth-sheet\],/);
    expect(still).toMatch(/\[data-depth-rig\],\s*\[data-depth-sheet\],\s*\[data-depth-tilt\]\s*\{[^}]*transform:\s*none/);
  });
});

describe('Drift, Hinge and Trace below lg', () => {
  it('drifts from the same corners at smaller amplitudes, never sideways, by transform only', () => {
    for (const [corner, wide] of [['bl', 'bl'], ['br', 'br'], ['tr', 'tr'], ['tl', 'tl']] as const) {
      const small = fromTransform(`depth-drift-${corner}-narrow`);
      const big = fromTransform(`depth-drift-${wide}`);
      expect(small.translate3d![0], corner).toBe(0);
      expect(Math.abs(small.translate3d![1]!)).toBeLessThan(Math.abs(big.translate3d![1]!));
      expect(small.translate3d![2]).toBeLessThan(0);
      expect(Math.abs(small.translate3d![2]!)).toBeLessThan(Math.abs(big.translate3d![2]!));
      if (big.rotateY) expect(Math.abs(small.rotateY![0]!)).toBeLessThan(Math.abs(big.rotateY[0]!));
      expect(block(`@keyframes depth-drift-${corner}-narrow {`)).not.toContain('opacity');
    }
    expect(narrow).toMatch(/\[data-depth-drift\]\s*\{[^}]*transform-origin:\s*0% 100%[^}]*animation:\s*depth-drift-bl-narrow linear backwards[^}]*animation-timeline:\s*view\(\)/);
    expect(narrow).toMatch(/\[data-depth-drift="br"\]\s*\{[^}]*animation-name:\s*depth-drift-br-narrow/);
    expect(narrow).toMatch(/\[data-depth-drift="tr"\]\s*\{[^}]*animation-name:\s*depth-drift-tr-narrow/);
    expect(narrow).toMatch(/\[data-depth-drift="tl"\]\s*\{[^}]*animation:\s*depth-drift-tl-narrow var\(--duration-arrive\) var\(--ease-standard\) backwards/);
  });

  it('lifts the card lid and the glance card from shallower angles', () => {
    expect(fromTransform('depth-hinge-narrow').rotateX![0]).toBeLessThan(fromTransform('depth-hinge').rotateX![0]!);
    expect(fromTransform('depth-hinge-load-narrow').rotateX![0]).toBeLessThan(fromTransform('depth-hinge-load').rotateX![0]!);
    expect(narrow).toMatch(/\[data-depth-lean\] \[data-depth-hinge\]\s*\{[^}]*transform-origin:\s*50% 100%[^}]*animation:\s*depth-hinge-narrow linear backwards/);
    expect(narrow).toMatch(/\[data-depth-lean\] > \[data-vignette\]:has\(> \[data-depth-hinge\]\)\s*\{\s*perspective:\s*87\.5rem;\s*\}/);
    expect(narrow).toMatch(/\[data-depth-hinge="load"\]\s*\{[^}]*animation:\s*depth-hinge-load-narrow var\(--duration-arrive\) var\(--ease-standard\) backwards[^}]*animation-delay:\s*180ms/);
    const delays = [...narrow.matchAll(/\[data-glance-facts\] > div(?::nth-child\(\d\))?\s*\{[^}]*animation-delay:\s*(\d+)ms/g)].map((m) => Number(m[1]));
    expect(delays).toEqual([360, 420, 480, 540, 600]);
  });

  it('draws the spine, the dots, the group rules and the top hairline of each stacked cell', () => {
    expect(narrow).toMatch(/\[data-depth-trace="timeline"\]::before\s*\{[^}]*animation:\s*depth-trace-y linear backwards[^}]*animation-timeline:\s*--depth-trace/);
    expect(narrow).toMatch(/\[data-depth-trace="timeline"\] > li::before\s*\{[^}]*animation:\s*depth-dot linear backwards[^}]*animation-timeline:\s*--depth-row/);
    expect(narrow).toMatch(/\[data-experience-rule\]\s*\{[^}]*animation:\s*depth-trace-x linear backwards[^}]*animation-timeline:\s*view\(\)/);
    // A stacked cell is ruled along its top, so its drawn rule is horizontal and replaces that border.
    expect(narrow).toMatch(/\[data-depth-trace="proof"\] > \[data-proof\]:not\(:first-child\)\s*\{\s*border-top-color:\s*transparent;\s*\}/);
    expect(narrow).toMatch(/\[data-depth-trace="proof"\] > \[data-proof\]:not\(:first-child\)::before\s*\{[^}]*top:\s*-1px[^}]*height:\s*1px[^}]*animation:\s*depth-trace-x linear backwards[^}]*animation-timeline:\s*--depth-cell/);
    // The cells are two across at every narrow width, so the first row's two cells have no top border
    // and nothing draws there.
    expect(narrow).toMatch(/\}\s*\[data-depth-trace="proof"\] > \[data-proof\]:nth-child\(-n \+ 2\)::before\s*\{\s*content:\s*none;/);
    expect(narrow).not.toMatch(/@media \(width >= 40rem\)\s*\{\s*\[data-depth-trace="proof"\]/);
    // The automation lines: a top rule while they stack (below md), the wide screen's left rule from md.
    expect(block('@media (width < 48rem)', css.indexOf(NARROW))).toMatch(/\[data-depth-trace="row"\] > li \+ li::before\s*\{[^}]*top:\s*-1px[^}]*animation:\s*depth-trace-x linear backwards/);
    expect(block('@media (width >= 48rem)', css.indexOf(NARROW))).toMatch(/\[data-depth-trace="row"\] > li \+ li::before\s*\{[^}]*left:\s*-1px[^}]*animation:\s*depth-trace-y linear backwards/);
    // Their borders are utilities, so the rules that hide them are unlayered, in the same gates.
    expect(css).toMatch(/@media screen and \(width < 48rem\) and \(prefers-reduced-motion: no-preference\)\s*\{\s*\[data-depth-trace="row"\] > li \+ li\s*\{\s*border-top-color:\s*transparent;/);
    expect(css).toMatch(/@media screen and \(width >= 48rem\) and \(width < 64rem\) and \(prefers-reduced-motion: no-preference\)\s*\{\s*\[data-depth-trace="row"\] > li \+ li\s*\{\s*border-left-color:\s*transparent;/);
  });

  it('jumps to the final layout when a control inside has focus', () => {
    expect(narrow).toMatch(/\[data-depth-drift\]:focus-within,\s*\[data-depth-hinge\]:focus-within,\s*\[data-depth-hinge="load"\]:focus-within \[data-glance-facts\] > div,\s*\[data-depth-trace\]:focus-within::before,\s*\[data-depth-trace\]:focus-within > \*::before\s*\{\s*animation:\s*none;\s*\}/);
  });

  it('never fills forwards, pins nothing and moves nothing sideways', () => {
    for (const m of narrow.matchAll(/animation:\s*depth-[a-z0-9-]+ (?:linear|var\([^)]*\) var\([^)]*\)) (\w+)/g)) expect(m[1]).toBe('backwards');
    expect(narrow).not.toMatch(/sticky|position:\s*fixed|translateX|translate:/);
  });

  it('stops every one of them under reduced motion and in print', () => {
    for (const part of ['[data-depth-drift]', '[data-depth-hinge]', '[data-depth-hinge] [data-glance-facts] > div', '[data-experience-rule]', '[data-depth-trace]::before', '[data-depth-trace] > li::before', '[data-depth-trace] > [data-proof]::before', '[data-depth-sheet]']) {
      expect(still).toContain(part);
    }
  });
});

describe('the press on a touch screen', () => {
  const press = block(PRESS);

  it('sinks a clickable card and a tab a little on :active only, with a fast transition', () => {
    expect(press).toMatch(/\[data-depth-lean\]:active,\s*\[data-next\]:active,\s*\[data-how-tab\]:active\s*\{\s*scale:\s*0\.98;\s*\}/);
    expect(press).not.toMatch(/:hover|:focus/);
    for (const part of ['[data-depth-lean],\n    [data-next] {', '[data-how-tab] {']) {
      const rule = block(part, css.indexOf(PRESS));
      expect(rule, part).toMatch(/scale var\(--duration-fast\) var\(--ease-standard\)/);
    }
  });

  it('presses a hero button down 2 px instead, so a 44 px target never shrinks under a finger', () => {
    expect(press).toMatch(/\[data-depth-magnet\]:active\s*\{\s*translate:\s*0 2px;\s*\}/);
    expect(press).not.toMatch(/\[data-depth-magnet\][^{]*\{[^}]*scale:/);
    expect(block('[data-depth-magnet] {', css.indexOf(PRESS))).toMatch(/transition:\s*translate var\(--duration-fast\) var\(--ease-standard\)/);
  });

  it('keeps the transitions it replaces, so the colour and lift states still ease', () => {
    const cards = block('[data-depth-lean],\n    [data-next] {', css.indexOf(PRESS));
    expect(cards).toMatch(/border-color var\(--duration-fast\) var\(--ease-standard\),\s*translate var\(--duration-base\) var\(--ease-standard\)/);
    const tab = block('[data-how-tab] {', css.indexOf(PRESS));
    expect(tab).toMatch(/background-color var\(--duration-fast\)[^;]*border-color var\(--duration-fast\)[^;]*color var\(--duration-fast\)[^;]*translate var\(--duration-base\)/);
  });
});
