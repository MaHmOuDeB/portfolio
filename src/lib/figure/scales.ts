// Scales for ChartFrame. Pure and server-safe. A chart's x positions are fractions of the frame
// width, written as percentages, so text in the frame never scales with it.
import { scaleLinear } from 'd3-scale';

/** Below the `sm` breakpoint (640 px) a chart draws its narrow layout. */
export type Layout = 'narrow' | 'wide';

function assertDomain([a, b]: readonly [number, number]): void {
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    throw new TypeError(`a chart domain must be finite, got [${String(a)}, ${String(b)}]`);
  }
}

// A span wider than the largest double (say -1e308 to 1e308) overflows to Infinity; halving every
// value first keeps the arithmetic finite and changes nothing else, because halving is exact.
const prescale = ([a, b]: readonly [number, number]) => (Number.isFinite(b - a) ? 1 : 0.5);

/**
 * Maps the domain to 0..1, clamped. A reversed domain maps its first value to 0. A zero-width
 * domain (all-equal data) puts every value at 0.5. The infinities clamp to the ends; NaN throws,
 * because a NaN would otherwise reach the markup.
 */
export function linearFrac(domain: [number, number]): (v: number) => number {
  assertDomain(domain);
  const k = prescale(domain);
  const scale = scaleLinear().domain([domain[0] * k, domain[1] * k]).range([0, 1]).clamp(true);
  return (v) => {
    if (Number.isNaN(v)) throw new TypeError('a chart value must not be NaN');
    // + 0 turns -0 into 0.
    return scale(v * k) + 0;
  };
}

const MAX_TICKS = 50;
const MIN_STEP = 1e-300;

/**
 * Round tick values inside the domain (d3's ticks, not extended to nice bounds): ascending, unique,
 * finite and never -0. A zero-width domain gives its one value; a count below one gives none, and
 * so does a span too small to step through (subnormal data). A domain that crosses zero always has
 * a zero tick when it has any.
 */
export function niceTicks(domain: [number, number], count: number): number[] {
  assertDomain(domain);
  const lo = Math.min(domain[0], domain[1]);
  const hi = Math.max(domain[0], domain[1]);
  // No chart needs more than MAX_TICKS, and d3 allocates one slot per tick.
  const n = Math.min(count, MAX_TICKS);
  // d3 needs 10^-log10(step) to be finite; a step this small (subnormal data) would overflow it.
  if (hi > lo && (hi - lo) / n < MIN_STEP) return [];
  const k = prescale(domain);
  const raw = scaleLinear().domain([lo * k, hi * k]).ticks(n);
  const out: number[] = [];
  for (const t of raw) {
    const v = t / k + 0;
    // At huge magnitudes neighbouring ticks can round to the same double; keep each value once.
    if (Number.isFinite(v) && v >= lo && v <= hi && (out.length === 0 || v > out[out.length - 1]!)) out.push(v);
  }
  return out;
}

/** A fraction of the frame width as an SVG percentage, clamped to the frame: 0.375 gives "37.5%". */
export function pct(frac: number): string {
  if (Number.isNaN(frac)) throw new TypeError('a chart position must not be NaN');
  const clamped = Math.min(1, Math.max(0, frac));
  // Three decimals of a percent is far below a pixel; + 0 turns -0 into 0.
  return `${Number((clamped * 100).toFixed(3)) + 0}%`;
}
