// The Home scroll moment as data: five steps (Hypothesis, Split, Evidence, Guardrails, Decision),
// each a heading and a server-rendered body, and the slice of the live chart the Evidence step may
// draw. Server only: it reads the Home model, which keeps exact counts. The bodies are children
// for the scroll moment's shell, never JSON; only `chartSnapshot`, `homeChartTable` and
// `chartAriaLabel` produce data a client chart receives.
//
// What every state may say comes from the model, never from the drawable data alone:
// - A placeholder, unreadable settings or a closure check show the note's explanation, never an
//   observed mark or a zero count. A failed split or calibration hides the chart and gives its reason.
// - A group count that prints as "<5" never reaches the kit's chart (its collecting row prints exact
//   counts): the Evidence step draws CollectingFrame instead.
// - A held, paused or closed test is never promised a next look or an estimate. With a look to draw
//   it gets the kit's paused body (the last interval, no projection) and a stop label; without one,
//   CollectingFrame with stopped wording.
// - Past tense once counting has closed or the test is held; "counting has closed" only when the
//   closure is confirmed, otherwise "the result is being confirmed".
import type { ReactNode } from 'react';
import { HOME_HERO } from '../../../content/home.ts';
import { HOME_LINKS } from '../../../content/home-destinations.ts';
import { CollectingFrame } from '@/components/home/CollectingFrame';
import { GuardrailChart } from '@/components/home/GuardrailChart';
import { SPLIT_FAILED, SplitWarning, stopSentence } from '@/components/home/LiveNote';
import { Parts } from '@/components/home/Parts';
import { PublishedCountText } from '@/components/home/PublishedCountText';
import { DecisionZonesDiagram, GroupOutlinesDiagram, HypothesisDiagram } from '@/components/home/StepDiagrams';
import type { TableData } from '@/components/kit/DataTable';
import { Derived, derivedAttr, type DerivedRef } from '@/components/kit/Derived';
import { TextLink } from '@/components/kit/TextLink';
import { EXPERIMENT } from '@/experiment.values';
import { HELD_REASON, NOT_STARTED_REASON } from '@/lib/experiment/live';
import { berlinStartOfDay } from '@/lib/experiment/time';
import {
  confidenceModel,
  confidenceTable,
  contentBody,
  formatIntervalPoints,
  liveFigureState,
  shownSeries,
  type LiveSnapshot,
} from '@/lib/figure/cs-band';
import { formatSignedNumber } from '@/lib/figure/format';
import { MIN_PER_GROUP, type Freshness } from '@/lib/figure/states';
import { berlinDate } from '@/lib/figure/time';
import { publishedCount, type PublishedCount } from './counts';
import type { HomeModel, CheckStatus } from './model';

export type HomeStep = 1 | 2 | 3 | 4 | 5;
export type HomeStepContent = { step: HomeStep; heading: string; body: ReactNode };

const BUILD: readonly DerivedRef[] = ['build'];
const P = 'max-w-text text-base';
const EVIDENCE: HomeStep = 3;

/** The modes whose snapshot holds no data a step may show as observed. */
const UNREAD = new Set<HomeModel['mode']>(['not-started', 'closure-check', 'unavailable', 'settings-unreadable']);
/** The modes whose result is withheld: the step gives the reason instead. */
const WITHHELD = new Set<HomeModel['mode']>(['srm-suppressed', 'aa-failed']);

/** How a test that is not running stopped: the first that applies. */
type Stop = 'running' | 'held' | 'closed' | 'paused' | 'confirming';
function stopOf(m: HomeModel): Stop {
  if (m.held !== null) return 'held';
  if (m.countingClosed && m.closedConfirmed) return 'closed';
  if (m.mode === 'paused') return 'paused';
  if (m.countingClosed) return 'confirming';
  return 'running';
}

