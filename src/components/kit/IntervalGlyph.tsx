// The signature mark: a bar with end caps is the interval, the dot on it is the estimate.
// A data mark, not an icon. Decorative unless given a label. Server-safe, no hooks.
import { GLYPH_LENGTH, glyphGeometry, type GlyphSize } from '@/lib/figure/glyph';

type Props = {
  size?: GlyphSize;
  /** Width in px: 48 for inline, 96 for large. */
  length?: number;
  /** Where the estimate sits along the bar, 0 to 1. */
  estimateAt?: number;
  /** Hollow is the grey "no estimate yet" form used while a test is collecting. */
  variant?: 'filled' | 'hollow';
  /** Omit for a decorative glyph (aria-hidden). */
  label?: string;
};

export function IntervalGlyph({
  size = 'inline',
  length = GLYPH_LENGTH[size],
  estimateAt = 0.62,
  variant = 'filled',
  label,
}: Props) {
  const g = glyphGeometry(size);
  const hollow = variant === 'hollow';
  const frame = hollow ? 'var(--color-line)' : 'var(--color-series-1)';
  const at = Math.min(1, Math.max(0, estimateAt)) * length;
  const capY = (g.height - g.capHeight) / 2;
  const a11y = label
    ? ({ role: 'img', 'aria-label': label } as const)
    : ({ 'aria-hidden': true } as const);

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={length}
      height={g.height}
      viewBox={`0 0 ${length} ${g.height}`}
      focusable="false"
      {...a11y}
    >
      <rect x={0} y={capY} width={g.capWidth} height={g.capHeight} fill={frame} />
      <rect x={length - g.capWidth} y={capY} width={g.capWidth} height={g.capHeight} fill={frame} />
      <rect x={0} y={(g.height - g.bar) / 2} width={length} height={g.bar} fill={frame} />
      {hollow ? (
        <circle
          cx={at}
          cy={g.height / 2}
          r={g.dot / 2}
          fill="none"
          stroke="var(--color-muted)"
          strokeWidth={g.bar}
        />
      ) : (
        <circle
          cx={at}
          cy={g.height / 2}
          r={g.dot / 2}
          fill="var(--color-series-2)"
          stroke="var(--color-bg)"
          strokeWidth={g.halo}
          paintOrder="stroke"
        />
      )}
    </svg>
  );
}
