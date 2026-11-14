// The Home page's blocks, rendered on the server: the hero scene, the proof row, the two tracks, the
// tiles, the ribbon of tools, the site tile and the decision band. The three featured cards are the
// tested element of the live experiment: both groups get the same markup, both headline strings sit
// in the same grid cell, and only which one is shown differs. Every figure must come from the facts
// data, including the hidden headline, and every sentence of the approved is pinned once here.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parse, type DefaultTreeAdapterTypes as T } from 'parse5';
import { describe, expect, it } from 'vitest';
import { auditHtml } from '../../../scripts/truth-audit.ts';
import { HEADLINES, HOME_CASES, HOME_AUTOMATION, HOME_PROOF, headlineText, type Study } from '../../../content/home.ts';
import { HOME_LINKS } from '../../../content/home-destinations.ts';
import { SHIPPED_TOOLS } from '../../../content/about';
import { aboutPhoto } from '../../../content/about-photo';
import { FACTS, FACT_DISPLAYS } from '../../../src/lib/facts/facts.generated.ts';
import type { Arm } from '@/experiment.values';
import { toHomeModel } from '@/lib/home/model';
import { snapshotFixture } from '@/lib/home/fixtures';
import { CONTACT, CONTACT_HREF, CV_LINK } from '@/lib/site';

const { CaseCard } = await import('@/components/home/CaseCard');
const { FeaturedCases } = await import('@/components/home/FeaturedCases');
const { Hero } = await import('@/components/home/Hero');
const { ProofRow } = await import('@/components/home/ProofRow');
const { ExperimentsTrack } = await import('@/components/home/ExperimentsTrack');
const { AutomationTrack } = await import('@/components/home/AutomationTrack');
const { WorkTiles } = await import('@/components/home/WorkTiles');
const { ToolsRibbon } = await import('@/components/home/ToolsRibbon');
const { SiteTile } = await import('@/components/home/SiteTile');
const { DecisionBand } = await import('@/components/home/DecisionBand');

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
      'An analytics dashboard I designed and built around a seven-event taxonomy. A demo, with no real users.',
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
      expect(ids).toEqual(['retail.returns.yoy_growth_clean', 'retail.returns.yoy_growth_raw', 'pulse.events.count']);
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

describe('ExperimentsTrack', () => {
  const html = render(createElement(ExperimentsTrack, { headlineArm: 'a' }));
  const d = doc(html);

  it('is the section #work, headed "Experiments and analytics", with its lede and the cards region', () => {
    const section = one(d, (el) => el.tagName === 'section' && attr(el, 'id') === 'work');
    const h2 = one(section, (el) => el.tagName === 'h2');
    expect(text(h2)).toBe('Experiments and analytics');
    expect(attr(h2, 'data-depth-rise')).toBe('heading');
    expect(attr(section, 'aria-labelledby')).toBe(attr(h2, 'id'));
    expect(text(one(section, (el) => el.tagName === 'p' && classes(el).includes('text-lg') && !has(el, 'data-case-description')))).toBe(
      'How I plan a test, read it honestly and get to a decision.',
    );
    expect(all(section, (el) => attr(el, 'data-experiment') === 'cards')).toHaveLength(1);
  });

  it('passes the truth audit', () => {
    expect(audit(html)).toEqual([]);
  });
});