const calibrating = (m: HomeModel) => m.calibration !== null;
const pastTense = (m: HomeModel) => m.countingClosed || m.held !== null;
/** Both groups have the minimum: from here on the counts may be printed. */
const countsReached = (m: HomeModel) => typeof m.counts.smaller === 'number' && m.counts.smaller >= MIN_PER_GROUP;
/** A look the chart can draw: enough data and a shown point. */
const drawable = (live: LiveSnapshot) => liveFigureState(live).live?.data === 'enough-data' && shownSeries(live).length > 0;
const smallCount = (m: HomeModel) => m.counts.a === '<5' || m.counts.b === '<5';
/** The result is hidden: a failed split or calibration, by the mode or by the data. */
const withheld = (m: HomeModel) => WITHHELD.has(m.mode) || m.live.phase === 'srm-suppressed' || m.live.phase === 'aa-failed';

/** "the experiment has not started yet, so…" as a sentence. */
const sentence = (reason: string) => `${reason.charAt(0).toUpperCase()}${reason.slice(1)}.`;

function Para({ children }: { children: ReactNode }) {
  return <p className={`${P} mt-3 first:mt-0`}>{children}</p>;
}
const Target = () => <Derived value={MIN_PER_GROUP} unit="count" refs={BUILD} />;
function When({ iso, refs }: { iso: string; refs: readonly DerivedRef[] }) {
  return (
    <time dateTime={iso} {...derivedAttr(refs)}>
      {berlinDate(iso)}
    </time>
  );
}
/** The visual of a step, below its sentences. */
const Visual = ({ children }: { children: ReactNode }) => <div className="mt-6">{children}</div>;

/** The note's own explanation for an unread or withheld test, and for a held one. */
function explanation(m: HomeModel): ReactNode {
  if (m.mode === 'not-started') return sentence(NOT_STARTED_REASON);
  return stopSentence(m);
}

/** The same, without where a failed split check failed, which the Split step gives. */
function shortExplanation(m: HomeModel): ReactNode {
  if (m.mode === 'srm-suppressed') return SPLIT_FAILED;
  if (m.mode === 'held') return stopSentence(m, { splitWarning: false });
  return explanation(m);
}

// ---------------------------------------------------------------------------------------------
// The live chart

/** The freshness a stopped chart is drawn with: paused, so the kit shows the last look unprojected. */
function stoppedFreshness(m: HomeModel, stop: Exclude<Stop, 'running'>): Freshness {
  if (m.live.freshness.kind === 'paused') return m.live.freshness;
  if (stop === 'held' && m.held) return { kind: 'paused', pausedOn: berlinStartOfDay(m.held.on), reason: HELD_REASON[m.held.reason] };
  const on = m.live.decidedOn ?? (m.closed ? berlinStartOfDay(m.closed.day) : m.live.plannedEnd);
  return { kind: 'paused', pausedOn: on, reason: m.closedConfirmed ? 'counting has closed' : 'the result is being confirmed' };
}

/**
 * What the Evidence step's live chart may draw, or null: in every other step, for a placeholder,
 * unreadable settings or a closure check, for a withheld result, while a group count prints as
 * "<5" (keyed off the published counts, never the exact ones), and for a stopped test with no look
 * to draw. A running test goes to the kit as it is; a stopped one with a look is drawn paused.
 */
export function chartSnapshot(m: HomeModel, step: HomeStep): LiveSnapshot | null {
  if (step !== EVIDENCE) return null;
  if (UNREAD.has(m.mode) || withheld(m) || smallCount(m)) return null;
  const stop = stopOf(m);
  if (stop === 'running') return m.live;
  if (!drawable(m.live)) return null;
  return { ...m.live, freshness: stoppedFreshness(m, stop) };
}

/** The chart Figure's table: the kit's, with every count printed by the small-count rule. */
export function homeChartTable(snapshot: LiveSnapshot, refs: readonly DerivedRef[]): TableData {
  const t = confidenceTable(snapshot, refs);
  return { ...t, rows: t.rows.map((row) => row.map((v, i) => (i < 2 && typeof v === 'number' ? publishedCount(v) : v))) };
}

/**
 * The accessible name of a drawn chart of a held or closed test, in words, for the kit's override
 * (the kit's own name would say "until the pause"). Undefined while the test runs or is only paused:
 * the kit's own name is true then. "Until counting stopped" only for a held test or a confirmed
 * closure; an unconfirmed closure, paused or not, gets the neutral form.
 */
