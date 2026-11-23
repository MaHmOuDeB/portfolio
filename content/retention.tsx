// The Retention case study's sourced prose: the glance card and the plain opening, the data, the
// method and its steps, each finding's lead-in and takeaway, the win-back sizing, how I checked it,
// its limits, its sources and the close. Every number is a <Fact> from the vendored exports or a
// <Derived> that names its source; the rest is plain words. The method was checked against the source
// code at the pinned commits (sql/01_clean.sql for the reversal rule, sql/02_features.sql and
// src/analysis.py for the snapshots, the models and the sizing), not against the repositories'
// README files.
//
// The words are a `RetentionCopy`: RETENTION_EN here, the German twin in content/de/retention.tsx typed
// by the same type, so a missing key fails the typecheck. A sentence with numbers is a function of
// `Slots`, which holds the numbers as elements (a <Fact> or a <Derived> in the page's language), so the
// German sentence can put them where its grammar wants them. `blocks` turns a copy into the page's
// parts: the structure (the paragraphs, the lists, the links) is drawn once, from the copy's words.
// Server only: a client island gets its words as props (src/lib/retention/text.ts).
import type { ReactNode } from 'react';
import { GLANCE_LABELS_EN, type GlanceLabels, type GlanceParts } from '@/components/depth/GlanceBlock';
import { Derived, derivedAttr, type DerivedRef } from '@/components/kit/Derived';
import { Fact } from '@/components/kit/Fact';
import { TextLink } from '@/components/kit/TextLink';
import { KIT_TEXT_EN, type KitText } from '@/components/kit/text';
import { getFact, type FactId } from '@/lib/facts';
import type { Unit } from '@/lib/facts/types';
import { localHref } from '@/lib/i18n/href';
import type { Locale } from '@/lib/i18n/locale';
import { RETAIL, RETENTION, numericFact, sourceRepo } from '@/lib/retention/data';
// Constants of the source code: the Champions scores, the label window and the interval level.
import { CHAMPIONS_MIN_SCORE, INTERVAL_LEVEL, TOP_SCORE, WINDOW_DAYS } from '@/lib/retention/rfm';
import { EN_TABLES, type SourcedTablesText } from '@/lib/retention/tables';
import { EN_COHORTS, EN_RETURNS, type CohortText, type ReturnsText } from '@/lib/retention/text';
import type { FRAME_DE } from './de/frame';

// Constants of the source code, printed through <Derived> because no export holds them as a value.
/** sql/01_clean.sql in both repositories: an order reversed by a cancellation up to a day later. */
const RULE_HOURS = 24;
/** src/analysis.py holdout_sample_sizes: a two-sided test at this significance level and power. */
const ALPHA = 0.05;
const POWER = 0.8;

const RULE_REFS = ['source:retail', 'source:retention'] as const;
const RETENTION_REF = ['source:retention'] as const;

/** The anchor ids of the page's visible sections, in page order. */
export const RETENTION_SECTION_IDS = [
  'returns-cleaning',
  'cohort-retention',
  'repeat-order-model',
  'win-back-sizing',
  'how-i-checked-this',
  'limits',
  'sources',
] as const;
export type RetentionSectionId = (typeof RETENTION_SECTION_IDS)[number];

/**
 * What a sentence is given to put numbers and links where its grammar wants them: every value is an
 * element in the page's language, with its source refs.
 */
export type Slots = {
  locale: Locale;
  /** A number from the facts data, as a <Fact>. */
  fact: (id: FactId, decimals?: number) => ReactNode;
  /** A computed number or a date, as a <Derived> with its refs. */
  num: (value: number | string, unit: Unit, refs: readonly DerivedRef[], decimals?: number) => ReactNode;
  /** The reversal window of the cleaning rule, in hours. */
  hours: ReactNode;
  /** The label window after a cutoff, in days. */
  days: ReactNode;
  /** The rate the win-back test is sized to detect: the baseline plus the rise, in whole points. */
  target: ReactNode;
  /** An address of this site in the page's language. */
  href: (path: string) => string;
  /** Constants and export values the sentences print through `num`. */
  d: {
    /** The date of the reversed order behind most of the January to November change. */
    januaryDate: string;
    championsMin: number;
    topScore: number;
    intervalLevel: number;
    alpha: number;
    power: number;
    perGroup: number;
    /** The targeting table's first row: the top share of lapsed customers by score. */
    firstTarget: (typeof RETENTION.tables.lapsed_targeting)[number];
    /** The holdout size for the top-scored lapsed customers at the sized rise. */
    topSized: (typeof RETENTION.tables.holdout_sizes)[number];
    /** The share of lapsed customers the top-scored group is. */
    topShare: number;
    /** The calibration table's lowest-scored tenth. */
    lowest: (typeof RETENTION.tables.calibration)[number];
  };
};

