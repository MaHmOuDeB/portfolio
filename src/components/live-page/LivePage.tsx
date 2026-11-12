// The Live test page (/experiment): the site's experiment on its own visitors, as it stands. It
// follows the spec's order: the plan with the pre-registration and the build commit, the funnel, the
// split check, the detectable effect, the results, the decision and the end, the data with the
// script that recomputes it, and the colophon. A short "where the test stands" comes first.
//
// It renders the allowlisted display shape only (toLivePageDisplay): every count is a published
// cell, the state copy comes from StateExplanation and the next step from nextStepFor, and nothing
// here reads the snapshot. Server-safe, no client component of its own and no beacon: the page
// assigns no group and polls nothing. `runtime` forces a Figure runtime (no-JS, error) for the
// tests, as the kit's own forced states do.
//
// Refs: a value read from the published data uses the reader's refs (`live` on the site); a value
// committed with the configuration (the planning rate, the pre-registration's version, tag and hash)
// and a figure quoted from the plan uses `build`.
import type { ReactNode } from 'react';
import { Derived, derivedAttr, type DerivedRef } from '@/components/kit/Derived';
import { TextLink } from '@/components/kit/TextLink';
import { StateExplanation } from '@/components/live-page/StateExplanation';
import { berlinTime } from '@/lib/figure/time';
import type { FigureRuntime } from '@/lib/figure/states';
import type { BuildMeta } from '@/lib/live-page/build-meta-shape';
import type { LivePageDisplay } from '@/lib/live-page/model';
import { CONTACT } from '@/lib/site';
import { Colophon } from './Colophon';
import { DetectableFigure } from './DetectableFigure';
import { FunnelFigure } from './FunnelFigure';
import { ResultsFigure } from './ResultsFigure';
import { BUILD, MarkedText, When } from './Values';

export const LIVE_TEST_TITLE = 'Live test';

/** The sections after the opening summary, in page order. */
export const LIVE_SECTIONS = [
  { id: 'plan', title: 'The plan' },
  { id: 'funnel', title: 'From beacons to analysed views' },
  { id: 'split-check', title: 'The split check' },
  { id: 'detectable', title: 'What this many views can detect' },
  { id: 'results', title: 'Results' },
  { id: 'decision', title: 'Decision and end' },
  { id: 'check-it-yourself', title: 'Check it yourself' },
  { id: 'colophon', title: 'Colophon' },
] as const;

type SectionId = (typeof LIVE_SECTIONS)[number]['id'];

const TEXT = 'max-w-text';
const P = `${TEXT} text-base`;
const REPO = `${CONTACT.github}/portfolio`;

