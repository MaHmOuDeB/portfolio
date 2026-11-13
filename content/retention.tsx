// The Retention case study's sourced prose: the summary, the problem, the data, the method and its
// steps, the win-back sizing, the findings, how I checked it, its limits and its sources. Each
// export is a server section without its own heading, so the page decides the outline and the
// anchors (src/components/retention/RetentionPage.tsx). Every number is a <Fact> from the vendored
// exports or a <Derived> that names its source; the rest is plain words. The method was checked against the source code
// at the pinned commits (sql/01_clean.sql for the reversal rule, sql/02_features.sql and
// src/analysis.py for the snapshots, the models and the sizing), not against the repositories'
// README files.
import type { ReactNode } from 'react';
import { Derived, derivedAttr } from '@/components/kit/Derived';
import { Fact } from '@/components/kit/Fact';
import { Stat } from '@/components/kit/Stat';
import { TextLink } from '@/components/kit/TextLink';
import { getFact } from '@/lib/facts';
import { RETAIL, RETENTION, numericFact, sourceRepo } from '@/lib/retention/data';
// Constants of the source code: the Champions scores, the label window and the interval level.
import { CHAMPIONS_MIN_SCORE, INTERVAL_LEVEL, TOP_SCORE, WINDOW_DAYS } from '@/lib/retention/rfm';

// Constants of the source code, printed through <Derived> because no export holds them as a value.
/** sql/01_clean.sql in both repositories: an order reversed by a cancellation up to a day later. */
const RULE_HOURS = 24;
/** src/analysis.py holdout_sample_sizes: a two-sided test at this significance level and power. */
const ALPHA = 0.05;
const POWER = 0.8;

const RULE_REFS = ['source:retail', 'source:retention'] as const;

const Hours = () => <Derived value={RULE_HOURS} unit="count" refs={RULE_REFS} />;
const Days = () => <Derived value={WINDOW_DAYS} unit="count" refs={['source:retention']} />;

/** The settings every holdout size on this page assumes. */
const TestSettings = () => (
  <>
    two-sided, a <Derived value={ALPHA} unit="share" refs={['source:retention']} /> significance level and{' '}
    <Derived value={POWER} unit="share" refs={['source:retention']} /> power
  </>
);

/** The reversed order behind most of the January to November change, found by its fact value. */
function januaryReversalDate(): string {
  const value = getFact('retail.reversal.january_gbp').value;
  const row = RETAIL.tables.largest_reversals.find((r) => r.value_gbp === value);
  if (!row) throw new Error('retail: the January reversal is not in largest_reversals');
  return row.date;
}

/** 34%: the baseline rate plus the uplift the test is sized to detect. */
function TargetRate() {
  const baseline = numericFact('retention.winback.baseline_rate');
  const upliftPoints = numericFact('retention.winback.uplift_pp');
  return (
    <Derived
      // In whole points, so the machine value is 0.34 and not 0.29 + 0.05 with float noise.
      value={Math.round(baseline * 100 + upliftPoints) / 100}
      unit="share"
      decimals={0}
      refs={['retention.winback.baseline_rate', 'retention.winback.uplift_pp']}
    />
  );
}

const ITEM = 'mt-4 first:mt-0';

