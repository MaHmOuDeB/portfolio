// The About page and the CV page, rendered on the server. The copy is pinned word for word: the
// story, the timeline (Audible as a working student), the tools I have shipped with, the languages
// (German at B1) and every claim of the CV. Every number is a <Fact> or a <Derived>, so the truth
// audit finds no stray numeral on either page. The header always links the CV page; the PDF's
// download button appears only when the build found a checked PDF with its metadata, and the page's
// claims are the PDF's claims (cv-parity.ts).
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parse, type DefaultTreeAdapterTypes as T } from 'parse5';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { auditHtml } from '../../../scripts/truth-audit.ts';
import { aboutPhoto } from '../../../content/about-photo.ts';
import { FACTS, FACT_DISPLAYS } from '../../../src/lib/facts/facts.generated.ts';
import { CV_PDF_HREF } from '@/lib/cv-pdf';
import { CONTACT, CV_LINK, SITE } from '@/lib/site';
import { compareClaims, pdfClaims, type Omission } from './cv-parity';
import { writePdf, type Line } from './synthetic-pdf';

// The header's navigation reads the path; a unit test has no router.
vi.mock('next/navigation', () => ({ usePathname: () => '/about' }));

const { AboutPage, ABOUT_SECTIONS } = await import('@/components/about/AboutPage');
const { CvPage, CV_SECTIONS } = await import('@/components/about/CvPage');
const { SiteHeader } = await import('@/components/shell/SiteHeader');

const repo = join(import.meta.dirname, '../../..');
// A checked PDF of 86,016 bytes, which the download button gives as 84 KB.
const PDF_ENV = JSON.stringify({ sha256: 'a'.repeat(64), renderedAt: '2026-11-12T10:00:00Z', bytes: 86_016 });
const DOWNLOAD = 'Download CV (PDF, 84 KB)';

// ── a small DOM over parse5 ──────────────────────────────────────────────────────────────────────
type El = T.Element;
const isEl = (n: T.ChildNode | T.ParentNode): n is El => 'tagName' in n;
const attr = (el: El, name: string) => el.attrs.find((a) => a.name === name)?.value;
const has = (el: El, name: string) => attr(el, name) !== undefined;
function all(root: T.ParentNode, pred: (el: El) => boolean): El[] {
  const out: El[] = [];
  const walk = (n: T.ParentNode) => {
    for (const c of n.childNodes) {
      if (!isEl(c)) continue;
      if (pred(c)) out.push(c);
      walk(c);
    }
  };
  walk(root);
  return out;
}
function one(root: T.ParentNode, pred: (el: El) => boolean): El {
  const found = all(root, pred);
  if (found.length !== 1) throw new Error(`expected one element, found ${found.length}`);
  return found[0]!;
}
function rawText(n: T.ParentNode): string {
  let s = '';
  for (const c of n.childNodes) {
    if (c.nodeName === '#text') s += (c as T.TextNode).value;
    else if (isEl(c)) s += rawText(c);
  }
  return s;
}
const text = (n: T.ParentNode) => rawText(n).replace(/\s+/g, ' ').trim();
const dom = (html: string) => parse(`<!doctype html><html><body>${html}</body></html>`);
const classes = (el: El) => (attr(el, 'class') ?? '').split(/\s+/);
const section = (d: T.ParentNode, id: string) => one(d, (el) => el.tagName === 'section' && attr(el, 'id') === id);

const audit = (html: string, route: string) =>
  auditHtml(html, { route, factIds: new Set(Object.keys(FACTS)), factDisplays: FACT_DISPLAYS, denylist: [] });

let savedEnv: string | undefined;
beforeEach(() => {
  savedEnv = process.env.CV_PDF;
  delete process.env.CV_PDF;
});
afterEach(() => {
  if (savedEnv === undefined) delete process.env.CV_PDF;
  else process.env.CV_PDF = savedEnv;
});

const about = () => dom(renderToStaticMarkup(createElement(AboutPage)));
const cv = () => dom(renderToStaticMarkup(createElement(CvPage)));

// ═════════════════════════════════════════ About ═════════════════════════════════════════════════
const STORY = [
  'I am an experimentation and growth analyst in Berlin, Germany.',
  'For nearly two years I was a working student at Audible (Amazon), mainly in growth experimentation with some marketing analytics.',
  'I contributed to 25+ A/B tests across web and mobile, did the sample-size planning and significance testing myself, and worked with 3 teams over my time there, one after another.',
  'I also built a browser-automation tool, Tampermonkey with a step recorder, that cut test-account setup from about 20 to about 3 minutes and was adopted team-wide.',
  "I hold an MSc in Data Science from the University of Europe for Applied Sciences in Berlin (2025), and since then I have rebuilt my Master's projects on public data and built tools of my own.",
];

const FOCUS =
  'I work on two things that belong together: experiments that end in a decision, and automation that takes the manual work out of getting there. At Audible that meant A/B tests and a browser tool my team adopted; since then it has meant agents, workflows and the checks around them.';
const LOOKING = 'Open to roles in AI automation, experimentation and product analytics in Germany.';

const TIMELINE = [
  { dates: 'Oct 2026 – present', datetimes: ['2026-10'], role: 'AI Data Specialist, Business and Analytics Workflows (Contract)', where: 'Mercor, remote' },
  { dates: 'Aug 2023 – Apr 2025', datetimes: ['2023-08', '2025-04'], role: 'Working student: Marketing Analytics & Growth Experimentation', where: 'Audible (Amazon), Berlin' },
  { dates: 'Apr 2023 – Nov 2025', datetimes: ['2023-04', '2025-11'], role: 'MSc Data Science', where: 'University of Europe for Applied Sciences, Berlin' },
  { dates: 'Sep 2019 – Nov 2022', datetimes: ['2019-09', '2022-11'], role: 'BSc Computer Science', where: 'Jacobs University Bremen (now Constructor University), Bremen' },
];

