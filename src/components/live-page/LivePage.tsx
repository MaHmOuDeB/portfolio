// The Live test page (/experiment): the site's experiment on its own visitors, as it stands. It
// follows the reading model of the inner pages. The first screen: what the page is for, the plain
// opening, the status card (the three steps and where the test stands) and four key points. Then the
// in-page links, the result so far with the decision and the end, the plan fixed before the start,
// the health checks (the split check and what this many views can detect), how views are counted,
// the data with the script that recomputes it, what the page shows about how I work, how the site is
// built, and the shared call to action. Method detail sits one click deeper, in native details rows,
// with its text unchanged.
//
// It renders the allowlisted display shape only (toLivePageDisplay): every count is a published
// cell, the state copy comes from StateExplanation and the next step from nextStepFor, and nothing
// here reads the snapshot. Every sentence about the test repeats the pre-registration or the page's
// own state copy, and is written to be true in every state: during the calibration both groups see
// group A, so the page says what the test compares and that the comparison starts after it.
// Server-safe, no client component of its own and no beacon: the page assigns no group and polls
// nothing. `runtime` forces a Figure runtime (no-JS, error) for the tests, as the kit's own forced
// states do.
//
// Refs: a value read from the published data uses the reader's refs (`live` on the site); a value
// committed with the configuration (the planning rate, the pre-registration's version, tag and hash)
// and a figure quoted from the plan uses `build`.
import type { ReactNode } from 'react';
import { FigureSheet, KeyPoints, LeadIn, MethodDetails, PageClose, SECTION_H2, SectionNav, Takeaway } from '@/components/frame';
import { Derived, derivedAttr, type DerivedRef } from '@/components/kit/Derived';
import { TextLink } from '@/components/kit/TextLink';
import { PageCallToAction } from '@/components/shell/PageCallToAction';
import { CaseHead } from '@/components/work/CaseHead';
import { MIN_PER_GROUP, type FigureRuntime } from '@/lib/figure/states';
import type { LivePageDisplay } from '@/lib/live-page/model';
import { CONTACT } from '@/lib/site';
import { DETECTABLE_METHOD, DetectableFigure } from './DetectableFigure';
import { FunnelExclusions, FunnelFigure, FunnelMethod } from './FunnelFigure';
import { ResultsFigure, resultsKind } from './ResultsFigure';
import { DECISION_WORDS, StatusCard, WITH_END, isRunning, stateWords } from './StatusCard';
import { BUILD, MarkedText, When } from './Values';

/** The h1, with its quiet second clause. */
export const LIVE_TEST_TITLE = 'A real A/B test on this site,';
export const LIVE_TEST_QUIET = 'run in the open.';

/** The ruled sections after the first screen, in page order. The close sits between the last two. */
export const LIVE_SECTIONS = [
  { id: 'results', title: 'Result so far' },
  { id: 'plan', title: 'The plan, fixed before the start' },
  { id: 'health', title: 'Is the test healthy?' },
  { id: 'funnel', title: 'How views are counted' },
  { id: 'check-it-yourself', title: 'Check it yourself' },
] as const;

type SectionId = (typeof LIVE_SECTIONS)[number]['id'];

const TEXT = 'max-w-text';
const P = `${TEXT} text-base`;
const H3 = `${TEXT} text-lg font-semibold`;
const REPO = `${CONTACT.github}/portfolio`;

function Section({ id, title, children }: { id: SectionId; title?: string; children: ReactNode }) {
  const entry = LIVE_SECTIONS.find((s) => s.id === id)!;
  return (
    <section id={id} aria-labelledby={`${id}-title`} data-rule="" className="mt-12 pt-12 md:mt-16 md:pt-16">
      <h2 id={`${id}-title`} className={`${TEXT} ${SECTION_H2}`}>
        {title ?? entry.title}
      </h2>
      {children}
    </section>
  );
}