/** The reversed order behind most of the January to November change, found by its fact value. */
function januaryReversalDate(): string {
  const value = getFact('retail.reversal.january_gbp').value;
  const row = RETAIL.tables.largest_reversals.find((r) => r.value_gbp === value);
  if (!row) throw new Error('retail: the January reversal is not in largest_reversals');
  return row.date;
}

/** The holdout-size row for the top-scored lapsed customers at the same uplift. */
function topScoredSizing() {
  const uplift = numericFact('retention.winback.uplift_pp');
  const row = RETENTION.tables.holdout_sizes.find((h) => h.group === 'top 20% of lapsed by score' && h.uplift_pp === uplift);
  if (!row) throw new Error('retention: no holdout size for the top-scored lapsed customers at the sized uplift');
  return row;
}

/** The targeting row for the top-scored lapsed customers, found by its fact. */
function topScoredTargeting() {
  const customers = numericFact('retention.winback.top20_customers');
  const row = RETENTION.tables.lapsed_targeting.find((r) => r.contacted === customers);
  if (!row) throw new Error('retention: the top-scored lapsed customers are not in the targeting table');
  return row;
}

/** The slots of a page in `locale`: every Fact and Derived carries the language. */
export function slotsFor(locale: Locale): Slots {
  const num: Slots['num'] = (value, unit, refs, decimals) => (
    <Derived value={value} unit={unit} refs={refs} decimals={decimals} locale={locale} />
  );
  const baseline = numericFact('retention.winback.baseline_rate');
  const upliftPoints = numericFact('retention.winback.uplift_pp');
  const lowest = RETENTION.tables.calibration[0];
  if (!lowest || lowest.bin !== 0) throw new Error('retention: the calibration table does not start at the lowest-scored tenth');
  const first = RETENTION.tables.lapsed_targeting[0];
  if (!first) throw new Error('retention: the targeting table is empty');
  return {
    locale,
    fact: (id, decimals) => <Fact id={id} decimals={decimals} locale={locale} />,
    num,
    hours: num(RULE_HOURS, 'count', RULE_REFS),
    days: num(WINDOW_DAYS, 'count', RETENTION_REF),
    // In whole points, so the machine value is 0.34 and not 0.29 + 0.05 with float noise.
    target: num(Math.round(baseline * 100 + upliftPoints) / 100, 'share', ['retention.winback.baseline_rate', 'retention.winback.uplift_pp'], 0),
    href: (path) => localHref(locale, path),
    d: {
      januaryDate: januaryReversalDate(),
      championsMin: CHAMPIONS_MIN_SCORE,
      topScore: TOP_SCORE,
      intervalLevel: INTERVAL_LEVEL,
      alpha: ALPHA,
      power: POWER,
      perGroup: numericFact('retention.winback.n_per_arm'),
      firstTarget: first,
      topSized: topScoredSizing(),
      topShare: topScoredTargeting().contact_share,
      lowest,
    },
  };
}

type Words = (p: Slots) => ReactNode;

/** The words of the model Figure. */
export type ModelsCopy = {
  title: string;
  ariaLabel: string;
  axis: { x: string; y: string };
  result: Words;
  caption: Words;
};

/** The words of the segments Figure; the segment names are the export's own and stay as printed. */
export type RfmCopy = {
  title: string;
  ariaLabel: string;
  axis: { x: string; y: string };
  /** The series words in a bar's label ("Customers 23%"). */
  series: { customers: string; spend: string };
  result: Words;
  caption: Words;
};