const TOOLS: readonly [tool: string, where: string][] = [
  ['SQL (DuckDB)', 'the retention analysis, the KPI dashboard and the weather pipeline'],
  ['Python: pandas, NumPy, scikit-learn and XGBoost', 'the analytics projects'],
  ['Excel', 'fortnightly performance reports at Audible'],
  ['Tableau, as a data source', 'the data behind those reports'],
  ['Tampermonkey with a step recorder', 'the test-account automation tool at Audible'],
  ['Amplitude', 'the Pulse instrumentation demo'],
  ['React, TypeScript and Vite', 'the Pulse dashboard'],
  ['Flask, FastAPI, Streamlit and Docker', "my Master's thesis tool and its 2026 rebuild"],
  ['Claude Code', 'the agents and automated checks in Docproof'],
  ['n8n', 'the e-invoice intake and error alerts library'],
  ['GitHub Actions', 'continuous integration for my public projects'],
];

const LANGUAGES: readonly [language: string, level: string][] = [
  ['Arabic', 'native'],
  ['English', 'fluent (C2)'],
  ['French', 'fluent (C2)'],
  ['German', 'B1'],
  ['Spanish', 'A2'],
];

describe('the About page', () => {
  it('has one h1 and the sections in order, each a region named by its h2', () => {
    const d = about();
    expect(all(d, (el) => el.tagName === 'h1').map(text)).toEqual(['About']);
    const sections = all(d, (el) => el.tagName === 'section' && has(el, 'id'));
    expect(sections.map((s) => [attr(s, 'id'), text(one(s, (el) => el.tagName === 'h2'))])).toEqual([
      ['timeline', 'Timeline'],
      ['tools', 'Tools I have shipped with'],
      ['languages', 'Languages'],
      ['cv', 'CV'],
    ]);
    expect(ABOUT_SECTIONS.map((s) => s.id)).toEqual(['timeline', 'tools', 'languages', 'cv']);
    for (const s of sections) expect(attr(s, 'aria-labelledby')).toBe(`${attr(s, 'id')}-title`);
  });

  it('tells the five-sentence story, the new paragraph and the looking-for line, word for word', () => {
    const story = one(about(), (el) => has(el, 'data-about-story'));
    const paragraphs = all(story, (el) => el.tagName === 'p').map(text);
    expect(paragraphs).toEqual([STORY.slice(0, 2).join(' '), FOCUS, LOOKING, STORY.slice(2, 4).join(' '), STORY[4]]);
    expect(paragraphs.join(' ').split(/(?<=\.)\s+(?=[A-Z])/)).toEqual([...STORY.slice(0, 2), ...FOCUS.split(/(?<=\.)\s+(?=[A-Z])/), LOOKING, ...STORY.slice(2)]);
  });

  it('puts the new paragraph right after the first, and the looking-for line alone after it', () => {
    const story = one(about(), (el) => has(el, 'data-about-story'));
    const paragraphs = all(story, (el) => el.tagName === 'p');
    expect(paragraphs.map((p) => all(p, (el) => has(el, 'data-sentence')).length)).toEqual([2, 0, 0, 2, 1]);
    expect(has(paragraphs[1]!, 'data-about-focus')).toBe(true);
    expect(has(paragraphs[2]!, 'data-about-looking')).toBe(true);
  });

  it('keeps exactly the four timeline entries in order, and leaves the two short earlier roles to the CV', () => {
    const d = about();
    const roles = all(section(d, 'timeline'), (el) => el.tagName === 'h3').map(text);
    expect(roles).toEqual([
      'AI Data Specialist, Business and Analytics Workflows (Contract)',
      'Working student: Marketing Analytics & Growth Experimentation',
      'MSc Data Science',
      'BSc Computer Science',
    ]);
    const page = text(d);
    for (const gone of ['Fundraiser', 'Direct Results', 'Research Assistant', 'Geo Engineering']) expect(page).not.toContain(gone);
    const cvText = text(cv());
    for (const kept of ['Fundraiser & Marketing Representative', 'Direct Results', 'Intern, Research Assistant', 'Geo Engineering']) expect(cvText).toContain(kept);
  });

  it('marks the layout motion: parallax photo, rising headings, a drawn timeline rule', () => {
    const d = about();
    expect(has(one(d, (el) => el.tagName === 'img'), 'data-depth-parallax')).toBe(true);
    const headings = all(d, (el) => el.tagName === 'h1' || el.tagName === 'h2');
    expect(headings.length).toBe(5);
    for (const h of headings) expect(attr(h, 'data-depth-rise')).toBe('heading');
    // the rule that draws is a decorative span next to the list, never the list itself
    const drawn = all(section(d, 'timeline'), (el) => has(el, 'data-depth-draw'));
    expect(drawn.length).toBe(1);
    expect(drawn[0]!.tagName).toBe('span');
    expect(attr(drawn[0]!, 'aria-hidden')).toBe('true');
    expect(has(one(section(d, 'timeline'), (el) => el.tagName === 'ol'), 'data-depth-draw')).toBe(false);
  });

  it('puts the portrait and the story side by side from lg: about 5 of 12 columns, rounded xl', () => {
    const d = about();
    const img = one(d, (el) => el.tagName === 'img');
    expect(classes(img)).toContain('rounded-xl');
    expect(classes(img)).not.toContain('rounded-sm');
    const story = one(d, (el) => has(el, 'data-about-story'));
    const textCol = all(d, (el) => el.tagName === 'div' && classes(el).includes('lg:col-span-7'));
    const photoCol = all(d, (el) => el.tagName === 'div' && classes(el).includes('lg:col-span-5'));
    expect(textCol).toHaveLength(1);
    expect(photoCol).toHaveLength(1);
    expect(all(textCol[0]!, (el) => el === story)).toHaveLength(1);
    expect(all(photoCol[0]!, (el) => el === img)).toHaveLength(1);
    const grid = all(d, (el) => el.tagName === 'div' && classes(el).includes('lg:grid-cols-12'));
    expect(grid).toHaveLength(1);
    expect(classes(grid[0]!)).not.toContain('md:grid-cols-12');
  });

  it('uses the page-title size from md up on its h1, as every other page does', () => {
    expect(classes(one(about(), (el) => el.tagName === 'h1'))).toEqual(expect.arrayContaining(['text-2xl', 'md:text-3xl']));
  });

  it('gives the timeline and the term lists one width, and one first column', () => {
    const d = about();
    const timeline = one(section(d, 'timeline'), (el) => el.tagName === 'ol');
    expect(classes(timeline)).toContain('max-w-text');
    expect(classes(timeline)).not.toContain('max-w-figure');
    for (const id of ['tools', 'languages']) {
      const dl = one(section(d, id), (el) => el.tagName === 'dl');
      expect(classes(dl)).toContain('max-w-text');
      expect(classes(dl)).toContain('md:grid-cols-[12rem_1fr]');
    }
    for (const li of all(section(d, 'timeline'), (el) => el.tagName === 'li')) expect(classes(li)).toContain('md:grid-cols-[12rem_1fr]');
  });

  it('shows the photograph with its alternative text, 4:5, at 480 px wide (960 px for dense screens), loaded eagerly but not preloaded', () => {
    const img = one(about(), (el) => el.tagName === 'img');
    expect(attr(img, 'alt')).toBe(aboutPhoto.alt);
    expect(Number(attr(img, 'width')) / Number(attr(img, 'height'))).toBe(4 / 5);
    expect(attr(img, 'width')).toBe('480');
    // Above the fold from md up, so it is not lazy; it is still not preloaded or given a high priority.
    expect(attr(img, 'loading')).toBe('eager');
    expect(attr(img, 'fetchpriority')).toBeUndefined();
    // One candidate per density; the widths themselves (480 and 960) come from next.config.ts and are
    // checked on the built page.
    expect(attr(img, 'srcset')?.split(', ').map((c) => c.split(' ')[1])).toEqual(['1x', '2x']);
    expect(attr(img, 'src')).toContain(encodeURIComponent(aboutPhoto.src));
  });

  it('lists the timeline newest first, with Audible as a working student and every date in <time>', () => {
    const rows = all(section(about(), 'timeline'), (el) => el.tagName === 'li');
    expect(
      rows.map((r) => ({
        dates: text(one(r, (el) => has(el, 'data-timeline-dates'))),
        datetimes: all(r, (el) => el.tagName === 'time').map((t) => attr(t, 'datetime')),
        role: text(one(r, (el) => el.tagName === 'h3')),
        where: text(one(r, (el) => has(el, 'data-timeline-where'))),
      })),
    ).toEqual(TIMELINE);
  });

  it('lists the tools I have shipped with and where, as plain words: no levels, bars or frequencies', () => {
    const tools = section(about(), 'tools');
    const dts = all(tools, (el) => el.tagName === 'dt').map(text);
    const dds = all(tools, (el) => el.tagName === 'dd').map(text);
    expect(dts.map((t, i) => [t, dds[i]])).toEqual(TOOLS);
    expect(all(tools, (el) => ['meter', 'progress', 'svg'].includes(el.tagName) || attr(el, 'role') === 'progressbar')).toEqual([]);
  });

  it('lists the languages with their levels, German at B1', () => {
    const langs = section(about(), 'languages');
    const dts = all(langs, (el) => el.tagName === 'dt').map(text);
    const dds = all(langs, (el) => el.tagName === 'dd').map(text);
    expect(dts.map((t, i) => [t, dds[i]])).toEqual(LANGUAGES);
  });

  it('links the CV page, and offers the PDF with its size only when the build found a checked one', () => {
    const links = (d: T.Document) => all(section(d, 'cv'), (el) => el.tagName === 'a').map((a) => [text(a), attr(a, 'href'), has(a, 'download')]);
    expect(links(about())).toEqual([['Read my CV', CV_LINK.href, false]]);
    process.env.CV_PDF = PDF_ENV;
    expect(links(about())).toEqual([
      ['Read my CV', CV_LINK.href, false],
      [DOWNLOAD, CV_PDF_HREF, true],
    ]);
  });

  it('passes the truth audit: every number is marked, the years and levels are allowed', () => {
    expect(audit(renderToStaticMarkup(createElement(AboutPage)), '/about')).toEqual([]);
    process.env.CV_PDF = PDF_ENV;
    expect(audit(renderToStaticMarkup(createElement(AboutPage)), '/about')).toEqual([]);
  });
});