/** A number quoted from the plan (the pre-registration's v1 text): fixed, so its ref is `build`. */
const N = ({ v }: { v: number }) => <Derived value={v} unit="count" refs={BUILD} />;
/** "<5" as text, marked: the label a count from 1 to 4 is printed as. */
const SmallLabel = () => (
  <span data-num="" {...derivedAttr(BUILD)}>
    &lt;5
  </span>
);
/** A status word in semibold, as on the Retention page; the word carries the meaning, never a colour. */
const Status = ({ children }: { children: string }) => (
  <span data-status="" className="font-semibold whitespace-nowrap">
    {children}
  </span>
);
/** The design hash: it may break between any two characters, but its last 8 stay together, so no line holds a lone stub. */
const Hash = ({ value }: { value: string }) => (
  <data value={value} className="break-all" {...derivedAttr(BUILD)}>
    {value.slice(0, -8)}
    <span className="whitespace-nowrap">{value.slice(-8)}</span>
  </data>
);
/** The design hash's first 12 characters in a code chip; the full value is in the pre-registration record. */
const ShortHash = ({ value }: { value: string }) => (
  <code className="rounded-sm border border-hairline-strong bg-surface px-1.5 py-0.5 text-sm whitespace-nowrap">
    <data value={value} {...derivedAttr(BUILD)}>
      {value.slice(0, 12)}
    </data>
  </code>
);

/** The result's heading: "so far" until a decision is recorded. */
const resultTitle = (d: LivePageDisplay) => (d.outcome !== null ? 'Result' : 'Result so far');

/**
 * What a reader with two minutes must take away. The second card follows the state; the others are
 * the design, so they hold in every state. While the configuration is in the calibration, the first
 * card says that the comparison has not started.
 */
function keyPoints(d: LivePageDisplay) {
  const standing: ReactNode =
    d.outcome === 'inconclusive'
      ? 'Inconclusive reports the final interval as the range of effects consistent with the data, never as no effect.'
      : d.outcome !== null
        ? 'The first decision is final, so later looks change nothing.'
        : !isRunning(d)
          ? 'The card above has the details.'
          : d.configPhase === 'calibration'
            ? 'Calibration is a dry run: both groups see the same headlines, so the counting and the split can be checked before the real comparison starts.'
            : 'The two groups see different headlines. The counts on this page are current; the interval and the verdict change once a day.';
  return [
    {
      id: 'tested',
      title: 'What is tested',
      body: (
        <>
          The three featured cards on the home page. Group A: headlines that name the topic. Group B: headlines that state the
          finding. Nothing else differs.
          {d.configPhase === 'calibration' && d.outcome === null
            ? ' The comparison starts after the calibration; during it both groups see group A’s headlines.'
            : null}
        </>
      ),
    },
    {
      id: 'standing',
      title: 'Where it stands',
      body: (
        <>
          <Status>{stateWords(d)}</Status>. {standing}
        </>
      ),
    },
    {
      id: 'expect',
      title: d.outcome !== null ? 'What I expected' : 'What I expect',
      body: (
        <>
          Probably no clear answer. At the planned <N v={225} /> views per group, only a lift of about <N v={15} /> percentage
          points would be found <N v={8} /> times in <N v={10} />, and I said so before the test started.
        </>
      ),
    },
    {
      id: 'why',
      title: 'Why run it then',
      body: 'Because how a test is planned, checked and reported matters more than whether it wins. The results here can be recomputed from the published data.',
    },
  ];
}

/** The result so far: the lead-in for what is drawn, the Figure on its sheet, what it means, the decision and the end. */
function Result({ d, runtime }: { d: LivePageDisplay; runtime?: FigureRuntime }) {
  const kind = resultsKind(d);
  const range = 'the range of differences between the groups that the data are compatible with';
  const open = d.outcome === null && !d.countingClosed && d.mode !== 'held';
  const collecting = kind === 'hollow' && isRunning(d) && !(typeof d.counts.smaller === 'number' && d.counts.smaller >= MIN_PER_GROUP);
  const target = <N v={MIN_PER_GROUP} />;
  return (
    <>
      {kind === 'none' ? (
        <div className="mt-4">
          <ResultsFigure display={d} runtime={runtime} />
        </div>
      ) : (
        <>
          <LeadIn>
            {kind === 'hollow'
              ? `The hollow mark stands in for the bar: ${range}.`
              : d.configPhase === 'calibration'
                ? `The bar is ${range}. In the calibration both groups see the same page, so the bar should include zero.`
                : `The bar is ${range}. Wholly on the side marked B higher, B is ahead; across zero, there is no clear answer${open ? ' yet' : ''}.`}
          </LeadIn>
          <FigureSheet>
            <ResultsFigure display={d} runtime={runtime} />
          </FigureSheet>
          {collecting ? (
            <Takeaway>
              No estimate is drawn until each group has {target} views. That threshold was fixed before the start.
            </Takeaway>
          ) : null}
        </>
      )}
      <Decision d={d} />
    </>
  );
}

