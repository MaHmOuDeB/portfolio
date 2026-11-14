// The Home page's content as data: fact text, the frozen card headlines, the case-study and tool
// lines, and the site destinations. Every figure here must come from the facts data.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  HEADLINES,
  HOME_CASES,
  HOME_AUTOMATION,
  HOME_HERO,
  HOME_PROOF,
  HOME_SITE,
  HOME_TILES,
  HOME_TRACKS,
  HOME_DECISION,
  headlineText,
  type HeadlinePart,
  type Study,
} from '../../../content/home.ts';
import { HOME_DESTINATIONS, HOME_LINKS } from '../../../content/home-destinations.ts';
import { FACTS, getFact, type FactId } from '@/lib/facts';
import { factText } from '@/lib/facts/text';
import { CV_LINK, NAV } from '@/lib/site';

const repo = join(import.meta.dirname, '../../..');
const codePoints = (s: string) => [...s].length;
const factIds = (parts: readonly HeadlinePart[]): FactId[] =>
  parts.flatMap((p) => (typeof p === 'string' ? [] : [p.fact]));
const caseOf = (study: Study) => {
  const found = HOME_CASES.find((c) => c.study === study);
  if (!found) throw new Error(`no case for ${study}`);
  return found;
};
const automationOf = (id: string) => {
  const found = HOME_AUTOMATION.find((t) => t.id === id);
  if (!found) throw new Error(`no automation card ${id}`);
  return found;
};
const stringParts = (parts: readonly HeadlinePart[]): string[] =>
  parts.filter((p): p is string => typeof p === 'string');

// Same character classes as scripts/design-lint.ts (arrows, middle dots, emoji and check marks).
const BANNED_CHARS =
  /[←-⇿⟰-⟿⤀-⥿➔-➿⬅-⬇›]|[·•∙⋅‧・]|\p{Emoji_Presentation}|\p{Extended_Pictographic}️|[☐-☒✓-✘]/u;

describe('factText', () => {
  it('prints a fact the way <Fact> does', () => {
    expect(factText('profile.audible.experiments')).toBe('25+');
    expect(factText('profile.audible.markets')).toBe('11');
    expect(factText('retail.returns.yoy_growth_clean')).toBe('2%');
    expect(factText('retail.returns.yoy_growth_raw')).toBe('29%');
    expect(factText('retention.data.first_date')).toBe('1 Dec 2009');
  });

  it('takes the decimals option and uses the true minus sign', () => {
    expect(factText('retail.returns.rate_2010_clean')).toBe('2.1%');
    expect(factText('retail.returns.rate_2010_clean', { decimals: 0 })).toBe('2%');
    expect(factText('retail.revenue.yoy_growth_clean')).toBe('−1%');
    expect(factText('retail.revenue.yoy_growth_clean', { decimals: 1 })).toBe('−1.3%');
  });

  it('fails loudly on an id that is not in the facts data', () => {
    expect(() => factText('no.such.fact' as FactId)).toThrow(/unknown fact/);
  });
});

describe('headlineText', () => {
  it('joins plain text and facts in order', () => {
    expect(headlineText(['Returns grew ', { fact: 'retail.returns.yoy_growth_raw' }, ' on paper'])).toBe(
      'Returns grew 29% on paper',
    );
    expect(headlineText([])).toBe('');
    expect(headlineText(['plain'])).toBe('plain');
  });
});

describe('the frozen card headlines', () => {
  it('cover three studies in the frozen order, each with a group A and a group B headline', () => {
    expect(HEADLINES.map((h) => h.study)).toEqual(['audible', 'retention', 'pulse']);
    for (const h of HEADLINES) {
      expect(h.a.length).toBeGreaterThan(0);
      expect(h.b.length).toBeGreaterThan(0);
    }
  });

  it('read as the approved wording once their facts are printed', () => {
    const rendered = HEADLINES.map((h) => [h.study, headlineText(h.a), headlineText(h.b)]);
    expect(rendered).toEqual([
      ['audible', 'How I run experiments', 'Most tests pitted personalisation against plain baselines'],
      [
        'retention',
        'Customer retention and reactivation analysis',
        'Reversed orders turned 2% returns growth into 29%',
      ],
      ['pulse', 'Pulse: analytics instrumentation demo', '7 events, each designed to answer a product question'],
    ]);
  });

  it('are 60 Unicode code points or fewer, all six', () => {
    const six = HEADLINES.flatMap((h) => [headlineText(h.a), headlineText(h.b)]);
    expect(six).toHaveLength(6);
    for (const text of six) expect(codePoints(text), text).toBeLessThanOrEqual(60);
  });

  it('name only facts that exist, and never type a numeral', () => {
    for (const h of HEADLINES) {
      for (const parts of [h.a, h.b]) {
        for (const id of factIds(parts)) {
          expect(Object.hasOwn(FACTS, id), id).toBe(true);
          expect(() => getFact(id)).not.toThrow();
        }
        for (const s of stringParts(parts)) expect(s, s).not.toMatch(/\d/);
      }
    }
  });
});