// ═════════════════════════════════════════ CV ════════════════════════════════════════════════════
/** Every claim on the CV page, in page order, word for word as it renders (figures as their facts print). */
const CV_CLAIMS: readonly [id: string, text: string][] = [
  ['summary-tenure', 'Experimentation and growth analyst with nearly two years at Audible (Amazon): contributed to 25+ A/B tests across web and mobile and worked with 3 teams over my time there.'],
  ['summary-tool', 'Built a browser-automation tool that cut test-account setup from ~20 to ~3 minutes and was adopted team-wide.'],
  ['summary-skills', 'MSc in Data Science (2025); I work in SQL and Python and build LLM applications and agentic workflows.'],
  ['mercor-data', 'Build high-quality training data for AI models, applying business and analytics expertise to produce accurate, well-documented work samples.'],
  ['mercor-accuracy', 'Put accuracy first: check and explain every result, and document the work so others can review and repeat it.'],
  ['mercor-standards', 'Work to strict quality standards and stay disciplined about privacy and confidentiality.'],
  ['audible-tests', "Contributed to 25+ A/B tests across web and mobile on Amazon's internal platforms, from hypothesis to a recommendation, doing the sample-size planning and significance testing myself."],
  ['audible-adopted', '20+ of my recommendations were adopted: most tests were personalisation and ordering bets against non-personalised baselines, ideas came from a pre-vetted pipeline, and neutral results could ship when guardrails held and there was a product reason.'],
  ['audible-metrics', 'Evaluated experiments for the teams that used mirrored metric setups (revenue primary and listening minutes secondary, or the reverse), with churn and incremental long-term value (ILTV) as guardrails.'],
  ['audible-crm', 'Contributed to CRM-driven personalisation for opted-in vs. opted-out member segments on Home and Discovery pages, writing the SQL segmentation queries within DMA consent rules and aligning targeting across teams.'],
  ['audible-automation', 'Spotted a manual bottleneck and built an automation tool (Tampermonkey with a step recorder) that cut test-account setup from ~20 to ~3 minutes (~85%) across 11 markets, then drove team-wide adoption via a guide and video.'],
  ['audible-ai-tools', 'Built AI tools adopted by the wider team after assessing Amazon Bedrock for team-efficiency use cases: an A/B test ideation tool that mines past experiment results, and a Jira launch-ticket generator.'],
  ['audible-reports', 'Built fortnightly Excel performance reports on experiments, campaigns and lifecycle KPIs from Tableau data for senior stakeholders of the teams I worked with.'],
  ['audible-campaigns', 'Set up and updated content campaigns in the CMS across app and website in 11 marketplaces, placing titles chosen with the content curation team; supported French-market content discovery and merchandising.'],
  ['direct-results-donors', 'Signed up new monthly donors through face-to-face outreach for CARE, the International Rescue Committee and World Vision.'],
  ['direct-results-team', 'Recruited and trained new team members: helped the manager run situational interviews, approached promising people on the street and coached new recruits on the street-fundraising sales funnel.'],
  ['geo-cnc', 'Designed, calibrated and tested a CNC milling machine under academic supervision, so the company could make parts in-house instead of buying them, and prepared its technical documentation and inventory (Excel, Solid Edge, Estlcam).'],
  ['retention-analysis', 'Analysed 801,134 clean order lines (5,850 customers) from a public UK online-retailer dataset: cohort retention, RFM segments and a 90-day repurchase model scored on a later period (AUC 0.79 vs 0.76 for a most-recent-buyer-first rule).'],
  ['retention-segments', 'Segmented customers by recency, frequency and spend (Champions: 23% of customers, 71% of spend) and sized a holdout test (1,353 customers per group to detect +5 pp) for measuring a win-back offer.'],
  ['kpi-dashboard', 'Built a static KPI dashboard (Chart.js) over SQL-built KPI tables; excluded reversed orders (an order and its cancellation), which had inflated revenue and made returns look like they had grown 29%.'],
  ['pulse-taxonomy', 'Designed and built a dashboard to demonstrate Amplitude instrumentation: a 7-event taxonomy in which each event is designed to answer a product question (activation, engagement, conversion intent, retention), plus user properties for segmentation.'],
  ['pulse-replay', 'Layered autocapture and Session Replay under the explicit taxonomy and deployed through GitHub and Vercel CI/CD.'],
  ['thesis-tool', 'Built a web-based generative AI tool that writes platform-specific marketing content (social, email, PPC, product launches) from a brief, with iterative feedback from marketers.'],
  ['thesis-rebuild', 'Rebuilt in 2026 as a live web app (FastAPI, Vercel) with copy variants and a fact check against invented claims.'],
  ['docproof-pipeline', 'Built an open-source pipeline (Python CLI + Claude agents) that turns one structured fact base into Word files and designed PDFs; usable with any LLM (Claude, GPT, Gemini).'],
  ['docproof-verification', 'Automated claim verification: every figure must trace to the fact base and listed gaps are blocked.'],
  ['docproof-agents', 'Split the work across agents (author, claim auditor, context-free reviewer), backed by unit tests and GitHub Actions CI with headless-Chrome rendering checks.'],
  ['weather-pipeline', 'Built a SQL star schema with 18 automated data-quality checks and benchmarked k-NN, Random Forest and XGBoost for rain classification with location-grouped cross-validation (XGBoost: AUC 0.91, F1 0.52).'],
  ['n8n-intake', 'Built an e-invoice intake in n8n (XRechnung, ZUGFeRD: German e-invoice formats) that reads and checks supplier invoices, flags duplicates and changed bank details, archives originals and routes exceptions to a person.'],
  ['n8n-delivery', 'Added Gmail mail intake and a shared error-alert system, with a one-command installer, an acceptance test and a Docker setup (PostgreSQL, HTTPS) whose backup was restored after a full data wipe.'],
  ['n8n-tests', '270+ automated tests (part of the suite runs in GitHub Actions on every push); verified on a clean n8n install.'],
];

