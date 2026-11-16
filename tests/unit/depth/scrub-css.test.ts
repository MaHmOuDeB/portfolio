import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SCRUB_PARTS } from '@/lib/depth/scrub';

// The scroll fallback's CSS: below lg, a browser without scroll timelines runs the same keyframes as
// the native rules, driven by Lean's fallback (src/lib/depth/scrub.ts). So the fallback block must be
// the native phone rules, rule for rule: the same selectors under the root's gate, the same
// declarations, the animation paused at 1s with the script's delay, each animation-range carried as
// --depth-range word for word and each named timeline as the element that holds it (--depth-on).
// Then the time-based rules again, so they keep winning over the drift's mirror. Left out on purpose:
// the ribbon (its single line would change the layout after load) and everything from lg.
const css = readFileSync(join(import.meta.dirname, '../../../src/app/globals.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

type Rule = { media: string[]; sel: string; decls: Record<string, string> };
type Top = { head: string; body: string };

/** The index of the brace that closes the one at `open`. */
function close(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}' && --depth === 0) return i;
  }
  throw new Error('unclosed block');
}

/** The statements at the top of `text`: each head with its block's body. */
function statements(text: string): Top[] {
  const out: Top[] = [];
  let at = 0;
  for (;;) {
    const open = text.indexOf('{', at);
    if (open < 0) return out;
    const end = close(text, open);
    // A statement ends at a ";" (an @import) or a "}"; the head is what follows the last of them.
    const head = text.slice(at, open).split(/[;}]/).pop()!.trim();
    out.push({ head, body: text.slice(open + 1, end) });
    at = end + 1;
  }
}

const splitTop = (s: string) => {
  const parts: string[] = [];
  let depth = 0;
  let from = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '(') depth++;
    else if (s[i] === ')') depth--;
    else if (s[i] === ',' && depth === 0) {
      parts.push(s.slice(from, i).trim());
      from = i + 1;
    }
  }
  parts.push(s.slice(from).trim());
  return parts;
};

/** Every style rule in `body`, with the media queries it sits in (@layer and @supports are passed through). */
function rules(body: string, media: string[] = []): Rule[] {
  const out: Rule[] = [];
  for (const { head, body: inner } of statements(body)) {
    if (head.startsWith('@media')) out.push(...rules(inner, [...media, head]));
    else if (head.startsWith('@layer') || head.startsWith('@supports')) out.push(...rules(inner, media));
    else {
      const decls: Record<string, string> = {};
      for (const d of inner.split(';').map((x) => x.trim()).filter(Boolean)) {
        const colon = d.indexOf(':');
        decls[d.slice(0, colon).trim()] = d.slice(colon + 1).trim().replace(/\s+/g, ' ');
      }
      out.push({ media, sel: splitTop(head).join(', '), decls });
    }
  }
  return out;
}

const top = statements(css);
const SUPPORTS = '@supports (animation-timeline: view())';
const NARROW_MEDIA = '@media screen and (width < 64rem) and (prefers-reduced-motion: no-preference)';
const GATE = ':root[data-depth-fallback]';

