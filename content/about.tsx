// The About page and the CV page as data. Every number is a <Fact> (or a <Derived> naming its
// source); dates are months in <time>, languages are CEFR levels in words. The page compositions
// (src/components/about/) decide the layout and the outline.
//
// The CV page carries the same claims as the web CV PDF, word for word, except where the PDF prints
// a figure the site has no fact for: there the page leaves the figure out (tests/unit/about lists
// each one). The teams are the ones I worked with over my time at Audible, one after another, and
// the markets figure belongs to the automation tool and the campaign work.
import type { ReactNode } from 'react';
import { Derived } from '@/components/kit/Derived';
import { Fact } from '@/components/kit/Fact';
import type { MonthRange } from '@/components/about/Months';
import { WINDOW_DAYS } from '@/lib/retention/rfm';

// ── About ───────────────────────────────────────────────────────────────────────────────────────

/** The story, one sentence per entry. */
export const ABOUT_STORY: readonly ReactNode[] = [
  <>I am an experimentation and growth analyst in Berlin, Germany.</>,
  <>
    For nearly two years I was a working student at Audible (Amazon), mainly in growth experimentation with some
    marketing analytics.
  </>,
  <>
    I contributed to <Fact id="profile.audible.experiments" /> A/B tests across web and mobile, did the sample-size
    planning and significance testing myself, and worked with <Fact id="profile.audible.teams" /> teams over my time
    there, one after another.
  </>,
  <>
    I also built a browser-automation tool, Tampermonkey with a step recorder, that cut test-account setup from about{' '}
    <Fact id="profile.audible.setup_minutes_before" /> to about <Fact id="profile.audible.setup_minutes_after" />{' '}
    minutes and was adopted team-wide.
  </>,
  <>
    I hold an MSc in Data Science from the University of Europe for Applied Sciences in Berlin (2025), and since then I
    have rebuilt my Master&apos;s projects on public data and built tools of my own.
  </>,
];

/** The new paragraph after the first one: what the two halves of my work have in common. */
export const ABOUT_FOCUS =
  'I work on two things that belong together: experiments that end in a clear recommendation, and automation that takes the manual work out of getting there. At Audible that meant A/B tests and a browser tool my team adopted; since then it has meant agents, workflows and the checks around them.';

/** What I am looking for, as its own short paragraph. */
export const ABOUT_LOOKING = 'Open to roles in AI automation, experimentation and product analytics in Germany.';

/**
 * Work and study, newest first. The two short earlier roles (the fundraiser job and the research
 * internship) are on the CV page only.
 */
export const TIMELINE: readonly { range: MonthRange; role: string; where: string }[] = [
  { range: { from: '2026-10', to: null }, role: 'AI Data Specialist, Business and Analytics Workflows (Contract)', where: 'Mercor, remote' },
  {
    range: { from: '2023-08', to: '2025-04' },
    role: 'Working student: Marketing Analytics & Growth Experimentation',
    where: 'Audible (Amazon), Berlin',
  },
  { range: { from: '2023-04', to: '2025-11' }, role: 'MSc Data Science', where: 'University of Europe for Applied Sciences, Berlin' },
  {
    range: { from: '2019-09', to: '2022-11' },
    role: 'BSc Computer Science',
    where: 'Jacobs University Bremen (now Constructor University), Bremen',
  },
];

/** Tools I have shipped work with, and where. No levels and no frequencies. */
export const SHIPPED_TOOLS: readonly { tool: string; where: string }[] = [
  { tool: 'SQL (DuckDB)', where: 'the retention analysis, the KPI dashboard and the weather pipeline' },
  { tool: 'Python: pandas, NumPy, scikit-learn and XGBoost', where: 'the analytics projects' },
  { tool: 'Excel', where: 'fortnightly performance reports at Audible' },
  { tool: 'Tableau, as a data source', where: 'the data behind those reports' },
  { tool: 'Tampermonkey with a step recorder', where: 'the test-account automation tool at Audible' },
  { tool: 'Amplitude', where: 'the Pulse instrumentation demo' },
  { tool: 'React, TypeScript and Vite', where: 'the Pulse dashboard' },
  { tool: 'Flask, FastAPI, Streamlit and Docker', where: "my Master's thesis tool and its 2026 rebuild" },
  { tool: 'Claude Code', where: 'the agents and automated checks in Docproof' },
  { tool: 'n8n', where: 'the e-invoice intake and error alerts library' },
  { tool: 'GitHub Actions', where: 'continuous integration for my public projects' },
];

/** Both pages list these; German is B1. */
export const LANGUAGES: readonly { language: string; level: string }[] = [
  { language: 'Arabic', level: 'native' },
  { language: 'English', level: 'fluent (C2)' },
  { language: 'French', level: 'fluent (C2)' },
  { language: 'German', level: 'B1' },
  { language: 'Spanish', level: 'A2' },
];

