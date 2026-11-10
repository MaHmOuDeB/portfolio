// The Home page's hero, featured case-study cards and "Tools I've built" rows, rendered on the
// server. The cards are the tested element of the live experiment: both groups get the same
// markup, both headline strings sit in the same grid cell, and only which one is shown differs.
// Every figure must come from the facts data, including the hidden headline.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parse, type DefaultTreeAdapterTypes as T } from 'parse5';
import { describe, expect, it, vi } from 'vitest';
import { auditHtml } from '../../../scripts/truth-audit.ts';
import { HEADLINES, HOME_CASES, HOME_HERO, HOME_TOOLS, headlineText, type Study } from '../../../content/home.ts';
import { HOME_LINKS } from '../../../content/home-destinations.ts';
import { FACTS, FACT_DISPLAYS } from '../../../src/lib/facts/facts.generated.ts';
import type { Arm } from '@/experiment.values';
import { CONTACT, CV_LINK, SITE } from '@/lib/site';

// The planner island reads the URL with next/navigation, which has no router in a unit test. Its
// own tests cover it; here it is a marked stand-in, so the hero's own markup is what is checked.
vi.mock('@/components/home/HeroSimulator', () => ({
  HERO_PLANNER_ID: 'hero-planner',
  HeroSimulator: () => createElement('div', { 'data-hero-simulator': '' }),
}));

const { CaseCard } = await import('@/components/home/CaseCard');
const { FeaturedCases } = await import('@/components/home/FeaturedCases');
const { Hero } = await import('@/components/home/Hero');
const { Tools } = await import('@/components/home/Tools');

const ARMS: readonly Arm[] = ['a', 'b'];
const NBSP = '\u00a0';

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

const cards = (arm: Arm) => renderToStaticMarkup(createElement(FeaturedCases, { headlineArm: arm }));

// ---------------------------------------------------------------------------------------------