const supports = top.filter((t) => t.head === SUPPORTS);
/** The scroll-linked rules for every width, which phones get too. */
const generic = supports.find((t) => /^\s*@layer components\s*\{\s*:has\(> \[data-depth-rise\]\)/.test(t.body))!;
/** The phone block: directly in the support check, in the narrow motion query. */
const narrow = supports.find((t) => t.body.trim().startsWith(NARROW_MEDIA))!;
/** The unlayered border rules of the phone's ruled row. */
const borders = supports.find((t) => /^\s*@media screen and \(width < 48rem\) and \(prefers-reduced-motion: no-preference\)/.test(t.body))!;
const narrowTops = top.filter((t) => t.head === NARROW_MEDIA.replace(/^@media /, '@media '));
const timed = narrowTops.find((t) => t.body.includes('[data-depth-drift="tl"]') && !t.body.includes(GATE))!;
const fallback = narrowTops.find((t) => t.body.includes(GATE))!;
const fallbackBorders = top.filter((t) => t.head.startsWith('@media screen') && t.body.includes(GATE) && !t.body.includes('@layer'));

const ON: Record<string, string> = { '--depth-fan': '[data-depth-stack]', '--depth-trace': '[data-depth-trace]', 'scroll(root)': ':root' };
const SELF = new Set(['view()', '--depth-row', '--depth-cell']);

/** A native scroll-linked rule as the fallback must state it. */
function mirror(r: Rule, keepMedia: boolean): Rule | null {
  const decls: Record<string, string> = {};
  for (const [p, v] of Object.entries(r.decls)) {
    if (p === 'view-timeline' || p === 'view-timeline-inset') continue;
    if (p === 'animation') {
      const m = /^(depth-[a-z0-9-]+) linear (backwards|both)$/.exec(v);
      decls[p] = m ? `${m[1]} 1s linear calc(var(--depth-t, 1) * -1s) paused ${m[2]}` : v;
    } else if (p === 'animation-timeline') {
      if (ON[v]) decls['--depth-on'] = ON[v];
      else expect(SELF.has(v), `${r.sel}: timeline ${v}`).toBe(true);
    } else if (p === 'animation-range') decls['--depth-range'] = v;
    else decls[p] = v;
  }
  if (Object.keys(decls).length === 0) return null;
  return { media: keepMedia ? r.media : r.media.slice(1), sel: splitTop(r.sel).map((s) => `${GATE} ${s}`).join(', '), decls };
}
const gated = (r: Rule, keepMedia: boolean): Rule => ({ media: keepMedia ? r.media : r.media.slice(1), sel: splitTop(r.sel).map((s) => `${GATE} ${s}`).join(', '), decls: r.decls });

describe('the scroll fallback below lg', () => {
  it('finds every block it mirrors', () => {
    for (const [name, b] of Object.entries({ generic, narrow, borders, timed, fallback })) expect(b, name).toBeDefined();
    expect(fallbackBorders).toHaveLength(2);
  });

  it('plays the on-load portrait and glance lid without a scroll timeline, below lg with motion allowed', () => {
    // Its own top-level query, outside every support check.
    const timedRules = rules(timed.body);
    expect(timedRules.map((r) => r.sel)).toContain('[data-depth-drift="tl"]');
    expect(timedRules.map((r) => r.sel)).toContain('[data-depth-hinge="load"]');
    for (const r of timedRules) {
      if (r.decls.animation && r.decls.animation !== 'none') expect(r.decls.animation).toMatch(/var\(--duration-arrive\) var\(--ease-standard\) backwards$/);
    }
    // And after the phone's scroll-linked block, so a portrait (also a drift) keeps its own entrance.
    expect(css.indexOf(timed.body)).toBeGreaterThan(css.indexOf(narrow.body));
  });

  it('mirrors every scroll-linked rule a phone gets, rule for rule, then the time-based ones', () => {
    const native = [
      ...rules(generic.body).filter((r) => !r.sel.includes('[data-depth-ribbon]')).map((r) => mirror(r, true)),
      ...rules(narrow.body).map((r) => mirror(r, false)),
      ...rules(timed.body).map((r) => gated(r, false)),
    ].filter((r): r is Rule => r !== null);
    const got = rules(fallback.body);
    // The first rule is the default progress (below); the mirror follows it.
    expect(got.slice(1)).toEqual(native);
  });

  it('starts every part at the final state, so a part never takes its progress from a part around it', () => {
    // --depth-t inherits (a ::before reads its element's value), so each part gets its own 1 until
    // the script writes one inline.
    const [first] = rules(fallback.body);
    expect(first!.media).toEqual([]);
    expect(first!.decls).toEqual({ '--depth-t': '1' });
    const inner = new RegExp(`^${GATE.replace(/[[\]]/g, '\\$&')} :is\\((.*)\\)$`).exec(first!.sel)?.[1];
    expect(inner, first!.sel).toBeDefined();
    const norm = (list: string) => splitTop(list).map((x) => x.replace(/\s*>\s*/g, '>')).sort();
    expect(norm(inner!)).toEqual(norm(SCRUB_PARTS));
  });

  it('mirrors the unlayered border rules of the ruled row in the same queries', () => {
    const native = rules(borders.body).map((r) => mirror(r, true));
    const got = fallbackBorders.flatMap((t) => rules(t.body, [t.head]));
    expect(got).toEqual(native);
  });

  it('applies only on a screen below lg with motion allowed, under the gate, outside every support check', () => {
    expect(fallback.head).toBe(NARROW_MEDIA);
    for (const r of rules(fallback.body)) for (const s of splitTop(r.sel)) expect(s.startsWith(`${GATE} `), s).toBe(true);
    // Not inside a support check: the browsers it serves have no scroll timelines.
    const before = css.slice(0, css.indexOf(fallback.body));
    expect(before.lastIndexOf(SUPPORTS)).toBeLessThan(before.lastIndexOf(NARROW_MEDIA));
    expect(rules(fallback.body).some((r) => r.media.some((m) => /width >= 64rem/.test(m)))).toBe(false);
  });

  it('leaves the ribbon out (its single line would change the layout after load)', () => {
    expect(fallback.body).not.toContain('data-depth-ribbon');
  });

  it('keeps the range and the timeline holder on the element itself: neither is inherited', () => {
    for (const name of ['--depth-range', '--depth-on']) {
      expect(css).toMatch(new RegExp(`@property ${name}\\s*\\{\\s*syntax:\\s*"\\*";\\s*inherits:\\s*false;\\s*\\}`));
    }
  });

  it('lets the script find every element a mirrored rule animates', () => {
    const parts = new Set(SCRUB_PARTS.split(',').map((s) => s.trim()));
    for (const r of rules(fallback.body)) {
      if (!('--depth-range' in r.decls || '--depth-on' in r.decls)) continue;
      for (const s of splitTop(r.sel)) {
        // The element that carries the value: the last compound, without its pseudo-element.
        const compounds = s.replace(/::before$/, '').split(/\s*[ >+]\s*(?![^(]*\))/).filter(Boolean);
        const last = compounds[compounds.length - 1]!;
        const attr = /^\[([a-z-]+)/.exec(last)?.[1];
        // A direct child of a ruled container (or a sibling of one) is found as one ([data-depth-trace]>*).
        const child = /\[data-depth-trace[^\]]*\] > [^>]+$/.test(s.replace(/::before$/, '')) && parts.has('[data-depth-trace]>*');
        const ok = (attr !== undefined && parts.has(`[${attr}]`)) || child;
        expect(ok, s).toBe(true);
      }
    }
  });
});
