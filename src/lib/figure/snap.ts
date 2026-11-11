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

const validStep = (step: number) => step > 0 && Number.isFinite(step);

/**
 * True when `v` is a value of snapToStep's grid, to the digits a browser keeps. A number input
 * prints min + k * step to about 15 significant digits, which can differ from snapToStep's own
 * rounding in the last digit, so an exact comparison would refuse a value the input stepped to
 * itself. The tolerance (a billionth of a step, plus the last digits of `v`) stays far below half a
 * step. With a step that is not positive and finite, any value in [min, max] is on the grid.
 */
export function isOnStepGrid(v: number, min: number, max: number, step: number): boolean {
  if (!Number.isFinite(v)) return false;
  const tolerance = (validStep(step) ? step * 1e-9 : 0) + Math.abs(v) * 1e-12;
  return Math.abs(snapToStep(v, min, max, step) - v) <= tolerance;
}

/**
 * One step up (`dir` 1) or down (-1) from `base`, as a number input's arrow keys step: a base on the
 * grid moves one whole step, a base between two grid values moves to the nearer one in that
 * direction. The result is snapped and clamped like snapToStep, so it never throws; with a step that
 * is not positive and finite, the base is only clamped.
 */
export function stepFrom(base: number, dir: 1 | -1, min: number, max: number, step: number): number {
  if (!validStep(step) || Number.isNaN(base)) return snapToStep(base, min, max, step);
  const k = (base - min) / step;
  const near = Math.round(k);
  const index = Math.abs(k - near) <= 1e-9 ? near + dir : dir > 0 ? Math.ceil(k) : Math.floor(k);
  return snapToStep(min + index * step, min, max, step);
}