/**
 * The PDF's figures the page leaves out, one by one: the site has no sourced fact for them, so the
 * page drops the figure (or the whole claim) and never spells it out in words.
 */
const OMISSIONS: readonly Omission[] = [
  {
    id: 'direct-results-donors',
    pdf: 'Signed up an average of 3+ new monthly donors per working day through face-to-face outreach for CARE, the International Rescue Committee and World Vision.',
    omitted: ['an average of 3+ ', ' per working day'],
  },
  {
    id: 'direct-results-team',
    pdf: 'Recruited and trained 4 new team members: helped the manager run situational interviews, approached promising people on the street and coached new recruits on the street-fundraising sales funnel.',
    omitted: ['4 '],
  },
  {
    id: 'thesis-validation',
    pdf: 'Validated with 9 Audible marketers over 2 rounds: 83/100 usability (SUS), 4.6/5 relevance, 4.7/5 fluency; 7 of 9 preferred it to manual writing, and participants reported 50–70% less planning time.',
    omitted: 'whole claim',
  },
  {
    id: 'docproof-agents',
    pdf: 'Split the work across 3 agents (author, claim auditor, context-free reviewer), backed by unit tests and GitHub Actions CI with headless-Chrome rendering checks.',
    omitted: ['3 '],
  },
];

