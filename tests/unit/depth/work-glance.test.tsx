// The 20-second top of each of the seven work pages: a GlanceBlock directly under the title and its
// standfirst, with its five parts, an outcome that reads as the page's one-sentence result, and the
// rise attributes on the block and on the page's own section headings. Every figure in a sentence is a
// <Fact>, so the expected sentences below name a fact in braces and the test prints it the way the
// page does.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AudiblePage } from '@/components/audible/AudiblePage';
import { DocproofPage } from '@/components/docproof/DocproofPage';
import { MarketingwsPage } from '@/components/marketingws/MarketingwsPage';
import { N8nPage } from '@/components/n8n/N8nPage';
import { PulsePage } from '@/components/pulse/PulsePage';
import { RetentionPage } from '@/components/retention/RetentionPage';
import { WeatherPage } from '@/components/weather/WeatherPage';
import { withoutCta } from '../page-cta';
import { type FactId } from '@/lib/facts';
import { factText } from '@/lib/facts/text';

const decode = (s: string) =>
  s.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
/** Visible text: inline <data> and <time> elements join their neighbours, other tags become spaces. */
const text = (markup: string) =>
  decode(markup.replace(/<\/?(data|time)[^>]*>/g, '').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .replace(/ ([.,:;)?])/g, '$1')
    .replace(/\( /g, '(')
    .trim();
/** A sentence with {fact.id} placeholders printed as the facts print. */
const sentence = (template: string) => template.replace(/\{([a-z0-9_.]+)\}/g, (_, id: string) => factText(id as FactId));

/** `points` are the key figures above the sentence, each as its figure and label read together. */
type Glance = {
  points: readonly string[];
  outcome: string;
  role: string;
  methods: string;
  tools: string;
  when: string;
  scope: string;
};

const PAGES: readonly { name: string; render: () => string; title: string; glance: Glance }[] = [
  {
    name: 'audible',
    render: () => renderToStaticMarkup(<AudiblePage />),
    title: 'audible-title',
    glance: {
      points: [
        '{profile.audible.experiments} A/B tests across web and mobile',
        // The adoption figure always carries the link to its context (the 20+ of 25+ section).
        '{profile.audible.recommendations_adopted} recommendations adopted Why so many?',
        'about {profile.audible.setup_minutes_after} minutes to set up a test account, down from about {profile.audible.setup_minutes_before}, with a tool I built',
      ],
      outcome:
        'Each test needed a plan before it started and a recommendation when it ended: roll the change out permanently, or not.',
      role: 'Working student. I recommended; my manager decided.',
      methods:
        'Primary, secondary and guardrail metrics per team, sample-size and duration planning, significance testing, SQL segmentation.',
      tools: "Amazon's internal experimentation platforms, SQL, Excel, Tableau as a data source, Tampermonkey with a step recorder.",
      when: 'Aug 2023 to Apr 2025.',
      scope: 'Method and role. The results are confidential.',
    },
  },
  {
    name: 'retention',
    render: () => renderToStaticMarkup(<RetentionPage />),
    title: 'retention-title',
    glance: {
      points: [
        '{retail.returns.yoy_growth_raw} growth in returns, as a double count first showed it',
        'about {retail.returns.yoy_growth_clean} the real growth, with the double count removed',
        '{retention.winback.n_per_arm} customers per group for a fair test of a win-back offer',
      ],
      outcome:
        'A model predicts who orders again only slightly better than putting the most recent buyers first, so the next step is a test with a holdout group, not a campaign to the top scorers.',
      role: 'Personal projects rebuilt from MSc projects.',
      methods: 'Cohorts, customer segments, a model scored on a later period, sample-size calculation.',
      tools: 'SQL (DuckDB), scikit-learn, pytest, GitHub Actions; Chart.js for the KPI dashboard.',
      when: 'Rebuilt in 2026, data from 2009 to 2011.',
      scope:
        "Public dataset, rebuilt in 2026 from my Master's projects. A prediction and a sample size: nobody was contacted and no test was run.",
    },
  },
  {
    name: 'pulse',
    render: () => renderToStaticMarkup(<PulsePage />),
    title: 'pulse-page-title',
    glance: {
      points: ['{pulse.events.count} events, each tied to one product question', '{pulse.identity.user_properties} user properties, so events can be split by user'],
      outcome:
        'Each event exists to answer one product question: the original sends them to Amplitude, and the copy on this page sends them to a list in your browser.',
      role: 'Personal project, designed and built.',
      methods: 'A named list of events, user identification, properties for segments.',
      tools: 'React, TypeScript, Vite, Tailwind, Recharts, Amplitude, Vercel.',
      when: 'Sep 2026.',
      scope: 'A demo. No real users, so the questions are still open.',
    },
  },
  {
    name: 'docproof',
    render: () => renderToStaticMarkup(<DocproofPage />),
    title: 'docproof-title',
    glance: {
      points: [],
      outcome: 'Agents propose the changes; deterministic checks decide what reaches the reader.',
      role: 'Designed and built.',
      methods:
        'Single fact base, claim verification, multi-agent orchestration (author, auditor, context-free reviewer), rendering checks.',
      tools: 'Python, Claude Code agents and skills, headless Chrome, GitHub Actions.',
      when: '2026.',
      scope: 'Open source (MIT), built in 2026. No users yet.',
    },
  },
  {
    name: 'n8n',
    render: () => renderToStaticMarkup(<N8nPage />),
    title: 'n8n-title',
    glance: {
      points: ['{profile.n8n.automated_tests} automated tests'],
      outcome:
        'Document and process automation in n8n that installs with one command, restored and checked after a full wipe of its data.',
      role: 'I set the requirements and made the design decisions.',
      methods:
        'Structural/arithmetic/master-data checks, duplicate and changed-bank-detail flags, restore test, clean-install test.',
      tools: 'n8n, Node.js, REST/webhooks, Gmail API, Docker, PostgreSQL, Caddy, GitHub Actions.',
      when: '2026.',
      scope:
        'Personal project, 2026. No client and no production use; every invoice was a generated sample.',
    },
  },
  {
    name: 'marketingws',
    render: () => renderToStaticMarkup(<MarketingwsPage />),
    title: 'marketingws-title',
    glance: {
      points: [],
      outcome:
        'It drafts from a brief, revises the current draft, and turns figures and promises it cannot support into placeholders.',
      role: 'Built independently (thesis 2025, rebuild 2026).',
      methods:
        'Brief-to-draft generation, revise/translate current draft, code plus model fact check, behavioural evals; thesis evaluated with marketers.',
      tools: 'Python, FastAPI, Streamlit, Vercel, Groq, OpenAI, Docker.',
      when: 'Thesis Apr to Nov 2025, rebuild live since Sep 2026.',
      scope: "Master's thesis (2025), rebuilt in 2026.",
    },
  },
  {
    name: 'weather',
    render: () => renderToStaticMarkup(<WeatherPage />),
    title: 'weather-title',
    glance: {
      points: ['{weather.checks.count} data-quality checks', '{weather.quarantine.rows} impossible readings held in quarantine'],
      outcome:
        'The warehouse is written only when every error-level check passes, and impossible readings wait in quarantine with their reason.',
      role: 'I built the pipeline, the schema, the checks and the tests.',
      methods: 'Star schema, {weather.checks.count} checks, quarantine.',
      tools: 'DuckDB SQL, Python, pytest.',
      when: 'Rebuilt in 2026.',
      scope: "A personal project on a public dataset, rebuilt in 2026 from my Master's project.",
    },
  },
];

describe.each(PAGES)('the glance block on /work/$name', ({ render, title, glance }) => {
  const html = withoutCta(render());
  const block = /<section aria-label="At a glance"[^>]*data-glance=""[^>]*>[\s\S]*?<\/section>/.exec(html)?.[0] ?? '';

  it('is there once, with its key figures, its sentence and its five facts', () => {
    expect([...html.matchAll(/data-glance=""/g)]).toHaveLength(1);
    expect(block).not.toBe('');
    const part = (re: RegExp) => text(re.exec(block)?.[1] ?? '');
    const points = [...block.matchAll(/<li data-glance-point="">([\s\S]*?)<\/li>/g)].map((m) => text(m[1] ?? ''));
    expect(points).toEqual(glance.points.map(sentence));
    expect(part(/<p data-glance-outcome="">([\s\S]*?)<\/p>/)).toBe(sentence(glance.outcome));
    expect(part(/<dt>Role<\/dt><dd>([\s\S]*?)<\/dd>/)).toBe(sentence(glance.role));
    expect(part(/<dt>Methods<\/dt><dd>([\s\S]*?)<\/dd>/)).toBe(sentence(glance.methods));
    expect(part(/<dt>Tools<\/dt><dd>([\s\S]*?)<\/dd>/)).toBe(sentence(glance.tools));
    expect(part(/<dt>When<\/dt><dd>([\s\S]*?)<\/dd>/)).toBe(sentence(glance.when));
    expect(part(/<dt>Scope<\/dt><dd>([\s\S]*?)<\/dd>/)).toBe(sentence(glance.scope));
    expect([...block.matchAll(/<dt>([^<]+)<\/dt>/g)].map((m) => m[1])).toEqual(['When', 'Role', 'Methods', 'Tools', 'Scope']);
  });

  it('sits right under the h1 and its standfirst, before any section, and lifts once on load (it is in the first screen)', () => {
    expect(block).toMatch(/data-depth-hinge="load"/);
    expect(block).not.toMatch(/data-depth-rise=""/);
    const h1 = html.indexOf(`<h1 id="${title}"`);
    expect(h1).toBeGreaterThan(-1);
    const at = html.indexOf('<section aria-label="At a glance"');
    expect(at).toBeGreaterThan(h1);
    // nothing but the title block lies between the h1 and the glance block
    expect(html.slice(h1, at)).not.toMatch(/<(section|nav|h2|article)[\s>]/);
  });

  it("marks every section heading of the page's own to rise as a heading", () => {
    const own = [...html.matchAll(/<h2 id="[^"]+-title"[^>]*>/g)].map((m) => m[0]);
    expect(own.length).toBeGreaterThan(2);
    for (const h2 of own) expect(h2).toContain('data-depth-rise="heading"');
  });

  it('gives the adoption figure its link to the context, one click away (Audible only)', () => {
    const adopted = /<li data-glance-point="">(?:(?!<\/li>)[\s\S])*profile\.audible\.recommendations_adopted[\s\S]*?<\/li>/.exec(block)?.[0] ?? '';
    if (!glance.points.some((p) => p.includes('recommendations_adopted'))) return expect(adopted).toBe('');
    expect(adopted).toMatch(/<a href="#why-so-many"[^>]*>Why so many\?<\/a>/);
  });

  it('prints its figures through facts only', () => {
    expect(text(block)).not.toMatch(/OAuth2|Symphony|Bullseye|F1/);
  });
});