describe('the featured case studies', () => {
  const byStudy = {
    audible: caseOf('audible'),
    retention: caseOf('retention'),
    pulse: caseOf('pulse'),
  };

  it('are the three studies of the headlines, in the same order', () => {
    expect(HOME_CASES).toHaveLength(3);
    expect(HOME_CASES.map((c) => c.study)).toEqual(HEADLINES.map((h) => h.study));
  });

  it('link to same-origin site paths that the destinations list holds', () => {
    for (const c of HOME_CASES) {
      expect(c.href.startsWith('/') && !c.href.startsWith('//'), c.href).toBe(true);
      expect(c.href).not.toMatch(/[\\\s]/);
      expect(new URL(c.href, 'https://site.test').origin, c.href).toBe('https://site.test');
      expect(HOME_DESTINATIONS, c.href).toContain(c.href);
    }
    expect(HOME_CASES.map((c) => c.href)).toEqual([
      '/work/audible#why-so-many',
      '/work/retention',
      '/work/pulse',
    ]);
  });

  it('describe each study with the approved line and meta', () => {
    expect(headlineText(byStudy.audible.description)).toBe(
      'How I planned and analysed A/B tests at Audible, and why so many of my recommendations were adopted.',
    );
    expect(headlineText(byStudy.retention.description)).toBe(
      'Two years of orders from a UK online gift retailer: cohorts, segments and a win-back sample size. Public dataset, rebuilt in 2026.',
    );
    expect(headlineText(byStudy.pulse.description)).toBe(
      'An analytics dashboard I designed and built around a 7-event taxonomy. A demo, with no real users.',
    );
    expect(HOME_CASES.map((c) => c.meta)).toEqual([
      'Sample size, significance testing, 2023 to 2025',
      'SQL, Python, cohort analysis, 2026',
      'Amplitude, React, event taxonomy, 2026',
    ]);
  });

  it('keep the Audible line to what he planned, analysed and recommended', () => {
    const text = headlineText(byStudy.audible.description);
    expect(text).not.toMatch(/\b(run|ran|runs|decide|decided|defined|won|shipped)\b/i);
    expect(text).toMatch(/recommendations were adopted/);
  });

  it('call the rebuilt analysis a public dataset, and Pulse a demo with no real users', () => {
    expect(headlineText(byStudy.retention.description)).toMatch(/Public dataset, rebuilt in 2026/);
    expect(headlineText(byStudy.pulse.description)).toMatch(/no real users/);
    expect(headlineText(byStudy.pulse.description)).not.toMatch(/A\/B|experiment|result/i);
  });

  it('type no numeral except a year from 2008 to 2030, and name only facts that exist', () => {
    for (const c of HOME_CASES) {
      for (const id of factIds(c.description)) expect(Object.hasOwn(FACTS, id), id).toBe(true);
      for (const s of stringParts(c.description)) {
        expect(s.replace(/\b20(?:0[89]|[12]\d|30)\b/g, ''), s).not.toMatch(/\d/);
      }
      expect(c.meta.replace(/\b20(?:0[89]|[12]\d|30)\b/g, ''), c.meta).not.toMatch(/\d/);
    }
  });
});