describe('FeaturedCases', () => {
  it('is one labelled cards region with three cards, in the order of the headlines', () => {
    for (const arm of ARMS) {
      const d = doc(cards(arm));
      const region = one(d, (el) => attr(el, 'data-experiment') === 'cards');
      expect(region.tagName).toBe('section');
      expect(attr(region, 'aria-label')).toBe('Featured case studies');
      const list = all(region, (el) => has(el, 'data-case-card'));
      expect(list.map((el) => attr(el, 'data-case-card'))).toEqual(HEADLINES.map((h) => h.study));
    }
  });

  it('has three marked same-origin card links, the same hrefs and link text in both groups', () => {
    const hrefs = HOME_CASES.map((c) => c.href);
    for (const arm of ARMS) {
      const d = doc(cards(arm));
      const links = all(d, (el) => el.tagName === 'a');
      // Only the card links are links: no second focusable link inside a headline.
      expect(links).toHaveLength(3);
      for (const a of links) {
        expect(attr(a, 'data-experiment-click')).toBe('card');
        const href = attr(a, 'href')!;
        expect(href.startsWith('/') && !href.startsWith('//'), href).toBe(true);
        expect(new URL(href, 'https://site.test').origin).toBe('https://site.test');
        expect(text(a)).toBe('Read the case study');
        expect(has(a, 'target')).toBe(false);
        expect(has(a, 'download')).toBe(false);
      }
      expect(links.map((a) => attr(a, 'href'))).toEqual(hrefs);
    }
  });

  it('gives every card the same description in both groups', () => {
    const descriptions = (arm: Arm) =>
      all(doc(cards(arm)), (el) => has(el, 'data-case-description')).map((el) => text(el));
    const expected = HOME_CASES.map((c) => headlineText(c.description));
    expect(descriptions('a')).toEqual(expected);
    expect(descriptions('b')).toEqual(expected);
  });

  it('renders both headline strings in one cell; only the selected one is shown and announced', () => {
    for (const arm of ARMS) {
      const d = doc(cards(arm));
      for (const h of HEADLINES) {
        const card = one(d, (el) => attr(el, 'data-case-card') === h.study);
        const heading = one(card, (el) => has(el, 'data-case-headline'));
        expect(heading.tagName).toBe('h2');
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
      expect(ids).toEqual(['retail.returns.yoy_growth_clean', 'retail.returns.yoy_growth_raw', 'pulse.events.count']);
      expect(audit(cards(arm))).toEqual([]);
    }
  });

  it('describes each card link by its own headline, the same reference in both groups', () => {
    for (const arm of ARMS) {
      const d = doc(cards(arm));
      for (const h of HEADLINES) {
        const card = one(d, (el) => attr(el, 'data-case-card') === h.study);
        const heading = one(card, (el) => has(el, 'data-case-headline'));
        const link = one(card, (el) => el.tagName === 'a');
        expect(attr(heading, 'id')).toBe(`case-${h.study}-headline`);
        expect(attr(link, 'aria-describedby')).toBe(`case-${h.study}-headline`);
      }
    }
  });

  it('stacks the cards below lg and puts them in three columns that share rows at lg', () => {
    const d = doc(cards('a'));
    const region = one(d, (el) => attr(el, 'data-experiment') === 'cards');
    expect(classes(region)).toEqual(expect.arrayContaining(['grid', 'lg:grid-cols-3']));
    for (const card of all(region, (el) => has(el, 'data-case-card'))) {
      expect(classes(card)).toEqual(expect.arrayContaining(['lg:row-span-4', 'lg:grid-rows-subgrid']));
    }
  });

  it('renders one card alone the same way', () => {
    const study: Study = 'pulse';
    const html = renderToStaticMarkup(createElement(CaseCard, { study, headlineArm: 'b' }));
    const d = doc(html);
    const twins = all(d, (el) => has(el, 'data-headline-twin'));
    expect(twins).toHaveLength(2);
    expect(attr(twins[1]!, 'data-headline-shown')).toBe('');
    expect(all(d, (el) => el.tagName === 'a').map((a) => attr(a, 'href'))).toEqual([HOME_LINKS.pulse]);
  });
});

describe('Hero', () => {
  const html = renderToStaticMarkup(createElement(Hero));
  const d = doc(html);

  it('takes no props, so every visitor gets the same hero', () => {
    expect(Hero.length).toBe(0);
    expect(renderToStaticMarkup(createElement(Hero))).toBe(html);
  });

  it('names him in one h1 with a non-breaking space in the surname', () => {
    const h1 = one(d, (el) => el.tagName === 'h1');
    expect(text(h1)).toBe(`Mahmoud El${NBSP}Bergui`);
    expect(text(h1).replace(NBSP, ' ')).toBe(SITE.name);
    expect(classes(h1)).toEqual(expect.arrayContaining(['text-display-sm', 'md:text-display']));
  });

  it('prints the approved role, place and proof lines', () => {
    expect(HOME_HERO.role).toBe(SITE.role);
    const role = one(d, (el) => has(el, 'data-hero-role'));
    expect(text(role)).toBe('Experimentation & growth analyst');
    expect(classes(role)).toEqual(expect.arrayContaining(['text-lg']));
    expect(text(one(d, (el) => has(el, 'data-hero-place')))).toBe('Berlin, MSc Data Science');
    const proof = one(d, (el) => has(el, 'data-hero-proof'));
    expect(text(proof)).toBe(
      'Nearly two years at Audible (Amazon): 25+ A/B tests across web and mobile, 20+ recommendations adopted. Why so many?',
    );
    expect(all(proof, (el) => has(el, 'data-fact')).map((el) => attr(el, 'data-fact'))).toEqual([
      'profile.audible.experiments',
      'profile.audible.recommendations_adopted',
    ]);
    const why = one(proof, (el) => el.tagName === 'a');
    expect(attr(why, 'href')).toBe(HOME_LINKS.whySoMany);
    expect(text(why)).toBe('Why so many?');
  });

  it('never joins the experiments with the markets, and names no street, phone or visa', () => {
    const t = text(d);
    expect(t).not.toMatch(/markets?/i);
    expect(t).not.toMatch(/\+\d|\bvisa\b|work permit|authori[sz]ation|stra(ss|ß)e|street/i);
    expect(t).not.toMatch(/Germany/);
    expect(SITE.city).toBe('Berlin, Germany');
  });

  it('links Try the lab, CV (PDF) and LinkedIn; the CV button is hidden on phones', () => {
    const lab = one(d, (el) => el.tagName === 'a' && text(el) === 'Try the lab');
    expect(attr(lab, 'href')).toBe(HOME_LINKS.lab);
    const cv = one(d, (el) => el.tagName === 'a' && text(el).includes(CV_LINK.label));
    expect(attr(cv, 'href')).toBe(CV_LINK.href);
    expect(has(cv, 'download')).toBe(true);
    const cvWrap = one(d, (el) => has(el, 'data-hero-cv'));
    expect(classes(cvWrap)).toEqual(expect.arrayContaining(['hidden', 'md:block']));
    const linkedin = one(d, (el) => el.tagName === 'a' && text(el) === 'LinkedIn');
    expect(attr(linkedin, 'href')).toBe(CONTACT.linkedin);
    expect(attr(linkedin, 'rel')).toBe('noopener');
  });

  it('puts the name across the page and splits identity and evidence 7/5 below it from lg', () => {
    const grid = one(d, (el) => has(el, 'data-hero-columns'));
    expect(classes(grid)).toEqual(expect.arrayContaining(['lg:grid-cols-12']));
    expect(classes(one(d, (el) => has(el, 'data-hero-identity')))).toContain('lg:col-span-7');
    const evidence = one(d, (el) => has(el, 'data-hero-evidence'));
    expect(classes(evidence)).toContain('lg:col-span-5');
    one(evidence, (el) => has(el, 'data-hero-simulator'));
    // The name is outside the grid, so it spans the full width.
    expect(all(grid, (el) => el.tagName === 'h1')).toEqual([]);
  });

  it('passes the truth audit: every figure is a fact', () => {
    expect(audit(html)).toEqual([]);
  });
});

describe('Tools', () => {
  const html = renderToStaticMarkup(createElement(Tools));
  const d = doc(html);

  it('is a section titled "Tools I\'ve built" with one row per tool, in order', () => {
    const section = one(d, (el) => has(el, 'data-home-tools'));
    const h2 = one(section, (el) => el.tagName === 'h2');
    expect(text(h2)).toBe("Tools I've built");
    expect(attr(section, 'aria-labelledby')).toBe(attr(h2, 'id'));
    const rows = all(section, (el) => has(el, 'data-tool'));
    expect(rows.map((r) => attr(r, 'data-tool'))).toEqual(HOME_TOOLS.map((t) => t.id));
  });

  it('names each tool as a link to its page and prints its approved line', () => {
    for (const tool of HOME_TOOLS) {
      const row = one(d, (el) => attr(el, 'data-tool') === tool.id);
      const link = one(row, (el) => el.tagName === 'a');
      expect(attr(link, 'href')).toBe(tool.href);
      expect(text(link)).toBe(tool.name);
      expect(text(one(row, (el) => has(el, 'data-tool-line')))).toBe(headlineText(tool.parts));
    }
    expect(text(d)).toContain('Tampermonkey with a step recorder');
  });

  it('prints the automation figures from facts and passes the truth audit', () => {
    const row = one(d, (el) => attr(el, 'data-tool') === 'automation');
    expect(all(row, (el) => has(el, 'data-fact')).map((el) => attr(el, 'data-fact'))).toEqual([
      'profile.audible.setup_minutes_before',
      'profile.audible.setup_minutes_after',
      'profile.audible.markets',
    ]);
    expect(audit(html)).toEqual([]);
  });
});

describe('HOME_HERO', () => {
  it('types no numeral; its figures are fact parts', () => {
    const strings = [HOME_HERO.role, HOME_HERO.place, ...HOME_HERO.proof.filter((p): p is string => typeof p === 'string')];
    for (const s of strings) expect(s, s).not.toMatch(/\d/);
  });
});
