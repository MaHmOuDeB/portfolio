// Number formatting for charts and tables: en-GB, U+2212 for minus, and a value that rounds to
// zero (including -0) prints "0" with no sign. The fact formatter in src/lib/facts/format.ts
// serves <Fact> values; this one serves the kit's computed numbers.
const MINUS = '−';

function digitsOf(abs: number, min: number, max: number): string {
  return new Intl.NumberFormat('en-GB', { minimumFractionDigits: min, maximumFractionDigits: max }).format(abs);
}

function assertFinite(v: number): void {
  if (!Number.isFinite(v)) throw new TypeError(`expected a finite number, got ${String(v)}`);
}

// Sign and magnitude as printed. `sign` is '' when the printed digits are all zero.
function signed(v: number, min: number, max: number, plus: boolean): string {
  assertFinite(v);
  const digits = digitsOf(Math.abs(v), min, max);
  if (!/[1-9]/.test(digits)) return '0';
  if (v < 0) return `${MINUS}${digits}`;
  return plus ? `+${digits}` : digits;
}

/** "1,353", "−12.5", "0". Up to `maxDigits` decimals, trailing zeros dropped. */
export function formatNumber(v: number, maxDigits = 2): string {
  return signed(v, 0, maxDigits, false);
}

/** "+31", "−12", "0": a difference in percentage points with a fixed number of decimals. */
export function formatSignedPoints(v: number, digits: 0 | 1): string {
  return signed(v, digits, digits, true);
}

/** "−12 to +31". Each end follows formatSignedPoints, so "−0 to +0" cannot appear. */
export function formatInterval(lower: number, upper: number, digits: 0 | 1): string {
  return `${formatSignedPoints(lower, digits)} to ${formatSignedPoints(upper, digits)}`;
}
