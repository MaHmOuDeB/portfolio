import { test } from '@playwright/test';

/**
 * Marks the running test slow: three times its time budget, with the reason as its `slow` annotation.
 *
 * The rule: only a test whose work is fixed and known (many page loads, whole-page scans, a long
 * tab walk, a deliberate wait) and does not fit its budget on a loaded runner is marked slow, and
 * the reason names that work. It never covers a hang, a race or a flaky assertion: those are fixed in
 * the test or the code.
 *
 * - Call it as the first line of the test body, after any `test.setTimeout()`. It triples the
 *   timeout in force when it runs (a describe-level `test.setTimeout(120_000)` becomes 360 s, the
 *   default 30 s becomes 90 s); a `test.setTimeout()` after it would replace the tripled value.
 * - It changes nothing else: no expect timeout, retry, scan or assertion. A wait inside the test
 *   that needs more time sets its own timeout.
 * - `when` false (a route or project that is not heavy) leaves the test as it is, with no annotation.
 */
export function markSlow(reason: string, when = true): void {
  test.info().slow(when, reason);
}
