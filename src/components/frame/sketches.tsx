// The site's vignettes, one per project and one per "How I test" panel: small schematic sketches at
// the bottom of a card (Home and the Work index draw the same sketch for the same project), in a panel
// or beside the site band, each inside the frame's Vignette (decorative, aria-hidden, with the
// visible word "Illustration"). A sketch never prints a digit, a real figure or an Audible metric
// name; positions and shades live in style values only. The Pulse sketch names three events of the
// Pulse export, typed against its event names. Server-safe.
import type { CSSProperties, ReactNode } from 'react';
import { IntervalMark, MiniRow, Tag, Tick } from './marks';
import { Vignette } from './Vignette';
import type { PulseEventName } from '@/lib/pulse/names';

/** The sketch's own small head: a bold name and a muted note. */
function Head({ name, note }: { name: string; note: string }) {
  return (
    <div className="flex items-center justify-between gap-3 pb-2">
      <span className="font-semibold">{name}</span>
      <span className="min-w-0 text-muted">{note}</span>
    </div>
  );
}

function Sketch({ kind, children }: { kind: string; children: ReactNode }) {
  return (
    <Vignette>
      <div data-sketch={kind} className="pr-8">
        {children}
      </div>
    </Vignette>
  );
}

/**
 * A plain row (wider than MiniRow's label column): a mark, a name and an optional end. When the
 * name and the end do not fit on one line of a narrow card, the end moves under the name, so the
 * two never overlap.
 */
function Row({ mark, name, end }: { mark: ReactNode; name: string; end?: ReactNode }) {
  return (
    <div className="flex min-h-8.5 flex-wrap items-center gap-x-2 gap-y-1 border-b border-hairline py-1 leading-tight">
      <span className="flex w-4 shrink-0">{mark}</span>
      <span data-mini-label="" className="min-w-0 flex-auto">
        {name}
      </span>
      {end ? <span className="ml-auto flex">{end}</span> : null}
    </div>
  );
}

/** A hollow circle: a step that has not run. */
const Waiting = () => <span className="size-4 rounded-pill border border-hairline-strong" />;

/** A filled bar from the start of a MiniRow's track, `w` percent long. */
const Bar = ({ w }: { w: number }) => (
  <span className="absolute inset-y-1.5 left-0 rounded-sm bg-series-1" style={{ width: `${w}%` } as CSSProperties} />
);

/** A box with a word, joined to its neighbours by hairlines. */
const Node = ({ children }: { children: string }) => (
  <span data-node="" className="inline-flex h-7 shrink-0 items-center rounded-md border border-hairline-strong bg-surface px-2 font-medium">
    {children}
  </span>
);
const Link = () => <span className="h-px min-w-3 flex-1 bg-ink" />;

// Experiments ---------------------------------------------------------------------------------

/**
 * Audible: the process, never a result (the results are confidential): four steps of a test, each
 * ticked, with no outcome word.
 */
export function ProcessSketch() {
  return (
    <Sketch kind="process">
      <Row mark={<Tick />} name="Sample size" end={<Tag>planned</Tag>} />
      <Row mark={<Tick />} name="Run time" end={<Tag>set</Tag>} />
      <Row mark={<Tick />} name="Guardrails" end={<Tag>defined</Tag>} />
      <Row mark={<Tick />} name="Recommendation" end={<Tag>written</Tag>} />
    </Sketch>
  );
}

const COHORT_ROWS = 5;
const COHORT_COLS = 8;

/** Retention: a triangle of cohort cells, fading with age (the shade is a made-up shape, not data). */
export function CohortsSketch() {
  const cells: { key: string; opacity: number }[] = [];
  for (let r = 0; r < COHORT_ROWS; r++) {
    for (let c = 0; c < COHORT_COLS; c++) {
      const opacity = c > COHORT_COLS - 1 - r ? 0 : Math.max(0.08, (1 - c / COHORT_COLS) * (1 - r * 0.12) * 0.95);
      cells.push({ key: `${r}-${c}`, opacity: Math.round(opacity * 100) / 100 });
    }
  }
  return (
    <Sketch kind="cohorts">
      <Head name="Cohorts" note="share who order again" />
      <div className="grid grid-cols-8 gap-0.75">
        {cells.map((cell) => (
          <span key={cell.key} data-cohort-cell="" className="h-4 rounded-sm bg-series-1" style={{ opacity: cell.opacity }} />
        ))}
      </div>
    </Sketch>
  );
}

const EVENTS: readonly { name: PulseEventName; tag: string; tint?: boolean }[] = [
  { name: 'Viewed Dashboard', tag: 'activation' },
  { name: 'Applied Filter', tag: 'engagement', tint: true },
  { name: 'Exported Report', tag: 'intent' },
];

/** Pulse: three of its events, each tagged with the kind of question it answers. */
export function EventsSketch() {
  return (
    <Sketch kind="events">
      <Head name="Events" note="each answers a question" />
      <div className="grid gap-1.5">
        {EVENTS.map((e) => (
          <div key={e.name} data-event={e.name} className="flex h-6.5 items-center justify-between rounded-md border border-hairline px-2">
            <span className="min-w-0">{e.name}</span>
            <Tag tone={e.tint ? 'tint' : 'plain'}>{e.tag}</Tag>
          </div>
        ))}
      </div>
    </Sketch>
  );
}

/** Weather: a table of data-quality checks, each passed. */
export function ChecksSketch() {
  return (
    <Sketch kind="checks">
      {(['Nulls', 'Range', 'Dupes'] as const).map((name) => (
        <MiniRow key={name} label={name} tag={<Tick />}>
          <span className="absolute inset-y-1.75 left-0 right-10 rounded-sm bg-track" />
        </MiniRow>
      ))}
    </Sketch>
  );
}