// ── CV ──────────────────────────────────────────────────────────────────────────────────────────

/** One claim of the CV: a summary sentence or a bullet. The id names it in the tests. */
export type CvClaim = { id: string; body: ReactNode };

export type CvEntry = {
  id: string;
  title: string;
  /** A site page about the entry, if there is one. */
  href?: string;
  /** Employer or school and place; for a project, what kind of project it is. */
  where: ReactNode;
  range?: MonthRange;
  claims: readonly CvClaim[];
  /** Plain lines without a bullet (coursework, a minor). */
  lines?: readonly string[];
  technologies?: string;
};

export const CV_SUMMARY: readonly CvClaim[] = [
  {
    id: 'summary-tenure',
    body: (
      <>
        Experimentation and growth analyst with nearly two years at Audible (Amazon): contributed to{' '}
        <Fact id="profile.audible.experiments" /> A/B tests across web and mobile and worked with{' '}
        <Fact id="profile.audible.teams" /> teams over my time there.
      </>
    ),
  },
  {
    id: 'summary-tool',
    body: (
      <>
        Built a browser-automation tool that cut test-account setup from ~<Fact id="profile.audible.setup_minutes_before" />{' '}
        to ~<Fact id="profile.audible.setup_minutes_after" /> minutes and was adopted team-wide.
      </>
    ),
  },
  {
    id: 'summary-skills',
    body: <>MSc in Data Science (2025); I work in SQL and Python and build LLM applications and agentic workflows.</>,
  },
];

export const CV_EXPERIENCE: readonly CvEntry[] = [
  {
    id: 'mercor',
    title: 'AI Data Specialist, Business and Analytics Workflows (Contract)',
    where: 'Mercor, Berlin, Germany (remote)',
    range: { from: '2026-10', to: null },
    claims: [
      {
        id: 'mercor-data',
        body: 'Build high-quality training data for AI models, applying business and analytics expertise to produce accurate, well-documented work samples.',
      },
      {
        id: 'mercor-accuracy',
        body: 'Put accuracy first: check and explain every result, and document the work so others can review and repeat it.',
      },
      { id: 'mercor-standards', body: 'Work to strict quality standards and stay disciplined about privacy and confidentiality.' },
    ],
  },
  {
    id: 'audible',
    title: 'Marketing Analytics & Growth Experimentation (Working Student)',
    where: 'Audible (Amazon), Berlin, Germany',
    range: { from: '2023-08', to: '2025-04' },
    claims: [
      {
        id: 'audible-tests',
        body: (
          <>
            Contributed to <Fact id="profile.audible.experiments" /> A/B tests across web and mobile on Amazon&apos;s
            internal platforms, from hypothesis to a recommendation, doing the sample-size planning and significance
            testing myself.
          </>
        ),
      },
      {
        id: 'audible-adopted',
        body: (
          <>
            <Fact id="profile.audible.recommendations_adopted" /> of my recommendations were adopted: most tests were
            personalisation and ordering bets against non-personalised baselines, ideas came from a pre-vetted
            pipeline, and neutral results could ship when guardrails held and there was a product reason.
          </>
        ),
      },
      {
        id: 'audible-metrics',
        body: 'Evaluated experiments for the teams that used mirrored metric setups (revenue primary and listening minutes secondary, or the reverse), with churn and incremental long-term value (ILTV) as guardrails.',
      },
      {
        id: 'audible-crm',
        body: 'Contributed to CRM-driven personalisation for opted-in vs. opted-out member segments on Home and Discovery pages, writing the SQL segmentation queries within DMA consent rules and aligning targeting across teams.',
      },
      {
        id: 'audible-automation',
        body: (
          <>
            Spotted a manual bottleneck and built an automation tool (Tampermonkey with a step recorder) that cut
            test-account setup from ~<Fact id="profile.audible.setup_minutes_before" /> to ~
            <Fact id="profile.audible.setup_minutes_after" /> minutes (~<Fact id="profile.audible.setup_time_cut" />)
            across <Fact id="profile.audible.markets" /> markets, then drove team-wide adoption via a guide and video.
          </>
        ),
      },
      {
        id: 'audible-ai-tools',
        body: 'Built AI tools adopted by the wider team after assessing Amazon Bedrock for team-efficiency use cases: an A/B test ideation tool that mines past experiment results, and a Jira launch-ticket generator.',
      },
      {
        id: 'audible-reports',
        body: 'Built fortnightly Excel performance reports on experiments, campaigns and lifecycle KPIs from Tableau data for senior stakeholders of the teams I worked with.',
      },
      {
        id: 'audible-campaigns',
        body: (
          <>
            Set up and updated content campaigns in the CMS across app and website in{' '}
            <Fact id="profile.audible.markets" /> marketplaces, placing titles chosen with the content curation team;
            supported French-market content discovery and merchandising.
          </>
        ),
      },
    ],
  },
  {
    id: 'direct-results',
    title: 'Fundraiser & Marketing Representative',
    where: 'Direct Results, Berlin, Germany',
    range: { from: '2023-03', to: '2023-06' },
    claims: [
      {
        id: 'direct-results-donors',
        body: 'Signed up new monthly donors through face-to-face outreach for CARE, the International Rescue Committee and World Vision.',
      },
      {
        id: 'direct-results-team',
        body: 'Recruited and trained new team members: helped the manager run situational interviews, approached promising people on the street and coached new recruits on the street-fundraising sales funnel.',
      },
    ],
  },
  {
    id: 'geo-engineering',
    title: 'Intern, Research Assistant',
    where: 'Geo Engineering, Bremen, Germany',
    range: { from: '2021-06', to: '2021-09' },
    claims: [
      {
        id: 'geo-cnc',
        body: 'Designed, calibrated and tested a CNC milling machine under academic supervision, so the company could make parts in-house instead of buying them, and prepared its technical documentation and inventory (Excel, Solid Edge, Estlcam).',
      },
    ],
  },
];