function Plan({ d }: { d: LivePageDisplay }) {
  const prereg = d.public.prereg;
  const commit = prereg.commit;
  return (
    <>
      <p className={`${P} mt-4`}>
        Pre-registered means the design, the numbers I plan with and the decision rule were fixed and published before any
        visitor was counted, so they cannot be changed quietly after seeing results.
      </p>
      <p className={`${P} mt-3`}>
        The pre-registration fixes the design, the numbers I plan with, the decision rule and what I will do in each outcome. Its
        hypothesis: “Featured case-study cards that state the finding get more clicks than cards that name the topic.”
      </p>
      <div id="plan-planning" className="mt-3 space-y-3">
        <p className={P}>
          I planned the test at <N v={225} /> views per group. At that size, the smallest lift it would find <N v={8} /> times in{' '}
          <N v={10} /> is about <N v={15} /> percentage points. Even a <N v={5} />-point lift would be found about <N v={1} /> time in{' '}
          <N v={20} />. Inconclusive is the likely, honest outcome.
        </p>
        <p className={P}>
          There is also a guardrail, a second measure that must not get worse: quick exits. A quick exit is a view whose visitor
          leaves within <N v={5} /> seconds without interacting. To ship B, the data must rule out a rise in quick exits of{' '}
          <N v={10} /> percentage points or more. To show that, even two identical groups would need about <N v={390} /> to{' '}
          <N v={470} /> entry views (fresh arrivals on the home page) each. That is a planning figure, not a target.
        </p>
        <p className={P}>The test counts views, not people: one person can count more than once, and in both groups.</p>
      </div>
      <p id="plan-prereg-short" className={`${P} mt-4`}>
        Pre-registration <MarkedText value={prereg.version} refs={BUILD} />, design hash <ShortHash value={prereg.configSha256} />.
      </p>
      <div className={TEXT}>
        <TextLink href={`${REPO}/blob/${prereg.tag}/docs/experiment/prereg.md`} external standalone>
          Read the pre-registration at its tag
        </TextLink>
      </div>
      <MethodDetails summary="Pre-registration record">
        <p id="plan-prereg" className="wrap-anywhere">
          Pre-registration <MarkedText value={prereg.version} refs={BUILD} />, tag <MarkedText value={prereg.tag} refs={BUILD} />, design
          hash <Hash value={prereg.configSha256} />.
        </p>
        {/* No line when the build recorded no commit: an empty value would read as a fault. */}
        {commit !== null ? (
          <p id="plan-build">
            This page was built from commit <MarkedText value={commit} shown={commit.slice(0, 7)} refs={BUILD} />.
          </p>
        ) : null}
      </MethodDetails>
    </>
  );
}

const CHECK_WORDS = { passed: 'passed', failed: 'failed', 'not-evaluated': 'not checked yet' } as const;

function SplitCheck({ d }: { d: LivePageDisplay }) {
  const lead = (
    <p className={`${P} mt-3`}>
      The split check asks whether the two groups got the share of views chance would give them (sample ratio mismatch, SRM). If it
      fails, the split is further from even than chance would plausibly give, so something may have moved views between the groups,
      and no result is shown. Because it is checked at every completed day, the chance of a false flag over the whole run is about{' '}
      <N v={1} />% to <N v={3} />%.
    </p>
  );
  let status: ReactNode;
  if (d.public.source === 'unavailable') status = <p className={`${P} mt-3`}>No split check is shown: this page has no data.</p>;
  else if (d.mode === 'held') {
    status = (
      <p className={`${P} mt-3`}>
        {d.split ? 'The split check also failed, as the note at the top of this page says.' : 'The split check is not reported after the consistency check failed.'}
      </p>
    );
  } else {
    status = (
      <ul className={`${TEXT} mt-3 space-y-2 text-base`}>
        <li>
          Entry views: <Status>{CHECK_WORDS[d.splitStatus.entry]}</Status>
        </li>
        <li>
          Analysed views: <Status>{CHECK_WORDS[d.splitStatus.analysed]}</Status>
        </li>
      </ul>
    );
  }
  return (
    <>
      {lead}
      {status}
      {d.afterDecisionSrm ? <p className={`${P} mt-3`}>A later split check failed; the recorded decision is unchanged.</p> : null}
    </>
  );
}