describe('the automation cards', () => {
  const byId = {
    automation: automationOf('automation'),
    docproof: automationOf('docproof'),
    n8n: automationOf('n8n'),
    marketingws: automationOf('marketingws'),
  };

  it('are the automation tool, Docproof, n8n and MarketingWS, with existing destinations', () => {
    expect(HOME_AUTOMATION.map((t) => t.id)).toEqual(['automation', 'docproof', 'n8n', 'marketingws']);
    expect(HOME_AUTOMATION.map((t) => t.href)).toEqual([
      '/work/audible#automation',
      '/work/docproof',
      '/work/n8n',
      '/work/marketingws',
    ]);
    for (const t of HOME_AUTOMATION) {
      expect(HOME_DESTINATIONS, t.href).toContain(t.href);
      expect(new URL(t.href, 'https://site.test').origin).toBe('https://site.test');
    }
  });

  it('say the approved lines, with the figures printed from facts', () => {
    expect(headlineText(byId.automation.description)).toBe(
      'Tampermonkey with a step recorder. It cut test-account setup at Audible from about 20 to about 3 minutes and was adopted team-wide.',
    );
    expect(headlineText(byId.docproof.description)).toBe(
      'Separate agents write, audit and review a document, and deterministic checks decide what reaches the reader. Open source, tested in CI, no users yet.',
    );
    expect(headlineText(byId.n8n.description)).toBe(
      'E-invoice intake and error alerts as reusable workflows, with 270+ automated tests. A portfolio project, not used by a client.',
    );
    expect(headlineText(byId.marketingws.description)).toBe(
      "Copy variants for marketing workflows from one brief. The live demo runs on Groq's free tier.",
    );
    expect(factIds(byId.automation.description)).toEqual([
      'profile.audible.setup_minutes_before',
      'profile.audible.setup_minutes_after',
    ]);
    expect(factIds(byId.n8n.description)).toEqual(['profile.n8n.automated_tests']);
    expect(HOME_AUTOMATION.map((t) => headlineText(t.meta))).toEqual([
      'Browser automation, 11 markets',
      'Multi-agent orchestration, Claude Code',
      'n8n, XRechnung, ZUGFeRD',
      'Python, FastAPI, Groq',
    ]);
  });

  it('keep the limits: the tool is the step recorder, n8n has no client, nothing is deployed', () => {
    expect(headlineText(byId.automation.description)).toMatch(/^Tampermonkey with a step recorder\. /);
    expect(headlineText(byId.n8n.description)).toMatch(/not used by a client/);
    for (const t of HOME_AUTOMATION) expect(headlineText(t.description), t.id).not.toMatch(/deployed|in production|job|CV|AI-powered/i);
  });

  it('type no numeral and name only facts that exist', () => {
    for (const t of HOME_AUTOMATION) {
      for (const id of factIds(t.description)) expect(Object.hasOwn(FACTS, id), id).toBe(true);
      for (const s of stringParts(t.description)) expect(s, s).not.toMatch(/\d/);
      for (const id of factIds(t.meta)) expect(Object.hasOwn(FACTS, id), id).toBe(true);
      const meta = stringParts(t.meta).join('');
      expect(meta.replace(/n8n/g, ''), meta).not.toMatch(/\d/);
      expect(t.title.length).toBeGreaterThan(0);
    }
  });
});

describe('the hero, proof row, tiles, site tile and decision band', () => {
  it('say the approved words', () => {
    expect(HOME_HERO.title).toBe('I test what works, and automate the rest.');
    expect(HOME_HERO.sub).toBe(
      'Analyst in Berlin for experimentation and AI automation. Nearly two years of A/B testing at Audible (Amazon), and I build agents and workflows that take over repetitive manual steps.',
    );
    expect([HOME_HERO.evidence, HOME_HERO.cv, HOME_HERO.contact]).toEqual(['See the evidence', 'CV', 'Contact']);
    expect(HOME_TRACKS.experiments).toEqual({
      title: 'Experiments and analytics',
      lede: 'How I plan a test, read it honestly and write the recommendation.',
    });
    expect(HOME_TRACKS.automation).toEqual({
      title: 'Automation and agents',
      lede: 'Tools I built so that people, including me, stop doing the same thing by hand.',
    });
    expect(HOME_SITE).toEqual({
      title: 'This site is part of the evidence.',
      text: 'It runs its own pre-registered A/B test on the three experiment cards above. I built it with coding agents, and every change passes its automated checks before it ships.',
      live: 'See the live test',
      lab: 'Try the Lab',
    });
    expect(HOME_DECISION).toEqual({
      title: 'Your call.',
      text: 'Open to roles in AI automation, experimentation and product analytics in Germany. Based in Berlin.',
      write: 'Write to me',
      cv: 'Read my CV',
      linkedin: 'LinkedIn',
    });
    expect(HOME_TILES.test.lines).toHaveLength(3);
    expect(HOME_TILES.automate.lines).toHaveLength(3);
  });

  it('prints each proof figure from a fact, the numbers never typed', () => {
    expect(HOME_PROOF.map((p) => factIds(p.figure))).toEqual([
      ['profile.audible.experiments'],
      ['profile.audible.recommendations_adopted'],
      ['profile.audible.setup_minutes_after'],
      ['profile.n8n.automated_tests'],
    ]);
    for (const p of HOME_PROOF) {
      for (const id of [...factIds(p.figure), ...factIds(p.caption)]) expect(Object.hasOwn(FACTS, id), id).toBe(true);
      for (const s of [...stringParts(p.figure), ...stringParts(p.caption)]) expect(s, s).not.toMatch(/\d/);
    }
  });

  it('type no numeral of their own', () => {
    const strings = [
      HOME_HERO.title, HOME_HERO.sub, HOME_SITE.title, HOME_SITE.text, HOME_DECISION.text,
      ...HOME_TILES.test.lines, ...HOME_TILES.automate.lines,
    ];
    for (const s of strings) expect(s, s).not.toMatch(/\d/);
  });
});

