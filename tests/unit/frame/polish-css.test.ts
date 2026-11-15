import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cardLean } from '@/lib/depth/lean';

// Small rules of the look that are easy to lose: the focus ring's shape, the size of the
// card sketches (no visible tag), and a card's lean, which must stay small enough for its text to stay sharp.
const css = readFileSync(join(import.meta.dirname, '../../../src/app/globals.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

describe('the focus ring', () => {
  it('follows the control\'s radius: a link, a button or a summary with no radius of its own gets a small one while focused', () => {
    const rule = /@layer base\s*\{\s*:where\(a, button, summary, \[tabindex\]\):focus-visible\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(rule).toMatch(/border-radius:\s*var\(--radius-sm\)/);
    // In the base layer and nothing else in the rule: a control's own radius (a utility, a component rule) still wins.
    expect(rule.trim().split(';').filter(Boolean)).toHaveLength(1);
  });
});

describe('the card sketches', () => {
  it('carry no visible tag (owner decision 2026-11-15): the label rule is gone', () => {
    expect(css).not.toMatch(/\[data-vignette-label\]/);
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

  it('is flat under reduced motion and in print', () => {
    const still = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce), print'));
    expect(still).toMatch(/\[data-depth-lean\]\s*\{\s*transform:\s*none;/);
  });
});

// A clickable card (a lean card or a previous/next card) says it is a link: on hover, focus and
// press its border turns ink and its plus fills ink (the Next label underlines), and it rises 4 px
// where motion is allowed. Hover lives only where hover exists, so a tap never leaves a card hovered.
const flat = (text: string) => text.replace(/\s+/g, ' ');

/** The start and end of every block whose head is exactly `head`. */
function spans(text: string, head: string): [number, number][] {
  const out: [number, number][] = [];
  for (let start = text.indexOf(`${head} {`); start > -1; start = text.indexOf(`${head} {`, start + 1)) {
    const open = text.indexOf('{', start);
    let depth = 0;
    for (let i = open; i < text.length; i++) {
      if (text[i] === '{') depth++;
      else if (text[i] === '}' && --depth === 0) {
        out.push([start, i + 1]);
        break;
      }
    }
  }
  return out;
}
/** The bodies of every block whose head is exactly `head`, joined and with whitespace collapsed. */
const blocks = (head: string, text = css) => flat(spans(text, head).map(([a, b]) => text.slice(text.indexOf('{', a) + 1, b - 1)).join(' '));
/** `text` with every block whose head is exactly `head` cut out. */
function without(head: string, text = css): string {
  return spans(text, head).reverse().reduce((t, [a, b]) => t.slice(0, a) + t.slice(b), text);
}

const INK_GO = 'border-color: var(--color-ink); background-color: var(--color-ink); color: var(--color-surface);';

describe('a clickable card on hover, focus and press', () => {
  it('has no hover rule outside a hover-capable media query: the old always-on rules are gone', () => {
    // Every block whose query starts with (hover: hover), the pointer lean's included.
    const heads = new Set([...css.matchAll(/@media \(hover: hover\)[^{]*(?= \{)/g)].map((m) => m[0]));
    const rest = [...heads].reduce((text, head) => without(head, text), css);
    expect(rest).not.toMatch(/\[data-(?:depth-lean|next)\]:(?:is\([^)]*)?hover/);
  });

  it('turns the border ink and fills the plus ink on hover, and underlines the Next label', () => {
    const hover = blocks('@media (hover: hover)');
    expect(hover).toContain('[data-depth-lean]:hover, [data-next]:hover { border-color: var(--color-ink); }');
    expect(hover).toContain(`[data-depth-lean]:hover [data-depth-go] { ${INK_GO} }`);
    expect(hover).toContain('[data-next]:hover [data-next-label] { text-decoration-line: underline; }');
  });

  it('shows the same colour state on keyboard focus and on press, on every device', () => {
    const always = flat(without('@media (hover: hover)'));
    expect(always).toContain('[data-depth-lean]:is(:focus-visible, :active), [data-next]:is(:focus-visible, :active) { border-color: var(--color-ink); }');
    expect(always).toContain(`[data-depth-lean]:is(:focus-visible, :active) [data-depth-go] { ${INK_GO} }`);
    expect(always).toContain('[data-next]:is(:focus-visible, :active) [data-next-label] { text-decoration-line: underline; }');
  });

  it('draws the plus ink at rest where there is no hover, so a phone still shows which cards open', () => {
    expect(blocks('@media (hover: none)')).toContain('[data-depth-go] { color: var(--color-ink); }');
  });

  it('underlines the Next label thinly, a little below the text', () => {
    expect(flat(css)).toMatch(/\[data-next-label\] \{[^}]*text-decoration-thickness: 1px; text-underline-offset: 0\.18em;/);
  });

  it('rises 4 px by translate only, on hover where hover exists and motion is allowed, never on keyboard focus', () => {
    const lift = 'translate: 0 calc(var(--spacing) * -1);';
    expect(blocks('@media (hover: hover) and (prefers-reduced-motion: no-preference)')).toContain(
      `[data-depth-lean]:hover, [data-next]:hover { ${lift} }`,
    );
    // Focus never moves the card: a tall focused card at the top of a small viewport would push its
    // ring off screen (WebKit at 320x180).
    expect(flat(css)).not.toMatch(/\[data-(?:depth-lean|next)\]:focus-visible[^{]*\{[^}]*translate/);
    // Nowhere else does a card move on hover, focus or press, and never by scale or transform.
    const rest = flat(without('@media (hover: hover) and (prefers-reduced-motion: no-preference)'));
    expect(rest).not.toMatch(/\[data-(?:depth-lean|next)\]:[^{]*\{[^}]*(?:translate|scale|transform|rotate)/);
  });

  it('transitions the lift next to the lean and the border, and fades the plus fill', () => {
    const tr = (prop: string, duration: string) => `${prop} var(--duration-${duration}) var(--ease-standard)`;
    const f = flat(css);
    expect(f).toMatch(new RegExp(`\\[data-depth-lean\\] \\{ --card-pad:[^}]*transition: ${escape(`${tr('border-color', 'fast')}, ${tr('translate', 'base')}`)};`));
    expect(blocks('@media (hover: hover) and (pointer: fine)')).toContain(
      `transition: ${tr('transform', 'lean')}, ${tr('border-color', 'fast')}, ${tr('translate', 'base')};`,
    );
    expect(f).toMatch(new RegExp(`\\[data-next\\] \\{[^}]*transition: ${escape(`${tr('border-color', 'fast')}, ${tr('translate', 'base')}`)};`));
    expect(f).toMatch(new RegExp(`\\[data-depth-go\\] \\{[^}]*transition: ${escape(`${tr('background-color', 'fast')}, ${tr('border-color', 'fast')}, ${tr('color', 'fast')}`)};`));
  });

  it('keeps a cue in forced colours: Highlight border, and a Highlight plus that is not forced back to Canvas', () => {
    const forced = blocks('@media (forced-colors: active)');
    expect(forced).toContain('[data-depth-lean]:is(:focus-visible, :active), [data-next]:is(:focus-visible, :active) { border-color: Highlight; }');
    expect(forced).toContain('[data-depth-lean]:is(:focus-visible, :active) [data-depth-go] { forced-color-adjust: none; border-color: Highlight; background-color: Highlight; color: HighlightText; }');
    const forcedHover = blocks('@media (hover: hover)', spans(css, '@media (forced-colors: active)').map(([a, b]) => css.slice(a, b)).join('\n'));
    expect(forcedHover).toContain('[data-depth-lean]:hover, [data-next]:hover { border-color: Highlight; }');
    expect(forcedHover).toContain('[data-depth-lean]:hover [data-depth-go] { forced-color-adjust: none; border-color: Highlight; background-color: Highlight; color: HighlightText; }');
  });

  it('gives a tap a light grey flash, in case a phone does not apply :active to a link', () => {
    const f = flat(css);
    expect(f).toMatch(/\[data-depth-lean\] \{ --card-pad:[^}]*-webkit-tap-highlight-color: var\(--color-hairline-strong\);/);
    expect(f).toMatch(/\[data-next\] \{ display: flex;[^}]*-webkit-tap-highlight-color: var\(--color-hairline-strong\);/);
  });
});

// The "How I test" tabs are clickable too, so they say so the way a card does: the border turns ink
// on hover (only where hover exists), on keyboard focus of the radio and on press, and on hover the
// tab rises 4 px where motion is allowed (focus never moves it). The selected tab keeps its own look (a surface fill and an ink bar).
describe('a "How I test" tab on hover, focus and press', () => {
  const lift = 'translate: 0 calc(var(--spacing) * -1);';
  const focus = '[data-how-tab]:has(:focus-visible), [data-how-tab]:active';

  it('rests on a hairline and transitions its border and its lift with the card tokens', () => {
    const tr = (prop: string, duration: string) => `${prop} var(--duration-${duration}) var(--ease-standard)`;
    expect(flat(css)).toMatch(
      new RegExp(
        `\\[data-how-tab\\] \\{ border-color: var\\(--color-hairline\\); transition: ${escape(
          `${tr('background-color', 'fast')}, ${tr('border-color', 'fast')}, ${tr('color', 'fast')}, ${tr('translate', 'base')}`,
        )}; \\}`,
      ),
    );
  });

  it('turns the border ink on hover only where hover exists, and on keyboard focus and press everywhere', () => {
    expect(blocks('@media (hover: hover)')).toContain('[data-how-tab]:hover { border-color: var(--color-ink); }');
    expect(flat(without('@media (hover: hover)'))).toContain(`${focus} { border-color: var(--color-ink); }`);
    const heads = new Set([...css.matchAll(/@media \(hover: hover\)[^{]*(?= \{)/g)].map((m) => m[0]));
    const rest = [...heads].reduce((text, head) => without(head, text), css);
    expect(rest).not.toMatch(/\[data-how-tab\]:(?:is\([^)]*)?hover/);
  });

  it('rises 4 px by translate only, on hover where motion is allowed, never on keyboard focus', () => {
    expect(blocks('@media (hover: hover) and (prefers-reduced-motion: no-preference)')).toContain(`[data-how-tab]:hover { ${lift} }`);
    const rest = flat(without('@media (hover: hover) and (prefers-reduced-motion: no-preference)'));
    expect(rest).not.toMatch(/\[data-how-tab\]:[^{]*\{[^}]*(?:translate|scale|transform|rotate)/);
  });

  it('keeps a Highlight border in forced colours on hover, focus and press', () => {
    const forcedText = spans(css, '@media (forced-colors: active)').map(([a, b]) => css.slice(a, b)).join('\n');
    expect(blocks('@media (forced-colors: active)')).toContain(`${focus} { border-color: Highlight; }`);
    expect(blocks('@media (hover: hover)', forcedText)).toContain('[data-how-tab]:hover { border-color: Highlight; }');
  });
});

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