/** A decision can still come: the test has not stopped for good and no stop is confirmed. */
const DECISION_AHEAD = new Set(['not-started', 'before-data', 'calibration', 'ab', 'paused']);

function Decision({ d }: { d: LivePageDisplay }) {
  const configRefs: readonly DerivedRef[] = d.refs.includes('simulated') ? ['simulated'] : BUILD;
  const showEnd = d.public.source !== 'unavailable' && WITH_END.includes(d.mode);
  const ahead = DECISION_AHEAD.has(d.mode) && !(d.countingClosed && d.closedConfirmed);
  return (
    <div id="decision" className="mt-6">
      <p id="decision-line" className={`${P} font-semibold`}>
        {d.outcome === null ? (
          ahead ? (
            'No decision yet.'
          ) : (
            'No decision is shown.'
          )
        ) : (
          <>
            Decision: {DECISION_WORDS[d.outcome]}
            {d.decidedOn !== null ? (
              <>
                , on <When iso={d.decidedOn} refs={d.refs} />
              </>
            ) : null}
            .
          </>
        )}
      </p>
      {showEnd ? (
        <p id="decision-end" className={`${P} mt-3`}>
          {d.plannedEndKind === 'earliest' ? 'Earliest end' : 'Planned end'}: <When iso={d.plannedEnd} refs={configRefs} />.
          {d.plannedEndKind === 'earliest' ? ' During the calibration this is the earliest date the A/B test’s time limit can fall; a decision can end the test sooner.' : null}
        </p>
      ) : null}
    </div>
  );
}

function CheckItYourself({ d, host }: { d: LivePageDisplay; host: string | null }) {
  const source = d.public.source;
  return (
    <>
      <p className={`${P} mt-4`}>
        <a
          href="/experiment/data.json"
          download="data.json"
          data-touch-target=""
          className="inline-flex min-h-(--size-target) items-center text-muted underline decoration-muted hover:text-ink focus-visible:text-ink"
        >
          Download the data (data.json)
        </a>
      </p>
      <p className={`${P} mt-3`}>
        The data are aggregated daily counts, no identifiers. They are not anonymous: someone who knows when a person visited could
        link a change between two days to that visit. A count from <N v={1} /> to <N v={4} /> is shown as “<SmallLabel />”, here and
        in the file.
      </p>
      {host !== null ? (
        <p className={`${P} mt-3`}>To recompute the results yourself, run this from a copy of the repository:</p>
      ) : (
        <p className={`${P} mt-3`}>
          To recompute the results yourself, save the file from the address of this page followed by /data.json, then run this from a
          copy of the repository:
        </p>
      )}
      <pre
        className="mt-3 max-w-figure overflow-x-auto rounded-md border border-hairline-strong bg-surface p-3 text-sm"
        tabIndex={0}
        role="region"
        aria-label="Commands"
      >
        <code>
          {host !== null ? (
            <>
              {'curl --fail --silent --show-error https://'}
              <MarkedText value={host} refs={BUILD} />
              {'/experiment/data.json -o data.json\n'}
            </>
          ) : null}
          {'python3 scripts/verify_experiment.py data.json'}
        </code>
      </pre>
      <MethodDetails summary="How the script treats small counts">
        <p>
          The script uses the Python standard library only and imports nothing from this site. It recomputes the split check, both
          intervals over the daily looks, the decision and the detectable effect, and checks the publishing rules. Each check agrees
          with the published value to within a hundred-millionth, or the script reports it as failed; a check the published data
          cannot settle is reported as indeterminate, with its reason.
        </p>
        <p>
          Where a check depends on a count shown as “<SmallLabel />”, the script tries every value the cell may hold. The check passes
          when all of them give the published result, fails when none does, and is reported as indeterminate otherwise. It never prints those values.
          Its own tests run it on saved copies of published data, built by the site’s code from known counts.
        </p>
      </MethodDetails>
      {source === 'fixture' ? (
        <p className={`${P} mt-3`}>This build has no store, so the numbers on this page are a stand-in, not visitors.</p>
      ) : source === 'local' ? (
        <p className={`${P} mt-3`}>This build reads a local test store, so its numbers are simulated, not visitors.</p>
      ) : null}
      <div className={`${TEXT} mt-3`}>
        <TextLink href={`${REPO}/blob/${d.public.prereg.commit ?? d.public.prereg.tag}/scripts/verify_experiment.py`} external standalone>
          Read the script
        </TextLink>
      </div>
    </>
  );
}

