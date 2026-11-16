// The Live test page's first screen after the opening: a white hairline card across the rail with
// the test's three steps and where it stands.
//
// - The track names the pre-registration's phases in the page's own words (Calibration, A/B test,
//   Decision). The current step is marked by more than colour: a chip with a word, a heavier name,
//   an ink rule and `aria-current`. A finished step carries a check and the word "Done". When the
//   page cannot say which step the test is at (not started, counts not loaded, a stored result being
//   checked), no step is marked.
// - The cells give the state in words with the state's own sentences (StateExplanation), the
//   progress and the next date. Each prints only what the page's display shape already holds; a
//   cell with no value in a state is left out, never drawn empty.
//
// Server-safe, no hooks. `#where-it-stands` holds what the page says about the state; the track
// around it names every phase, so it sits outside that element.
import type { ReactNode } from 'react';
import { Chip } from '@/components/frame';
import { PublishedCountText } from '@/components/home/PublishedCountText';
import { Derived, derivedAttr, type DerivedRef } from '@/components/kit/Derived';
import { Icon } from '@/components/kit/Icon';
import { berlinTime } from '@/lib/figure/time';
import { MIN_PER_GROUP } from '@/lib/figure/states';
import type { HomeMode } from '@/lib/home/model';
import type { LivePageDisplay } from '@/lib/live-page/model';
import { StateExplanation } from './StateExplanation';
import { BUILD, When } from './Values';

export const STEPS = [
  { id: 'calibration', name: 'Calibration' },
  { id: 'ab', name: 'A/B test' },
  { id: 'decision', name: 'Decision' },
] as const;
export type StepId = (typeof STEPS)[number]['id'];

export const DECISION_WORDS = { 'ship-b': 'Ship B', 'stop-for-harm': 'Stop for harm', inconclusive: 'Inconclusive at the limit' } as const;

const RUNNING: readonly HomeMode[] = ['before-data', 'calibration', 'ab'];
/** The states in which the page cannot say which step the test is at. */
const NO_STEP: readonly HomeMode[] = ['not-started', 'unavailable', 'closure-check'];
const STOPPED: readonly HomeMode[] = ['held', 'aa-failed', 'settings-unreadable'];
/** The states that print the planned or earliest end (as the decision lines do). */
export const WITH_END: readonly HomeMode[] = ['before-data', 'calibration', 'ab', 'paused', 'settings-unreadable', 'srm-suppressed', 'ship-b', 'stop-for-harm', 'inconclusive'];

/** Counting is open and no decision is recorded: the test is collecting or running. */
export const isRunning = (d: LivePageDisplay): boolean => RUNNING.includes(d.mode) && !d.countingClosed && d.outcome === null;

/** The step the test is at, or null when the page cannot say. */
export function currentStep(d: LivePageDisplay): StepId | null {
  if (d.outcome !== null) return 'decision';
  if (NO_STEP.includes(d.mode)) return null;
  return d.configPhase;
}

/** The word on the current step's chip. */
function stepWord(d: LivePageDisplay): 'Now' | 'Paused' | 'Stopped' | 'Closed' | 'Reached' {
  if (d.outcome !== null) return 'Reached';
  if (d.mode === 'paused') return 'Paused';
  if (STOPPED.includes(d.mode)) return 'Stopped';
  // Only a confirmed stop is called closed; until then the step is where the test is now.
  if (d.countingClosed && d.closedConfirmed) return 'Closed';
  return 'Now';
}

/** The state in a few words, from the state's own sentence. */
export function stateWords(d: LivePageDisplay): string {
  if (d.outcome !== null) return DECISION_WORDS[d.outcome];
  switch (d.mode) {
    case 'not-started':
      return 'Not started';
    case 'closure-check':
      return 'Checking the stored result';
    case 'unavailable':
      return 'Counts not loaded';
    case 'settings-unreadable':
      return 'Counting is stopped';
    case 'held':
      return 'Stopped for a data fault';
    case 'srm-suppressed':
      return 'Split check failed';
    case 'aa-failed':
      return 'Calibration stopped';
    case 'paused':
      return 'Paused';
    default:
      if (d.countingClosed) return d.closedConfirmed ? 'Counting has closed' : 'Result being confirmed';
      return d.configPhase === 'ab' ? 'A/B test running' : 'Calibrating';
  }
}

const LABEL = 'text-xs font-medium text-muted';
const VALUE = 'mt-1 text-xl font-semibold';
const NOTE = 'mt-1 text-sm text-muted';