export function chartAriaLabel(m: HomeModel, step: HomeStep): string | undefined {
  const snap = chartSnapshot(m, step);
  if (snap === null || (m.held === null && !m.countingClosed)) return undefined;
  const cm = confidenceModel(snap);
  if (cm === null) return undefined;
  const where = cm.includesZero ? 'includes zero' : cm.current.lower > 0 ? 'lies above zero' : 'lies below zero';
  const groups = contentBody(snap) === 'calibration' ? 'the two identical groups' : 'the groups, B minus A,';
  const until = m.held !== null || m.closedConfirmed ? ' until counting stopped' : '';
  return `The difference between ${groups} as views per group grew${until}: the last interval ${where}`;
}

// ---------------------------------------------------------------------------------------------
// The steps

function hypothesis(m: HomeModel, p: string): ReactNode {
  const aa = calibrating(m);
  const opener =
    m.mode === 'not-started'
      ? null
      : aa
        ? 'The case-study cards above are what I will test, after a calibration run in which everyone sees the same page.'
        : pastTense(m)
          ? 'The case-study cards above were the test.'
          : 'The case-study cards above are the test.';
  return (
    <>
      {opener ? <Para>{opener}</Para> : null}
      <Para>The hypothesis: case-study cards that state the finding get more clicks than cards that name the topic.</Para>
      <Visual>
        <HypothesisDiagram kind={aa ? 'identical-headlines' : 'topic-finding'} id={`${p}-hypothesis`} />
      </Visual>
    </>
  );
}

const STATUS_WORD: Record<CheckStatus, string> = { passed: 'passed', failed: 'failed', 'not-evaluated': 'not evaluated in this snapshot' };

/** The split check in one word, from the model's checks only. */
function SplitStatus({ m }: { m: HomeModel }) {
  const { entry, analysed } = m.splitStatus;
  const status: CheckStatus = entry === 'failed' || analysed === 'failed' ? 'failed' : entry === 'passed' && analysed === 'passed' ? 'passed' : 'not-evaluated';
  const tone = status === 'passed' ? 'text-ok' : status === 'failed' ? 'text-warn' : '';
  if (status === 'passed' && m.afterDecisionSrm) {
    // The decision's own check passed; a check after it failed, which the decision does not undo.
    return (
      <Para>
        Split check: <span className={`font-semibold ${tone}`}>passed</span> at the decision;{' '}
        <span className="font-semibold text-warn">a later check failed</span>.
      </Para>
    );
  }
  return (
    <Para>
      Split check: <span className={`font-semibold ${tone}`}>{STATUS_WORD[status]}</span>.
    </Para>
  );
}

/**
 * The counts the Split step may print: both groups at 50 or more. A held test reports only its last
 * clean look (the model keeps only looks with 50 views a group), never counts from the fault on.
 */
function splitCounts(m: HomeModel): { a: PublishedCount; b: PublishedCount } | null {
  if (m.held !== null) {
    const clean = m.live.series.at(-1);
    return clean ? { a: publishedCount(clean.nA), b: publishedCount(clean.nB) } : null;
  }
  return countsReached(m) ? { a: m.counts.a, b: m.counts.b } : null;
}

