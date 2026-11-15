// The Home page's top blocks and its featured cards, rendered on the server: the hero, the proof row
// and the cards (the sections below them are in sections.test.tsx). The three featured cards are the
// tested element of the live experiment: both groups get the same markup, both headline strings sit
// in the same grid cell, and only which one is shown differs. Every figure must come from the facts
// data, including the hidden headline, and every sentence of the approved is pinned once here.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parse, type DefaultTreeAdapterTypes as T } from 'parse5';
import { describe, expect, it } from 'vitest';
import { auditHtml } from '../../../scripts/truth-audit.ts';
import { HEADLINES, HOME_CASES, HOME_PROOF, headlineText, type Study } from '../../../content/home.ts';
import { HOME_LINKS } from '../../../content/home-destinations.ts';
import { FACTS, FACT_DISPLAYS } from '../../../src/lib/facts/facts.generated.ts';
import type { Arm } from '@/experiment.values';
import { CONTACT_HREF, CV_LINK } from '@/lib/site';

const { CaseCard } = await import('@/components/home/CaseCard');
const { FeaturedCases } = await import('@/components/home/FeaturedCases');
const { Hero } = await import('@/components/home/Hero');
const { ProofRow } = await import('@/components/home/ProofRow');

const ARMS: readonly Arm[] = ['a', 'b'];

const audit = (html: string) =>
  auditHtml(html, { route: '/v/a', factIds: new Set(Object.keys(FACTS)), factDisplays: FACT_DISPLAYS, denylist: [] });

// ---------------------------------------------------------------------------------------------
// A small DOM over parse5, enough to query the rendered markup.

type El = T.Element;
const isEl = (n: T.ChildNode | T.ParentNode): n is El => 'tagName' in n;
const attr = (el: El, name: string): string | undefined => el.attrs.find((a) => a.name === name)?.value;
const has = (el: El, name: string) => attr(el, name) !== undefined;

function all(root: T.ParentNode, test: (el: El) => boolean): El[] {
  const out: El[] = [];
  const walk = (node: T.ParentNode) => {
    for (const child of node.childNodes) {
      if (!isEl(child)) continue;
      if (test(child)) out.push(child);
      walk(child);
    }
  };
  walk(root);
  return out;
}
const one = (root: T.ParentNode, test: (el: El) => boolean): El => {
  const found = all(root, test);
  expect(found).toHaveLength(1);
  return found[0]!;
};
function text(node: T.ParentNode): string {
  let s = '';
  for (const child of node.childNodes) {
    if (child.nodeName === '#text') s += (child as T.TextNode).value;
    else if (isEl(child) && child.tagName !== 'template') s += text(child);
  }
  return s;
}
/** The text a visitor reads: hidden (aria-hidden or visibility:hidden) subtrees left out. */
function shownText(node: T.ParentNode): string {
  let s = '';
  for (const child of node.childNodes) {
    if (child.nodeName === '#text') s += (child as T.TextNode).value;
    else if (isEl(child) && attr(child, 'aria-hidden') !== 'true' && !classes(child).includes('invisible')) s += shownText(child);
  }
  return s;
}
const classes = (el: El) => (attr(el, 'class') ?? '').split(/\s+/).filter(Boolean);
const doc = (html: string) => parse(`<!doctype html><html><body>${html}</body></html>`);
const render = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);
const style = (el: El) => attr(el, 'style') ?? '';

const cards = (arm: Arm) => render(createElement(FeaturedCases, { headlineArm: arm }));

// ---------------------------------------------------------------------------------------------