function Track({ d }: { d: LivePageDisplay }) {
  const current = currentStep(d);
  const at = current === null ? -1 : STEPS.findIndex((s) => s.id === current);
  return (
    // role="list": WebKit drops the list role from a list drawn without bullets.
    <ol role="list" data-live-track="" aria-label="The steps of the test" className="mt-4 grid gap-3 sm:grid-cols-3 sm:gap-0">
      {STEPS.map((step, i) => {
        const state = i === at ? 'current' : i < at ? 'done' : 'upcoming';
        return (
          <li
            key={step.id}
            data-step={step.id}
            data-step-state={state}
            aria-current={state === 'current' ? 'step' : undefined}
            className={`flex min-h-(--size-target) flex-wrap items-center gap-x-2.5 gap-y-1 border-t-2 pt-3 sm:pr-4 ${state === 'upcoming' ? 'border-hairline-strong' : 'border-ink'}`}
          >
            {state === 'done' ? (
              <span aria-hidden="true" className="inline-flex flex-none text-ink">
                <Icon name="check" />
              </span>
            ) : state === 'upcoming' ? (
              <span aria-hidden="true" className="size-2.5 flex-none rounded-full border border-hairline-strong" />
            ) : null}
            <span className={state === 'current' ? 'text-base font-semibold' : state === 'done' ? 'text-base' : 'text-base text-muted'}>{step.name}</span>
            {state === 'current' ? <Chip dot={isRunning(d) ? 'live' : 'none'}>{stepWord(d)}</Chip> : null}
            {state === 'done' ? <span className="text-sm text-muted">Done</span> : null}
          </li>
        );
      })}
    </ol>
  );
}

/** How far the collecting has got: toward the first estimate, then the analysed views per group. */
function Progress({ d }: { d: LivePageDisplay }): ReactNode {
  const target = <Derived value={MIN_PER_GROUP} unit="count" refs={BUILD} />;
  const reached = typeof d.counts.smaller === 'number' && d.counts.smaller >= MIN_PER_GROUP;
  return (
    <div data-status-cell="progress">
      <dt className={LABEL}>Progress</dt>
      {reached ? (
        <>
          <dd className={VALUE}>
            <PublishedCountText value={d.counts.a} refs={d.refs} /> and <PublishedCountText value={d.counts.b} refs={d.refs} />
          </dd>
          <dd className={NOTE}>analysed views in group A and group B. Both groups have reached {target} views.</dd>
        </>
      ) : (
        <>
          <dd className={VALUE}>
            <PublishedCountText value={d.counts.smaller} refs={d.refs} /> of {target}
          </dd>
          <dd className={NOTE}>views in the smaller group. Estimates appear at {target} views per group.</dd>
        </>
      )}
    </div>
  );
}

/** The next date the page has: the day of the decision, or the planned or earliest end. */
function NextDate({ d }: { d: LivePageDisplay }): ReactNode {
  if (d.outcome !== null) {
    return d.decidedOn !== null ? (
      <div data-status-cell="date">
        <dt className={LABEL}>Decided on</dt>
        <dd className={VALUE}>
          <When iso={d.decidedOn} refs={d.refs} />
        </dd>
      </div>
    ) : null;
  }
  if (d.public.source === 'unavailable' || !WITH_END.includes(d.mode)) return null;
  const configRefs: readonly DerivedRef[] = d.refs.includes('simulated') ? ['simulated'] : BUILD;
  const earliest = d.plannedEndKind === 'earliest';
  return (
    <div data-status-cell="date">
      <dt className={LABEL}>{earliest ? 'Time limit' : 'Planned end'}</dt>
      <dd className={VALUE}>
        <When iso={d.plannedEnd} refs={configRefs} withYear={earliest} />
      </dd>
      {/* Only while the test is collecting: a stopped or paused test is promised no decision. */}
      {earliest && isRunning(d) ? <dd className={NOTE}>A decision can end the test sooner.</dd> : null}
    </div>
  );
}

const COLUMNS = ['', '', 'md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]', 'md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]'] as const;

export function StatusCard({ d }: { d: LivePageDisplay }) {
  const read = d.public.source === 'store' || d.public.source === 'local';
  const progress = d.public.source !== 'unavailable' && isRunning(d) ? <Progress d={d} /> : null;
  const date = NextDate({ d });
  const cells = 1 + (progress === null ? 0 : 1) + (date === null ? 0 : 1);
  return (
    <section id="status" aria-labelledby="status-title" data-live-status="" className="mt-2 rounded-xl border border-hairline bg-surface p-5 md:p-8">
      <h2 id="status-title" className="text-sm font-medium text-muted">
        Where the test stands
      </h2>
      <Track d={d} />
      <div id="where-it-stands" className="mt-6">
        <dl data-status-cells="" data-count={cells} className={`grid grid-cols-1 gap-6 md:gap-8 ${COLUMNS[cells]}`}>
          <div data-status-cell="state">
            <dt className={LABEL}>Status</dt>
            <dd data-status-words="" className={VALUE}>
              {stateWords(d)}
            </dd>
            <dd className="mt-2">
              <StateExplanation model={d} />
            </dd>
          </div>
          {progress}
          {date}
        </dl>
        {read ? (
          <p className="mt-6 border-t border-hairline pt-4 text-sm text-muted">
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