export type RetentionCopy = {
  /** The title of the h1 and its quiet second clause. */
  title: string;
  quiet: string;
  chip: string;
  github: string;
  sections: Record<RetentionSectionId, { title: string; link: string }>;
  /** The summaries of the details rows. */
  summaries: {
    reversal: string;
    cohorts: string;
    model: string;
    sizing: string;
    data: string;
    method: string;
    segments: string;
    sql: string;
    checked: string;
  };
  glance: (p: Slots) => GlanceParts;
  glanceLabels: GlanceLabels;
  /** The inside of the plain opening's paragraph. */
  intro: Words;
  /** The inside of the data paragraph. */
  data: Words;
  methodSteps: { lead: string; steps: readonly Words[]; after: string };
  /** The paragraphs of the reversal rule. */
  cleaning: readonly Words[];
  cohorts: Words;
  segments: Words;
  model: Words;
  winBack: Words;
  winBackReach: Words;
  targeting: Words;
  labLink: string;
  titles: { targeting: string; holdout: string };
  sql: { intro: string; ariaLabel: string; after: string; link: (commit: ReactNode) => ReactNode };
  checks: readonly (readonly [key: string, body: Words])[];
  /** Each finding's lead-in (what to look at) and takeaway (what it means). */
  exhibits: Record<'returns' | 'cohorts' | 'model' | 'winBack', { leadIn: Words; takeaway: Words }>;
  close: Words;
  closeLink: string;
  limits: readonly (readonly [key: string, body: Words])[];
  sources: {
    retention: (commit: ReactNode) => ReactNode;
    retentionSql: string;
    retentionExport: string;
    retail: (commit: ReactNode) => ReactNode;
    retailSql: string;
    retailExport: string;
    data: (name: string) => ReactNode;
    licence: (licence: ReactNode) => ReactNode;
  };
  /** The previous and next case studies; a kicker is set only where the frame's English default does not fit. */
  neighbours: { prev: { label: string; kicker?: string }; next: { label: string; kicker?: string } };
  /** The frame parts' labels; empty in English, where each part's own default is the English one. */
  frame: Partial<typeof FRAME_DE>;
  kit: KitText;
  returns: ReturnsText;
  cohortsFigure: CohortText;
  tables: SourcedTablesText;
  models: ModelsCopy;
  rfm: RfmCopy;
};

const ITEM = 'mt-4 first:mt-0';

/**
 * The reversal rule, quoted exactly from sql/01_clean.sql at the pinned commit (lines 34 to 39, the
 * same lines in both repositories). The repositories are not vendored: this text was read from the
 * file at the lock's commit, and the link points at those lines at that commit.
 */
export const REVERSAL_SQL = [
  'CREATE OR REPLACE TABLE reversed_pairs AS',
  'SELECT DISTINCT s.invoice AS order_invoice, s.stock_code, r.invoice AS cancel_invoice',
  'FROM returns_all r',
  'JOIN sales_all s',
  '  ON s.customer_id = r.customer_id AND s.stock_code = r.stock_code AND s.quantity = r.quantity',
  ' AND s.invoice_ts <= r.invoice_ts AND s.invoice_ts >= r.invoice_ts - INTERVAL 1 DAY;',
].join('\n');
const REVERSAL_SQL_LINES = '#L34-L39';
/**
 * The commits REVERSAL_SQL was read at: the lock commits of the two repositories when it was
 * quoted. A test holds the lock to these, so a lock bump cannot leave old SQL quoted "at the linked
 * commits": re-read sql/01_clean.sql lines 34 to 39 at the new commit, then change both.
 */
export const REVERSAL_SQL_READ_AT = {
  retention: '20cfb1376af28e19f6988283be39b45ded5afe22',
  retail: '73dc12a52d81e8459b99335a01db00c72d799f59',
} as const;

const LICENCE_URLS: Readonly<Record<string, string>> = {
  'CC BY 4.0': 'https://creativecommons.org/licenses/by/4.0/',
};

/** A pinned commit, shortened; its digits are marked as coming from the source. */
function Commit({ id }: { id: 'retention' | 'retail' }) {
  return <code {...derivedAttr([`source:${id}`])}>{sourceRepo(id).commit.slice(0, 7)}</code>;
}

const list = (items: readonly (readonly [string, ReactNode])[]) => (
  <ul className="list-disc pl-6">
    {items.map(([key, body]) => (
      <li key={key} className="mt-2 first:mt-0">
        {body}
      </li>
    ))}
  </ul>
);

/**
 * The page's parts from a copy: the data, the method, the reversal rule, the checks, the limits, the
 * sources and the closing sentence, each with the structure it always had.
 */