type Props = {
  display: LivePageDisplay;
  /** The production host for the download command; null names "the address of this page" instead. */
  host: string | null;
  runtime?: FigureRuntime;
};

export function LivePage({ display: d, host, runtime }: Props): ReactNode {
  const preregHref = `${REPO}/blob/${d.public.prereg.tag}/docs/experiment/prereg.md`;
  return (
    <article aria-labelledby="live-test-title">
      <CaseHead
        id="live-test-title"
        chip="Live test"
        title={LIVE_TEST_TITLE}
        quiet={LIVE_TEST_QUIET}
        intro={
          <p>
            The test is about the three featured cards on the home page. In group A their headlines name the topic; in group B
            they state the finding. The question is whether the finding headlines get more clicks. I published the plan before any
            data came in, and this page shows every step, including a result that may well be: not enough data to say.
          </p>
        }
      />

      <StatusCard d={d} />
      <KeyPoints items={keyPoints(d)} />

      <SectionNav
        items={[
          { href: '#results', label: resultTitle(d) },
          { href: '#plan', label: 'The plan' },
          { href: '#health', label: 'Is the test healthy?' },
          { href: '#funnel', label: 'How views are counted' },
          { href: '#check-it-yourself', label: 'Check it yourself' },
        ]}
      />

      <Section id="results" title={resultTitle(d)}>
        <Result d={d} runtime={runtime} />
      </Section>

      <Section id="plan">
        <Plan d={d} />
      </Section>

      <Section id="health">
        <div id="split-check" className="mt-6">
          <h3 className={H3}>Did both groups get a fair share?</h3>
          <SplitCheck d={d} />
        </div>
        <div id="detectable" className="mt-10">
          <h3 className={H3}>How small a difference this test can see</h3>
          <LeadIn>
            How big a difference could this test notice? The line is the smallest lift it would catch <N v={8} /> times in{' '}
            <N v={10} /> at each number of views.
          </LeadIn>
          <FigureSheet>
            <DetectableFigure
              data={d.public}
              refs={d.refs}
              phase={d.configPhase}
              smaller={d.counts.smaller}
              hideCurrentSize={d.mode === 'srm-suppressed'}
              runtime={runtime}
            />
          </FigureSheet>
          <Takeaway>Smaller real differences will mostly end as inconclusive, which is not the same as no effect.</Takeaway>
          <MethodDetails summary="How the line is computed">
            <p>{DETECTABLE_METHOD}</p>
          </MethodDetails>
        </div>
      </Section>

      <Section id="funnel">
        <LeadIn>
          Not every page load counts. Raw signals from the home page are filtered down to the views the analysis uses.
        </LeadIn>
        <FigureSheet>
          <FunnelFigure data={d.public} refs={d.refs} runtime={runtime} />
        </FigureSheet>
        <MethodDetails>
          <FunnelMethod />
        </MethodDetails>
        <MethodDetails summary="Why views were not counted">
          <FunnelExclusions data={d.public} refs={d.refs} />
        </MethodDetails>
      </Section>

      <Section id="check-it-yourself">
        <CheckItYourself d={d} host={host} />
      </Section>

      <PageClose
        links={[
          { href: '/lab', label: 'Try the same checks in the Lab' },
          { href: preregHref, label: 'See the pre-registration', external: true },
        ]}
      >
        <p>
          Here I publish the plan before the data, show the checks beside the result, say in advance when a test is too small to
          settle the question, and give you the data to prove me wrong.
        </p>
      </PageClose>

      <PageCallToAction />
    </article>
  );
}
