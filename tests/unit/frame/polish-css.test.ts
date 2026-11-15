import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cardLean } from '@/lib/depth/lean';

// Small rules of the look that are easy to lose: the focus ring's shape, the size of the
// "Illustration" label, and a card's lean, which must stay small enough for its text to stay sharp.
const css = readFileSync(join(import.meta.dirname, '../../../src/app/globals.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

describe('the focus ring', () => {
  it('follows the control\'s radius: a link, a button or a summary with no radius of its own gets a small one while focused', () => {
    const rule = /@layer base\s*\{\s*:where\(a, button, summary, \[tabindex\]\):focus-visible\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(rule).toMatch(/border-radius:\s*var\(--radius-sm\)/);
    // In the base layer and nothing else in the rule: a control's own radius (a utility, a component rule) still wins.
    expect(rule.trim().split(';').filter(Boolean)).toHaveLength(1);
  });
});

describe('the "Illustration" label', () => {
  it('is text-xs (13 px), like the other small text', () => {
    expect(css).toMatch(/\[data-vignette-label\]\s*\{[^}]*font-size:\s*var\(--text-xs\)/);
    expect(css).not.toMatch(/\[data-vignette-label\]\s*\{[^}]*font-size:\s*0\.6875rem/);
  });
});

describe('a lean card', () => {
  const lean = /@media \(hover: hover\) and \(pointer: fine\)\s*\{\s*\[data-depth-lean\]\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';

  it('turns by at most about 0.6 degrees, so its text stays sharp', () => {
    const m = /transform:\s*rotateX\(calc\(var\(--rx, 0deg\) \* ([\d.]+)\)\) rotateY\(calc\(var\(--ry, 0deg\) \* ([\d.]+)\)\);/.exec(lean);
    expect(m, lean).not.toBeNull();
    // The largest angles the pointer script writes, at a corner of the card.
    const corner = cardLean(500, 200, { left: 100, top: 200, width: 400, height: 200 });
    const rx = parseFloat(corner.rx) * Number(m![1]);
    const ry = parseFloat(corner.ry) * Number(m![2]);
    for (const angle of [rx, ry]) {
      expect(angle).toBeGreaterThan(0.4);
      expect(angle).toBeLessThanOrEqual(0.6);
    }
  });

  it('reads as a link on hover and focus by its border and the plus button\'s colour only: nothing moves', () => {
    const card = /\[data-depth-lean\]:is\(:hover, :focus-visible\)\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(card.trim()).toBe('border-color: var(--color-hairline-strong);');
    const go = /\[data-depth-lean\]:is\(:hover, :focus-visible\) \[data-depth-go\]\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(go).toMatch(/border-color:\s*var\(--color-ink\)/);
    expect(go).toMatch(/color:\s*var\(--color-ink\)/);
    expect(card + go).not.toMatch(/transform|translate|scale|rotate/);
    expect(css).toMatch(/\[data-depth-go\]\s*\{[^}]*transition:\s*border-color var\(--duration-fast\) var\(--ease-standard\), color var\(--duration-fast\) var\(--ease-standard\)/);
  });

  it('is flat under reduced motion and in print', () => {
    const still = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce), print'));
    expect(still).toMatch(/\[data-depth-lean\]\s*\{\s*transform:\s*none;/);
  });
});
