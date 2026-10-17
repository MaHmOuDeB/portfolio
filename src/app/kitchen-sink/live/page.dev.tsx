// Dev-only, like the page above it: every state of a live Figure, one Figure per phase × amount of
// data × freshness × runtime (8 × 2 × 3 × 3 = 144), with fictional data. The page is static: a live
// Figure has no controls, so nothing here waits for an island. `interacting` needs a real visitor
// action and is covered by the interaction specs. Specimen ids name their axes:
// live--{phase}--{data}--{freshness}--{runtime}.
import type { Metadata } from 'next';
import { ConfidenceChart } from '@/components/kit/ConfidenceChart';
import { derivedAttr } from '@/components/kit/Derived';
import { Figure } from '@/components/kit/Figure';
import { LiveStateBody } from '@/components/kit/LiveStateBody';
import { TextLink } from '@/components/kit/TextLink';
import { confidenceTable, contentBody, liveFigureState } from '@/lib/figure/cs-band';
import {
  DATA_AMOUNTS,
  LIVE_PHASES,
  RUNTIMES,
  resolveFigureBody,
  type DataAmount,
  type FigureRuntime,
  type LivePhase,
} from '@/lib/figure/states';
import { FRESHNESS_KINDS, liveFixture, SINK_REFS, type FreshnessKind } from '../_parts/live-fixtures';
import { Specimen } from '../_parts/Specimen';

export const metadata: Metadata = {
  title: 'Live Figure states',
  robots: { index: false, follow: false },
};

const PHASES: Record<LivePhase, { title: string; note: string }> = {
  'before-data': { title: 'Before data', note: 'No views yet: the pre-registered wait for the first estimate.' },
  calibration: { title: 'Calibration', note: 'The A/A phase: both groups see the same page.' },
  'aa-failed': { title: 'Calibration stopped', note: 'The A/A phase failed its check and restarts on a set date.' },
  ab: { title: 'A/B test', note: 'The test is running: the interval narrows as views arrive.' },
  inconclusive: { title: 'Inconclusive', note: 'Neither rule held by the six-month cap: the likely result.' },
  'ship-b': { title: 'Ship B', note: 'The lower end of the interval is above zero.' },
  'stop-for-harm': { title: 'Stopped for harm', note: 'The upper end of the interval is below zero.' },
  'srm-suppressed': { title: 'Split check failed', note: 'The counts are shown and the verdict is hidden.' },
};
const DATA: Record<DataAmount, string> = { 'low-data': 'Low data', 'enough-data': 'Enough data' };
const FRESH: Record<FreshnessKind, string> = { fresh: 'fresh', stale: 'stale', paused: 'paused' };
const RUNTIME: Record<FigureRuntime, string> = {
  default: 'default',
  'no-js': 'without JavaScript',
  error: 'chart could not load',
};

/** Combinations the rules never produce, drawn so every body is still deliberate. */
function cannotOccur(phase: LivePhase, data: DataAmount): string | undefined {
  if (phase === 'before-data' && data === 'enough-data') return 'Cannot occur: before data there are no views.';
  if ((phase === 'ship-b' || phase === 'stop-for-harm') && data === 'low-data') {
    return 'Cannot occur: no verdict is reached before the estimate shows.';
  }
  return undefined;
}

const TITLE = 'The difference between the groups, so far.';
const SIMULATED = derivedAttr(SINK_REFS);
const CAPTION = (
  <>
    Fictional counts for the kitchen sink, not this site&apos;s experiment. The band is the{' '}
    <span {...SIMULATED}>95%</span> confidence sequence of B − A in percentage points, narrowed at each look and never
    widened, and projected to the six-month cap.
  </>
);

function LiveFigure({ id, phase, data, fresh, runtime }: { id: string; phase: LivePhase; data: DataAmount; fresh: FreshnessKind; runtime: FigureRuntime }) {
  const snapshot = liveFixture(phase, data, fresh);
  const state = liveFigureState(snapshot, runtime);
  return (
    <Figure
      id={id}
      titleLevel={4}
      title={TITLE}
      state={state}
      provenance="live"
      table={confidenceTable(snapshot, SINK_REFS)}
      caption={CAPTION}
      // The forced error shows the build-time chart: what the data calls for, never a hidden verdict.
      // Elsewhere the server-rendered body is the preview, so the page carries each chart once.
      preview={
        runtime === 'error' ? (
          <ConfidenceChart id={`${id}-preview`} snapshot={snapshot} body={contentBody(snapshot)} refs={SINK_REFS} />
        ) : undefined
      }
    >
      <LiveStateBody id={id} snapshot={snapshot} body={resolveFigureBody(state)} refs={SINK_REFS} />
    </Figure>
  );
}

function PhaseSection({ phase }: { phase: LivePhase }) {
  const { title, note } = PHASES[phase];
  return (
    <section id={`live-${phase}`} data-section={`live-${phase}`} aria-labelledby={`live-${phase}-title`} className="mt-12">
      <h2 id={`live-${phase}-title`} className="text-xl font-semibold">
        {title}
      </h2>
      <p className="mt-1 max-w-text text-sm text-muted">{note}</p>
      {DATA_AMOUNTS.flatMap((data) =>
        FRESHNESS_KINDS.flatMap((fresh) =>
          RUNTIMES.map((runtime) => {
            const id = `live--${phase}--${data}--${fresh}--${runtime}`;
            return (
              <Specimen key={id} id={id} title={`${DATA[data]}, ${FRESH[fresh]}, ${RUNTIME[runtime]}`} note={cannotOccur(phase, data)}>
                <LiveFigure id={id} phase={phase} data={data} fresh={fresh} runtime={runtime} />
              </Specimen>
            );
          }),
        ),
      )}
    </section>
  );
}

export default function KitchenSinkLive() {
  return (
    <div className="py-section">
      <h1 className="text-2xl font-semibold md:text-3xl">Live Figure states</h1>
      <p className="mt-3 max-w-text text-base text-muted">
        Every phase, amount of data, freshness and runtime of a live Figure, one Figure for each combination. This page
        exists only in the test build. All data on it is fictional.
      </p>
      <nav aria-label="Phases" className="mt-6">
        <ul className="flex flex-wrap gap-x-6">
          {LIVE_PHASES.map((phase) => (
            <li key={phase}>
              <TextLink href={`#live-${phase}`} standalone>
                {PHASES[phase].title}
              </TextLink>
            </li>
          ))}
        </ul>
      </nav>
      {LIVE_PHASES.map((phase) => (
        <PhaseSection key={phase} phase={phase} />
      ))}
    </div>
  );
}