export function blocks(c: RetentionCopy, p: Slots) {
  const para = (body: ReactNode, key?: number) => (
    <p key={key} className={ITEM}>
      {body}
    </p>
  );
  const data = () => para(c.data(p));
  const cleaning = () => <>{c.cleaning.map((words, i) => para(words(p), i))}</>;
  const cohorts = () => para(c.cohorts(p));
  const segments = () => para(c.segments(p));
  const model = () => para(c.model(p));
  const winBack = () => para(c.winBack(p));
  return {
    intro: () => <p data-plain-opening="">{c.intro(p)}</p>,
    data,
    cleaning,
    cohorts,
    segments,
    model,
    winBack,
    winBackReach: () => para(c.winBackReach(p)),
    targeting: () => para(c.targeting(p)),
    methodSteps: () => (
      <>
        <p className={ITEM}>{c.methodSteps.lead}</p>
        <ol className="mt-4 list-decimal pl-6">
          {c.methodSteps.steps.map((words, i) => (
            <li key={i} className={i === 0 ? 'mt-2 first:mt-0' : 'mt-2'}>
              {words(p)}
            </li>
          ))}
        </ol>
        <p className={ITEM}>{c.methodSteps.after}</p>
      </>
    ),
    /** Data, cleaning, cohorts, segments, model and sizing, as the source code does them, in one block. */
    method: () => (
      <>
        {data()}
        {cleaning()}
        {cohorts()}
        {segments()}
        {model()}
        {winBack()}
      </>
    ),
    labLink: () => (
      <TextLink href={p.href('/lab#sample-size')} standalone>
        {c.labLink}
      </TextLink>
    ),
    /**
     * The SQL excerpt of the reversal rule, with what it does and a link to the whole file. The prose
     * keeps to the readable column; the code runs to the figure width, so its lines fit on a desktop
     * and scroll inside their own region on a phone.
     */
    sqlExcerpt: () => {
      const retention = sourceRepo('retention');
      return (
        <>
          <p className="max-w-text">{c.sql.intro}</p>
          <pre
            tabIndex={0}
            role="region"
            aria-label={c.sql.ariaLabel}
            className="mt-4 max-w-figure overflow-x-auto border-l border-line py-2 pl-4 text-sm"
          >
            <code {...derivedAttr(RULE_REFS)}>{REVERSAL_SQL}</code>
          </pre>
          <p className="mt-4 max-w-text">{c.sql.after}</p>
          <div className="mt-2 max-w-text">
            <TextLink href={`${retention.file('sql/01_clean.sql')}${REVERSAL_SQL_LINES}`} standalone external>
              <span>{c.sql.link(<Commit id="retention" />)}</span>
            </TextLink>
          </div>
        </>
      );
    },
    checks: () => list(c.checks.map(([key, body]) => [key, body(p)] as const)),
    limits: () => list(c.limits.map(([key, body]) => [key, body(p)] as const)),
    /** The repositories at their pinned commits, the dataset and its licence: one link per line. */
    sources: () => {
      const retention = sourceRepo('retention');
      const retail = sourceRepo('retail');
      const { name, url, licence } = RETENTION._meta.dataset;
      const licenceUrl = LICENCE_URLS[licence];
      if (!licenceUrl) throw new Error(`retention: no link for the licence ${licence}`);
      const s = c.sources;
      const links: readonly (readonly [href: string, body: ReactNode])[] = [
        [retention.tree, s.retention(<Commit id="retention" />)],
        [retention.file('sql/01_clean.sql'), s.retentionSql],
        [retention.file(), s.retentionExport],
        [retail.tree, s.retail(<Commit id="retail" />)],
        [retail.file('sql/01_clean.sql'), s.retailSql],
        [retail.file(), s.retailExport],
        [url, s.data(name)],
        [licenceUrl, s.licence(<span {...derivedAttr(['source:retention', 'source:retail'])}>{licence}</span>)],
      ];
      return (
        <ul>
          {links.map(([href, body]) => (
            <li key={href}>
              <TextLink href={href} standalone external>
                <span>{body}</span>
              </TextLink>
            </li>
          ))}
        </ul>
      );
    },
    close: () => <p className="max-w-text">{c.close(p)}</p>,
  };
}

