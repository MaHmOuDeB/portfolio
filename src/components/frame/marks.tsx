// The small marks a vignette's sketch is drawn from: a row with a label, a track and a tag; the
// interval mark (a bar with end caps, and the estimate dot); a tag; a tick. Decorative, server-safe.
import type { CSSProperties, ReactNode } from 'react';

const pct = (n: number) => `${Math.min(100, Math.max(0, n))}%`;

/** A bar with end caps from `left` to `left + width`, and the estimate dot at `dot` (percentages of the track). */
export function IntervalMark({ left, width, dot }: { left: number; width: number; dot: number }) {
  const style = { '--l': pct(left), '--w': pct(width), '--d': pct(dot) } as CSSProperties;
  return (
    <span data-interval-mark="" style={style}>
      <span data-interval-bar="" />
      <span data-interval-dot="" />
    </span>
  );
}

/** One hairline row: a short label, a track (usually an IntervalMark) and an optional tag at the end. */
export function MiniRow({ label, tag, children }: { label: ReactNode; tag?: ReactNode; children: ReactNode }) {
  return (
    <div data-mini-row="">
      <span data-mini-label="">{label}</span>
      <span data-mini-track="">{children}</span>
      {tag ?? null}
    </div>
  );
}

/** A small word on a plain track tint, or on the series tint. */
export function Tag({ tone = 'plain', children }: { tone?: 'plain' | 'tint'; children: ReactNode }) {
  return <span data-tag={tone}>{children}</span>;
}

/** A filled circle with a check, for a step that passed. */
export function Tick() {
  return <span data-tick="" />;
}