describe('FeaturedCases', () => {
  it('is one labelled cards region with three card links, in the order of the headlines', () => {
    for (const arm of ARMS) {
      const d = doc(cards(arm));
      const region = one(d, (el) => attr(el, 'data-experiment') === 'cards');
      expect(region.tagName).toBe('section');
      expect(attr(region, 'aria-label')).toBe('Featured case studies');
      const list = all(region, (el) => has(el, 'data-case-card'));
      expect(list.map((el) => attr(el, 'data-case-card'))).toEqual(HEADLINES.map((h) => h.study));
    }
  });

  it('has three marked same-origin card links, the same hrefs in both groups, the whole card being the link', () => {
    const hrefs = HOME_CASES.map((c) => c.href);
    for (const arm of ARMS) {
      const d = doc(cards(arm));
      const links = all(d, (el) => el.tagName === 'a');
      // Only the card links are links: no second focusable link inside a headline.
      expect(links).toHaveLength(3);
      for (const a of links) {
        // The tracking contract with the beacon: the click marker and the card marker on the link itself.
        expect(attr(a, 'data-experiment-click')).toBe('card');
        expect(has(a, 'data-case-card')).toBe(true);
        expect(has(a, 'data-touch-target')).toBe(true);
        expect(has(a, 'data-depth-lean')).toBe(true);
        const href = attr(a, 'href')!;
        expect(href.startsWith('/') && !href.startsWith('//'), href).toBe(true);
        expect(new URL(href, 'https://site.test').origin).toBe('https://site.test');
        expect(has(a, 'target')).toBe(false);
        expect(has(a, 'download')).toBe(false);
      }
      expect(links.map((a) => attr(a, 'href'))).toEqual(hrefs);
    }
  });

  it('gives every card the same description and meta line in both groups', () => {
    const lines = (arm: Arm, name: string) => all(doc(cards(arm)), (el) => has(el, name)).map((el) => text(el));
    expect(lines('a', 'data-case-description')).toEqual(HOME_CASES.map((c) => headlineText(c.description)));
    expect(lines('b', 'data-case-description')).toEqual(HOME_CASES.map((c) => headlineText(c.description)));
    expect(lines('a', 'data-depth-meta')).toEqual(HOME_CASES.map((c) => c.meta));
    expect(lines('b', 'data-depth-meta')).toEqual(HOME_CASES.map((c) => c.meta));
  });

  it('pins the approved: every description and meta line, word for word', () => {
    expect(HOME_CASES.map((c) => headlineText(c.description))).toEqual([
      'How I planned and analysed A/B tests at Audible, and why so many of my recommendations were adopted.',
      'Two years of orders from a UK online gift retailer: cohorts, segments and a win-back sample size. Public dataset, rebuilt in 2026.',
      'An analytics dashboard I designed and built around a 7-event taxonomy. A demo, with no real users.',
    ]);
    expect(HOME_CASES.map((c) => c.meta)).toEqual([
      'Sample size, significance testing, 2023 to 2025',
      'SQL, Python, cohort analysis, 2026',
      'Amplitude, React, event taxonomy, 2026',
    ]);
  });

  it('renders both headline strings in one cell of an h3; only the selected one is shown and announced', () => {
    for (const arm of ARMS) {
      const d = doc(cards(arm));
      for (const h of HEADLINES) {
        const card = one(d, (el) => attr(el, 'data-case-card') === h.study);
        const heading = one(card, (el) => has(el, 'data-case-headline'));
        // The card's heading is an h3 (the track's h2 is above it); the headline cell is inside it.
        const h3 = one(card, (el) => el.tagName === 'h3');
        expect(all(h3, (el) => el === heading)).toHaveLength(1);
        expect(classes(heading)).toContain('grid');
        const twins = all(heading, (el) => has(el, 'data-headline-twin'));
        expect(twins.map((t) => attr(t, 'data-headline-twin'))).toEqual(['a', 'b']);
        for (const twin of twins) {
          // The same grid cell: first column, first row, so the taller string sets the height.
          expect(classes(twin)).toEqual(expect.arrayContaining(['col-start-1', 'row-start-1']));
          const selected = attr(twin, 'data-headline-twin') === arm;
          expect(has(twin, 'data-headline-shown')).toBe(selected);
          expect(attr(twin, 'aria-hidden')).toBe(selected ? undefined : 'true');
          expect(classes(twin).includes('invisible')).toBe(!selected);
        }
        expect(text(twins[0]!)).toBe(headlineText(h.a));
        expect(text(twins[1]!)).toBe(headlineText(h.b));
        expect(shownText(heading)).toBe(headlineText(arm === 'a' ? h.a : h.b));
        // The headline holds no link, so the hidden twin can never be a second focusable link.
        expect(all(heading, (el) => el.tagName === 'a' || has(el, 'tabindex'))).toEqual([]);
      }
    }
  });

  it('keeps the headline area at a fixed minimum height, the same in every card and group', () => {
    for (const arm of ARMS) {
      const h3s = all(doc(cards(arm)), (el) => el.tagName === 'h3');
      expect(h3s).toHaveLength(3);
      for (const h3 of h3s) expect(style(h3)).toBe('min-height:3lh');
    }
  });

  it('differs between the groups only in which twin is shown', () => {
    const neutral = (html: string) =>
      html
        .replaceAll(' data-headline-shown=""', '')
        .replaceAll(' aria-hidden="true"', '')
        .replaceAll(' invisible', '');
    expect(cards('a')).not.toBe(cards('b'));
    expect(neutral(cards('a'))).toBe(neutral(cards('b')));
  });

  it('prints the full headline: no ellipsis, clamp, truncation, fixed height or line count', () => {
    for (const arm of ARMS) {
      const html = cards(arm);
      expect(html).not.toMatch(/line-clamp|truncate|text-ellipsis|text-clip|overflow-hidden|whitespace-nowrap|max-h-|\bh-\[|min-h-\[/);
      expect(html).not.toMatch(/…|\.\.\./);
    }
  });

  it('keeps every figure of the hidden twin traceable to the facts data', () => {
    for (const arm of ARMS) {
      const d = doc(cards(arm));
      const ids = all(d, (el) => has(el, 'data-fact')).map((el) => attr(el, 'data-fact'));
      // Retention B (two facts) and Pulse B (one): present in group A too, inside the hidden twin.
      // The Pulse description itself now carries the event count as a fact as well.
      expect(ids).toEqual([
        'retail.returns.yoy_growth_clean',
        'retail.returns.yoy_growth_raw',
        'pulse.events.count',
        'pulse.events.count',
      ]);
      expect(audit(cards(arm))).toEqual([]);
    }
  });

  it('names each card link by its shown headline (the headline is inside the link)', () => {
    for (const arm of ARMS) {
      const d = doc(cards(arm));
      for (const h of HEADLINES) {
        const link = one(d, (el) => attr(el, 'data-case-card') === h.study);
        expect(link.tagName).toBe('a');
        expect(shownText(link)).toContain(headlineText(arm === 'a' ? h.a : h.b));
        expect(attr(one(link, (el) => has(el, 'data-case-headline')), 'id')).toBe(`case-${h.study}-headline`);
      }
    }
  });

  it('renders one card alone the same way', () => {
    const study: Study = 'pulse';
    const d = doc(render(createElement(CaseCard, { study, headlineArm: 'b' })));
    const twins = all(d, (el) => has(el, 'data-headline-twin'));
    expect(twins).toHaveLength(2);
    expect(attr(twins[1]!, 'data-headline-shown')).toBe('');
    expect(all(d, (el) => el.tagName === 'a').map((a) => attr(a, 'href'))).toEqual([HOME_LINKS.pulse]);
  });
});

describe('Hero', () => {
  const html = render(createElement(Hero));
  const d = doc(html);
  const hero = one(d, (el) => has(el, 'data-hero'));
  const band = one(d, (el) => has(el, 'data-depth-band'));

  it('takes no props, so every visitor gets the same hero', () => {
    expect(Hero.length).toBe(0);
    expect(render(createElement(Hero))).toBe(html);
  });

  it('is centred: the chip, the two-tone h1, the sub with two inline chips and two buttons', () => {
    expect(hero.tagName).toBe('section');
    const h1 = one(hero, (el) => el.tagName === 'h1');
    expect(attr(hero, 'aria-labelledby')).toBe(attr(h1, 'id'));
    const chips = all(hero, (el) => has(el, 'data-chip'));
    expect(text(chips[0]!)).toBe('Open to roles in Germany');
    expect(all(chips[0]!, (el) => attr(el, 'data-chip-dot') === 'ok')).toHaveLength(1);
    expect(text(h1)).toBe('Experimentation and AI automation for product and growth teams');
    expect(text(one(h1, (el) => has(el, 'data-quiet')))).toBe('for product and growth teams');
    expect(classes(h1)).toEqual(expect.arrayContaining(['text-display-sm', 'xs:text-display', 'md:text-display-lg']));
    const sub = one(hero, (el) => has(el, 'data-hero-sub'));
    expect(text(sub)).toBe(
      'Analyst in Berlin with nearly two years of A/B testing at Audible (Amazon). I plan and analyse tests that end in a clear recommendation, and build the agents and workflows that take the manual work out.',
    );
    expect(all(sub, (el) => has(el, 'data-chip') && has(el, 'data-inline')).map((el) => text(el))).toEqual(['agents', 'workflows']);
    // The second chip and the last words stay together: one tail that does not wrap from sm up.
    const tail = one(sub, (el) => has(el, 'data-hero-tail'));
    expect(text(tail)).toBe('workflows that take the manual work out.');
    expect(html).not.toContain('I test what works');
  });

  it('ends in one muted proof line under the buttons, its figures Facts, and a quiet link to the work', () => {
    const proof = one(hero, (el) => has(el, 'data-hero-proof'));
    expect(text(proof)).toBe('25+ A/B tests at Audible. A tool my team adopted. 270+ automated software tests in public code. See the work');
    expect(all(proof, (el) => has(el, 'data-fact')).map((el) => attr(el, 'data-fact'))).toEqual(['profile.audible.experiments', 'profile.n8n.automated_tests']);
    expect(html.indexOf('data-hero-proof')).toBeGreaterThan(html.indexOf('data-hero-actions'));
  });

  it('never animates the h1 (the largest contentful paint)', () => {
    const h1 = one(d, (el) => el.tagName === 'h1');
    expect(h1.attrs.map((a) => a.name).filter((n) => n.startsWith('data-depth') || n === 'style')).toEqual([]);
    expect(all(h1, (el) => el.attrs.some((a) => a.name.startsWith('data-depth')))).toEqual([]);
    // No ancestor of the h1 moves either.
    expect(html.slice(0, html.indexOf('<h1'))).not.toMatch(/data-depth-(load|recede|rise|arrive)/);
  });

  it('links Read my CV (secondary) to the CV page and Write to me (primary, the magnet) to Contact', () => {
    const links = all(hero, (el) => el.tagName === 'a');
    expect(links.map((a) => text(a))).toEqual(['Read my CV', 'Write to me', 'See the work']);
    expect(links.map((a) => attr(a, 'href'))).toEqual([CV_LINK.href, CONTACT_HREF, '/work']);
    expect(classes(links[0]!)).toEqual(expect.arrayContaining(['bg-surface']));
    expect(classes(links[1]!)).toEqual(expect.arrayContaining(['bg-ink']));
    expect(text(one(d, (el) => has(el, 'data-depth-magnet')))).toBe('Write to me');
  });

  it('settles the sub line and the two buttons in order, once on load', () => {
    const loads = all(hero, (el) => has(el, 'data-depth-load'));
    expect(loads.map((el) => style(el).replaceAll(' ', ''))).toEqual(['--d:0', '--d:1', '--d:2']);
  });

  it('is followed by the band: three sheets and two links, hidden from assistive technology', () => {
    expect(html.indexOf('data-depth-band')).toBeGreaterThan(html.indexOf('</h1>'));
    const stack = one(band, (el) => has(el, 'data-depth-stack'));
    expect(attr(stack, 'aria-hidden')).toBe('true');
    const sheets = all(stack, (el) => has(el, 'data-depth-sheet'));
    expect(sheets.map((el) => attr(el, 'data-depth-sheet'))).toEqual(['1', '2', '3']);
    expect(all(stack, (el) => has(el, 'data-depth-link'))).toHaveLength(2);
    expect(all(stack, (el) => el.tagName === 'a' || el.tagName === 'button')).toEqual([]);
    const leaves = (node: T.ParentNode): string[] =>
      node.childNodes.flatMap((c) => (c.nodeName === '#text' ? [(c as T.TextNode).value] : isEl(c) ? leaves(c) : []));
    const words = sheets.map((el) => leaves(el).join(' ').replace(/\s+/g, ' ').trim());
    expect(words).toEqual([
      'Test two groups, one metric A baseline B higher planned before the start guardrails intact',
      'Agents each one checks the last Write draft Audit every figure traced Review fresh eyes',
      'Recommendation from the evidence Ship it. Or do not. Either way it is written down, with the reasons. checks passed',
    ]);
  });

  it('says under the band, visibly and outside the hidden stack, what it shows: how I work', () => {
    const caption = one(band, (el) => has(el, 'data-depth-caption'));
    expect(caption.tagName).toBe('p');
    expect(text(caption)).toBe('How I work: a test, the agents that check the work, and the recommendation.');
    expect(shownText(band).trim()).toBe('How I work: a test, the agents that check the work, and the recommendation.');
  });

  it('has no digits in the band and prints figures only in the proof line, as Facts', () => {
    expect(text(band)).not.toMatch(/\d/);
    expect(all(band, (el) => has(el, 'data-fact'))).toEqual([]);
    const proof = one(d, (el) => has(el, 'data-hero-proof'));
    expect(all(d, (el) => has(el, 'data-fact'))).toEqual(all(proof, (el) => has(el, 'data-fact')));
    expect(audit(html)).toEqual([]);
  });
});

describe('ProofRow', () => {
  const html = render(createElement(ProofRow));
  const d = doc(html);
  const proofs = all(d, (el) => has(el, 'data-proof'));

  it('has four figures: two for experiments, two for automation', () => {
    expect(proofs).toHaveLength(4);
    expect(proofs.map((p) => text(one(p, (el) => has(el, 'data-proof-side'))))).toEqual(['Experiments', 'Experiments', 'Automation', 'Automation']);
  });

  it('prints the approved figures and captions, the numbers coming from facts', () => {
    const figures = proofs.map((p) => text(one(p, (el) => has(el, 'data-proof-figure'))));
    expect(figures).toEqual(['25+', '20+', 'about 3 min', '270+']);
    const captions = proofs.map((p) => text(one(p, (el) => has(el, 'data-proof-caption'))));
    expect(captions).toEqual([
      'A/B tests I contributed to at Audible, across web and mobile.',
      'of my recommendations adopted. Why so many?',
      'to set up a test account, down from about 20, with a tool I built. Adopted team-wide, across 11 markets.',
      'automated software tests behind my workflow library for e-invoice intake.',
    ]);
    expect(all(d, (el) => has(el, 'data-fact')).map((el) => attr(el, 'data-fact'))).toEqual([
      'profile.audible.experiments',
      'profile.audible.recommendations_adopted',
      'profile.audible.setup_minutes_after',
      'profile.audible.setup_minutes_before',
      'profile.audible.markets',
      'profile.n8n.automated_tests',
    ]);
    expect(HOME_PROOF.map((p) => p.id)).toEqual(['experiments', 'adopted', 'setup', 'tests']);
  });

  it('keeps the "Why so many?" link with its destination, once', () => {
    const link = one(d, (el) => el.tagName === 'a');
    expect(attr(link, 'href')).toBe(HOME_LINKS.whySoMany);
    expect(text(link)).toBe('Why so many?');
  });

  it('never joins the experiment count with the markets', () => {
    for (const p of proofs) {
      const t = text(p);
      expect(/25\+/.test(t) && /\b11\b/.test(t), t).toBe(false);
    }
  });

  it('passes the truth audit: every figure is a fact', () => {
    expect(audit(html)).toEqual([]);
  });

  it('is four ruled cells: a section ruled from rail to rail, no decorative mark', () => {
    const row = one(d, (el) => has(el, 'data-home-proof'));
    expect(row.tagName).toBe('section');
    expect(has(row, 'data-rule')).toBe(true);
    expect(all(d, (el) => has(el, 'data-proof-mark'))).toEqual([]);
  });

  it('sets the words around a number in a smaller unit size, so every figure stays on one line', () => {
    const units = all(d, (el) => has(el, 'data-proof-unit')).map((el) => text(el));
    expect(units).toEqual(['about ', ' min']);
    // The numbers themselves are never inside a unit.
    for (const u of all(d, (el) => has(el, 'data-proof-unit'))) expect(all(u, (el) => has(el, 'data-fact'))).toEqual([]);
  });
});