/** The TL;DR box: question, my role, method, result, what I would recommend, next step. */
export function RetentionSummary(): ReactNode {
  const items: readonly [label: string, body: ReactNode][] = [
    [
      'Question',
      <>Which customers of a UK online gift retailer order again, and how large would a fair test of a win-back offer need to be?</>,
    ],
    [
      'My role',
      <>
        Two personal projects on the same public dataset, rebuilt in 2026 from my Master&apos;s projects. I cleaned
        the orders, analysed the returns, the cohorts and the segments, built and evaluated the model, and sized a
        holdout test.
      </>,
    ],
    [
      'Method',
      <>
        SQL in DuckDB for the cleaning, the cohorts and the customer snapshots; scikit-learn models that learn on one
        snapshot and are scored on a later one; a sample-size calculation for a holdout test.
      </>,
    ],
    [
      'Result',
      <>
        Counting orders cancelled within <Hours /> hours as returns made returned-order value look like it grew{' '}
        <Fact id="retail.returns.yoy_growth_raw" /> in January to November 2011 against the same months of 2010. With
        those orders removed, it grew about <Fact id="retail.returns.yoy_growth_clean" />. Across the January to
        November 2010 cohorts, weighted by size, about <Fact id="retention.cohort.month1_rate" /> order again in the
        month after their first order. A
        model ranks who orders again only slightly better than putting the most recent buyers first: ROC AUC{' '}
        <Fact id="retention.model.gb_auc" /> against <Fact id="retention.model.rule_auc" />.
      </>,
    ],
    [
      'What I would recommend',
      <>
        Do not judge a win-back offer by how often the highest-scored lapsed customers order again: the model picks
        people who were likely to come back anyway. Test the offer against a holdout group first.
      </>,
    ],
    [
      'Next step',
      <>
        A holdout test, which I sized at <Fact id="retention.winback.n_per_arm" /> lapsed customers per group to
        detect a rise from <Fact id="retention.winback.baseline_rate" /> to <TargetRate /> in those who order again
        within <Days /> days (<TestSettings />). Nobody was contacted and no test was run.
      </>,
    ],
  ];
  return (
    <dl>
      {items.map(([label, body]) => (
        <div key={label} className={ITEM}>
          <dt className="font-semibold">{label}</dt>
          <dd className="mt-1">{body}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The line under the page title. */
export function RetentionIntro(): ReactNode {
  return (
    <p>
      Two years of orders from a UK online gift retailer (public dataset, rebuilt in 2026): cleaning the returns,
      cohorts, customer segments, a model of who orders again and a win-back sample size.
    </p>
  );
}

/** The question behind the analysis, and why the numbers had to be cleaned first. */
export function RetentionProblem(): ReactNode {
  return (
    <>
      <p className={ITEM}>
        Which of a shop&apos;s lapsed customers will order again, and would a win-back offer change that? The order
        history can answer the first question. Only a test with a holdout group, customers who get no offer, can
        answer the second.
      </p>
      <p className={ITEM}>
        Before either, the numbers have to be right. In this data, an order cancelled within <Hours /> hours counted
        once as a sale and again as a return, and that made returned-order value look like it grew{' '}
        <Fact id="retail.returns.yoy_growth_raw" /> in January to November 2011 against the same months of 2010,
        instead of about <Fact id="retail.returns.yoy_growth_clean" />.
      </p>
    </>
  );
}

/** The dataset, its period and what cleaning keeps. */
export function RetentionData(): ReactNode {
  return (
    <p className={ITEM}>
      The data is UCI Online Retail II, orders from a UK online gift retailer from{' '}
      <Fact id="retention.data.first_date" /> to <Fact id="retention.data.last_date" />:{' '}
      <Fact id="retention.data.raw_rows" /> invoice lines. Cleaning keeps cancellations apart as returns and drops
      lines without a customer, lines that are not products (such as postage) and lines with no positive quantity or
      price. After cleaning and the reversal rule below,{' '}
      <Fact id="retention.data.clean_rows" /> sales lines remain, in <Fact id="retention.data.orders" /> orders from{' '}
      <Fact id="retention.data.customers" /> customers.
    </p>
  );
}

/** The steps of the analysis in order, and how the page shows each one. */
export function RetentionMethodSteps(): ReactNode {
  return (
    <>
      <p className={ITEM}>I worked in five steps; most have their own period and their own group of customers:</p>
      <ol className="mt-4 list-decimal pl-6">
        <li className="mt-2 first:mt-0">
          Clean the invoice lines with SQL in DuckDB, and remove orders cancelled within <Hours /> hours.
        </li>
        <li className="mt-2">
          Group customers by the month of their first order and count, for each later month, the share who ordered in
          it.
        </li>
        <li className="mt-2">
          Score every customer on recency, frequency and spend at a cutoff, and name segments from the scores.
        </li>
        <li className="mt-2">
          Train scikit-learn models on an earlier cutoff and score them on a later one, against a simple rule.
        </li>
        <li className="mt-2">Size a holdout test of a win-back offer for lapsed customers.</li>
      </ol>
      <p className={ITEM}>
        Each chart below has its numbers in a table under it and a badge that says where its data comes from. The
        interactive ones keep their setting in the page address, so a link opens the same view.
      </p>
    </>
  );
}

/** The two growth figures the cleaning step is about, side by side. */
export function RetentionCleaningStats(): ReactNode {
  const source = "From the retail dashboard's export";
  return (
    <div className="flex flex-col gap-8 sm:flex-row sm:gap-12">
      <div className="sm:flex-1">
        <Stat
          value={<Fact id="retail.returns.yoy_growth_raw" />}
          label={
            <>
              Growth in returned-order value, January to November 2011 against the same months of 2010, with orders
              cancelled within <Hours /> hours counted as returns
            </>
          }
          source={source}
        />
      </div>
      <div className="sm:flex-1">
        <Stat
          value={<Fact id="retail.returns.yoy_growth_clean" />}
          label="The same growth with those orders removed"
          source={source}
        />
      </div>
    </div>
  );
}

/** The reversal rule and what it changes in the returns growth. */
export function RetentionCleaning(): ReactNode {
  return (
    <>
      <p className={ITEM}>
        A cancellation that matches an order line from the same customer, for the same product and quantity, placed up
        to <Hours /> hours before it, marks an order that never happened, so I remove both lines. That rule takes out
        orders cancelled within <Hours /> hours, about <Fact id="retention.data.reversed_revenue_gbp" /> of revenue.
        Without it, the same order counts once as a sale and again as a return.
      </p>
      <p className={ITEM}>
        Returns growth compares January to November 2011 with the same months of 2010, because the data stops on{' '}
        <Fact id="retention.data.last_date" />. The change between the two growth figures comes mostly from one{' '}
        <Fact id="retail.reversal.january_gbp" /> order, placed on{' '}
        <Derived value={januaryReversalDate()} unit="date" refs={['source:retail']} /> and cancelled within{' '}
        <Hours /> hours. The inflated growth was not my catch: a review caught it and I fixed it. Growth is not the
        same as returns as a share of sales: with the rule, returns were{' '}
        <Fact id="retail.returns.rate_2010_clean" /> of sales in January to November 2010 and{' '}
        <Fact id="retail.returns.rate_2011_clean" /> in 2011; without it, <Fact id="retail.returns.rate_2010_raw" /> and{' '}
        <Fact id="retail.returns.rate_2011_raw" />.
      </p>
    </>
  );
}

/** How the cohorts are built and what their shares mean. */
export function RetentionCohorts(): ReactNode {
  return (
    <p className={ITEM}>
      Customers are grouped by the month of their first order in the data. I use the January to November 2010 cohorts: December
      2009 is the first month of the data, so it holds customers who were already buying, and December 2010 would end
      in the incomplete December 2011. A later month counts the cohort members who ordered in that month, so a share
      can rise again. Weighted by cohort size, about <Fact id="retention.cohort.month1_rate" /> order again in the
      month after their first order and about <Fact id="retention.cohort.month12_rate" /> in the twelfth month after it.
    </p>
  );
}

/** The RFM scores and the Champions definition. */
export function RetentionSegments(): ReactNode {
  return (
    <p className={ITEM}>
      At the September 2011 cutoff I score each customer on recency, frequency and spend by rank. Champions score{' '}
      <Derived value={CHAMPIONS_MIN_SCORE} unit="count" refs={['source:retention']} /> or{' '}
      <Derived value={TOP_SCORE} unit="count" refs={['source:retention']} /> out of{' '}
      <Derived value={TOP_SCORE} unit="count" refs={['source:retention']} /> on each of recency, frequency and spend
      (roughly the top two-fifths on each). They are <Fact id="retention.rfm.champions_customer_share" /> of customers
      and hold <Fact id="retention.rfm.champions_revenue_share" /> of spend up to the cutoff, partly by construction.
    </p>
  );
}

/** The out-of-time model set-up. */
export function RetentionModel(): ReactNode {
  return (
    <p className={ITEM}>
      For the model, each customer&apos;s features use only orders up to a cutoff, and the label is whether they
      ordered again within the <Days /> days after it. Logistic regression and gradient boosting learn on an earlier
      cutoff, whose window closes before the later one, and are scored on the September 2011 cutoff against a rule
      that puts the most recent buyers first. In that window, <Fact id="retention.model.test_base_rate" /> of
      customers ordered again.
    </p>
  );
}

/** The lapsed customers and the holdout-test size: a sizing only. */
export function RetentionWinBack(): ReactNode {
  return (
    <p className={ITEM}>
      Lapsed customers are those with no order in the <Days /> days before the September 2011 cutoff:{' '}
      <Fact id="retention.winback.lapsed_customers" /> of them, and <Fact id="retention.winback.baseline_rate" /> of
      them ordered again within <Days /> days. I sized a possible holdout test; nobody was contacted and no test was
      run. With a standard two-group sample-size calculation (<TestSettings />), detecting a rise from{' '}
      <Fact id="retention.winback.baseline_rate" /> to <TargetRate />, an uplift of{' '}
      <Fact id="retention.winback.uplift_pp" /> percentage points, needs <Fact id="retention.winback.n_per_arm" />{' '}
      lapsed customers in each group.
    </p>
  );
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

/**
 * Whether the customers exist for the sized test: counting only. It is not power evidence for a
 * test on the top-scored customers, whose size is set by their own rate.
 */
export function RetentionWinBackReach(): ReactNode {
  const perGroup = numericFact('retention.winback.n_per_arm');
  const top = topScoredSizing();
  const share = topScoredTargeting().contact_share;
  return (
    <p className={ITEM}>
      Two groups of that size are <Derived value={2 * perGroup} unit="count" refs={['retention.winback.n_per_arm']} />{' '}
      customers, and <Fact id="retention.winback.lapsed_customers" /> customers were lapsed at the cutoff, so one period
      has enough of them. That is arithmetic about how many customers there are, not evidence that an offer would work.
      A test on only the top <Derived value={share} unit="share" refs={['source:retention']} /> of lapsed customers by
      score would not fit: at their rate of ordering again,{' '}
      <Derived value={top.baseline_rate} unit="share" refs={['source:retention']} />, the same rise needs{' '}
      <Derived value={top.customers_per_arm} unit="count" refs={['source:retention']} /> customers per group,{' '}
      <Derived value={2 * top.customers_per_arm} unit="count" refs={['source:retention']} /> in all, and that group
      has <Fact id="retention.winback.top20_customers" />.
    </p>
  );
}

/** The heading of the targeting table. */
export const TARGETING_TITLE = 'Lapsed customers ranked by score: who ordered again, against a random selection';
/** The heading of the holdout-size table. */
export const HOLDOUT_TITLE = 'Customers needed in each group of a holdout test';

/** What the score's ranking shows, and what it cannot. */
export function RetentionTargeting(): ReactNode {
  const first = RETENTION.tables.lapsed_targeting[0];
  if (!first) throw new Error('retention: the targeting table is empty');
  const refs = ['source:retention'] as const;
  return (
    <p className={ITEM}>
      The ranking does pick people who order again: of the top{' '}
      <Derived value={first.contact_share} unit="share" refs={refs} /> of lapsed customers by score,{' '}
      <Derived value={first.contacted} unit="count" refs={refs} /> customers,{' '}
      <Derived value={first.returners_model} unit="count" refs={refs} /> ordered again within <Days /> days, against
      about <Derived value={first.returners_random} unit="count" refs={refs} /> expected from a random selection of the
      same size. These are later orders from customers nobody contacted. They show that the score ranks well, not that
      an offer would add anything; that is the question the holdout test is for.
    </p>
  );
}

/** The link to the Lab, where the same sizing can be tried with other numbers. */
export function RetentionLabLink(): ReactNode {
  return (
    <TextLink href="/lab#sample-size" standalone>
      Try other baselines and rises in the Lab&apos;s sample-size planner
    </TextLink>
  );
}

/**
 * The link to the Home page's planner: the win-back planner above computes with the same formula. The
 * two share the arithmetic, not their inputs: here the baseline is the observed share of lapsed
 * customers who ordered again, and the rise a hypothetical uplift.
 */
export function RetentionHomePlannerLink(): ReactNode {
  return (
    // Not prefetched (prefetchFor): the proxy draws a group per request to /, and Next 16.4 re-requests a prefetched /.
    <TextLink href="/#hero-planner" standalone>
      The same arithmetic as the Home planner
    </TextLink>
  );
}

/** Data, cleaning, cohorts, segments, model and sizing, as the source code does them: the parts the page places under their own headings, in one block. */
export function RetentionMethod(): ReactNode {
  return (
    <>
      <RetentionData />
      <RetentionCleaning />
      <RetentionCohorts />
      <RetentionSegments />
      <RetentionModel />
      <RetentionWinBack />
    </>
  );
}

/** What the analysis found, one line per step. */
export function RetentionFindings(): ReactNode {
  const findings: readonly [key: string, body: ReactNode][] = [
    [
      'cleaning',
      <>
        Removing orders cancelled within <Hours /> hours changes the returns story: returned-order value grew about{' '}
        <Fact id="retail.returns.yoy_growth_clean" /> in January to November 2011, not{' '}
        <Fact id="retail.returns.yoy_growth_raw" />. As a share of sales, returns went from{' '}
        <Fact id="retail.returns.rate_2010_clean" /> to <Fact id="retail.returns.rate_2011_clean" />.
      </>,
    ],
    [
      'cohorts',
      <>
        Across the January to November 2010 cohorts, about <Fact id="retention.cohort.month1_rate" /> order again in
        the month after their first order, and about <Fact id="retention.cohort.month12_rate" /> in the twelfth month
        after it. Repeat ordering varies by cohort, and a later month can be higher than an earlier one.
      </>,
    ],
    [
      'segments',
      <>
        Champions are <Fact id="retention.rfm.champions_customer_share" /> of customers at the September 2011 cutoff
        and hold <Fact id="retention.rfm.champions_revenue_share" /> of spend up to it, partly by construction.
      </>,
    ],
    [
      'model',
      <>
        Gradient boosting ranks who orders again only slightly better than putting the most recent buyers first: ROC
        AUC <Fact id="retention.model.gb_auc" /> against <Fact id="retention.model.rule_auc" />. Its scores rank
        customers but are not calibrated probabilities.
      </>,
    ],
    [
      'sizing',
      <>
        Sized to detect a rise of <Fact id="retention.winback.uplift_pp" /> percentage points, a holdout test of all
        lapsed customers needs <Fact id="retention.winback.n_per_arm" /> per group and fits in one period; a test on
        the top-scored customers alone does not.
      </>,
    ],
  ];
  return (
    <ul className="list-disc pl-6">
      {findings.map(([key, body]) => (
        <li key={key} className="mt-2 first:mt-0">
          {body}
        </li>
      ))}
    </ul>
  );
}

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

/**
 * The SQL excerpt of the reversal rule, with what it does and a link to the whole file. The prose
 * keeps to the readable column; the code runs to the figure width, so its lines fit on a desktop
 * and scroll inside their own region on a phone.
 */
export function RetentionSqlExcerpt(): ReactNode {
  const retention = sourceRepo('retention');
  return (
    <>
      <p className="max-w-text">
        The reversal rule as the cleaning SQL writes it, the same in both repositories at the linked commits:
      </p>
      <pre
        tabIndex={0}
        role="region"
        aria-label="The reversal rule in SQL"
        className="mt-4 max-w-figure overflow-x-auto border-l border-line py-2 pl-4 text-sm"
      >
        <code {...derivedAttr(RULE_REFS)}>{REVERSAL_SQL}</code>
      </pre>
      <p className="mt-4 max-w-text">
        A cancellation joins the order line it reverses: the same customer, product and quantity, placed at most a day
        before it. The sales and returns tables then leave out both lines.
      </p>
      <div className="mt-2 max-w-text">
        <TextLink href={`${retention.file('sql/01_clean.sql')}${REVERSAL_SQL_LINES}`} standalone external>
          <span>
            The whole cleaning SQL at commit <Commit id="retention" />
          </span>
        </TextLink>
      </div>
    </>
  );
}

/** How I checked this: the checks that hold the numbers on this page to their sources. */
export function RetentionChecks(): ReactNode {
  const checks: readonly [key: string, body: ReactNode][] = [
    [
      'repositories',
      <>The SQL, the models and the exports live in public repositories with tests, lint and CI; the sources below link the exact commits this page reads.</>,
    ],
    [
      'pinned',
      <>Each export is pinned by commit and by a hash of its content, and this site&apos;s build stops if a vendored copy does not match it.</>,
    ],
    [
      'schema',
      <>The build also checks each vendored export against its schema, so a missing or renamed field stops the build instead of printing a wrong number.</>,
    ],
    [
      'export-tests',
      <>
        The analysis repository tests its export against its own results: the facts must equal the analysis results
        they come from, and the cohort table must reproduce the weighted month-one and month-twelve rates. A further
        test rebuilds the export from the downloaded dataset and expects the same bytes; it needs the dataset, so CI
        skips it.
      </>,
    ],
    [
      'printed',
      <>
        Every figure on this page is marked with where it comes from: one of those exports, the source code at the
        linked commits, or a calculation. An audit of the built page fails on any unmarked number other than a
        calendar year.
      </>,
    ],
    [
      'period',
      <>The returns comparison uses the same months in both years, January to November, because December 2011 is incomplete.</>,
    ],
    [
      'out-of-time',
      <>The models are scored on a later cutoff than they learned from, so no order from the test window was used in training.</>,
    ],
    [
      'interval',
      <>
        The gain in ROC AUC is <Fact id="retention.model.auc_gain" />, with a{' '}
        <Derived value={INTERVAL_LEVEL} unit="share" refs={['source:retention']} /> interval of{' '}
        <Fact id="retention.model.auc_gain_low" /> to <Fact id="retention.model.auc_gain_high" /> from a paired
        bootstrap over the test customers, so it covers test-sample variability only.
      </>,
    ],
    [
      'sizing',
      <>
        This site&apos;s own sample-size code, which is tested against reference values from scipy and statsmodels,
        gives the same <Fact id="retention.winback.n_per_arm" /> per group as the analysis.
      </>,
    ],
  ];
  return (
    <ul className="list-disc pl-6">
      {checks.map(([key, body]) => (
        <li key={key} className="mt-2 first:mt-0">
          {body}
        </li>
      ))}
    </ul>
  );
}

/** What this analysis cannot show. */
export function RetentionLimits(): ReactNode {
  const lowest = RETENTION.tables.calibration[0];
  if (!lowest || lowest.bin !== 0) throw new Error('retention: the calibration table does not start at the lowest-scored tenth');
  const limits: readonly [key: string, body: ReactNode][] = [
    [
      'observational',
      <>
        This is historic, observational data from one UK gift retailer. It shows who ordered again, not how anyone would
        respond to a win-back offer. Nobody was contacted.
      </>,
    ],
    [
      'uplift',
      <>
        A higher score means a customer is more likely to order again, not more likely to be persuaded: rank is not
        uplift. Only a holdout test could show what an offer changes.
      </>,
    ],
    [
      'interval',
      <>
        The interval on the AUC gain covers test-sample variability only. It does not cover retraining the model,
        another period or a change in the mix of customers.
      </>,
    ],
    [
      'calibration',
      <>
        The scores rank customers but are not calibrated probabilities: in the tenth of customers with the lowest
        scores, the gradient-boosting model predicted{' '}
        <Derived value={lowest.predicted} unit="share" decimals={1} refs={['source:retention']} /> on average and{' '}
        <Derived value={lowest.observed} unit="share" decimals={1} refs={['source:retention']} /> ordered again.
      </>,
    ],
    [
      'construction',
      <>
        Champions&apos; share of spend is high partly by construction: spend is one of the three scores that define
        them.
      </>,
    ],
    [
      'first-order',
      <>
        The data starts in December 2009, so a first order in the data is not always a customer&apos;s first order,
        and lines without a customer number are left out of every customer figure.
      </>,
    ],
  ];
  return (
    <ul className="list-disc pl-6">
      {limits.map(([key, body]) => (
        <li key={key} className="mt-2 first:mt-0">
          {body}
        </li>
      ))}
    </ul>
  );
}

const LICENCE_URLS: Readonly<Record<string, string>> = {
  'CC BY 4.0': 'https://creativecommons.org/licenses/by/4.0/',
};

/** A pinned commit, shortened; its digits are marked as coming from the source. */
function Commit({ id }: { id: 'retention' | 'retail' }) {
  return <code {...derivedAttr([`source:${id}`])}>{sourceRepo(id).commit.slice(0, 7)}</code>;
}

/** The repositories at their pinned commits, the dataset and its licence: one link per line. */
export function RetentionSources(): ReactNode {
  const retention = sourceRepo('retention');
  const retail = sourceRepo('retail');
  const { name, url, licence } = RETENTION._meta.dataset;
  const licenceUrl = LICENCE_URLS[licence];
  if (!licenceUrl) throw new Error(`retention: no link for the licence ${licence}`);
  const links: readonly [href: string, body: ReactNode][] = [
    [
      retention.tree,
      <>
        Customer retention analysis, at commit <Commit id="retention" />
      </>,
    ],
    [retention.file('sql/01_clean.sql'), <>Cleaning SQL of the retention analysis</>],
    [retention.file(), <>Export of the retention analysis that this page reads</>],
    [
      retail.tree,
      <>
        Retail KPI dashboard, at commit <Commit id="retail" />
      </>,
    ],
    [retail.file('sql/01_clean.sql'), <>Cleaning SQL of the retail dashboard</>],
    [retail.file(), <>Returns export of the retail dashboard</>],
    [url, <>The data: {name}</>],
    [
      licenceUrl,
      <>
        Its licence, <span {...derivedAttr(['source:retention', 'source:retail'])}>{licence}</span>
      </>,
    ],
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
}
