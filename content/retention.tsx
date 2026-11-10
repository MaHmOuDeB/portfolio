// The Retention case study's sourced prose: the summary, the method, how I checked it, its limits
// and its sources. Each export is a server section without its own heading, so the page decides
// the outline and the anchors. Every number is a <Fact> from the vendored exports or a <Derived>
// that names its source; the rest is plain words. The method was checked against the source code
// at the pinned commits (sql/01_clean.sql for the reversal rule, sql/02_features.sql and
// src/analysis.py for the snapshots, the models and the sizing), not against the repositories'
// README files.
import type { ReactNode } from 'react';
import { Derived, derivedAttr } from '@/components/kit/Derived';
import { Fact } from '@/components/kit/Fact';
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
        those orders removed, it grew about <Fact id="retail.returns.yoy_growth_clean" />. About{' '}
        <Fact id="retention.cohort.month1_rate" /> of a cohort order again in the month after their first order. A
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

/** Data, cleaning, cohorts, segments, model and sizing, as the source code does them. */
export function RetentionMethod(): ReactNode {
  return (
    <>
      <p className={ITEM}>
        The data is UCI Online Retail II, orders from a UK online gift retailer from{' '}
        <Fact id="retention.data.first_date" /> to <Fact id="retention.data.last_date" />:{' '}
        <Fact id="retention.data.raw_rows" /> invoice lines. Cleaning keeps cancellations apart as returns and drops
        lines without a customer, lines that are not products (such as postage) and lines with no positive quantity or
        price. After cleaning and the reversal rule below,{' '}
        <Fact id="retention.data.clean_rows" /> sales lines remain, in <Fact id="retention.data.orders" /> orders from{' '}
        <Fact id="retention.data.customers" /> customers.
      </p>
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
      <p className={ITEM}>
        Customers are grouped by the month of their first order in the data. I use the January to November 2010 cohorts: December
        2009 is the first month of the data, so it holds customers who were already buying, and December 2010 would end
        in the incomplete December 2011. A later month counts the cohort members who ordered in that month, so a share
        can rise again. Weighted by cohort size, about <Fact id="retention.cohort.month1_rate" /> order again in the
        month after their first order and about <Fact id="retention.cohort.month12_rate" /> a year after it.
      </p>
      <p className={ITEM}>
        At the September 2011 cutoff I score each customer on recency, frequency and spend by rank. Champions score{' '}
        <Derived value={CHAMPIONS_MIN_SCORE} unit="count" refs={['source:retention']} /> or{' '}
        <Derived value={TOP_SCORE} unit="count" refs={['source:retention']} /> out of{' '}
        <Derived value={TOP_SCORE} unit="count" refs={['source:retention']} /> on each of recency, frequency and spend
        (roughly the top two-fifths on each). They are <Fact id="retention.rfm.champions_customer_share" /> of customers
        and hold <Fact id="retention.rfm.champions_revenue_share" /> of spend up to the cutoff, partly by construction.
      </p>
      <p className={ITEM}>
        For the model, each customer&apos;s features use only orders up to a cutoff, and the label is whether they
        ordered again within the <Days /> days after it. Logistic regression and gradient boosting learn on an earlier
        cutoff, whose window closes before the later one, and are scored on the September 2011 cutoff against a rule
        that puts the most recent buyers first. In that window, <Fact id="retention.model.test_base_rate" /> of
        customers ordered again.
      </p>
      <p className={ITEM}>
        Lapsed customers are those with no order in the <Days /> days before the September 2011 cutoff:{' '}
        <Fact id="retention.winback.lapsed_customers" /> of them, and <Fact id="retention.winback.baseline_rate" /> of
        them ordered again within <Days /> days. I sized a holdout test for them with a standard two-group sample-size
        calculation (<TestSettings />). Nobody was contacted and no test was run.
      </p>
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
        scores, the model predicted <Derived value={lowest.predicted} unit="share" decimals={1} refs={['source:retention']} /> on
        average and <Derived value={lowest.observed} unit="share" decimals={1} refs={['source:retention']} /> ordered
        again.
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

/** The repositories at their pinned commits, the dataset and its licence. */
export function RetentionSources(): ReactNode {
  const retention = sourceRepo('retention');
  const retail = sourceRepo('retail');
  const { name, url, licence } = RETENTION._meta.dataset;
  const licenceUrl = LICENCE_URLS[licence];
  if (!licenceUrl) throw new Error(`retention: no link for the licence ${licence}`);
  return (
    <ul>
      <li>
        <TextLink href={retention.tree} external>
          Customer retention analysis
        </TextLink>{' '}
        at commit <Commit id="retention" />:{' '}
        <TextLink href={retention.file('sql/01_clean.sql')} external>
          the cleaning SQL
        </TextLink>{' '}
        and{' '}
        <TextLink href={retention.file()} external>
          the export this page reads
        </TextLink>
        .
      </li>
      <li className="mt-2">
        <TextLink href={retail.tree} external>
          Retail KPI dashboard
        </TextLink>{' '}
        at commit <Commit id="retail" />:{' '}
        <TextLink href={retail.file('sql/01_clean.sql')} external>
          the cleaning SQL
        </TextLink>{' '}
        and{' '}
        <TextLink href={retail.file()} external>
          the returns export
        </TextLink>
        .
      </li>
      <li className="mt-2">
        The data:{' '}
        <TextLink href={url} external>
          {name}
        </TextLink>
        , licensed{' '}
        <TextLink href={licenceUrl} external>
          <span {...derivedAttr(['source:retention', 'source:retail'])}>{licence}</span>
        </TextLink>
        .
      </li>
    </ul>
  );
}
