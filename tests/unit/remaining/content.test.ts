// Content contracts the remaining pages share before those pages exist: the Work directory's order,
// destinations and wording, the profile facts the pages read, where the adoption line links, and the
// Pulse taxonomy count. Whether each route and fragment resolves is checked once the pages exist
// (the Work page test and the whole-site link checks); here only the intended names are pinned.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement, Fragment, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { HOME_LINKS } from '../../../content/home-destinations.ts';
import { WORK_GROUPS } from '../../../content/work.tsx';
import { lintSource } from '../../../scripts/design-lint.ts';
import { auditHtml } from '../../../scripts/truth-audit.ts';
import { FACTS, FACT_DISPLAYS, getFact } from '@/lib/facts';

const repo = join(import.meta.dirname, '../../..');

/** The intended site paths of the remaining pages and the fragments other pages link to. */
const ROUTES = {
  experiment: '/experiment',
  audible: '/work/audible',
  whySoMany: '/work/audible#why-so-many',
  automation: '/work/audible#automation',
  retention: '/work/retention',
  pulse: '/work/pulse',
  marketingws: '/work/marketingws',
  docproof: '/work/docproof',
  weather: '/work/weather',
  n8n: '/work/n8n',
} as const;

/** The Work directory, in the order the page lists it. */
const WORK_ORDER = [
  ROUTES.experiment,
  ROUTES.whySoMany,
  ROUTES.retention,
  ROUTES.pulse,
  ROUTES.marketingws,
  ROUTES.docproof,
  ROUTES.weather,
  ROUTES.n8n,
];

const items = WORK_GROUPS.flatMap((g) => g.items);
const html = (node: ReactNode) => renderToStaticMarkup(createElement(Fragment, null, node));
/** Markup as visible text: tags removed and the entities React writes decoded. */
const visible = (markup: string) =>
  markup
    .replace(/<[^>]+>/g, '')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
const itemAt = (href: string) => {
  const found = items.find((i) => i.href === href);
  if (!found) throw new Error(`no Work item for ${href}`);
  return found;
};
/** The visible text of an item: its title and its description with the markup removed. */
const textOf = (href: string) => {
  const item = itemAt(href);
  return `${item.title} ${visible(html(item.description))}`;
};
const factIdsIn = (node: ReactNode) => [...html(node).matchAll(/data-fact="([^"]+)"/g)].map((m) => m[1]);

/**
 * The directory as one document, the way a page would print it, for the site's own truth audit. The
 * product name n8n stays as it is: the audit's allow-list covers the digit of that exact name only.
 */
const directoryHtml = () => {
  const itemHtml = (i: (typeof items)[number]) => `<h3>${html(i.title)}</h3><p>${html(i.description)}</p>`;
  const body = WORK_GROUPS.map((g) => `<h2>${html(g.label)}</h2>${g.items.map(itemHtml).join('')}`).join('');
  return `<!doctype html><html><head><title>Work</title></head><body><main>${body}</main></body></html>`;
};
const auditContext = {
  route: '/work',
  factIds: new Set(Object.keys(FACTS)),
  factDisplays: FACT_DISPLAYS,
  denylist: [],
};

