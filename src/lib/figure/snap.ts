// Snapping for the Figure controls: a slider, a number input and a URL parameter all go through
// this, so a hostile value (NaN, out of range, off the step grid) is clamped and never throws.

/**
 * Clamps `v` to [min, max], rounds it to a whole number of steps counted from `min`, and strips
 * float noise (0.15000000000000002 becomes 0.15). NaN falls back to `min`. A maximum that is off
 * the step grid is never exceeded: the last whole step below it is used. A step that is not a
 * positive finite number only clamps.
 */
export function snapToStep(v: number, min: number, max: number, step: number): number {
  if (Number.isNaN(v)) return min;
  const clamp = (x: number) => Math.min(max, Math.max(min, x));
  if (!(step > 0) || !Number.isFinite(step)) return clamp(v);
  // The tolerance keeps a maximum that is on the grid from being lost to division noise (0.3 / 0.1).
  const last = Math.floor((max - min) / step + 1e-9);
  const steps = Math.min(Math.round((clamp(v) - min) / step), last);
  // 15 significant digits keep every real value and drop the last-bit noise of min + k * step.
  return clamp(Number((min + steps * step).toPrecision(15)));
}
