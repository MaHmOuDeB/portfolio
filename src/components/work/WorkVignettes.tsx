// The small sketches on the Work cards, one per entry that clearly has one. Each is decorative (the
// frame's Vignette hides it from assistive technology), says "Illustration" and prints no digit:
// positions are percentages in custom properties, never figures. Server-safe.
import type { ReactNode } from 'react';
import { IntervalMark, MiniRow, Tag, Tick, Vignette } from '@/components/frame';
import { HOME_LINKS } from '../../../content/home-destinations.ts';

/** Interval rows: three results read against a guardrail. */
function IntervalRows() {
  return (
    <>
      <MiniRow label="Primary" tag={<Tag tone="tint">Clear</Tag>}>
        <IntervalMark left={52} width={30} dot={66} />
      </MiniRow>
      <MiniRow label="Second" tag={<Tag>Neutral</Tag>}>
        <IntervalMark left={30} width={40} dot={50} />
      </MiniRow>
      <MiniRow label="Guard" tag={<Tag>Held</Tag>}>
        <IntervalMark left={36} width={28} dot={48} />
      </MiniRow>
    </>
  );
}

/** A cohort grid: rows of customers, columns of months, each cell a little fainter. */
const COHORT_ROWS = [
  [100, 70, 55, 45, 38, 32],
  [100, 66, 50, 40, 34],
  [100, 62, 46, 38],
  [100, 58, 44],
  [100, 55],
] as const;
const OPACITY: Record<number, string> = {
  100: 'opacity-100',
  70: 'opacity-70',
  66: 'opacity-65',
  62: 'opacity-60',
  58: 'opacity-55',
  55: 'opacity-50',
  50: 'opacity-45',
  46: 'opacity-40',
  45: 'opacity-40',
  44: 'opacity-40',
  40: 'opacity-35',
  38: 'opacity-35',
  34: 'opacity-30',
  32: 'opacity-30',
};
function CohortGrid() {
  return (
    <div className="grid gap-1">
      {COHORT_ROWS.map((row, i) => (
        <div key={i} className="flex gap-1">
          {row.map((v, j) => (
            <span key={j} className={`block h-[18px] flex-1 rounded-[3px] bg-series-1 ${OPACITY[v]}`} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** An event list: a name, a quiet track and a tag per row. */
function EventList() {
  return (
    <>
      {(['open', 'tap', 'save'] as const).map((name) => (
        <MiniRow key={name} label={name} tag={<Tag>event</Tag>}>
          <span className="absolute inset-y-[7px] left-0 right-6 rounded-sm bg-track" />
        </MiniRow>
      ))}
    </>
  );
}

/** Agents with one blocked claim. */
function AgentRows() {
  return (
    <>
      <MiniRow label="Write" tag={<Tick />}>
        <span className="absolute inset-y-[7px] left-0 right-12 rounded-sm bg-track" />
      </MiniRow>
      <MiniRow label="Audit" tag={<Tick />}>
        <span className="absolute inset-y-[7px] left-0 right-20 rounded-sm bg-track" />
      </MiniRow>
      <MiniRow label="Review" tag={<Tag tone="tint">Blocked</Tag>}>
        <span className="absolute inset-y-[7px] left-0 right-6 rounded-sm bg-track" />
      </MiniRow>
    </>
  );
}

/** A workflow: three nodes joined by lines. */
function Workflow() {
  const node = 'rounded-md border border-hairline-strong bg-surface px-2.5 py-1.5 font-semibold';
  const link = 'h-px flex-1 bg-hairline-strong';
  return (
    <div className="flex h-full items-center gap-2 pb-4">
      <span className={node}>Intake</span>
      <span className={link} />
      <span className={node}>Check</span>
      <span className={link} />
      <span className={node}>Alert</span>
    </div>
  );
}

/** Copy variants from one brief. */
function Variants() {
  return (
    <div className="grid gap-2">
      {(['A', 'B', 'C'] as const).map((v, i) => (
        <div key={v} className="flex items-center gap-2.5 rounded-md border border-hairline bg-bg px-2.5 py-2">
          <Tag>{v}</Tag>
          <span className="grid flex-1 gap-1">
            <span className="h-1.5 rounded-sm bg-track" />
            <span className={`h-1.5 rounded-sm bg-track ${i === 0 ? 'w-3/4' : i === 1 ? 'w-1/2' : 'w-2/3'}`} />
          </span>
        </div>
      ))}
    </div>
  );
}

/** A table of checks, each passed. */
function Checks() {
  return (
    <>
      {(['Nulls', 'Range', 'Dupes'] as const).map((name) => (
        <MiniRow key={name} label={name} tag={<Tick />}>
          <span className="absolute inset-y-[7px] left-0 right-10 rounded-sm bg-track" />
        </MiniRow>
      ))}
    </>
  );
}

const SKETCHES: Record<string, () => ReactNode> = {
  [HOME_LINKS.whySoMany]: IntervalRows,
  [HOME_LINKS.retention]: CohortGrid,
  [HOME_LINKS.pulse]: EventList,
  [HOME_LINKS.docproof]: AgentRows,
  [HOME_LINKS.n8n]: Workflow,
  [HOME_LINKS.marketingws]: Variants,
  '/work/weather': Checks,
};

/** The vignette for a Work entry, or undefined where no sketch fits. */
export function workVignette(href: string): ReactNode | undefined {
  const Sketch = SKETCHES[href];
  return Sketch ? (
    <Vignette>
      {/* The sheet bleeds off the card's right edge, so the sketch keeps clear of it. */}
      <div className="h-full pr-8">
        <Sketch />
      </div>
    </Vignette>
  ) : undefined;
}