export const CV_SKILLS: readonly { label: string; items: string }[] = [
  {
    label: 'Tools & languages',
    items: 'SQL (DuckDB), Python (pandas, NumPy, scikit-learn, XGBoost, statsmodels), Power BI, Tableau, Excel, Amplitude, REST APIs, Git/GitHub, Streamlit.',
  },
  {
    label: 'Analytics & methods',
    items:
      'A/B testing & experimentation (significance testing, sample-size planning), experiment metric design (primary, secondary & guardrail metrics), funnel/lifecycle/cohort retention analysis, RFM segmentation, predictive modelling (supervised ML) & clustering, CRM segmentation (consent-aware), KPI definition & stakeholder reporting, product analytics & event tracking.',
  },
  {
    label: 'AI & automation',
    items:
      'AI-assisted analysis & coding (Claude Code, ChatGPT, Microsoft Copilot), agentic workflows (custom Claude agents, multi-step pipelines with automated verification), LLM applications via API (OpenAI GPT), process automation (Python, n8n, browser automation).',
  },
];

export const CV_EDUCATION: readonly CvEntry[] = [
  {
    id: 'msc',
    title: 'MSc Data Science',
    where: 'University of Europe for Applied Sciences, Berlin',
    range: { from: '2023-04', to: '2025-11' },
    claims: [],
    lines: [
      'Relevant coursework: Marketing Analytics, Machine Learning, Data Visualization, Data Engineering, Cloud Computing (AWS), Agile Project Management.',
    ],
  },
  {
    id: 'bsc',
    title: 'BSc Computer Science',
    where: 'Jacobs University Bremen (now Constructor University)',
    range: { from: '2019-09', to: '2022-11' },
    claims: [],
    lines: [
      'Minor in Global Economics and Management.',
      'Relevant coursework: Databases & Web Services, Machine Learning, Probability and Random Processes, Software Engineering, Algorithms & Data Structures.',
    ],
  },
];

const REBUILT = 'Personal project on a public dataset, rebuilt in 2026';

