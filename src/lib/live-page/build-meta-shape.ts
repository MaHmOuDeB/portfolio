// The shape of the build metadata the Live test page's colophon prints: the commit the CI reports
// were made for, unit and browser test counts, axe violations and the Lighthouse lab scores. It is
// written by the deploy (scripts/build-meta.ts), embedded into the build while next.config.ts loads
// (scripts/embed-build-meta.ts) and parsed on the server (build-meta-file.ts); all three check it
// with `isBuildMeta`. Pure, no imports, so the scripts can load it with Node's type stripping.

// How the Lighthouse scores were measured, as the colophon prints it: lighthouserc.json's first URL
// (scripts/build-meta.ts takes the first representative run) and its throttlingMethod "devtools",
// which applies the mobile network and CPU profile in the browser. tests/unit/lighthouserc.test.ts
// ties the two together.
export const LIGHTHOUSE_LABEL = 'CI lab run on the home page, group A (mobile, throttled in the browser)';

export type BuildMeta = {
  commit: string;
  builtAt: string;
  /** `total` is the tests that ran (passed plus failed); skipped and to-do tests are counted apart. */
  unitTests: { passed: number; total: number; skipped: number };
  /** `passed` includes `flaky` (passed after a retry); `total` is passed plus failed. */
  e2eTests: { passed: number; total: number; skipped: number; flaky: number };
  axeViolations: number;
  lighthouse: { performance: number; accessibility: number; bestPractices: number; seo: number };
  lighthouseLabel: typeof LIGHTHOUSE_LABEL;
};

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
const count = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const score = (v: unknown): v is number => count(v) && v <= 100;

/** A full git commit SHA. */
export const isCommit = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{40}$/.test(v);

/** Passed and total (the tests that ran) from a run that ran at least one test, and the skipped ones. */
export const isTally = (v: unknown): v is { passed: number; total: number; skipped: number } =>
  isObject(v) && count(v.passed) && count(v.total) && count(v.skipped) && v.total >= 1 && v.passed <= v.total;

const isE2eTally = (v: unknown): v is BuildMeta['e2eTests'] => isTally(v) && count((v as Json).flaky) && ((v as Json).flaky as number) <= v.passed;

export function isBuildMeta(v: unknown): v is BuildMeta {
  if (!isObject(v)) return false;
  const l = v.lighthouse;
  return (
    isCommit(v.commit) &&
    typeof v.builtAt === 'string' &&
    /^\d{4}-\d{2}-\d{2}T/.test(v.builtAt) &&
    Number.isFinite(Date.parse(v.builtAt)) &&
    isTally(v.unitTests) &&
    isE2eTally(v.e2eTests) &&
    count(v.axeViolations) &&
    isObject(l) &&
    score(l.performance) &&
    score(l.accessibility) &&
    score(l.bestPractices) &&
    score(l.seo) &&
    v.lighthouseLabel === LIGHTHOUSE_LABEL
  );
}
