// The Lab's four card sketches, one per check: sample bars, two split bars, the rising peeking line
// and the falling exaggeration curve. Each sits in the frame's Vignette (decorative, aria-hidden,
// unlabelled) and is drawn from the frame's marks and plain shapes. A sketch
// never prints a digit or a real figure: lengths and positions are made-up shapes in style values.
// Server-safe.
import type { CSSProperties, ReactNode } from 'react';
import { MiniRow, Tag, Vignette } from '@/components/frame';
import { EN_SKETCH, type SketchText } from '@/lib/lab/text-sketch';

export type SketchProps = { text?: SketchText };

function Sketch({ kind, name, note, children }: { kind: string; name: string; note: string; children: ReactNode }) {
  return (
    <Vignette>
      <div data-lab-sketch={kind} className="pr-8">
        <div className="flex items-center justify-between gap-3 pb-2">
          <span className="font-semibold">{name}</span>
          <span className="min-w-0 text-muted">{note}</span>
        </div>
        {children}
      </div>
    </Vignette>
  );
}

/** A bar from the start of a MiniRow's track, `w` percent long: filled, or outlined for the plan. */
function Bar({ w, outlined }: { w: number; outlined?: boolean }) {
  return (
    <span
      className={outlined ? 'absolute inset-y-1.5 left-0 rounded-sm border border-series-1' : 'absolute inset-y-1.5 left-0 rounded-sm bg-series-1'}
      style={{ width: `${w}%` } as CSSProperties}
    />
  );
}

/** Sample size: the smaller the rise to detect, the longer the bar of visitors. */
export function SampleSketch({ text = EN_SKETCH }: SketchProps = {}) {
  const t = text.sample;
  return (
    <Sketch kind="sample" name={t.name} note={t.note}>
      <MiniRow label={t.rows[0]} tag={<Tag>{t.tag}</Tag>}>
        <Bar w={96} />
      </MiniRow>
      <MiniRow label={t.rows[1]}>
        <Bar w={48} />
      </MiniRow>
      <MiniRow label={t.rows[2]}>
        <Bar w={20} />
      </MiniRow>
    </Sketch>
  );
}

/** Split check: two groups that should be equal, and are not. */
export function SplitSketch({ text = EN_SKETCH }: SketchProps = {}) {
  const t = text.split;
  return (
    <Sketch kind="split" name={t.name} note={t.note}>
      <MiniRow label={t.a} tag={<Tag tone="tint">{t.more}</Tag>}>
        <Bar w={88} />
      </MiniRow>
      <MiniRow label={t.b} tag={<Tag>{t.fewer}</Tag>}>
        <Bar w={66} />
      </MiniRow>
      <MiniRow label={t.plan}>
        <Bar w={77} outlined />
      </MiniRow>
    </Sketch>
  );
}

/** A small chart: a line, an optional dotted level, and the current dot (positions in percent of the plot). */
function Curve({ d, level, dot }: { d: string; level?: number; dot: { x: number; y: number } }) {
  return (
    <div className="relative h-20 border-b border-l border-hairline-strong">
      <svg aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible">
        {level !== undefined ? (
          <line x1="0" x2="100" y1={level} y2={level} stroke="var(--color-muted)" strokeWidth="1" strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
        ) : null}
        <path d={d} fill="none" stroke="var(--color-series-1)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <span
        className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-pill bg-series-2 outline-2 outline-surface"
        style={{ left: `${dot.x}%`, top: `${dot.y}%` } as CSSProperties}
      />
    </div>
  );
}

/** Peeking: the share of false winners climbs with every check, away from the planned level. */
export function PeekSketch({ text = EN_SKETCH }: SketchProps = {}) {
  return (
    <Sketch kind="peek" name={text.peek.name} note={text.peek.note}>
      <Curve d="M0 86 C 18 62, 34 46, 52 36 S 84 20, 96 14" level={86} dot={{ x: 96, y: 14 }} />
    </Sketch>
  );
}

/** Exaggeration: the smaller the test, the more a win overstates the effect. */
export function CurseSketch({ text = EN_SKETCH }: SketchProps = {}) {
  return (
    <Sketch kind="curse" name={text.curse.name} note={text.curse.note}>
      <Curve d="M2 8 C 14 52, 30 74, 52 84 S 86 91, 98 92" dot={{ x: 22, y: 60 }} />
    </Sketch>
  );
}

/** The sketch of each check, by its Figure. */
export const LAB_SKETCHES = {
  planner: SampleSketch,
  srm: SplitSketch,
  peeking: PeekSketch,
  curse: CurseSketch,
} as const;
