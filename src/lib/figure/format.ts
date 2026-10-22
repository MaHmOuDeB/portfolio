// Number formatting for charts and tables: en-GB, U+2212 for minus, and a value that rounds to
// zero (including -0) prints "0" with no sign. The fact formatter in src/lib/facts/format.ts
// serves <Fact> values; this one serves the kit's computed numbers.
const MINUS = '−';

// Fraction digits for an explicit `maxDigits`; with none, a value under 1 keeps three significant
// digits (0.004 stays "0.004", 0.0123 stays "0.0123") and a larger one keeps two decimals.
function digitsOf(abs: number, min: number, max: number | undefined): string {
  if (max === undefined && abs < 1) {
    return new Intl.NumberFormat('en-GB', { maximumSignificantDigits: 3 }).format(abs);
  }
  return new Intl.NumberFormat('en-GB', { minimumFractionDigits: min, maximumFractionDigits: max ?? 2 }).format(abs);
}

function assertFinite(v: number): void {
  if (!Number.isFinite(v)) throw new TypeError(`expected a finite number, got ${String(v)}`);
}

// Sign and magnitude as printed. `sign` is '' when the printed digits are all zero.
function signed(v: number, min: number, max: number | undefined, plus: boolean): string {
  assertFinite(v);
  const digits = digitsOf(Math.abs(v), min, max);
  if (!/[1-9]/.test(digits)) return '0';
  if (v < 0) return `${MINUS}${digits}`;
  return plus ? `+${digits}` : digits;
}

/**
 * "1,353", "−12.5", "0.004", "0". Trailing zeros are dropped. With `maxDigits`, at most that many
 * decimals; without it, two decimals from 1 up and three significant digits below 1, so only a
 * true zero (or -0) prints "0" and a small non-zero value never does.
 */
export function formatNumber(v: number, maxDigits?: number): string {
  return signed(v, 0, maxDigits, false);
}

/** "+5", "−0.4", "0": a signed difference with up to `maxDigits` decimals, trailing zeros dropped. */
export function formatSignedNumber(v: number, maxDigits = 1): string {
  return signed(v, 0, maxDigits, true);
}

/** "+31", "−12", "0": a difference in percentage points with a fixed number of decimals (0 to 6). */
export function formatSignedPoints(v: number, digits: number): string {
  return signed(v, digits, digits, true);
}

/** "−12 to +31". Each end follows formatSignedPoints, so "−0 to +0" cannot appear. */
export function formatInterval(lower: number, upper: number, digits: number): string {
  return `${formatSignedPoints(lower, digits)} to ${formatSignedPoints(upper, digits)}`;
}