const EXPERIENCE = [
  ['AI Data Specialist, Business and Analytics Workflows (Contract)', 'Mercor, Berlin, Germany (remote)', 'Oct 2026 – present'],
  ['Marketing Analytics & Growth Experimentation (Working Student)', 'Audible (Amazon), Berlin, Germany', 'Aug 2023 – Apr 2025'],
  ['Fundraiser & Marketing Representative', 'Direct Results, Berlin, Germany', 'Mar 2023 – Jun 2023'],
  ['Intern, Research Assistant', 'Geo Engineering, Bremen, Germany', 'Jun 2021 – Sep 2021'],
];
const EDUCATION = [
  {
    heading: ['MSc Data Science', 'University of Europe for Applied Sciences, Berlin', 'Apr 2023 – Nov 2025'],
    lines: ['Relevant coursework: Marketing Analytics, Machine Learning, Data Visualization, Data Engineering, Cloud Computing (AWS), Agile Project Management.'],
  },
  {
    heading: ['BSc Computer Science', 'Jacobs University Bremen (now Constructor University)', 'Sep 2019 – Nov 2022'],
    lines: [
      'Minor in Global Economics and Management.',
      'Relevant coursework: Databases & Web Services, Machine Learning, Probability and Random Processes, Software Engineering, Algorithms & Data Structures.',
    ],
  },
];
const SKILLS = [
  ['Tools & languages', 'SQL (DuckDB), Python (pandas, NumPy, scikit-learn, XGBoost, statsmodels), Power BI, Tableau, Excel, Amplitude, REST APIs, Git/GitHub, Streamlit.'],
  [
    'Analytics & methods',
    'A/B testing & experimentation (significance testing, sample-size planning), experiment metric design (primary, secondary & guardrail metrics), funnel/lifecycle/cohort retention analysis, RFM segmentation, predictive modelling (supervised ML) & clustering, CRM segmentation (consent-aware), KPI definition & stakeholder reporting, product analytics & event tracking.',
  ],
  [
    'AI & automation',
    'AI-assisted analysis & coding (Claude Code, ChatGPT, Microsoft Copilot), agentic workflows (custom Claude agents, multi-step pipelines with automated verification), LLM applications via API (OpenAI GPT), process automation (Python, n8n, browser automation).',
  ],
];
const PROJECTS = [
  ['Customer Retention & Reactivation Analysis', 'Personal project on a public dataset, rebuilt in 2026', 'Technologies: Python (pandas, scikit-learn, statsmodels), SQL (DuckDB), pytest, GitHub Actions.'],
  ['Retail KPI Dashboard', 'Personal project on a public dataset, rebuilt in 2026', 'Technologies: SQL (DuckDB), JavaScript (Chart.js), Python, GitHub Pages, GitHub Actions.'],
  ['Pulse: Amplitude Analytics Demo', 'Personal project, 2026', 'Technologies: React, TypeScript, Vite, Tailwind CSS, Amplitude (event tracking, Session Replay), Git/GitHub, Vercel.'],
  ['Generative AI Content Marketing Web Service', "Master's thesis, Apr 2025 – Nov 2025", 'Technologies: Python, Flask, FastAPI, Streamlit, Docker, Google Cloud Run, Vercel, OpenAI GPT, Claude, Groq, Meta NLLB.'],
  ['Docproof: Multi-Agent Document Pipeline', 'Open-source project, 2026', 'Technologies: Python, Claude Code (agents & skills), HTML/CSS, headless Chrome, GitHub Actions.'],
  ['Global Weather Data Pipeline', 'Personal project on a public dataset, rebuilt in 2026', 'Technologies: SQL (DuckDB), Python (pandas, scikit-learn, XGBoost), pytest, GitHub Actions.'],
  ['n8n Library: E-Invoice Intake & Alerts', 'Personal project, 2026', 'Technologies: n8n, JavaScript (Node.js), REST APIs & webhooks, Gmail API (OAuth2), Docker, PostgreSQL, GitHub Actions.'],
];

