// The rows of the evidence field: a confidence band seen on a ground plane. Row 0 is the farthest
// (an early look, wide) and the last row the nearest (a late look, narrow). Pure and deterministic.

export type FieldRow = {
  /** Row index, 0 for the farthest row. */
  i: number;
  /** Distance from the top of the plane, in px at a 520 px plane. */
  top: number;
  /** Width of the interval, in px. */
  width: number;
  /** Where the estimate has settled, in px from the zero line. */
  shift: number;
};

const HALF_PLANE = 250;

export function fieldRows(count = 26): FieldRow[] {
  return Array.from({ length: count }, (_, i) => {
    const n = i + 1;
    return {
      i,
      top: 20 * i,
      width: (2 * HALF_PLANE) / Math.sqrt(0.9 * n),
      shift: 34 * (1 - Math.exp(-n / 7)) + (9 * Math.sin(1.7 * n)) / Math.sqrt(n),
    };
  });
}
