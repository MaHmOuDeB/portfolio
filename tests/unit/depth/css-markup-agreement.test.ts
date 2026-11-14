import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The depth components render part attributes and globals.css styles them. The two were written
// apart once and drifted, so this guards the agreement: a styled part must be rendered somewhere,
// and a rendered part must be styled (or be a deliberately unstyled hook, listed below).
const root = join(__dirname, '..', '..', '..');
const ATTR = /data-(?:depth|proof|tile|glance|size)[a-z-]*/g;

const stripCssComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const stripCodeComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const css = stripCssComments(readFileSync(join(root, 'src/app/globals.css'), 'utf8'));
// Only what sits in a selector: the text before each "{", minus at-rule preludes.
const selectorText = [...css.matchAll(/([^{}]+)\{/g)]
  .map((m) => m[1]!)
  .filter((s) => !s.trim().startsWith('@'))
  .join('\n');
const styled = new Set(selectorText.match(ATTR) ?? []);

const depthDir = join(root, 'src/components/depth');
const files = [
  ...readdirSync(depthDir)
    .filter((f) => f.endsWith('.tsx'))
    .map((f) => join(depthDir, f)),
  join(root, 'src/components/shell/SiteHeader.tsx'),
];
const rendered = new Set<string>();
for (const f of files) {
  for (const m of stripCodeComments(readFileSync(f, 'utf8')).matchAll(/(data-(?:depth|proof|tile|glance|size)[a-z-]*)=/g)) {
    rendered.add(m[1]!);
  }
}

// Hooks that pages put on their own elements (or on a depth component through its data-* pass-through).
const SET_BY_PAGES: Record<string, string> = {
  'data-depth-scene': 'the hero section a page marks, so its scroll turns the plane',
  'data-depth-load': 'the load sequence, set on a page element with --d',
  'data-depth-recede': 'a page element that recedes as it leaves',
  'data-depth-book': 'a page element that opens like a book, also passed to Tile through its data-* props',
  'data-depth-scale': 'a page element that scales in, also passed to Ribbon through its data-* props',
  'data-depth-parallax': 'a page element that drifts with the scroll',
  'data-depth-reveal': 'a page element revealed left to right',
  'data-depth-magnet': 'a button a page marks; Lean moves it',
  'data-proof-unit': 'a word around a proof figure\'s number (about, min), which the page passes inside the figure',
};
// Rendered parts with no rule of their own. Empty on purpose: add an entry only with a reason.
const UNSTYLED: Record<string, string> = {};

describe('depth CSS and markup agree', () => {
  it('finds both sides (the scan is not vacuous)', () => {
    expect(styled.size).toBeGreaterThan(15);
    expect(rendered.size).toBeGreaterThan(15);
  });

  it('every styled attribute is rendered by a component or listed as page-applied', () => {
    const missing = [...styled].filter((a) => !rendered.has(a) && !(a in SET_BY_PAGES)).sort();
    expect(missing).toEqual([]);
  });

  it('every rendered part attribute appears in a selector or is listed as unstyled', () => {
    const unstyled = [...rendered].filter((a) => !styled.has(a) && !(a in UNSTYLED)).sort();
    expect(unstyled).toEqual([]);
  });

  it('keeps the allowlists honest: no entry is rendered and styled both', () => {
    for (const a of Object.keys(SET_BY_PAGES)) expect(rendered.has(a) && styled.has(a), a).toBe(false);
    for (const a of Object.keys(UNSTYLED)) expect(styled.has(a), a).toBe(false);
  });
});