const claimsOf = (d: T.Document) =>
  all(d, (el) => has(el, 'data-cv-claim')).map((el) => ({ id: attr(el, 'data-cv-claim')!, text: text(el), el }));
const entryRows = (s: El) =>
  all(s, (el) => el.tagName === 'article').map((e) => [
    text(one(e, (el) => el.tagName === 'h3')),
    text(one(e, (el) => has(el, 'data-cv-where'))),
    ...all(e, (el) => has(el, 'data-cv-dates')).map(text),
  ]);

describe('the CV page', () => {
  it('has my name as its h1 and the sections in the CV order', () => {
    const d = cv();
    expect(all(d, (el) => el.tagName === 'h1').map(text)).toEqual([SITE.name]);
    const sections = all(d, (el) => el.tagName === 'section' && has(el, 'id'));
    expect(sections.map((s) => [attr(s, 'id'), text(one(s, (el) => el.tagName === 'h2'))])).toEqual([
      ['summary', 'Summary'],
      ['experience', 'Experience'],
      ['skills', 'Skills'],
      ['education', 'Education'],
      ['languages', 'Languages'],
      ['projects', 'Projects'],
    ]);
    expect(CV_SECTIONS.map((s) => s.id)).toEqual(sections.map((s) => attr(s, 'id')));
  });

  it('marks the h1 and the section headings to rise on entry', () => {
    const headings = all(cv(), (el) => el.tagName === 'h1' || el.tagName === 'h2');
    expect(headings.length).toBe(7);
    for (const h of headings) expect(attr(h, 'data-depth-rise')).toBe('heading');
  });

  it('uses the page-title size from md up on its h1', () => {
    expect(classes(one(cv(), (el) => el.tagName === 'h1'))).toEqual(expect.arrayContaining(['text-2xl', 'md:text-3xl']));
  });

  it('keeps every bullet and plain line at the reading width inside the wider frame', () => {
    const d = cv();
    const lists = all(d, (el) => el.tagName === 'ul' && all(el, (li) => has(li, 'data-cv-claim')).length > 0);
    expect(lists.length).toBeGreaterThan(3);
    for (const ul of lists) expect(classes(ul)).toContain('max-w-text');
    for (const line of all(d, (el) => has(el, 'data-cv-line') || has(el, 'data-cv-technologies'))) expect(classes(line)).toContain('max-w-text');
  });

  // In print a long role may break across pages: only its heading stays with its first bullet, and
  // no single bullet splits. The page margins are set by @page in globals.css.
  it('lets an entry break across printed pages, keeping its heading with its first bullet', () => {
    const d = cv();
    const entries = all(d, (el) => el.tagName === 'article' && (attr(el, 'aria-labelledby') ?? '').startsWith('cv-') && attr(el, 'aria-labelledby') !== 'cv-title');
    expect(entries.length).toBeGreaterThan(5);
    for (const e of entries) {
      expect(classes(e)).not.toContain('break-inside-avoid');
      const head = one(e, (el) => has(el, 'data-cv-entry-head'));
      expect(classes(head)).toEqual(expect.arrayContaining(['break-inside-avoid', 'break-after-avoid']));
      expect(all(head, (el) => el.tagName === 'h3')).toHaveLength(1);
    }
    for (const li of all(d, (el) => el.tagName === 'li' && has(el, 'data-cv-claim'))) expect(classes(li)).toContain('break-inside-avoid');
    const css = readFileSync(join(repo, 'src/app/globals.css'), 'utf8');
    expect(css).toMatch(/@page\s*\{\s*margin:/);
  });

  it('prints the role line, Berlin, Germany, and the LinkedIn and GitHub profiles as external links', () => {
    const header = one(cv(), (el) => has(el, 'data-cv-header'));
    expect(text(one(header, (el) => has(el, 'data-cv-role')))).toBe(SITE.role);
    expect(text(one(header, (el) => has(el, 'data-cv-place')))).toBe(SITE.city);
    const links = all(header, (el) => el.tagName === 'a').map((a) => [text(a), attr(a, 'href'), attr(a, 'rel')]);
    expect(links).toEqual([
      ['linkedin.com/in/melbergui', CONTACT.linkedin, 'noopener'],
      ['github.com/MaHmOuDeB', CONTACT.github, 'noopener'],
    ]);
  });

  it('prints every claim word for word, each once', () => {
    expect(claimsOf(cv()).map(({ id, text: t }) => [id, t])).toEqual(CV_CLAIMS);
  });

  it('lists the experience, education, skills, languages and projects as pinned', () => {
    const d = cv();
    expect(entryRows(section(d, 'experience'))).toEqual(EXPERIENCE);
    const edu = all(section(d, 'education'), (el) => el.tagName === 'article');
    expect(
      edu.map((e) => ({
        heading: [text(one(e, (el) => el.tagName === 'h3')), text(one(e, (el) => has(el, 'data-cv-where'))), text(one(e, (el) => has(el, 'data-cv-dates')))],
        lines: all(e, (el) => el.tagName === 'p' && has(el, 'data-cv-line')).map(text),
      })),
    ).toEqual(EDUCATION);
    const skills = section(d, 'skills');
    const dts = all(skills, (el) => el.tagName === 'dt').map(text);
    expect(dts.map((t, i) => [t, all(skills, (el) => el.tagName === 'dd').map(text)[i]])).toEqual(SKILLS);
    const langs = section(d, 'languages');
    const ldts = all(langs, (el) => el.tagName === 'dt').map(text);
    expect(ldts.map((t, i) => [t, all(langs, (el) => el.tagName === 'dd').map(text)[i]])).toEqual(LANGUAGES);
    const projects = all(section(d, 'projects'), (el) => el.tagName === 'article');
    expect(
      projects.map((p) => [
        text(one(p, (el) => el.tagName === 'h3')),
        text(one(p, (el) => has(el, 'data-cv-where'))),
        text(one(p, (el) => has(el, 'data-cv-technologies'))),
      ]),
    ).toEqual(PROJECTS);
  });

  it('shows Audible as a working student and the teams as one after another', () => {
    const d = cv();
    expect(entryRows(section(d, 'experience'))[1]![0]).toContain('(Working Student)');
    const teams = claimsOf(d).filter((c) => all(c.el, (el) => attr(el, 'data-fact') === 'profile.audible.teams').length > 0);
    expect(teams.map((c) => c.id)).toEqual(['summary-tenure']);
    expect(teams[0]!.text).toContain('over my time there');
  });

  it('holds the markets fact only in the automation and campaign claims; the About story names its own facts', () => {
    const facts = (el: El) => all(el, (e) => has(e, 'data-fact')).map((e) => attr(e, 'data-fact'));
    const markets = claimsOf(cv()).filter((c) => facts(c.el).includes('profile.audible.markets'));
    expect(markets.map((c) => c.id)).toEqual(['audible-automation', 'audible-campaigns']);
    const story = one(about(), (el) => has(el, 'data-about-story'));
    expect(all(story, (el) => has(el, 'data-sentence')).map(facts)).toEqual([
      [],
      [],
      ['profile.audible.experiments', 'profile.audible.teams'],
      ['profile.audible.setup_minutes_before', 'profile.audible.setup_minutes_after'],
      [],
    ]);
  });

  it('gives LinkedIn as the contact route, with no mail link', () => {
    const header = one(cv(), (el) => has(el, 'data-cv-header'));
    const contact = one(header, (el) => has(el, 'data-cv-contact'));
    const link = one(contact, (el) => el.tagName === 'a');
    expect([text(link), attr(link, 'href')]).toEqual(['linkedin.com/in/melbergui', CONTACT.linkedin]);
    expect(renderToStaticMarkup(createElement(CvPage))).not.toContain('mailto:');
  });

  it('passes the truth audit, with and without the PDF linked', () => {
    expect(audit(renderToStaticMarkup(createElement(CvPage)), '/cv')).toEqual([]);
    process.env.CV_PDF = PDF_ENV;
    expect(audit(renderToStaticMarkup(createElement(CvPage)), '/cv')).toEqual([]);
  });

  it('offers the PDF only when the build found a checked one: one primary button at the top, with its size, hidden in print', () => {
    const pdfLinks = (d: T.Document) => all(d, (el) => el.tagName === 'a' && attr(el, 'href') === CV_PDF_HREF);
    expect(pdfLinks(cv())).toEqual([]);
    expect(all(cv(), (el) => has(el, 'data-cv-download'))).toEqual([]);
    process.env.CV_PDF = PDF_ENV;
    const d = cv();
    const [link, ...more] = pdfLinks(d);
    expect(more).toEqual([]);
    expect(text(link!)).toBe(DOWNLOAD);
    expect(has(link!, 'download')).toBe(true);
    expect(classes(link!)).toContain('bg-ink');
    const size = one(link!, (el) => el.tagName === 'data');
    expect([attr(size, 'value'), attr(size, 'data-derived')]).toEqual(['84', 'build']);
    const download = one(d, (el) => has(el, 'data-cv-download'));
    expect(classes(download)).toContain('print:hidden');
    expect(all(one(d, (el) => has(el, 'data-cv-header')), (el) => el === download)).toEqual([download]);
  });
});

// ═════════════════════════════════ the header's CV link ═════════════════════════════════════════
describe('the header always links the CV page', () => {
  const cvLinks = () =>
    all(dom(renderToStaticMarkup(createElement(SiteHeader))), (el) => el.tagName === 'a' && /^CV/.test(text(el))).map((a) => [
      text(a),
      attr(a, 'href'),
      has(a, 'download'),
    ]);

  it('"CV" to the CV page (desktop and phone), with or without a checked PDF', () => {
    const page = [
      ['CV', '/cv', false],
      ['CV', '/cv', false],
    ];
    expect(cvLinks()).toEqual(page);
    process.env.CV_PDF = PDF_ENV;
    expect(cvLinks()).toEqual(page);
  });
});

// ═════════════════════════════════ the page and the PDF agree ═══════════════════════════════════
const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

/** Wraps a sentence onto lines that fit the synthetic page. */
function wrap(s: string, width = 80): string[] {
  const out: string[] = [];
  let line = '';
  for (const w of s.split(' ')) {
    if (line && line.length + 1 + w.length > width) {
      out.push(line);
      line = w;
    } else line = line ? `${line} ${w}` : w;
  }
  return [...out, line];
}

const claimText = (id: string) => CV_CLAIMS.find(([i]) => i === id)![1];
const omission = (id: string) => OMISSIONS.find((o) => o.id === id)!;

/** A small synthetic web CV: a summary sentence, one job with three bullets, one project with one. */
function syntheticCv(bullets: readonly string[]): { pdf: Buffer; manifest: unknown; records: unknown } {
  const lines: Line[] = [];
  let y = 800;
  const put = (t: string, x = 72) => {
    lines.push({ text: t, x, y });
    y -= 14;
  };
  put('Ada Example');
  y -= 14;
  put('Summary');
  for (const l of wrap(claimText('summary-skills'))) put(l);
  y -= 14;
  put('Experience');
  lines.push({ text: 'Oct 2026 – Present', x: 450, y });
  put('Data Specialist');
  put('Example Co, Testville');
  for (const b of bullets.slice(0, 3)) {
    lines.push({ text: '•', x: 72, y });
    for (const l of wrap(b)) put(l, 82);
  }
  y -= 14;
  put('Projects');
  lines.push({ text: '2026', x: 450, y });
  put('Pipeline');
  lines.push({ text: '•', x: 72, y });
  for (const l of wrap(bullets[3]!)) put(l, 82);
  y -= 14;
  put('Languages');
  lines.push({ text: 'German B1', x: 250, y });
  put('English Fluent (C2)');
  const agents = omission('docproof-agents').pdf;
  const at = agents.indexOf('3');
  return {
    pdf: writePdf({ pages: [lines] }),
    manifest: {
      version: 1,
      links: [],
      sections: [
        { sectionId: 'summary', heading: 'Summary' },
        {
          sectionId: 'experience',
          heading: 'Experience',
          entries: [
            {
              entryId: 'example-co',
              heading: 'Data Specialist Oct 2026 – Present',
              subject: 'Example Co',
              claims: ['mercor-data', 'mercor-accuracy', 'mercor-standards'].map((claimId) => ({ claimId, bulletMarker: '•', page: 1 })),
            },
          ],
        },
        {
          sectionId: 'projects',
          heading: 'Projects',
          entries: [{ entryId: 'pipeline', heading: 'Pipeline 2026', subject: 'Pipeline', claims: [{ claimId: 'docproof-agents', bulletMarker: '•', page: 1 }] }],
        },
        { sectionId: 'languages', heading: 'Languages' },
      ],
      summaryBindings: [{ bindingId: 'summary-skills', sectionId: 'summary', normalizedClaim: claimText('summary-skills'), subject: 'Example Co' }],
    },
    records: {
      entries: bullets[3] === agents
        ? [
            {
              id: 'agents',
              bindingId: 'pipeline',
              claimId: 'docproof-agents',
              token: '3',
              span: { start: at, end: at + 1 },
              normalizedClaim: agents,
              subject: 'Pipeline',
              meaning: 'agents',
            },
          ]
        : [],
    },
  };
}

function runSynthetic(bullets: readonly string[]) {
  const dir = mkdtempSync(join(tmpdir(), 'cv-copy-'));
  dirs.push(dir);
  const s = syntheticCv(bullets);
  writeFileSync(join(dir, 'cv.pdf'), s.pdf);
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(s.manifest));
  writeFileSync(join(dir, 'records.json'), JSON.stringify(s.records));
  return pdfClaims(join(dir, 'cv.pdf'), { manifest: join(dir, 'manifest.json'), records: join(dir, 'records.json'), denylist: 'synthetic deny term' });
}

