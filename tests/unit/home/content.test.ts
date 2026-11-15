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
  HOME_BAND,
  bandWords,
  heroSubText,
  HOME_PROOF,
  HOME_SITE,
  HOME_SITE_HEAD,
  HOME_TRACKS,
  HOME_HOW,
  HOME_EXPERIMENTS_HEAD,
  HOME_AUTOMATION_HEAD,
  HOME_AUTOMATE_LINES,
  HOME_QUESTIONS,
  HOME_FAQ,
  type FaqPart,
  TOOLS_LABEL,
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
/** A FAQ answer's fact ids, its plain text parts, and its words (link text as shown, a month as yyyy-mm). */
const faqFacts = (parts: readonly FaqPart[]): FactId[] => parts.flatMap((p) => (typeof p !== 'string' && 'fact' in p ? [p.fact] : []));
const faqStrings = (parts: readonly FaqPart[]): string[] =>
  parts.flatMap((p) => (typeof p === 'string' ? [p] : 'text' in p ? [p.text] : []));
const faqText = (parts: readonly FaqPart[]): string =>
  parts.map((p) => (typeof p === 'string' ? p : 'fact' in p ? headlineText([p]) : 'text' in p ? p.text : p.month)).join('');
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
      ['audible', 'How I run experiments', 'Many tests pitted personalisation against plain baselines'],
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

  it('name the project in a small label, and say what each does as a verb and its object', () => {
    expect(HOME_AUTOMATION.map((t) => t.label)).toEqual(['Audible test-account tool', 'Docproof', 'n8n workflow library', 'MarketingWS']);
    expect(HOME_AUTOMATION.map((t) => headlineText(t.title))).toEqual([
      'Set up a test account in about 3 minutes, not 20',
      'Let agents write, and let checks decide',
      'Check every e-invoice before a person has to',
      'Draft marketing copy, with a check for invented figures',
    ]);
    expect(factIds(byId.automation.title)).toEqual(['profile.audible.setup_minutes_after', 'profile.audible.setup_minutes_before']);
  });

  it('say the approved lines, with the figures printed from facts', () => {
    expect(headlineText(byId.automation.description)).toBe(
      'Tampermonkey with a step recorder. I spotted the bottleneck myself, built the tool and wrote the guide and video for it. Adopted team-wide.',
    );
    expect(headlineText(byId.docproof.description)).toBe(
      'Separate agents write, audit and review a document, and deterministic checks decide what reaches the reader. Open source, tested in CI, no users yet.',
    );
    expect(headlineText(byId.n8n.description)).toBe(
      'Checks incoming e-invoices, flags duplicates and changed bank details, and sends exceptions to a person; 270+ automated tests. A portfolio project, not used by a client.',
    );
    expect(headlineText(byId.marketingws.description)).toBe(
      "Copy variants from one brief, and a fact check that turns unsupported figures into placeholders. The live demo runs on Groq's free tier.",
    );
    // The minutes stay in the title, so the description carries no figure of its own.
    expect(factIds(byId.automation.description)).toEqual([]);
    expect(factIds(byId.n8n.description)).toEqual(['profile.n8n.automated_tests']);
    expect(HOME_AUTOMATION.map((t) => headlineText(t.meta))).toEqual([
      'Browser automation, 11 markets',
      'Multi-agent orchestration, automated verification, Claude Code',
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
      expect(t.label.length).toBeGreaterThan(0);
      for (const id of factIds(t.title)) expect(Object.hasOwn(FACTS, id), id).toBe(true);
      for (const s of stringParts(t.title)) expect(s, s).not.toMatch(/\d/);
    }
  });
});

/** Every string of the tools band: each group's name, line, chips and "seen in" line, then the engineering line. */
const toolsCopy = (): string[] => [
  ...HOME_TOOLS.groups.flatMap((g) => [g.name, g.line, ...g.items, g.seenIn]),
  HOME_TOOLS.engineering,
];

/** Every string of the sections from "How I test" to the site band (heads, tabs, lines, questions, tools). */
const sectionCopy = (): string[] => [
  ...[HOME_HOW.head, HOME_EXPERIMENTS_HEAD, HOME_AUTOMATION_HEAD, HOME_QUESTIONS.head, HOME_SITE_HEAD, HOME_FAQ.head].flatMap((h) => Object.values(h) as string[]),
  ...HOME_HOW.tabs.flatMap((t) => [t.title, t.line]),
  ...HOME_AUTOMATE_LINES,
  ...HOME_QUESTIONS.rows.flat(),
  TOOLS_LABEL,
  ...toolsCopy(),
];