describe('all Home copy', () => {
  it('has no arrow, middle dot, emoji or check mark, and none of the banned words', () => {
    const all = [
      ...HEADLINES.flatMap((h) => [headlineText(h.a), headlineText(h.b)]),
      ...HOME_CASES.map((c) => headlineText(c.description)),
      ...HOME_CASES.map((c) => c.meta),
      ...HOME_AUTOMATION.flatMap((t) => [t.title, headlineText(t.description), headlineText(t.meta)]),
      ...HOME_PROOF.flatMap((p) => [headlineText(p.figure), headlineText(p.caption)]),
      ...Object.values(HOME_TRACKS).flatMap((t) => [t.title, t.lede]),
      ...[HOME_TILES.test, HOME_TILES.automate].flatMap((t) => [t.title, ...t.lines]),
      HOME_HERO.title, HOME_HERO.sub, ...Object.values(HOME_SITE), ...Object.values(HOME_DECISION),
    ];
    for (const text of all) {
      expect(text, text).not.toMatch(BANNED_CHARS);
      expect(text, text).not.toMatch(/AI-powered|passionate|rockstar|\barm\b/i);
    }
  });
});

describe('HOME_DESTINATIONS', () => {
  it('lists each site path once: the reserved work slugs, the lab, the live test and the CV page', () => {
    expect(HOME_DESTINATIONS).toEqual([
      '/work/audible#why-so-many',
      '/work/audible#automation',
      '/work/retention',
      '/work/pulse',
      '/work/docproof',
      '/work/n8n',
      '/work/marketingws',
      '/lab',
      '/experiment',
      '/cv',
    ]);
    expect(new Set(HOME_DESTINATIONS).size).toBe(HOME_DESTINATIONS.length);
  });

  it('holds site paths only: no scheme, no protocol-relative address, no mail link', () => {
    for (const d of HOME_DESTINATIONS) {
      expect(d.startsWith('/') && !d.startsWith('//'), d).toBe(true);
      expect(d).not.toMatch(/^[a-z][a-z0-9+.-]*:/i);
      expect(new URL(d, 'https://site.test').origin).toBe('https://site.test');
    }
  });

  it('agrees with the site navigation and the CV link', () => {
    const nav = Object.fromEntries(NAV.map((n) => [n.label, n.href]));
    expect(HOME_LINKS.lab).toBe(nav['Lab']);
    expect(HOME_LINKS.experiment).toBe(nav['Live test']);
    expect(HOME_LINKS.cv).toBe(CV_LINK.href);
  });

  it('is a module with no imports, so the launch checker can load it with Node type stripping', () => {
    const source = readFileSync(join(repo, 'content/home-destinations.ts'), 'utf8');
    expect(source).not.toMatch(/^\s*import\b/m);
    expect(source).not.toMatch(/\bfrom\s+['"]/);
    expect(source).not.toMatch(/\brequire\(/);
    const url = pathToFileURL(join(repo, 'content/home-destinations.ts')).href;
    const out = execFileSync(
      process.execPath,
      [
        '--disable-warning=MODULE_TYPELESS_PACKAGE_JSON',
        '--input-type=module',
        '-e',
        `import { HOME_DESTINATIONS } from ${JSON.stringify(url)}; console.log(JSON.stringify(HOME_DESTINATIONS));`,
      ],
      { encoding: 'utf8' },
    );
    expect(JSON.parse(out)).toEqual([...HOME_DESTINATIONS]);
  });

  it('keeps the content modules free of @/ aliases and TSX, so scripts can import them', () => {
    for (const file of ['content/home.ts', 'content/home-destinations.ts']) {
      const source = readFileSync(join(repo, file), 'utf8');
      expect(source, file).not.toMatch(/from\s+['"]@\//);
      expect(source, file).not.toMatch(/from\s+['"][^'"]*\.tsx['"]/);
    }
  });
});