describe('Hero', () => {
  const html = render(createElement(Hero));
  const d = doc(html);

  it('takes no props, so every visitor gets the same hero', () => {
    expect(Hero.length).toBe(0);
    expect(render(createElement(Hero))).toBe(html);
  });

  it('is the depth scene, with the approved h1 and sub line', () => {
    const scene = one(d, (el) => has(el, 'data-depth-scene'));
    expect(scene.tagName).toBe('section');
    expect(has(scene, 'data-hero')).toBe(true);
    const h1 = one(d, (el) => el.tagName === 'h1');
    expect(text(h1)).toBe('I test what works, and automate the rest.');
    expect(attr(scene, 'aria-labelledby')).toBe(attr(h1, 'id'));
    expect(classes(h1)).toEqual(expect.arrayContaining(['text-display-sm', 'md:text-display', 'lg:text-display-lg']));
    expect(text(one(d, (el) => has(el, 'data-hero-sub')))).toBe(
      'Analyst in Berlin for experimentation and AI automation. Nearly two years of A/B testing at Audible (Amazon), and I build the agents and workflows that take the manual work out of analysis.',
    );
  });

  it('never animates the h1 (the largest contentful paint) and recedes only the text block', () => {
    const h1 = one(d, (el) => el.tagName === 'h1');
    expect(h1.attrs.map((a) => a.name).filter((n) => n.startsWith('data-depth'))).toEqual([]);
    const block = one(d, (el) => has(el, 'data-depth-recede'));
    expect(has(block, 'data-depth-load')).toBe(false);
    expect(all(block, (el) => el.tagName === 'h1')).toHaveLength(1);
    expect(all(block, (el) => el.tagName === 'a')).toHaveLength(3);
  });

  it('settles the sub line and the three buttons in order, and gives the primary button the magnet', () => {
    const loads = all(d, (el) => has(el, 'data-depth-load'));
    expect(loads.map((el) => style(el).replaceAll(' ', ''))).toEqual(['--d:0', '--d:1', '--d:2', '--d:3']);
    for (const [i, b] of loads.slice(1).entries()) expect(all(b, (el) => el.tagName === 'a'), `button ${i + 1}`).toHaveLength(1);
    const magnet = one(d, (el) => has(el, 'data-depth-magnet'));
    expect(text(magnet)).toBe('See the evidence');
  });

  it('links See the evidence to #work, the CV to the CV page and Contact to the contact page', () => {
    const links = all(d, (el) => el.tagName === 'a');
    expect(links.map((a) => text(a))).toEqual(['See the evidence', 'CV', 'Contact']);
    expect(links.map((a) => attr(a, 'href'))).toEqual(['#work', CV_LINK.href, CONTACT_HREF]);
  });

  it('holds the evidence field, hidden from assistive technology, beside the text', () => {
    const field = one(d, (el) => has(el, 'data-depth-field'));
    expect(attr(field, 'aria-hidden')).toBe('true');
    expect(all(d, (el) => has(el, 'data-depth-row'))).toHaveLength(26);
  });

  it('prints no figure and no planner', () => {
    expect(all(d, (el) => has(el, 'data-fact'))).toEqual([]);
    expect(html).not.toMatch(/data-hero-simulator|hero-planner|data-hero-evidence/);
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
      'to set up a test account, down from about 20, with a tool I built. Used across 11 markets.',
      'automated tests behind my workflow library for e-invoice intake.',
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
});

describe('AutomationTrack', () => {
  const html = render(createElement(AutomationTrack));
  const d = doc(html);

  it('is headed "Automation and agents" with the approved lede', () => {
    const section = one(d, (el) => attr(el, 'data-home-track') === 'automation');
    const h2 = one(section, (el) => el.tagName === 'h2');
    expect(text(h2)).toBe('Automation and agents');
    expect(attr(h2, 'data-depth-rise')).toBe('heading');
    expect(attr(section, 'aria-labelledby')).toBe(attr(h2, 'id'));
    expect(text(one(section, (el) => el.tagName === 'p' && classes(el).includes('text-lg')))).toBe(
      'Tools I built so that people, including me, stop doing the same thing by hand.',
    );
  });

  it('has four medium lean cards to the existing pages, in order, with the approved lines', () => {
    const links = all(d, (el) => el.tagName === 'a');
    expect(links.map((a) => attr(a, 'href'))).toEqual([
      '/work/audible#automation',
      '/work/docproof',
      '/work/n8n',
      '/work/marketingws',
    ]);
    for (const a of links) {
      expect(has(a, 'data-depth-lean')).toBe(true);
      expect(attr(a, 'data-size')).toBe('md');
      // They are not the experiment's cards.
      expect(has(a, 'data-experiment-click')).toBe(false);
    }
    expect(links.map((a) => text(one(a, (el) => el.tagName === 'h3')))).toEqual([
      'Test-account automation',
      'Docproof',
      'n8n workflow library',
      'MarketingWS',
    ]);
    expect(HOME_AUTOMATION.map((c) => headlineText(c.description))).toEqual([
      'Tampermonkey with a step recorder. It cut test-account setup at Audible from about 20 to about 3 minutes and was adopted team-wide.',
      'Three agents propose changes to a document, and deterministic checks decide what reaches the reader. Open source, tested in CI, no users yet.',
      'E-invoice intake and error alerts as reusable workflows, with 270+ automated tests. A portfolio project, not used by a client.',
      "Copy variants for marketing workflows from one brief. The live demo runs on Groq's free tier.",
    ]);
    expect(links.map((a) => text(one(a, (el) => has(el, 'data-depth-meta'))))).toEqual([
      'Browser automation, across markets',
      'Multi-agent orchestration, Claude Code',
      'n8n, XRechnung, ZUGFeRD',
      'Python, FastAPI, Groq',
    ]);
  });

  it('prints its figures from facts and passes the truth audit', () => {
    expect(all(d, (el) => has(el, 'data-fact')).map((el) => attr(el, 'data-fact'))).toEqual([
      'profile.audible.setup_minutes_before',
      'profile.audible.setup_minutes_after',
      'profile.n8n.automated_tests',
    ]);
    expect(text(d)).toContain('Tampermonkey with a step recorder');
    expect(text(d)).not.toMatch(/deployed|in production|\bused by (?!a client)/i);
    expect(audit(html)).toEqual([]);
  });
});

describe('WorkTiles', () => {
  const d = doc(render(createElement(WorkTiles)));

  it('opens "I test." (surface) from the left and "I automate." (ink) from the right', () => {
    const tiles = all(d, (el) => has(el, 'data-tile'));
    expect(tiles.map((t) => attr(t, 'data-tile'))).toEqual(['', 'ink']);
    expect(tiles.map((t) => attr(t, 'data-depth-book'))).toEqual(['left', 'right']);
    expect(tiles.map((t) => text(one(t, (el) => el.tagName === 'h3')))).toEqual(['I test.', 'I automate.']);
  });

  it('prints the approved lines, each on a rule that draws in', () => {
    const items = all(d, (el) => el.tagName === 'li');
    expect(items.map((li) => text(li))).toEqual([
      'I plan the sample size and the run time before a test starts.',
      'I read the result against the primary metric and its guardrails.',
      'I write the recommendation: ship it, or do not.',
      'I turn repeated manual steps into tools a whole team uses.',
      'I build agents that work in steps and check each other.',
      'I put automated tests around every workflow, so it stays right.',
    ]);
    for (const li of items) expect(has(li, 'data-depth-draw')).toBe(true);
  });
});

describe('ToolsRibbon', () => {
  const d = doc(render(createElement(ToolsRibbon)));

  it("is the About page's tools list, labelled \"Tools I work with\", each item once", () => {
    const ribbon = one(d, (el) => has(el, 'data-depth-ribbon'));
    const list = one(ribbon, (el) => el.tagName === 'ul');
    expect(attr(list, 'aria-label')).toBe('Tools I work with');
    const items = all(list, (el) => el.tagName === 'li').map((li) => text(li));
    expect(items).toEqual(SHIPPED_TOOLS.map((t) => t.tool));
    expect(new Set(items).size).toBe(items.length);
  });
});

describe('SiteTile', () => {
  type Mode = Parameters<typeof snapshotFixture>[0];
  const tile = (m: Mode) => render(createElement(SiteTile, { model: toHomeModel(snapshotFixture(m), 'b') }));

  it('says the approved heading and sentence, then the note, then the two buttons', () => {
    const html = tile('calibration');
    const root = one(doc(html), (el) => has(el, 'data-home-site'));
    expect(text(one(root, (el) => el.tagName === 'h3'))).toBe('This site is part of the evidence.');
    expect(text(all(root, (el) => el.tagName === 'p' && classes(el).includes('text-lg'))[0]!)).toBe(
      'It runs its own pre-registered A/B test on the three experiment cards above. I built it with coding agents, and every change passes its automated checks before it ships.',
    );
    // Order: sentence, note, buttons.
    expect(html.indexOf('data-home-note')).toBeGreaterThan(html.indexOf('pre-registered'));
    expect(html.indexOf('See the live test')).toBeGreaterThan(html.indexOf('data-home-note'));
    const buttons = all(root, (el) => el.tagName === 'a' && classes(el).includes('rounded-pill'));
    expect(buttons.map((a) => text(a))).toEqual(['See the live test', 'Try the Lab']);
    expect(buttons.map((a) => attr(a, 'href'))).toEqual([HOME_LINKS.experiment, HOME_LINKS.lab]);
  });

  it('shows the existing note while the test runs, and none before the start', () => {
    expect(all(doc(tile('calibration')), (el) => has(el, 'data-home-note'))).toHaveLength(1);
    expect(all(doc(tile('not-started')), (el) => has(el, 'data-home-note'))).toHaveLength(0);
  });

  it('types no numeral, and says nothing about a count of checks', () => {
    expect(text(doc(tile('not-started')))).not.toMatch(/\d|more than/);
  });
});

describe('DecisionBand', () => {
  const d = doc(render(createElement(DecisionBand)));

  it('says "Your call." as a scaling h2, then the looking-for sentence', () => {
    const section = one(d, (el) => el.tagName === 'section');
    const h2 = one(section, (el) => el.tagName === 'h2');
    expect(text(h2)).toBe('Your call.');
    expect(has(h2, 'data-depth-scale')).toBe(true);
    expect(attr(section, 'aria-labelledby')).toBe(attr(h2, 'id'));
    expect(text(one(section, (el) => el.tagName === 'p'))).toBe(
      'Open to roles in AI automation, experimentation and product analytics in Germany. Based in Berlin.',
    );
  });

  it('has Write to me, Read my CV and LinkedIn', () => {
    const links = all(d, (el) => el.tagName === 'a');
    expect(links.map((a) => text(a))).toEqual(['Write to me', 'Read my CV', 'LinkedIn']);
    expect(links.map((a) => attr(a, 'href'))).toEqual([CONTACT_HREF, CV_LINK.href, CONTACT.linkedin]);
    expect(attr(links[2]!, 'rel')).toBe('noopener');
  });

  it("shows the About page's photograph, lazily loaded, drifting against the scroll", () => {
    const wrap = one(d, (el) => has(el, 'data-depth-parallax'));
    const img = one(wrap, (el) => el.tagName === 'img');
    expect(attr(img, 'alt')).toBe(aboutPhoto.alt);
    expect(attr(img, 'loading')).toBe('lazy');
    expect(decodeURIComponent(attr(img, 'src') ?? '')).toContain(aboutPhoto.src);
  });

  it('claims no work authorisation and no phone number', () => {
    expect(text(d)).not.toMatch(/visa|permit|authori[sz]ation|\+?\d[\d ()-]{7,}/i);
  });
});