function split(m: HomeModel, p: string): ReactNode {
  const past = pastTense(m);
  const assigned = `Each counted visit to the home page ${past ? 'was' : 'is'} assigned to group A or B at random, on the server.`;
  const outlines = (
    <Visual>
      <GroupOutlinesDiagram id={`${p}-split`} />
    </Visual>
  );
  if (UNREAD.has(m.mode)) {
    return (
      <>
        <Para>{assigned}</Para>
        <Para>{explanation(m)}</Para>
        {outlines}
      </>
    );
  }
  const stop = stopOf(m);
  // A failed split or calibration is not running, whatever its flags say.
  const counting = stop === 'running' && !withheld(m);
  const shown = splitCounts(m);
  const view = calibrating(m) ? 'This view: one of the two identical groups.' : `This view: group ${m.arm === 'a' ? 'A' : 'B'}.`;
  const livePage = (
    <>
      The <TextLink href={HOME_LINKS.experiment}>Live test page</TextLink> shows the counts that are safe to publish.
    </>
  );
  const under =
    stop === 'held' ? (
      <>
        At least one group had fewer than <Target /> views at the last check that passed.
      </>
    ) : stop === 'closed' ? (
      <>
        At least one group had fewer than <Target /> views when counting stopped.
      </>
    ) : stop === 'confirming' ? (
      <>
        At least one group had fewer than <Target /> views in the analysis.
      </>
    ) : (
      <>
        At least one group has fewer than <Target /> views so far.
      </>
    );
  return (
    <>
      <Para>{assigned}</Para>
      {calibrating(m) && !past ? <Para>While calibrating, both groups see the same page.</Para> : null}
      <Para>{view}</Para>
      {m.mode === 'srm-suppressed' ? <Para>{stopSentence(m)}</Para> : null}
      {shown ? (
        <>
          <Para>
            {stop === 'held' ? 'Analysed views at the last check that passed: ' : counting ? 'Analysed views so far: ' : 'Analysed views counted: '}
            <PublishedCountText value={shown.a} refs={m.refs} /> in group A and <PublishedCountText value={shown.b} refs={m.refs} /> in group B.
          </Para>
          <SplitStatus m={m} />
        </>
      ) : (
        <Para>
          {under} {livePage}
        </Para>
      )}
      {m.split && m.mode !== 'srm-suppressed' ? (
        <Para>
          <SplitWarning split={m.split} refs={m.refs} lead="The split check failed on" counts={m.held === null} />
        </Para>
      ) : null}
      {outlines}
    </>
  );
}

/** What a drawn, stopped chart shows. */
const STOPPED_CHART: Record<Exclude<Stop, 'running'>, string> = {
  held: 'The test stopped, so the chart shows the last interval that passed its checks, with nothing projected.',
  closed: 'Counting has closed, so the chart shows the last interval, with nothing projected.',
  paused: 'Counting is paused, so the chart shows the last interval before the pause, with nothing projected.',
  confirming: 'The result is being confirmed, so the chart shows the last interval, with nothing projected.',
};

function evidence(m: HomeModel, p: string): ReactNode {
  if (UNREAD.has(m.mode) || withheld(m)) return <Para>{shortExplanation(m)}</Para>;
  const stop = stopOf(m);
  const snap = chartSnapshot(m, EVIDENCE);
  const aa = calibrating(m);
  if (stop !== 'running') {
    if (snap !== null) return <Para>{STOPPED_CHART[stop]}</Para>;
    const frame = stop === 'held' || stop === 'closed' ? 'stopped' : stop;
    return (
      <CollectingFrame
        id={`${p}-collecting`}
        counts={m.counts}
        plannedEnd={m.live.plannedEnd}
        plannedEndKind={m.live.plannedEndKind}
        stopped={frame}
        refs={m.refs}
      />
    );
  }
  const nextLook = 'Views from today join the analysis at the next daily look.';
  const running: ReactNode = drawable(m.live) ? (
    aa ? (
      'Both groups see the same page, so the interval is expected to include zero. A new look is added once a day, after the day’s views are complete.'
    ) : confidenceModel(m.live)?.projection !== undefined ? (
      'The interval stays valid however often anyone looks. The lighter band after the last look shows how far it is projected to narrow by the planned number of views.'
    ) : (
      'The interval stays valid however often anyone looks.'
    )
  ) : aa ? (
    nextLook
  ) : (
    <>
      {nextLook} The test ends on <When iso={m.live.plannedEnd} refs={m.refs} /> at the latest, when its six-month cap is reached.
    </>
  );
  return (
    <>
      <Para>{running}</Para>
      {snap === null ? (
        <Visual>
          <CollectingFrame
            id={`${p}-collecting`}
            counts={m.counts}
            plannedEnd={m.live.plannedEnd}
            plannedEndKind={m.live.plannedEndKind}
            stopped={false}
            refs={m.refs}
          />
        </Visual>
      ) : null}
    </>
  );
}