function Section({ id, children }: { id: SectionId; children: ReactNode }) {
  const entry = LIVE_SECTIONS.find((s) => s.id === id)!;
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="mt-12 md:mt-section">
      <h2 id={`${id}-title`} className={`${TEXT} text-xl font-semibold`}>
        {entry.title}
      </h2>
      <div className="mt-4">{children}</div>
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
/** A status word in a neutral outline; the word carries the meaning, never a colour. */
const Status = ({ children }: { children: string }) => (
  <span data-status="" className="inline-block rounded-sm border border-muted px-2 text-sm whitespace-nowrap">
    {children}
  </span>
);

/** Where the data stands and the state's own sentences. */
function WhereItStands({ d }: { d: LivePageDisplay }) {
  const read = d.public.source === 'store' || d.public.source === 'local';
  return (
    <section id="where-it-stands" aria-labelledby="where-it-stands-title" className={`${TEXT} mt-8 border-y border-line py-6`}>
      <h2 id="where-it-stands-title" className="text-xl font-semibold">
        Where the test stands
      </h2>
      <div className="mt-4">
        <StateExplanation model={d} />
        {read ? (
          <p className="mt-3 text-sm text-muted">
            These numbers were read on <When iso={d.readAt} refs={d.refs} /> at{' '}
            <time dateTime={d.readAt} {...derivedAttr(d.refs)}>
              {berlinTime(d.readAt)}
            </time>
            . The page reads the data again at most every five minutes, when someone opens it. If a read fails, it keeps
            showing the numbers it last read, with this time.
          </p>
        ) : null}
      </div>
    </section>
  );
}

function Plan({ d }: { d: LivePageDisplay }) {
  const prereg = d.public.prereg;
  const commit = prereg.commit;
  return (
    <>
      <p className={P}>
        The pre-registration fixes the design, the numbers I plan with, the decision rule and what I will do in each outcome. Its
        hypothesis: “Featured case-study cards that state the finding get more clicks than cards that name the topic.”
      </p>
      <div id="plan-planning" className="mt-4 space-y-3">
        <p className={P}>
          I planned the test at <N v={225} /> views per group. At that size, the smallest lift it would find <N v={8} /> times in{' '}
          <N v={10} /> is about <N v={15} /> percentage points. Even a <N v={5} />-point lift would be found about <N v={1} /> time in{' '}
          <N v={20} />. Inconclusive is the likely, honest outcome.
        </p>
        <p className={P}>
          The quick-exit guardrail asks for evidence that B does not hurt. For two identical groups, the planning calculation says
          ship B needs about <N v={390} /> to <N v={470} /> entry views per group. That is a planning figure for identical groups,
          not a threshold every run must reach.
        </p>
        <p className={P}>n counts views, not people: one person can count more than once, and in both groups.</p>
      </div>
      <p id="plan-prereg" className={`${P} mt-4 wrap-anywhere`}>
        Pre-registration <MarkedText value={prereg.version} refs={BUILD} />, tag <MarkedText value={prereg.tag} refs={BUILD} />, design
        hash <MarkedText value={prereg.configSha256} refs={BUILD} />.
      </p>
      <div className={TEXT}>
        <TextLink href={`${REPO}/tree/${prereg.tag}`} external standalone>
          Read the pre-registration at its tag
        </TextLink>
      </div>
      <p id="plan-build" className={`${P} mt-2`}>
        {commit === null ? (
          'Build commit: Not recorded.'
        ) : (
          <>
            This page was built from commit <MarkedText value={commit} shown={commit.slice(0, 7)} refs={BUILD} />.
          </>
        )}
      </p>
    </>
  );
}

const CHECK_WORDS = { passed: 'passed', failed: 'failed', 'not-evaluated': 'not checked yet' } as const;

function SplitCheck({ d }: { d: LivePageDisplay }) {
  const lead = (
    <p className={P}>
      The split check (sample ratio mismatch, SRM) asks whether the two groups got the share of views chance would give them. If it
      fails, something other than chance moved views between the groups, so no result is shown.
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

const DECISION_WORDS = { 'ship-b': 'Ship B', 'stop-for-harm': 'Stop for harm', inconclusive: 'Inconclusive at the limit' } as const;
const WITH_END = new Set(['before-data', 'calibration', 'ab', 'paused', 'settings-unreadable', 'srm-suppressed', 'ship-b', 'stop-for-harm', 'inconclusive']);

function Decision({ d }: { d: LivePageDisplay }) {
  const configRefs: readonly DerivedRef[] = d.refs.includes('simulated') ? ['simulated'] : BUILD;
  const showEnd = d.public.source !== 'unavailable' && WITH_END.has(d.mode);
  return (
    <>
      <p id="decision-line" className={P}>
        {d.outcome === null ? (
          'No decision is shown.'
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
          {d.plannedEndKind === 'earliest' ? ' During the calibration this is the earliest the whole run can end.' : null}
        </p>
      ) : null}
    </>
  );
}

function CheckItYourself({ d, host }: { d: LivePageDisplay; host: string | null }) {
  const source = d.public.source;
  return (
    <>
      <p className={P}>
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
        className="mt-3 max-w-figure overflow-x-auto rounded-sm border border-line p-3 text-sm"
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
      <p className={`${P} mt-3`}>
        The script uses the Python standard library only and imports nothing from this site. It recomputes the split check, both
        intervals over the daily looks, the decision and the detectable effect, and checks the publishing rules. Each check agrees
        with the published value to within a hundred-millionth, or the script reports it as failed.
      </p>
      <p className={`${P} mt-3`}>
        Where a check depends on a count shown as “<SmallLabel />”, the script tries every value the cell may hold. The check passes
        only when all of them give the published result, and is reported as indeterminate otherwise. It never prints those values.
        Its own tests run it on saved copies of published data, built by the site’s code from known counts.
      </p>
      {source === 'fixture' ? (
        <p className={`${P} mt-3`}>This build has no store, so the numbers on this page are a stand-in, not visitors.</p>
      ) : source === 'local' ? (
        <p className={`${P} mt-3`}>This build reads a local test store, so its numbers are simulated, not visitors.</p>
      ) : null}
      <div className={TEXT}>
        <TextLink href={`${REPO}/blob/${d.public.prereg.commit ?? d.public.prereg.tag}/scripts/verify_experiment.py`} external standalone>
          Read the script
        </TextLink>
      </div>
    </>
  );
}

type Props = {
  display: LivePageDisplay;
  meta: BuildMeta | null;
  /** The production host for the download command; null names "the address of this page" instead. */
  host: string | null;
  runtime?: FigureRuntime;
};

export function LivePage({ display: d, meta, host, runtime }: Props): ReactNode {
  return (
    <article aria-labelledby="live-test-title" className="py-12 md:py-section">
      <div className={TEXT}>
        <h1 id="live-test-title" className="text-2xl font-semibold md:text-3xl">
          {LIVE_TEST_TITLE}
        </h1>
        <p className="mt-4 text-lg text-muted">
          This site runs an experiment on its own visitors and shows it here as it goes: the plan, every stage from beacon to
          analysed view, the checks, the result, and the data to recompute it.
        </p>
      </div>

      <WhereItStands d={d} />

      <Section id="plan">
        <Plan d={d} />
      </Section>

      <Section id="funnel">
        <FunnelFigure data={d.public} refs={d.refs} runtime={runtime} />
      </Section>

      <Section id="split-check">
        <SplitCheck d={d} />
      </Section>

      <Section id="detectable">
        <DetectableFigure
          data={d.public}
          refs={d.refs}
          phase={d.configPhase}
          smaller={d.counts.smaller}
          hideCurrentSize={d.mode === 'srm-suppressed'}
          runtime={runtime}
        />
      </Section>

      <Section id="results">
        <ResultsFigure display={d} runtime={runtime} />
      </Section>

      <Section id="decision">
        <Decision d={d} />
      </Section>

      <Section id="check-it-yourself">
        <CheckItYourself d={d} host={host} />
      </Section>

      <Section id="colophon">
        <Colophon meta={meta} />
      </Section>
    </article>
  );
}

