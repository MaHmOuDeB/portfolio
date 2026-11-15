import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Forced colours (Windows high contrast): every surface that puts light text on ink names a system
// colour pair for its fill and its text. Chromium forces an ink fill to Canvas but keeps the light text
// tones, and WebKit keeps both, so a surface left to the engine reads at about 1:1 in one of them.
const ROOT = join(import.meta.dirname, '../..');
const css = readFileSync(join(ROOT, 'src/app/globals.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** The body of the first block that opens with `head`, braces balanced. */
function block(source: string, head: string): string {
  const start = source.indexOf(head);
  if (start === -1) throw new Error(`no block ${head}`);
  let depth = 0;
  for (let i = source.indexOf('{', start); i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}' && --depth === 0) return source.slice(source.indexOf('{', start) + 1, i);
  }
  throw new Error(`unclosed block ${head}`);
}

type Rule = { selectors: string[]; body: string };
/** The flat rules of a block (nested blocks such as @media inside are read as their inner rules). */
function rules(source: string): Rule[] {
  return [...source.matchAll(/([^{}@;]+)\{([^{}]*)\}/g)].map((m) => ({
    selectors: m[1]!.split(/,(?![^(]*\))/).map((s) => s.trim()).filter(Boolean),
    body: m[2]!,
  }));
}

const forced = block(css, '@media (forced-colors: active)');
const outside = css.replace(forced, '');
const forcedRules = rules(forced);
const pair = (fill: string, text: string) =>
  forcedRules.filter((r) => new RegExp(`background-color:\\s*${fill}\\s*!important`).test(r.body) && new RegExp(`(^|[^-])color:\\s*${text}\\s*!important`).test(r.body));

const LIGHT = /(^|[^-])color:\s*var\(--color-(surface|bg|on-ink|on-ink-muted)\)/;
const INK_FILL = /background(-color)?:\s*var\(--color-ink\)/;

describe('forced colours: text on ink', () => {
  const surfaces = pair('Canvas', 'CanvasText').flatMap((r) => r.selectors);
  const panels = surfaces.find((s) => s.startsWith(':is([data-ink]')) ?? '';

  it('the ink panels take Canvas and CanvasText for both fill and text', () => {
    expect(panels).not.toBe('');
    // every rule in the stylesheet that draws light text on an ink fill is one of those panels
    const inked = rules(outside)
      .filter((r) => INK_FILL.test(r.body) && LIGHT.test(r.body))
      .flatMap((r) => r.selectors);
    expect(inked.length).toBeGreaterThan(0);
    // A rule may instead name its own system pair for the same selector, kept from the engine with
    // forced-color-adjust: none (a clickable card's filled plus takes Highlight and HighlightText).
    const ownPair = (selector: string) =>
      forcedRules.some(
        (r) =>
          r.selectors.includes(selector) &&
          /forced-color-adjust:\s*none/.test(r.body) &&
          /background-color:\s*(?:Canvas|Highlight|ButtonFace)\b/.test(r.body) &&
          /(^|[^-])color:\s*(?:CanvasText|HighlightText|ButtonText)\b/.test(r.body),
      );
    for (const selector of inked) if (!ownPair(selector)) expect(panels, selector).toContain(selector);
    expect(inked.filter(ownPair).sort()).toEqual([
      '[data-depth-lean]:hover [data-depth-go]',
      '[data-depth-lean]:is(:focus-visible, :active) [data-depth-go]',
    ]);
  });

  it('text and links inside a panel name CanvasText and LinkText', () => {
    const inner = (sel: string, colour: string) =>
      forcedRules.some((r) => r.selectors.includes(`${panels} ${sel}`) && new RegExp(`color:\\s*${colour}\\s*!important`).test(r.body));
    expect(inner('*', 'CanvasText')).toBe(true);
    expect(inner('a', 'LinkText')).toBe(true);
  });

  it('a utility ink fill with light text on it takes a system pair, a link or button drawn so the button colours', () => {
    expect(surfaces).toContain(':is(.bg-ink, .bg-muted):is(.text-bg, .text-surface)');
    expect(surfaces).toContain('[class~="focus:bg-ink"]:focus');
    expect(pair('ButtonFace', 'ButtonText').flatMap((r) => r.selectors)).toContain(':is(a, button):is(.bg-ink, .bg-muted):is(.text-bg, .text-surface)');
  });

  it('every class list in the source that puts light text on an ink fill is covered by those selectors', () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.tsx?$/.test(e.name)) files.push(p);
      }
    };
    walk(join(ROOT, 'src'));
    const uncovered: string[] = [];
    let seen = 0;
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const m of source.matchAll(/[^'"`]*\bbg-(ink|muted)\b[^'"`]*/g)) {
        const list = m[0];
        const classes = list.split(/\s+/);
        // the element's own tag, up to this class list: a panel carries data-ink
        const tag = source.slice(source.lastIndexOf('<', m.index), m.index);
        for (const prefix of ['', 'focus:', 'hover:', 'focus-visible:', 'group-has-[:checked]:']) {
          const fill = classes.some((c) => c === `${prefix}bg-ink` || c === `${prefix}bg-muted`);
          const light = classes.some((c) => /^(?:[a-z-]+:)*text-(bg|surface|on-ink|on-ink-muted)$/.test(c) && c.startsWith(prefix));
          if (!fill || !light) continue;
          seen++;
          const covered =
            prefix === ''
              ? classes.some((c) => c === 'text-bg' || c === 'text-surface') || /\bdata-ink\b/.test(tag)
              : prefix === 'focus:'
                ? classes.includes('focus:bg-ink')
                : // a hover or focus-visible fill sits on an element whose base fill is covered already
                  classes.some((c) => c === 'bg-ink' || c === 'bg-muted');
          if (!covered) uncovered.push(`${file.slice(ROOT.length + 1)}: ${list.trim().slice(0, 80)}`);
        }
      }
    }
    expect(seen).toBeGreaterThan(0);
    expect(uncovered).toEqual([]);
  });

  it('the system colours land at once: no colour transition on an ink surface or inside a panel', () => {
    // A link's transition-colors would otherwise fade it from its light tone to LinkText after the switch,
    // and a check in between reads light text on Canvas.
    const still = forcedRules.filter((r) => /transition:\s*none\s*!important/.test(r.body)).flatMap((r) => r.selectors);
    expect(still).toEqual(expect.arrayContaining([panels, `${panels} *`, ':is(.bg-ink, .bg-muted):is(.text-bg, .text-surface)']));
  });

  it('nothing in the forced-colours block names a light token', () => {
    expect(forced).not.toMatch(/var\(--color-(surface|bg|on-ink|on-ink-muted)\)/);
  });
});