/** The experiment cards' sketches, by study. */
export const CASE_SKETCHES = {
  audible: ProcessSketch,
  retention: CohortsSketch,
  pulse: EventsSketch,
} as const;

// Automation ----------------------------------------------------------------------------------

/** The test-account tool: the generic mechanism (record, replay, verify), never the tool's own steps. */
export function StepsSketch() {
  return (
    <Sketch kind="steps">
      <Head name="Steps" note="recorded once, replayed" />
      <Row mark={<Tick />} name="Record" />
      <Row mark={<Tick />} name="Replay" />
      <Row mark={<Tick />} name="Verify" />
    </Sketch>
  );
}

/** Docproof: three agents, the auditor blocking one claim. */
export function AgentsSketch() {
  return (
    <Sketch kind="agents">
      <Head name="Agents" note="each one checks the last" />
      <Row mark={<Tick />} name="Author" end={<span className="text-muted">draft</span>} />
      <Row mark={<Waiting />} name="Claim auditor" end={<Tag tone="tint">blocked: unsupported claim</Tag>} />
      <Row mark={<Waiting />} name="Reviewer" end={<span className="text-muted">waiting</span>} />
    </Sketch>
  );
}

/** n8n: a three-node workflow. */
export function WorkflowSketch() {
  return (
    <Sketch kind="workflow">
      <Head name="Workflow" note="e-invoice intake" />
      <div className="flex items-center pt-3">
        <Node>Intake</Node>
        <Link />
        <Node>Validate</Node>
        <Link />
        <Node>Alert</Node>
      </div>
    </Sketch>
  );
}

/** MarketingWS: one brief fanning out to three copy variants (shapes, no words). */
export function VariantsSketch() {
  return (
    <Sketch kind="variants">
      <Head name="One brief" note="three copy variants" />
      <div className="flex items-center gap-0">
        <Node>Brief</Node>
        <span className="h-px w-3 shrink-0 bg-ink" />
        <div className="grid min-w-0 flex-1 gap-1.5 border-l border-ink pl-3">
          {[70, 52, 84].map((w) => (
            <span key={w} data-variant="" className="grid h-6.5 content-center gap-1 rounded-md border border-hairline px-2">
              <span className="h-1 rounded-sm bg-hairline-strong" style={{ width: `${w}%` }} />
              <span className="h-1 rounded-sm bg-track" style={{ width: `${w - 24}%` }} />
            </span>
          ))}
        </div>
      </div>
    </Sketch>
  );
}

/** The automation cards' sketches, by card id. */
export const AUTOMATION_SKETCHES: Record<string, () => ReactNode> = {
  automation: StepsSketch,
  docproof: AgentsSketch,
  n8n: WorkflowSketch,
  marketingws: VariantsSketch,
};

// How I test ----------------------------------------------------------------------------------

/** Plan: the inputs of a sample size, fixed before the start. */
export function PlanSketch() {
  return (
    <Sketch kind="plan">
      <Head name="Sample size" note="set before the start" />
      <MiniRow label="Effect" tag={<Tag>smallest</Tag>}>
        <Bar w={34} />
      </MiniRow>
      <MiniRow label="Power" tag={<Tag>planned</Tag>}>
        <Bar w={72} />
      </MiniRow>
      <MiniRow label="Run" tag={<Tag tone="tint">fixed</Tag>}>
        <Bar w={56} />
      </MiniRow>
    </Sketch>
  );
}

/** Read: the primary metric and a guardrail, as intervals. */
export function ReadSketch() {
  return (
    <Sketch kind="read">
      <Head name="Readout" note="the metric and its guardrail" />
      <MiniRow label="Metric" tag={<Tag tone="tint">higher</Tag>}>
        <IntervalMark left={36} width={44} dot={58} />
      </MiniRow>
      <MiniRow label="Guard" tag={<Tag>intact</Tag>}>
        <IntervalMark left={28} width={34} dot={44} />
      </MiniRow>
    </Sketch>
  );
}

/** Recommend: the written recommendation. */
export function RecommendSketch() {
  return (
    <Sketch kind="recommend">
      <Head name="Recommendation" note="written down" />
      <p className="mt-2 text-xl font-semibold">Ship it.</p>
      <span className="mt-3 inline-flex h-7 items-center gap-2 rounded-pill bg-ink px-3 text-surface">
        <span className="size-1.75 rounded-pill bg-series-2" />
        reasons attached
      </span>
    </Sketch>
  );
}

export const HOW_SKETCHES = {
  plan: PlanSketch,
  read: ReadSketch,
  recommend: RecommendSketch,
} as const;

// The site band -------------------------------------------------------------------------------

/** A confidence band narrowing around the difference, over a dashed zero line. No text in the SVG. */
export function ConfidenceSketch() {
  return (
    <Sketch kind="confidence">
      <Head name="Confidence over time" note="B minus A, with its band" />
      <svg viewBox="0 0 200 90" preserveAspectRatio="none" className="mt-1 h-28 w-full" aria-hidden="true">
        <line x1="0" y1="60" x2="200" y2="60" stroke="var(--color-muted)" strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
        <path d="M0 8 C60 22 120 30 200 34 L200 52 C120 58 60 70 0 86 Z" fill="var(--color-series-ghost)" />
        <path d="M0 47 C60 46 120 44 200 43" fill="none" stroke="var(--color-series-1)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
    </Sketch>
  );
}