function guardrails(m: HomeModel, p: string): ReactNode {
  const g = EXPERIMENT.guardrail;
  return (
    <>
      <Para>
        Quick exits are entry views that leave within <Derived value={g.quickExitSeconds} unit="count" refs={BUILD} /> seconds without
        interacting. The guardrail compares them, B minus A, with a <Derived value={1 - EXPERIMENT.alpha} unit="share" refs={BUILD} />{' '}
        confidence sequence, against a limit of{' '}
        <span data-num="" {...derivedAttr(BUILD)}>
          {formatSignedNumber(g.marginPp, 1)}
        </span>{' '}
        points.
      </Para>
      <Para>
        Checked from <Target /> views per group. The look waits for <Target /> analysed views in each group; the quick-exit rate is
        computed on entry views.
      </Para>
      {calibrating(m) ? <Para>The calibration publishes no guardrail interval.</Para> : null}
      <Para>Page speed parity is checked in lab runs.</Para>
      <Visual>
        <GuardrailChart model={m} id={`${p}-guardrail`} />
      </Visual>
    </>
  );
}

const OUTCOME_LEAD = {
  'ship-b': 'Ship B.',
  'stop-for-harm': 'Stop for harm.',
  inconclusive: 'Inconclusive at the limit; this is not evidence of no effect.',
} as const;

function decisionText(m: HomeModel): ReactNode {
  if (UNREAD.has(m.mode) || withheld(m) || m.mode === 'held') return shortExplanation(m);
  if (m.mode === 'paused') return 'The experiment on this site is paused, so no verdict is shown here.';
  const closed = m.closedConfirmed ? 'Counting has closed.' : 'The result is being confirmed.';
  if (m.outcome !== null) {
    const last = drawable(m.live) ? shownSeries(m.live).at(-1)! : null;
    return (
      <>
        {OUTCOME_LEAD[m.outcome]}{' '}
        {last ? (
          <>
            The final interval runs from{' '}
            <span data-num="" {...derivedAttr(m.refs)}>
              {formatIntervalPoints(last.lower, last.upper, { awayFromZero: m.outcome !== 'inconclusive' })}
            </span>{' '}
            points.
          </>
        ) : (
          'Too few views to report an interval.'
        )}{' '}
        {closed}
        {m.afterDecisionSrm ? ' A later split check failed; the recorded decision is unchanged.' : null}
      </>
    );
  }
  if (m.countingClosed) return m.closedConfirmed ? 'Counting has closed; no decision is recorded in this snapshot.' : 'The result is being confirmed.';
  if (calibrating(m)) return m.calibration?.ready === true ? 'The calibration checks have passed.' : 'No decision before the calibration checks pass.';
  return drawable(m.live)
    ? 'Ship B only when the primary interval is above zero and the quick-exit guardrail passes and the split check passes; stop for harm when the interval is below zero; otherwise report inconclusive at the limit.'
    : 'No result is shown before enough data arrives.';
}

function decision(m: HomeModel, p: string): ReactNode {
  const calibrationChecks = calibrating(m) && !UNREAD.has(m.mode) && !withheld(m) && m.mode !== 'paused' && countsReached(m);
  return (
    <>
      <Para>{decisionText(m)}</Para>
      {calibrationChecks ? <SplitStatus m={m} /> : null}
      <Visual>
        <DecisionZonesDiagram id={`${p}-decision`} />
      </Visual>
      <p data-closing-proof="" className={`${P} mt-6`}>
        <Parts parts={HOME_HERO.proof} />{' '}
        <span className="whitespace-nowrap">
          <TextLink href={HOME_LINKS.whySoMany}>{HOME_HERO.whySoMany}</TextLink>
        </span>
      </p>
    </>
  );
}

/**
 * The five steps for a model, in order. `idPrefix` starts every element id in the bodies (default
 * "home"), so the same steps can be rendered twice in one document (for example sticky and stacked
 * frames) without a repeated id.
 */
export function homeSteps(m: HomeModel, { idPrefix = 'home' }: { idPrefix?: string } = {}): readonly HomeStepContent[] {
  const p = idPrefix;
  return [
    { step: 1, heading: 'Hypothesis', body: hypothesis(m, p) },
    { step: 2, heading: 'Split', body: split(m, p) },
    { step: 3, heading: 'Evidence', body: evidence(m, p) },
    { step: 4, heading: 'Guardrails', body: guardrails(m, p) },
    { step: 5, heading: 'Decision', body: decision(m, p) },
  ];
}