describe('the hero, proof row, the sections and the site band', () => {
  it('say the approved words', () => {
    expect(HOME_HERO.chip).toBe('Open to roles in Germany');
    expect(heroSubText()).toBe(
      'Analyst in Berlin with nearly two years of A/B testing at Audible (Amazon). I plan and analyse tests that end in a clear recommendation, and build the agents and workflows that take the manual work out.',
    );
    expect([HOME_HERO.cv, HOME_HERO.contact]).toEqual(['Read my CV', 'Write to me']);
    expect(HOME_BAND.caption).toBe('How I work: a test, the agents that check the work, and the recommendation.');
    // the experiments track has no lede: nothing printed it, and its words were out of date
    expect(HOME_TRACKS.experiments).toEqual({ title: 'Experiments and analytics' });
    expect(HOME_TRACKS.automation).toEqual({
      title: 'Automation and agents',
      lede: 'A tool my team at Audible adopted, and public projects where code checks the work before a person relies on it.',
    });
    expect(HOME_SITE).toEqual({
      title: 'This site is part of the evidence.',
      text: 'It runs an A/B test on the three experiment cards above. The plan was published before the test started, and the data is public. I built it with coding agents, and every change passes its automated checks before it ships.',
      live: 'See the live test',
      lab: 'Try the Lab',
    });
    expect(HOME_SITE_HEAD).toEqual({ chip: 'Live test', title: 'This site is', quiet: 'part of the evidence.' });
    expect(TOOLS_LABEL).toBe('Methods and tools');
  });

  it('say the approved "How I test" and "I automate." lines word for word, in the tabs and the row under the cards', () => {
    expect(HOME_HOW.head).toEqual({
      chip: 'How I test',
      title: 'Planned before it starts,',
      quiet: 'honest about what it shows.',
      sub: 'Three steps behind every recommendation, including when the result is neutral.',
    });
    expect(HOME_HOW.tabs.map((t) => [t.title, t.line])).toEqual([
      ['Plan', 'I plan the sample size and run time before a test starts, so when to stop is settled in advance.'],
      ['Analyse', 'I test the primary metric for significance and check that the guardrails held.'],
      ['Recommend', 'I write the recommendation with its reasons, including when a neutral result is still worth shipping.'],
    ]);
    expect(HOME_AUTOMATION_HEAD).toEqual({
      chip: 'Automation and agents',
      title: 'Take the manual steps out,',
      quiet: 'and keep the checks in.',
      sub: 'A tool my team at Audible adopted, and public projects where code checks the work before a person relies on it.',
    });
    expect(HOME_AUTOMATE_LINES).toEqual([
      'I turn repeated manual steps into tools a whole team can use.',
      'I build agents in which code, not the model, has the last word on facts.',
      'I test my workflows against the ways they fail, not only when everything goes right.',
    ]);
    // The automation sub is the track's lede.
    expect(HOME_AUTOMATION_HEAD.sub).toBe(HOME_TRACKS.automation.lede);
  });

  it('give the tools band two groups of methods and tools, each with its line and where it was used, then one engineering line', () => {
    expect(HOME_TOOLS).toEqual({
      groups: [
        {
          id: 'experiments',
          name: 'Experimentation and analytics',
          line: 'What I use to plan a test, read it honestly and write the recommendation.',
          items: ['A/B testing', 'Sample size and power', 'Guardrail metrics', 'SQL', 'Python'],
          seenIn: 'At Audible and in the retention analysis.',
        },
        {
          id: 'automation',
          name: 'AI and automation',
          line: 'What I use to take repeated work off a team, with checks around it.',
          items: ['Multi-agent pipelines (Claude Code)', 'Automated verification', 'n8n workflows', 'LLM APIs', 'Browser automation'],
          seenIn: 'In the test-account tool, Docproof, the n8n library and MarketingWS.',
        },
      ],
      engineering: 'Engineering: FastAPI, React and TypeScript, Docker and GitHub Actions, in my public projects.',
    });
  });

  it('never tie the AI and automation group to Audible', () => {
    const ai = HOME_TOOLS.groups.find((g) => g.id === 'automation');
    expect(ai).toBeDefined();
    for (const s of [ai!.name, ai!.line, ...ai!.items, ai!.seenIn]) expect(s, s).not.toMatch(/Audible|Amazon/i);
  });

  it('keep the tools band to the Home list: no Excel, Tableau, Amplitude or the methods and tools that stay on About', () => {
    for (const s of [TOOLS_LABEL, ...toolsCopy()]) {
      expect(s, s).not.toMatch(
        /Excel|Tableau|Amplitude|significance testing|cohort|RFM|event tracking|webhook|REST API|pytest|shipped with|as a data source/i,
      );
    }
  });

  it('give the FAQ figures as facts that exist, never typed', () => {
    const ids = HOME_FAQ.items.flatMap((i) => faqFacts(i.answer));
    expect(ids).toEqual(['profile.audible.experiments', 'profile.audible.setup_minutes_before', 'profile.audible.setup_minutes_after']);
    for (const id of ids) expect(Object.hasOwn(FACTS, id), id).toBe(true);
    // CEFR levels and the name n8n are names, not figures (the truth audit allows them).
    // A month is its own part (printed in a <time>), never digits in the prose.
    for (const i of HOME_FAQ.items) for (const s of faqStrings(i.answer)) expect(s.replace(/\b[ABC][12]\b|\bn8n\b/g, ''), s).not.toMatch(/\d/);
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
      HOME_HERO.chip, heroSubText(), ...bandWords(), HOME_SITE.title, HOME_SITE.text,
      ...sectionCopy(),
    ];
    // The name n8n is a name, not a figure (the truth audit allows it).
    for (const s of strings) expect(s.replace(/\bn8n\b/g, ''), s).not.toMatch(/\d/);
  });
});

