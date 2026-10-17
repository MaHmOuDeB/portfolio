// Position math for StepNav. Pure and total: any number, including NaN, Infinity or a total of 0,
// gives a valid position. There are always at least one step, and the ends clamp (never wrap).

/** The arrow key that moves a step, or null for any other key and for a modified arrow. */
export function stepDirection(e: {
  key: string;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
}): 1 | -1 | null {
  // Alt+Left is the browser's Back, so a modified arrow is left alone.
  if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return null;
  if (e.key === 'ArrowRight') return 1;
  if (e.key === 'ArrowLeft') return -1;
  return null;
}

/** A whole position inside 1 to total. A total below 1 or not finite counts as one step. */
export function normalizeSteps(current: number, total: number): { current: number; total: number } {
  const steps = Number.isFinite(total) ? Math.max(1, Math.floor(total)) : 1;
  if (Number.isNaN(current)) return { current: 1, total: steps };
  return { current: Math.min(steps, Math.max(1, Math.round(current))), total: steps };
}

/** The position one step in `direction`, or null at an end (and for a single step). */
export function stepTarget(current: number, total: number, direction: 1 | -1): number | null {
  const at = normalizeSteps(current, total);
  const next = at.current + direction;
  return next < 1 || next > at.total ? null : next;
}

/** The visible and announced position, for example "3 of 5". */
export function stepLabel(current: number, total: number): string {
  const at = normalizeSteps(current, total);
  return `${at.current} of ${at.total}`;
}
