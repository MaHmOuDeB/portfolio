import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The phone layout rules in globals.css that markup tests cannot see. Every one sits in a query that
// ends below lg (64rem), except the card titles, which keep their lines from lg only: a desktop screen
// renders exactly as it did before these rules.
const css = readFileSync(join(__dirname, '..', '..', 'src/app/globals.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** The body of the block that opens at `start` (balanced braces). */
function body(start: number): string {
  const open = css.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}' && --depth === 0) return css.slice(open + 1, i);
  }
  throw new Error('unclosed block');
}

/** Every block that opens with `head`, joined. */
function blocks(head: string): string {
  const out: string[] = [];
  for (let at = css.indexOf(head); at > -1; at = css.indexOf(head, at + head.length)) out.push(body(at));
  expect(out.length, head).toBeGreaterThan(0);
  return out.join('\n');
}

const PHONE = blocks('@media (width < 40rem) {');
const BELOW_MD = blocks('@media (width < 48rem) {');
const BELOW_LG = blocks('@media (width < 64rem) {');

describe('phone layout', () => {
  it('puts 48 px above a section head under md and keeps 84 px from md', () => {
    expect(css).toMatch(/\[data-section-head\]\s*\{\s*padding-block:\s*calc\(var\(--spacing\) \* 12\) calc\(var\(--spacing\) \* 7\);/);
    expect(css).toMatch(/@media \(width >= 48rem\)\s*\{\s*\[data-section-head\]\s*\{\s*padding-top:\s*calc\(var\(--spacing\) \* 21\);/);
  });

  it('hides the frame rails under md only, keeping their width so the layout does not move', () => {
    // A zero-width border makes the column 2 px wider, which pushes clipped content 1 px past a phone screen.
    expect(BELOW_MD).toMatch(/\[data-frame\]\s*\{\s*border-inline-color:\s*var\(--color-clear\);\s*\}/);
    expect(BELOW_MD).not.toMatch(/border-inline:\s*0/);
    expect(css).toMatch(/\[data-frame\]\s*\{\s*--frame-pad:[^}]*border-inline:\s*1px solid var\(--color-hairline\);/);
  });

  it('balances headings and avoids a lone last word in running text below lg, in base so a component still wins', () => {
    expect(BELOW_LG).toMatch(/:is\(h1, h2, h3, summary\)\s*\{\s*text-wrap:\s*balance;/);
    expect(BELOW_LG).toMatch(/:is\(p, li, dd, figcaption\)\s*\{\s*text-wrap:\s*pretty;/);
    const base = css.indexOf('@layer base {');
    expect(body(base)).toContain(':is(h1, h2, h3, summary)');
  });

  it('starts the hero at the left edge on a phone and lets its inline chips sit in the line', () => {
    expect(PHONE).toMatch(/\[data-hero\]\s*\{\s*text-align:\s*start;/);
    expect(PHONE).toMatch(/\[data-hero\] h1,\s*\[data-hero-sub\],\s*\[data-hero-proof\]\s*\{\s*margin-inline:\s*0;/);
    expect(PHONE).toMatch(/\[data-hero-actions\]\s*\{\s*justify-content:\s*flex-start;/);
    expect(PHONE).toMatch(/\[data-hero-sub\] \[data-chip\]\[data-inline\]\s*\{\s*min-height:\s*0;\s*line-height:\s*1\.3;/);
    // From sm the hero stays centred.
    expect(css).toMatch(/\[data-hero\]\s*\{\s*padding:[^}]*text-align:\s*center;/);
  });

  it('sets the proof row in two columns on a phone, with a smaller figure', () => {
    expect(PHONE).toMatch(/\[data-home-proof\]\s*\{\s*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/);
    expect(PHONE).toMatch(/\[data-proof\]:nth-child\(-n \+ 2\)\s*\{\s*border-top:\s*0;/);
    expect(PHONE).toMatch(/\[data-proof\]:nth-child\(odd\)\s*\{[^}]*padding-left:\s*0;[^}]*border-left:\s*0;/);
    // In a half-width cell the figure may wrap (and break inside a number) instead of overflowing when
    // the text is enlarged to 200%; at normal size it keeps its line (about 30 px to spare at 320 px).
    expect(PHONE).toMatch(/\[data-proof-figure\]\s*\{\s*font-size:\s*var\(--text-2xl\);\s*white-space:\s*normal;\s*overflow-wrap:\s*anywhere;/);
    // The phone figure rule comes after the base one, so it wins.
    expect(css.indexOf('overflow-wrap: anywhere;\n    }\n  }\n\n  [data-proof-unit]')).toBeGreaterThan(css.indexOf('[data-proof-figure] {'));
  });

  it('stacks the experience groups at the column width on a phone, so their rules match', () => {
    expect(PHONE).toMatch(/\[data-experience-groups\]\s*\{\s*flex-direction:\s*column;\s*align-items:\s*stretch;/);
  });

  it('compacts the glance card on a phone: each figure beside its label, each fact beside its term', () => {
    expect(PHONE).toMatch(/\[data-glance-points\]\s*\{\s*grid-template-columns:\s*fit-content\(50%\) minmax\(0, 1fr\);/);
    expect(PHONE).toMatch(/\[data-glance-point\]\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*subgrid;/);
    // Beside its figure a label has less than the card's width: with enlarged text a long word
    // ("recommendations") breaks rather than running past the screen.
    expect(PHONE).toMatch(/\[data-glance-label\]\s*\{\s*margin-top:\s*0;\s*overflow-wrap:\s*break-word;/);
    // A fact is a wrapping row, not a fixed grid: a value with a long unbreakable word (n8n's
    // "Structural/arithmetic/master-data") drops under its term instead of overflowing a 320 px screen.
    expect(PHONE).toMatch(/\[data-glance-facts\] > div\s*\{[^}]*display:\s*flex;[^}]*flex-wrap:\s*wrap;/);
    expect(PHONE).toMatch(/\[data-glance-facts\] dt\s*\{\s*flex:\s*0 0 80px;/);
    expect(PHONE).toMatch(/\[data-glance-facts\] dd\s*\{\s*flex:\s*1 1 12rem;\s*margin-top:\s*0;/);
    expect(PHONE).not.toMatch(/grid-template-columns:\s*80px/);
  });

  it('raises the small sketch and tag text to the 13 px floor below lg', () => {
    expect(BELOW_LG).toMatch(
      /\[data-vignette\],\s*\[data-tag\],\s*\[data-depth-sheet-head\],\s*\[data-depth-foot\],\s*\[data-depth-log\] em,\s*\[data-depth-toast\]\s*\{\s*font-size:\s*var\(--text-xs\);/,
    );
    expect(BELOW_LG).toMatch(/\[data-depth-foot\]\s*\{\s*flex-wrap:\s*wrap;/);
  });

  it('keeps a card title its --title-lines lines from lg only', () => {
    expect(css).toMatch(/@media \(width >= 64rem\)\s*\{\s*\[data-depth-lean\] h3\[data-title-lines\]\s*\{\s*min-height:\s*calc\(var\(--title-lines\) \* 1lh\);/);
    expect(css.split('[data-title-lines]')).toHaveLength(2);
  });
});