describe('the page and the PDF say the same things', () => {
  const page = () => claimsOf(cv()).map(({ id, text: t }) => ({ id, text: t }));
  const subset = (ids: readonly string[]) => page().filter((c) => ids.includes(c.id));
  const IDS = ['summary-skills', 'mercor-data', 'mercor-accuracy', 'mercor-standards', 'docproof-agents'];
  const BULLETS = [claimText('mercor-data'), claimText('mercor-accuracy'), claimText('mercor-standards'), omission('docproof-agents').pdf];

  it('lists each left-out figure one by one, and only figures', () => {
    expect(OMISSIONS.map((o) => o.id)).toEqual(['direct-results-donors', 'direct-results-team', 'thesis-validation', 'docproof-agents']);
    // Every listed fragment is removed from the PDF sentence to give exactly the page's text.
    const pdf = [...CV_CLAIMS.filter(([id]) => !OMISSIONS.some((o) => o.id === id)).map(([, t]) => t), ...OMISSIONS.map((o) => o.pdf)];
    expect(compareClaims(page(), pdf, OMISSIONS)).toEqual([]);
  });

  it('reads a synthetic PDF with the web CV checker and finds the page claims in it', () => {
    const r = runSynthetic(BULLETS);
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
    expect(compareClaims(subset(IDS), r.claims, OMISSIONS.filter((o) => o.id === 'docproof-agents'))).toEqual([]);
  });

  it('reports a page claim the PDF words differently', () => {
    const changed = [BULLETS[0]!, 'Put accuracy first: check every result.', BULLETS[2]!, BULLETS[3]!];
    const r = runSynthetic(changed);
    expect(r.status).toBe(0);
    expect(compareClaims(subset(IDS), r.claims, OMISSIONS.filter((o) => o.id === 'docproof-agents'))).toEqual([
      'mercor-accuracy: the PDF holds the page text 0 times',
    ]);
  });

  it('checks the committed PDF against the page, or, with none committed, offers no PDF anywhere', () => {
    const pdf = join(repo, 'public', 'cv.pdf');
    if (existsSync(pdf)) {
      const r = pdfClaims(pdf, { meta: join(repo, 'public', 'cv.meta.json'), denylist: 'parity check placeholder' });
      expect(r.status, r.stderr).toBe(0);
      expect(compareClaims(page(), r.claims, OMISSIONS)).toEqual([]);
    } else {
      expect(existsSync(join(repo, 'public', 'cv.meta.json'))).toBe(false);
      const html = renderToStaticMarkup(createElement(CvPage)) + renderToStaticMarkup(createElement(AboutPage));
      expect(html).not.toContain(`href="${CV_PDF_HREF}"`);
    }
  });
});
