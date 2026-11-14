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

/** `outcomeAfter` is text that follows the outcome sentence in its paragraph (a link to the context). */
type Glance = { outcome: string; outcomeAfter?: string; role: string; methods: string; tools: string; when: string };

const PAGES: readonly { name: string; render: () => string; title: string; glance: Glance }[] = [
  {
    name: 'audible',
    render: () => renderToStaticMarkup(<AudiblePage />),
    title: 'audible-title',
    glance: {
      outcome:
        "Recommended rollouts from {profile.audible.experiments} A/B tests, {profile.audible.recommendations_adopted} adopted, and cut test-account setup from about {profile.audible.setup_minutes_before} to about {profile.audible.setup_minutes_after} minutes; recommendations were mine, ship decisions were my manager's.",
      // The adoption figure always carries the link to its context (the 20+ of 25+ section).
      outcomeAfter: 'Why so many?',
      role: 'Working student, mainly growth experimentation; contributed to tests, set up and analysed them.',
      methods:
        'Primary, secondary and guardrail metrics per team, sample-size and duration planning, significance testing, SQL segmentation.',
      tools: "Amazon's internal experimentation platforms, SQL, Excel, Tableau as a data source, Tampermonkey with a step recorder.",
      when: 'Aug 2023 to Apr 2025.',
    },
  },
  {
    name: 'retention',
    render: () => renderToStaticMarkup(<RetentionPage />),
    title: 'retention-title',
    glance: {
      outcome:
        'Cleaned returns that made returned-order value look like it grew ({retail.returns.yoy_growth_raw} raw, about {retail.returns.yoy_growth_clean} true), then ranked likely repeat buyers (AUC {retention.model.gb_auc} vs {retention.model.rule_auc}) and sized a win-back holdout; prediction only, nobody contacted.',
      role: 'Personal projects rebuilt from MSc projects.',
      methods: 'Cohorts, RFM, out-of-time model, sample-size calculation.',
      tools: 'SQL (DuckDB), scikit-learn, pytest, GitHub Actions; Chart.js for the KPI dashboard.',
      when: 'Rebuilt in 2026, data from 2009 to 2011.',
    },
  },
  {
    name: 'pulse',
    render: () => renderToStaticMarkup(<PulsePage />),
    title: 'pulse-page-title',
    glance: {
      outcome:
        'Designed and built a {pulse.events.count}-event tracking plan in Amplitude, each event tied to a product question; no real users, no outcome.',
      role: 'Personal project, designed and built.',
      methods: 'Event taxonomy, user identification, segmentation properties.',
      tools: 'React, TypeScript, Vite, Tailwind, Recharts, Amplitude, Vercel.',
      when: 'Sep 2026.',
    },
  },
  {
    name: 'docproof',
    render: () => renderToStaticMarkup(<DocproofPage />),
    title: 'docproof-title',
    glance: {
      outcome:
        'Built an open-source tool where agents propose changes and deterministic checks decide what reaches the reader; no adoption claimed.',
      role: 'Designed and built, Claude Code as pair-programmer.',
      methods:
        'Single fact base, claim verification, multi-agent orchestration (author, auditor, context-free reviewer), rendering checks.',
      tools: 'Python, Claude Code agents and skills, headless Chrome, GitHub Actions.',
      when: '2026.',
    },
  },
  {
    name: 'n8n',
    render: () => renderToStaticMarkup(<N8nPage />),
    title: 'n8n-title',
    glance: {
      outcome:
        'Built e-invoice intake and error alerts in n8n, installed with one command and covered by {profile.n8n.automated_tests} automated tests; no production use.',
      role: 'Set requirements and design decisions, Claude Code as pair programmer.',
      methods:
        'Structural/arithmetic/master-data checks, duplicate and changed-bank-detail flags, restore test, clean-install test.',
      tools: 'n8n, Node.js, REST/webhooks, Gmail API, Docker, PostgreSQL, Caddy, GitHub Actions.',
      when: '2026.',
    },
  },
  {
    name: 'marketingws',
    render: () => renderToStaticMarkup(<MarketingwsPage />),
    title: 'marketingws-title',
    glance: {
      outcome:
        "Rebuilt my thesis tool as a live web app that drafts from a brief, revises the current draft, and turns unsupported figures and promises into placeholders; the demo depends on Groq's free tier.",
      role: 'Built independently (thesis 2025, rebuild 2026).',
      methods:
        'Brief-to-draft generation, revise/translate current draft, code plus model fact check, behavioural evals; thesis evaluated with marketers.',
      tools: 'Python, FastAPI, Streamlit, Vercel, Groq, OpenAI, Docker.',
      when: 'Thesis Apr to Nov 2025, rebuild live since Sep 2026.',
    },
  },
  {
    name: 'weather',
    render: () => renderToStaticMarkup(<WeatherPage />),
    title: 'weather-title',
    glance: {
      outcome:
        'Built a tested SQL pipeline that quarantines impossible sensor readings and loads the rest into a star schema; all error-level checks pass.',
      role: 'Personal project rebuilt from MSc project; built pipeline, schema, checks, tests.',
      methods: 'Star schema, {weather.checks.count} checks, quarantine.',
      tools: 'DuckDB SQL, Python, pytest.',
      when: 'Rebuilt in 2026.',
    },
  },
];

describe.each(PAGES)('the glance block on /work/$name', ({ render, title, glance }) => {
  const html = render();
  const block = /<section aria-label="At a glance"[^>]*data-glance=""[^>]*>[\s\S]*?<\/section>/.exec(html)?.[0] ?? '';

  it('is there once, with its five parts', () => {
    expect([...html.matchAll(/data-glance=""/g)]).toHaveLength(1);
    expect(block).not.toBe('');
    const part = (re: RegExp) => text(re.exec(block)?.[1] ?? '');
    expect(part(/<p data-glance-outcome="">([\s\S]*?)<\/p>/)).toBe([sentence(glance.outcome), glance.outcomeAfter].filter(Boolean).join(' '));
    expect(part(/<dt>Role<\/dt><dd>([\s\S]*?)<\/dd>/)).toBe(sentence(glance.role));
    expect(part(/<dt>Methods<\/dt><dd>([\s\S]*?)<\/dd>/)).toBe(sentence(glance.methods));
    expect(part(/<dt>Tools<\/dt><dd>([\s\S]*?)<\/dd>/)).toBe(sentence(glance.tools));
    expect(part(/<dt>When<\/dt><dd>([\s\S]*?)<\/dd>/)).toBe(sentence(glance.when));
  });

  it('sits right under the h1 and its standfirst, before any section, and rises on entry', () => {
    expect(block).toMatch(/data-depth-rise=""/);
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

  it('prints its figures through facts only', () => {
    expect(text(block)).not.toMatch(/OAuth2|Symphony|Bullseye|F1/);
  });
});