describe('Work directory', () => {
  it('has two groups: experimentation and analytics first, then the tools', () => {
    expect(WORK_GROUPS.map((g) => g.label)).toEqual(['Experimentation & analytics', "Tools I've built"]);
    expect(WORK_GROUPS.map((g) => g.items.length)).toEqual([4, 4]);
  });

  it('lists the live test, Audible, Retention and Pulse, then MarketingWS, Docproof, Weather and n8n', () => {
    expect(items.map((i) => i.href)).toEqual(WORK_ORDER);
    expect(items.at(-1)?.href).toBe(ROUTES.n8n);
    expect(items.map((i) => i.title)).toEqual([
      'Live test',
      'Experimentation at Audible (Amazon)',
      'Customer retention and reactivation analysis',
      'Pulse: analytics instrumentation demo',
      'MarketingWS',
      'Docproof',
      'Weather data quality',
      'n8n Workflow Library',
    ]);
  });

  // The exact wording, so a change to any line is always a deliberate change here.
  it('prints exactly these descriptions, as a visitor reads them', () => {
    expect(items.map((i) => visible(html(i.description)))).toEqual([
      "The experiment on this site's own visitors: its design, its checks and the counts that are safe to publish.",
      'How I plan and analyse experiments, and why so many of my recommendations were adopted.',
      'Two years of orders from a UK online gift retailer (public dataset, rebuilt in 2026): cleaning the returns, cohorts, customer segments, a model of who orders again and a win-back sample size.',
      'A demo dashboard with a deliberate event taxonomy. Designed and built; no real users.',
      "My Master's thesis, a generative AI web service for content marketing, rebuilt in 2026 as a live web app. The live demo depends on Groq's free tier.",
      'Document verification with multi-agent orchestration and automated checks.',
      'A tested SQL pipeline on a public dataset of weather observations, rebuilt in 2026: a star schema, data-quality checks and a quarantine for sensor errors.',
      'Document and process automation in n8n: e-invoice intake (XRechnung, ZUGFeRD) and error alerts, with 270+ automated tests. A portfolio project with no production use.',
    ]);
  });

  it('links only the intended site paths', () => {
    const intended = new Set<string>(Object.values(ROUTES));
    for (const item of items) expect(intended.has(item.href), item.href).toBe(true);
  });

  it('links each item once, to a same-origin site path', () => {
    const hrefs = items.map((i) => i.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    for (const href of hrefs) expect(href).toMatch(/^\/(?!\/)[a-z0-9/#-]*$/);
  });

  it('gives every item a title and a one-line description', () => {
    for (const item of items) {
      expect(item.title.trim()).not.toBe('');
      const text = textOf(item.href);
      expect(text.length).toBeGreaterThan(item.title.length + 20);
      expect(html(item.description)).not.toMatch(/<(p|div|ul|ol|li|br|h\d)\b/);
    }
  });
});

describe('route and fragment names (resolution is checked once the pages exist)', () => {
  it('uses the intended path for every remaining page', () => {
    const pathOf = (href: string) => href.replace(/#.*$/, '');
    const paths = new Set<string>(Object.values(ROUTES).map(pathOf));
    for (const item of items) expect(paths).toContain(pathOf(item.href));
  });

  it('agrees with the Home page on the paths both link to', () => {
    expect(HOME_LINKS.experiment).toBe(ROUTES.experiment);
    expect(HOME_LINKS.whySoMany).toBe(ROUTES.whySoMany);
    expect(HOME_LINKS.automation).toBe(ROUTES.automation);
    expect(HOME_LINKS.retention).toBe(ROUTES.retention);
    expect(HOME_LINKS.pulse).toBe(ROUTES.pulse);
    expect(HOME_LINKS.marketingws).toBe(ROUTES.marketingws);
    expect(HOME_LINKS.docproof).toBe(ROUTES.docproof);
  });
});

describe('the facts the Work directory and the remaining pages read', () => {
  it('reads exactly these profile facts, with their values', () => {
    const profile = Object.keys(FACTS)
      .filter((id) => id.startsWith('profile.'))
      .sort();
    expect(profile).toEqual([
      'profile.audible.experiments',
      'profile.audible.markets',
      'profile.audible.recommendations_adopted',
      'profile.audible.setup_minutes_after',
      'profile.audible.setup_minutes_before',
      'profile.audible.setup_time_cut',
      'profile.audible.teams',
      'profile.n8n.automated_tests',
    ]);
    expect(profile.map((id) => [getFact(id as keyof typeof FACTS).value, getFact(id as keyof typeof FACTS).suffix]))
      .toEqual([
        [25, '+'],
        [11, undefined],
        [20, '+'],
        [3, undefined],
        [20, undefined],
        [0.85, undefined],
        [3, undefined],
        [270, '+'],
      ]);
  });

  it('links the item about adopted recommendations to the section that explains them', () => {
    const adoption = items.filter((i) => /\badopt/i.test(textOf(i.href)));
    expect(adoption.map((i) => i.href)).toEqual([ROUTES.whySoMany]);
  });

  it('prints one figure, the n8n test count, through its fact, and no number the truth audit would report', () => {
    expect(items.flatMap((i) => factIdsIn(i.description))).toEqual(['profile.n8n.automated_tests']);
    expect(auditHtml(directoryHtml(), auditContext)).toEqual([]);
  });
});

describe('what each Work line says', () => {
  it('uses no banned phrase or character, by the truth audit and the design lint', () => {
    // The audit reports the banned phrases; the lint reports arrows, middle dots, emoji and check marks,
    // in the rendered text and in the source file.
    expect(auditHtml(directoryHtml(), auditContext).filter((f) => f.kind === 'banned-phrase')).toEqual([]);
    const text = WORK_GROUPS.flatMap((g) => [g.label, ...g.items.map((i) => textOf(i.href))]).join('\n');
    expect(lintSource(text, 'content/work.mdx')).toEqual([]);
    expect(lintSource(readFileSync(join(repo, 'content/work.tsx'), 'utf8'), 'content/work.tsx')).toEqual([]);
  });

  it('says the Audible line plans, analyses and reports adopted recommendations', () => {
    const text = textOf(ROUTES.whySoMany);
    expect(text).toContain('plan and analyse');
    expect(text).toContain('recommendations were adopted');
  });

  it('calls the rebuilt analyses public datasets, rebuilt in 2026', () => {
    for (const href of [ROUTES.retention, ROUTES.weather]) {
      const text = textOf(href);
      expect(text, href).toContain('public dataset');
      expect(text, href).toContain('rebuilt in 2026');
    }
  });

  it('says Pulse was designed and built with no real users', () => {
    const text = textOf(ROUTES.pulse);
    expect(text).toContain('Designed and built');
    expect(text).toContain('no real users');
  });

  it('says MarketingWS is the thesis rebuilt in 2026, and that its live demo depends on the Groq free tier', () => {
    const text = textOf(ROUTES.marketingws);
    expect(text).toContain("My Master's thesis");
    expect(text).toContain('rebuilt in 2026');
    expect(text).toContain("The live demo depends on Groq's free tier");
  });

  it('describes Docproof by its engineering', () => {
    const text = textOf(ROUTES.docproof);
    expect(text).toContain('Document verification');
    expect(text).toContain('multi-agent orchestration');
  });

  it('says n8n is document and process automation, a portfolio project with no production use', () => {
    const text = textOf(ROUTES.n8n);
    expect(text).toContain('Document and process automation');
    expect(text).toContain('A portfolio project with no production use');
  });
});

describe('the audit and the lint used above do report', () => {
  it('the truth audit reports a typed number and a banned phrase in the directory markup', () => {
    const added = 'automated tests in 14 workflows, by a passionate analyst';
    const typed = directoryHtml().replace('automated tests', added);
    const kinds = auditHtml(typed, auditContext).map((f) => f.kind);
    expect(kinds.sort()).toEqual(['banned-phrase', 'stray-number']);
  });

  it('the design lint reports an arrow, a middle dot and a check mark in directory text', () => {
    // Written as escapes, so this file holds none of the characters.
    const text = 'from 20 \u2192 3 minutes \u00B7 adopted \u2713';
    const rules = lintSource(text, 'content/work.mdx').map((v) => v.rule);
    expect(rules.sort()).toEqual(['no-arrow-in-content', 'no-emoji', 'no-middle-dot']);
  });
});

describe('Pulse taxonomy', () => {
  it('counts exactly the events the vendored export lists', () => {
    const pulse = JSON.parse(readFileSync(join(repo, 'data/sources/pulse.json'), 'utf8')) as {
      tables: { events: { name: string }[] };
    };
    expect(getFact('pulse.events.count').value).toBe(pulse.tables.events.length);
    expect(pulse.tables.events.map((e) => e.name)).toEqual([
      'Viewed Dashboard',
      'Applied Filter',
      'Changed Date Range',
      'Viewed Chart Detail',
      'Exported Report',
      'Saved View',
      'Loaded Saved View',
    ]);
  });
});
