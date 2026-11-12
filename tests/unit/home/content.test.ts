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
  HOME_TOOLS,
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
const toolOf = (id: string) => {
  const found = HOME_TOOLS.find((t) => t.id === id);
  if (!found) throw new Error(`no tool ${id}`);
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

  it('describe each study with the approved line', () => {
    expect(headlineText(byStudy.audible.description)).toBe(
      'How I plan and analyse experiments, and why so many of my recommendations were adopted.',
    );
    expect(headlineText(byStudy.retention.description)).toBe(
      'Two years of orders from a UK online gift retailer (public dataset, rebuilt in 2026): cohorts, customer segments and a win-back sample size.',
    );
    expect(headlineText(byStudy.pulse.description)).toBe(
      'A demo dashboard with a deliberate event taxonomy. Designed and built; no real users.',
    );
  });

  it('keep the Audible line to what he planned, analysed and recommended', () => {
    const text = headlineText(byStudy.audible.description);
    expect(text).not.toMatch(/\b(run|ran|runs|decide|decided|defined|won|shipped)\b/i);
    expect(text).toMatch(/recommendations were adopted/);
  });

  it('call the rebuilt analysis a public dataset, and Pulse a demo with no real users', () => {
    expect(headlineText(byStudy.retention.description)).toMatch(/public dataset, rebuilt in 2026/);
    expect(headlineText(byStudy.pulse.description)).toMatch(/no real users/);
    expect(headlineText(byStudy.pulse.description)).not.toMatch(/A\/B|experiment|result/i);
  });

  it('type no numeral except a year from 2008 to 2030, and name only facts that exist', () => {
    for (const c of HOME_CASES) {
      for (const id of factIds(c.description)) expect(Object.hasOwn(FACTS, id), id).toBe(true);
      for (const s of stringParts(c.description)) {
        expect(s.replace(/\b20(?:0[89]|[12]\d|30)\b/g, ''), s).not.toMatch(/\d/);
      }
    }
  });
});

describe('the tools I have built', () => {
  const byId = {
    automation: toolOf('automation'),
    docproof: toolOf('docproof'),
    marketingws: toolOf('marketingws'),
  };

  it('are the automation tool, Docproof and MarketingWS, with their reserved destinations', () => {
    expect(HOME_TOOLS.map((t) => t.id)).toEqual(['automation', 'docproof', 'marketingws']);
    expect(HOME_TOOLS.map((t) => t.href)).toEqual([
      '/work/audible#automation',
      '/work/docproof',
      '/work/marketingws',
    ]);
    for (const t of HOME_TOOLS) {
      expect(HOME_DESTINATIONS, t.href).toContain(t.href);
      expect(new URL(t.href, 'https://site.test').origin).toBe('https://site.test');
    }
  });

  it('say the approved lines, with the automation figures printed from facts', () => {
    expect(headlineText(byId.automation.parts)).toBe(
      'Tampermonkey with a step recorder: test-account setup from about 20 to about 3 minutes across 11 markets, adopted team-wide.',
    );
    expect(headlineText(byId.docproof.parts)).toBe(
      'Document verification with multi-agent orchestration and automated checks.',
    );
    expect(headlineText(byId.marketingws.parts)).toBe(
      "Copy variants for marketing workflows; the live demo depends on Groq's free tier.",
    );
    expect(factIds(byId.automation.parts)).toEqual([
      'profile.audible.setup_minutes_before',
      'profile.audible.setup_minutes_after',
      'profile.audible.markets',
    ]);
  });

  it('the automation line opens with the tool and prints only the setup-time and market facts', () => {
    expect(headlineText(byId.automation.parts)).toMatch(/^Tampermonkey with a step recorder: /);
    for (const id of factIds(byId.automation.parts)) {
      expect(id).toMatch(/^profile\.audible\.(?:setup_minutes_(?:before|after)|markets)$/);
    }
  });

  it('the MarketingWS line is one plain sentence with no fact', () => {
    expect(byId.marketingws.parts).toEqual([
      "Copy variants for marketing workflows; the live demo depends on Groq's free tier.",
    ]);
    expect(factIds(byId.marketingws.parts)).toEqual([]);
  });

  it('type no numeral and name only facts that exist', () => {
    for (const t of HOME_TOOLS) {
      for (const id of factIds(t.parts)) expect(Object.hasOwn(FACTS, id), id).toBe(true);
      for (const s of stringParts(t.parts)) expect(s, s).not.toMatch(/\d/);
      expect(t.name.length).toBeGreaterThan(0);
    }
  });
});

describe('all Home copy', () => {
  it('has no arrow, middle dot, emoji or check mark, and none of the banned words', () => {
    const all = [
      ...HEADLINES.flatMap((h) => [headlineText(h.a), headlineText(h.b)]),
      ...HOME_CASES.map((c) => headlineText(c.description)),
      ...HOME_TOOLS.flatMap((t) => [t.name, headlineText(t.parts)]),
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