/** Every visitor-facing string of the Home content, figures printed. */
const allHomeCopy = (): string[] => [
  ...HEADLINES.flatMap((h) => [headlineText(h.a), headlineText(h.b)]),
  ...HOME_CASES.map((c) => headlineText(c.description)),
  ...HOME_CASES.map((c) => c.meta),
  ...HOME_AUTOMATION.flatMap((t) => [t.label, headlineText(t.title), headlineText(t.description), headlineText(t.meta)]),
  ...HOME_PROOF.flatMap((p) => [headlineText(p.figure), headlineText(p.caption)]),
  HOME_TRACKS.experiments.title, HOME_TRACKS.automation.title, HOME_TRACKS.automation.lede,
  HOME_HERO.chip, heroSubText(), ...bandWords(), ...Object.values(HOME_SITE),
  ...sectionCopy(),
  ...HOME_FAQ.items.flatMap((i) => [i.question, faqText(i.answer)]),
];

describe('all Home copy', () => {
  it('names no Excel and no Tableau "as a data source"', () => {
    const copy = allHomeCopy();
    expect(copy.length).toBeGreaterThan(50);
    for (const text of copy) expect(text, text).not.toMatch(/\bExcel\b|as a data source/i);
  });

  it('names Tampermonkey only as "Tampermonkey with a step recorder"', () => {
    const copy = allHomeCopy().join('\n');
    const all = copy.match(/Tampermonkey/g) ?? [];
    expect(all.length).toBeGreaterThan(0);
    expect(copy.match(/Tampermonkey with a step recorder/g) ?? []).toHaveLength(all.length);
  });

  it('has no arrow, middle dot, emoji or check mark, and none of the banned words', () => {
    for (const text of allHomeCopy()) {
      expect(text, text).not.toMatch(BANNED_CHARS);
      expect(text, text).not.toMatch(/AI-powered|passionate|rockstar|\barm\b/i);
    }
  });
});

describe('HOME_DESTINATIONS', () => {
  it('lists each site path once: the reserved work slugs, the Work index, the lab, the live test and the CV page', () => {
    expect(HOME_DESTINATIONS).toEqual([
      '/work/audible#why-so-many',
      '/work/audible#automation',
      '/work/audible',
      '/work/retention',
      '/work/pulse',
      '/work/docproof',
      '/work/n8n',
      '/work/marketingws',
      '/work',
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