export const RETENTION_EN: RetentionCopy = {
  title: 'Who orders again,',
  quiet: 'and how to test a win-back offer.',
  chip: 'Case study',
  github: 'See the code on GitHub',
  sections: {
    'returns-cleaning': { title: 'A double count made returns look like they grew', link: 'Returns' },
    'cohort-retention': { title: 'Who orders again, month by month', link: 'Cohorts' },
    'repeat-order-model': { title: 'A model of who orders again', link: 'Model' },
    'win-back-sizing': { title: 'Sizing a win-back test', link: 'Win-back sizing' },
    'how-i-checked-this': { title: 'How I did it and checked it', link: 'How I checked this' },
    limits: { title: 'Limits', link: 'Limits' },
    sources: { title: 'Sources and links', link: 'Sources' },
  },
  summaries: {
    reversal: 'How the reversal rule works',
    cohorts: 'How the cohorts are built',
    model: 'How the model is trained and scored',
    sizing: 'How the test is sized',
    data: 'The data',
    method: 'Method',
    segments: 'Customer segments',
    sql: 'The reversal rule in SQL',
    checked: 'How I checked this',
  },

  glanceLabels: GLANCE_LABELS_EN,
  /** The twenty-second card: three pull figures, one sentence, then the facts and the scope. */
  glance: (p) => ({
    points: [
      {
        id: 'returns-raw',
        figure: p.fact('retail.returns.yoy_growth_raw'),
        label: 'growth in returns, as a double count first showed it',
      },
      {
        id: 'returns-clean',
        figure: (
          <>
            <span data-proof-unit="">about </span>
            {p.fact('retail.returns.yoy_growth_clean')}
          </>
        ),
        label: 'the real growth, with the double count removed',
      },
      {
        id: 'per-group',
        figure: p.fact('retention.winback.n_per_arm'),
        label: 'customers per group for a fair test of a win-back offer',
      },
    ],
    outcome: (
      <>
        A model predicts who orders again only slightly better than putting the most recent buyers first, so the next step
        is a test with a holdout group, not a campaign to the top scorers.
      </>
    ),
    role: 'Personal projects rebuilt from MSc projects.',
    methods: 'Cohorts, customer segments, a model scored on a later period, sample-size calculation.',
    tools: 'SQL (DuckDB), scikit-learn, pytest, GitHub Actions; Chart.js for the KPI dashboard.',
    when: 'Rebuilt in 2026, data from 2009 to 2011.',
    scope: (
      <>
        Public dataset, rebuilt in 2026 from my Master&apos;s projects. A prediction and a sample size: nobody was contacted
        and no test was run.
      </>
    ),
  }),

  intro: () => (
    <>
      A shop wants to win back customers who stopped ordering. Before it spends on offers it needs to know two things: are
      its numbers right, and who would have come back anyway? I worked through both on two years of public order data
      from a UK gift retailer, rebuilt in 2026 from my Master&apos;s projects.
    </>
  ),

  data: (p) => (
    <>
      The data is UCI Online Retail II, orders from a UK online gift retailer from{' '}
      {p.fact('retention.data.first_date')} to {p.fact('retention.data.last_date')}:{' '}
      {p.fact('retention.data.raw_rows')} invoice lines. Cleaning keeps cancellations apart as returns and drops
      lines without a customer, lines that are not products (such as postage) and lines with no positive quantity or
      price. After cleaning and the reversal rule below,{' '}
      {p.fact('retention.data.clean_rows')} sales lines remain, in {p.fact('retention.data.orders')} orders from{' '}
      {p.fact('retention.data.customers')} customers.
    </>
  ),

  methodSteps: {
    lead: 'I worked in five steps; most have their own period and their own group of customers:',
    steps: [
      (p) => <>Clean the invoice lines with SQL in DuckDB, and remove orders cancelled within {p.hours} hours.</>,
      () => (
        <>
          Group customers by the month of their first order and count, for each later month, the share who ordered in
          it.
        </>
      ),
      () => <>Score every customer on recency, frequency and spend at a cutoff, and name segments from the scores.</>,
      () => <>Train scikit-learn models on an earlier cutoff and score them on a later one, against a simple rule.</>,
      () => <>Size a holdout test of a win-back offer for lapsed customers.</>,
    ],
    after:
      'Each chart below has its numbers in a table under it and a badge that says where its data comes from. The interactive ones keep their setting in the page address, so a link opens the same view.',
  },

  cleaning: [
    (p) => (
      <>
        Removing orders cancelled within {p.hours} hours changes the returns story: returned-order value grew about{' '}
        {p.fact('retail.returns.yoy_growth_clean')} in January to November 2011, not{' '}
        {p.fact('retail.returns.yoy_growth_raw')}.
      </>
    ),
    (p) => (
      <>
        A cancellation that matches an order line from the same customer, for the same product and quantity, placed up
        to {p.hours} hours before it, marks an order that never happened, so I remove both lines. That rule takes out
        orders cancelled within {p.hours} hours, about {p.fact('retention.data.reversed_revenue_gbp')} of revenue.
        Without it, the same order counts once as a sale and again as a return.
      </>
    ),
    (p) => (
      <>
        Returns growth compares January to November 2011 with the same months of 2010, because the data stops on{' '}
        {p.fact('retention.data.last_date')}. The change between the two growth figures comes mostly from one{' '}
        {p.fact('retail.reversal.january_gbp')} order, placed on{' '}
        {p.num(p.d.januaryDate, 'date', ['source:retail'])} and cancelled within{' '}
        {p.hours} hours. Growth is not the same as returns as a share of sales: with the rule, returns were{' '}
        {p.fact('retail.returns.rate_2010_clean')} of sales in January to November 2010 and{' '}
        {p.fact('retail.returns.rate_2011_clean')} in 2011; without it, {p.fact('retail.returns.rate_2010_raw')} and{' '}
        {p.fact('retail.returns.rate_2011_raw')}.
      </>
    ),
  ],

  cohorts: (p) => (
    <>
      Customers are grouped by the month of their first order in the data. I use the January to November 2010 cohorts: December
      2009 is the first month of the data, so it holds customers who were already buying, and December 2010 would end
      in the incomplete December 2011. A later month counts the cohort members who ordered in that month, so a share
      can rise again. Weighted by cohort size, about {p.fact('retention.cohort.month1_rate')} order again in the
      month after their first order and about {p.fact('retention.cohort.month12_rate')} in the twelfth month after it.
    </>
  ),

  segments: (p) => (
    <>
      At the September 2011 cutoff I score each customer on recency, frequency and spend by rank. Champions score{' '}
      {p.num(p.d.championsMin, 'count', RETENTION_REF)} or{' '}
      {p.num(p.d.topScore, 'count', RETENTION_REF)} out of{' '}
      {p.num(p.d.topScore, 'count', RETENTION_REF)} on each of recency, frequency and spend
      (roughly the top two-fifths on each). They are {p.fact('retention.rfm.champions_customer_share')} of customers
      and hold {p.fact('retention.rfm.champions_revenue_share')} of spend up to the cutoff.
    </>
  ),

  model: (p) => (
    <>
      For the model, each customer&apos;s features use only orders up to a cutoff, and the label is whether they
      ordered again within the {p.days} days after it. Logistic regression and gradient boosting learn on an earlier
      cutoff, whose window closes before the later one, and are scored on the September 2011 cutoff against a rule
      that puts the most recent buyers first. In that window, {p.fact('retention.model.test_base_rate')} of
      customers ordered again.
    </>
  ),

  winBack: (p) => (
    <>
      Lapsed customers are those with no order in the {p.days} days before the September 2011 cutoff:{' '}
      {p.fact('retention.winback.lapsed_customers')} of them, and {p.fact('retention.winback.baseline_rate')} of
      them ordered again within {p.days} days. I sized a possible holdout test. With a standard two-group sample-size calculation (
      <>
        two-sided, a {p.num(p.d.alpha, 'share', RETENTION_REF)} significance level and{' '}
        {p.num(p.d.power, 'share', RETENTION_REF)} power
      </>
      ), detecting a rise from{' '}
      {p.fact('retention.winback.baseline_rate')} to {p.target}, an uplift of{' '}
      {p.fact('retention.winback.uplift_pp')} percentage points, needs {p.fact('retention.winback.n_per_arm')}{' '}
      lapsed customers in each group.
    </>
  ),

  winBackReach: (p) => (
    <>
      Two groups of that size are {p.num(2 * p.d.perGroup, 'count', ['retention.winback.n_per_arm'])}{' '}
      customers, and {p.fact('retention.winback.lapsed_customers')} customers were lapsed at the cutoff, so one period
      has enough of them. That is arithmetic about how many customers there are, not evidence that an offer would work.
      A test on only the top {p.num(p.d.topShare, 'share', RETENTION_REF)} of lapsed customers by
      score would not fit: at their rate of ordering again,{' '}
      {p.num(p.d.topSized.baseline_rate, 'share', RETENTION_REF)}, the same rise needs{' '}
      {p.num(p.d.topSized.customers_per_arm, 'count', RETENTION_REF)} customers per group,{' '}
      {p.num(2 * p.d.topSized.customers_per_arm, 'count', RETENTION_REF)} in all, and that group
      has {p.fact('retention.winback.top20_customers')}.
    </>
  ),

  targeting: (p) => (
    <>
      The ranking does pick people who order again: of the top{' '}
      {p.num(p.d.firstTarget.contact_share, 'share', RETENTION_REF)} of lapsed customers by score,{' '}
      {p.num(p.d.firstTarget.contacted, 'count', RETENTION_REF)} customers,{' '}
      {p.num(p.d.firstTarget.returners_model, 'count', RETENTION_REF)} ordered again within {p.days} days, against
      about {p.num(p.d.firstTarget.returners_random, 'count', RETENTION_REF)} expected from a random selection of the
      same size. These are later orders from customers nobody contacted. They show that the score ranks well, not that
      an offer would add anything; that is the question the holdout test is for.
    </>
  ),

  labLink: "Try other baselines and rises in the Lab's sample-size planner",
  titles: {
    targeting: 'Lapsed customers ranked by score: who ordered again, against a random selection',
    holdout: 'Customers needed in each group of a holdout test',
  },

  sql: {
    intro: 'The reversal rule as the cleaning SQL writes it, the same in both repositories at the linked commits:',
    ariaLabel: 'The reversal rule in SQL',
    after:
      'A cancellation joins the order line it reverses: the same customer, product and quantity, placed at most a day before it. The sales and returns tables then leave out both lines.',
    link: (commit) => <>The whole cleaning SQL at commit {commit}</>,
  },

  checks: [
    [
      'repositories',
      () => (
        <>The SQL, the models and the exports live in public repositories with tests, lint and CI; the sources below link the exact commits this page reads.</>
      ),
    ],
    [
      'pinned',
      () => (
        <>Each export is pinned by commit and by a hash of its content, and this site&apos;s build stops if a vendored copy does not match it.</>
      ),
    ],
    [
      'schema',
      () => (
        <>The build also checks each vendored export against its schema, so a missing or renamed field stops the build instead of printing a wrong number.</>
      ),
    ],
    [
      'export-tests',
      () => (
        <>
          The analysis repository tests its export against its own results: the facts must equal the analysis results
          they come from, and the cohort table must reproduce the weighted month-one and month-twelve rates. A further
          test rebuilds the export from the downloaded dataset and expects the same bytes; it needs the dataset, so CI
          skips it.
        </>
      ),
    ],
    [
      'printed',
      () => (
        <>
          Every figure on this page is marked with where it comes from: one of those exports, the source code at the
          linked commits, or a calculation. An audit of the built page fails on any unmarked number other than a
          calendar year.
        </>
      ),
    ],
    [
      'period',
      () => <>The returns comparison uses the same months in both years, January to November, because December 2011 is incomplete.</>,
    ],
    [
      'out-of-time',
      () => <>The models are scored on a later cutoff than they learned from, so no order from the test window was used in training.</>,
    ],
    [
      'interval',
      (p) => (
        <>
          The gain in ROC AUC is {p.fact('retention.model.auc_gain')}, with a{' '}
          {p.num(p.d.intervalLevel, 'share', RETENTION_REF)} interval of{' '}
          {p.fact('retention.model.auc_gain_low')} to {p.fact('retention.model.auc_gain_high')} from a paired
          bootstrap over the test customers, so it covers test-sample variability only.
        </>
      ),
    ],
    [
      'sizing',
      (p) => (
        <>
          This site&apos;s own sample-size code, which is tested against reference values from scipy and statsmodels,
          gives the same {p.fact('retention.winback.n_per_arm')} per group as the analysis.
        </>
      ),
    ],
  ],

  exhibits: {
    returns: {
      leadIn: () => (
        <>
          Switch between counting cancelled orders as returns and removing them, and watch January 2011: the axis keeps room
          for the counted spike, so the empty space is what the double count added.
        </>
      ),
      takeaway: (p) => (
        <>
          One {p.fact('retail.reversal.january_gbp')} order, placed and cancelled within {p.hours} hours, produced most of the
          apparent growth, so a dashboard would have reported a returns problem that did not exist.
        </>
      ),
    },
    cohorts: {
      leadIn: () => (
        <>
          A cohort is customers grouped by the month of their first order; read each row across to see what share of them
          ordered again in each later month.
        </>
      ),
      takeaway: (p) => (
        <>
          About {p.fact('retention.cohort.month1_rate')} of new customers order again the next month, and about{' '}
          {p.fact('retention.cohort.month12_rate')} in the twelfth month after their first order.
        </>
      ),
    },
    model: {
      leadIn: () => (
        <>
          Compare the model with the simple rule that puts the most recent buyers first, and see how close their two scores
          are.
        </>
      ),
      takeaway: () => (
        <>
          The model finds people who were coming back anyway, so a campaign to its top scorers would look like a success and
          prove nothing.
        </>
      ),
    },
    winBack: {
      leadIn: () => (
        <>
          A holdout is customers who get no offer, so their behaviour shows what would have happened anyway; the table shows
          how many customers each group of such a test needs.
        </>
      ),
      takeaway: (p) => (
        <>
          The next step is a test with {p.fact('retention.winback.n_per_arm')} lapsed customers per group against a holdout,
          not a campaign to the top scorers.
        </>
      ),
    },
  },

  close: () => (
    <>
      I check that the numbers are right before I analyse them, and I treat a prediction as a reason to test, not as proof
      that an offer works.
    </>
  ),
  closeLink: 'Try other baselines in the Lab',

  limits: [
    [
      'observational',
      () => (
        <>
          This is historic, observational data from one UK gift retailer. It shows who ordered again, not how anyone would
          respond to a win-back offer.
        </>
      ),
    ],
    ['review', () => <>The inflated growth was not my catch: a review caught it and I fixed it.</>],
    [
      'uplift',
      () => (
        <>
          A higher score means a customer is more likely to order again, not more likely to be persuaded: rank is not
          uplift. Only a holdout test could show what an offer changes.
        </>
      ),
    ],
    [
      'interval',
      () => (
        <>
          The interval on the AUC gain covers test-sample variability only. It does not cover retraining the model,
          another period or a change in the mix of customers.
        </>
      ),
    ],
    [
      'calibration',
      (p) => (
        <>
          The scores rank customers but are not calibrated probabilities: in the tenth of customers with the lowest
          scores, the gradient-boosting model predicted{' '}
          {p.num(p.d.lowest.predicted, 'share', RETENTION_REF, 1)} on average and{' '}
          {p.num(p.d.lowest.observed, 'share', RETENTION_REF, 1)} ordered again.
        </>
      ),
    ],
    [
      'construction',
      () => (
        <>
          Champions&apos; share of spend is high partly by construction: spend is one of the three scores that define
          them.
        </>
      ),
    ],
    [
      'first-order',
      () => (
        <>
          The data starts in December 2009, so a first order in the data is not always a customer&apos;s first order,
          and lines without a customer number are left out of every customer figure.
        </>
      ),
    ],
  ],

  sources: {
    retention: (commit) => <>Customer retention analysis, at commit {commit}</>,
    retentionSql: 'Cleaning SQL of the retention analysis',
    retentionExport: 'Export of the retention analysis that this page reads',
    retail: (commit) => <>Retail KPI dashboard, at commit {commit}</>,
    retailSql: 'Cleaning SQL of the retail dashboard',
    retailExport: 'Returns export of the retail dashboard',
    data: (name) => <>The data: {name}</>,
    licence: (licence) => <>Its licence, {licence}</>,
  },

  neighbours: { prev: { label: 'Audible' }, next: { label: 'Pulse' } },
  frame: {},
  kit: KIT_TEXT_EN,
  returns: EN_RETURNS,
  cohortsFigure: EN_COHORTS,
  tables: EN_TABLES,

  models: {
    title: 'The model ranks repeat buyers only slightly better than recency',
    ariaLabel:
      'ROC AUC of the most-recent-buyer-first rule and of gradient boosting on the later test period, on a scale from chance to a perfect ranking: gradient boosting is only slightly higher',
    axis: { x: 'ROC AUC on the later test period', y: 'Ranking method' },
    result: (p) => (
      <>
        Gradient boosting ranks with a ROC AUC of {p.fact('retention.model.gb_auc')}, against{' '}
        {p.fact('retention.model.rule_auc')} for putting the most recent buyers first: a gain of{' '}
        {p.fact('retention.model.auc_gain')}, with a {p.num(p.d.intervalLevel, 'share', RETENTION_REF)} interval
        of {p.fact('retention.model.auc_gain_low')} to {p.fact('retention.model.auc_gain_high')} that covers
        test-sample variability only.
      </>
    ),
    caption: (p) => (
      <>
        How well each method ranks the customers of a public dataset by whether they ordered again within the{' '}
        {p.days} days after the September 2011 cutoff. The model learned
        on an earlier cutoff and both were scored on this later one. A ROC AUC is the chance that a customer who
        ordered again is ranked above one who did not: one half is no better than chance, one is a perfect ranking.
        This is ranking accuracy, not a response to any offer: a high score is a prediction, not an effect of
        contact. The table adds logistic regression and the scores for lapsed customers
        only.
      </>
    ),
  },

  rfm: {
    title: 'Champions account for more spend than their customer share',
    ariaLabel:
      'Share of customers and share of spend for each segment, on one scale from none to all: Champions hold a much larger share of spend than of customers, and Dormant customers the reverse',
    axis: { x: 'Share of all customers, or of all spend', y: 'Segment' },
    series: { customers: 'Customers', spend: 'Spend' },
    result: (p) => (
      <>
        Champions are {p.fact('retention.rfm.champions_customer_share')} of customers and hold{' '}
        {p.fact('retention.rfm.champions_revenue_share')} of spend up to the cutoff, partly by construction: spend
        is one of the three scores that define them.
      </>
    ),
    caption: (p) => (
      <>
        Customers of a UK online gift retailer, from a public dataset, in segments at the September 2011 cutoff. Each
        customer is scored by rank on recency, frequency and spend. Champions score {p.num(p.d.championsMin, 'count', RETENTION_REF)}{' '}
        or {p.num(p.d.topScore, 'count', RETENTION_REF)} out of {p.num(p.d.topScore, 'count', RETENTION_REF)} on each of recency, frequency and spend
        (roughly the top two-fifths on each), so they are not simply the customers who spent the most. Outlined bars
        are shares of customers and filled bars shares of spend, on the same scale.
      </>
    ),
  },
};