export const CV_PROJECTS: readonly CvEntry[] = [
  {
    id: 'retention',
    title: 'Customer Retention & Reactivation Analysis',
    href: '/work/retention',
    where: REBUILT,
    claims: [
      {
        id: 'retention-analysis',
        body: (
          <>
            Analysed <Fact id="retention.data.clean_rows" /> clean order lines (<Fact id="retention.data.customers" />{' '}
            customers) from a public UK online-retailer dataset: cohort retention, RFM segments and a{' '}
            <Derived value={WINDOW_DAYS} unit="count" refs={['source:retention']} />
            -day repurchase model scored on a later period (AUC <Fact id="retention.model.gb_auc" decimals={2} /> vs{' '}
            <Fact id="retention.model.rule_auc" decimals={2} /> for a most-recent-buyer-first rule).
          </>
        ),
      },
      {
        id: 'retention-segments',
        body: (
          <>
            Segmented customers by recency, frequency and spend (Champions:{' '}
            <Fact id="retention.rfm.champions_customer_share" /> of customers,{' '}
            <Fact id="retention.rfm.champions_revenue_share" /> of spend) and sized a holdout test (
            <Fact id="retention.winback.n_per_arm" /> customers per group to detect +
            <Fact id="retention.winback.uplift_pp" /> pp) for measuring a win-back offer.
          </>
        ),
      },
    ],
    technologies: 'Python (pandas, scikit-learn, statsmodels), SQL (DuckDB), pytest, GitHub Actions.',
  },
  {
    id: 'kpi-dashboard',
    title: 'Retail KPI Dashboard',
    where: REBUILT,
    claims: [
      {
        id: 'kpi-dashboard',
        body: (
          <>
            Built a static KPI dashboard (Chart.js) over SQL-built KPI tables; excluded reversed orders
            (an order and its cancellation), which had inflated revenue and made returns look like they had grown{' '}
            <Fact id="retail.returns.yoy_growth_raw" />.
          </>
        ),
      },
    ],
    technologies: 'SQL (DuckDB), JavaScript (Chart.js), Python, GitHub Pages, GitHub Actions.',
  },
  {
    id: 'pulse',
    title: 'Pulse: Amplitude Analytics Demo',
    where: 'Personal project, 2026',
    claims: [
      {
        id: 'pulse-taxonomy',
        body: (
          <>
            Designed and built a dashboard to demonstrate Amplitude instrumentation: a{' '}
            <Fact id="pulse.events.count" />
            -event taxonomy in which each event is designed to answer a product question (activation, engagement,
            conversion intent, retention), plus user properties for segmentation.
          </>
        ),
      },
      {
        id: 'pulse-replay',
        body: 'Layered autocapture and Session Replay under the explicit taxonomy and deployed through GitHub and Vercel CI/CD.',
      },
    ],
    technologies: 'React, TypeScript, Vite, Tailwind CSS, Amplitude (event tracking, Session Replay), Git/GitHub, Vercel.',
  },
  {
    id: 'thesis',
    title: 'Generative AI Content Marketing Web Service',
    where: "Master's thesis",
    range: { from: '2025-04', to: '2025-11' },
    claims: [
      {
        id: 'thesis-tool',
        body: 'Built a web-based generative AI tool that writes platform-specific marketing content (social, email, PPC, product launches) from a brief, with iterative feedback from marketers.',
      },
      {
        id: 'thesis-rebuild',
        body: 'Rebuilt in 2026 as a live web app (FastAPI, Vercel) with copy variants and a fact check against invented claims.',
      },
    ],
    technologies: 'Python, Flask, FastAPI, Streamlit, Docker, Google Cloud Run, Vercel, OpenAI GPT, Claude, Groq, Meta NLLB.',
  },
  {
    id: 'docproof',
    title: 'Docproof: Multi-Agent Document Pipeline',
    where: 'Open-source project, 2026',
    claims: [
      {
        id: 'docproof-pipeline',
        body: 'Built an open-source pipeline (Python CLI + Claude agents) that turns one structured fact base into Word files and designed PDFs; usable with any LLM (Claude, GPT, Gemini).',
      },
      {
        id: 'docproof-verification',
        body: 'Automated claim verification: every figure must trace to the fact base and listed gaps are blocked.',
      },
      {
        id: 'docproof-agents',
        body: 'Split the work across agents (author, claim auditor, context-free reviewer), backed by unit tests and GitHub Actions CI with headless-Chrome rendering checks.',
      },
    ],
    technologies: 'Python, Claude Code (agents & skills), HTML/CSS, headless Chrome, GitHub Actions.',
  },
  {
    id: 'weather',
    title: 'Global Weather Data Pipeline',
    where: REBUILT,
    claims: [
      {
        id: 'weather-pipeline',
        body: (
          <>
            Built a SQL star schema with <Fact id="weather.checks.count" /> automated data-quality checks and benchmarked
            k-NN, Random Forest and XGBoost for rain classification with location-grouped cross-validation (XGBoost: AUC{' '}
            <Fact id="weather.model.xgb_auc" />, F1 <Fact id="weather.model.xgb_f1" />
            ).
          </>
        ),
      },
    ],
    technologies: 'SQL (DuckDB), Python (pandas, scikit-learn, XGBoost), pytest, GitHub Actions.',
  },
  {
    id: 'n8n',
    title: 'n8n Library: E-Invoice Intake & Alerts',
    where: 'Personal project, 2026',
    claims: [
      {
        id: 'n8n-intake',
        body: 'Built an e-invoice intake in n8n (XRechnung, ZUGFeRD: German e-invoice formats) that reads and checks supplier invoices, flags duplicates and changed bank details, archives originals and routes exceptions to a person.',
      },
      {
        id: 'n8n-delivery',
        body: 'Added Gmail mail intake and a shared error-alert system, with a one-command installer, an acceptance test and a Docker setup (PostgreSQL, HTTPS) whose backup was restored after a full data wipe.',
      },
      {
        id: 'n8n-tests',
        body: (
          <>
            <Fact id="profile.n8n.automated_tests" /> automated tests (part of the suite runs in GitHub Actions on
            every push); verified on a clean n8n install.
          </>
        ),
      },
    ],
    technologies: 'n8n, JavaScript (Node.js), REST APIs & webhooks, Gmail API (OAuth2), Docker, PostgreSQL, GitHub Actions.',
  },
];
