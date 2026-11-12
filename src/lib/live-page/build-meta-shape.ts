// The shape of the build metadata the Live test page's colophon prints: the commit the CI reports
// were made for, unit and browser test counts, axe violations and the Lighthouse lab scores. It is
// written by the deploy (scripts/build-meta.ts), embedded into the build while next.config.ts loads
// (scripts/embed-build-meta.ts) and parsed on the server (build-meta-file.ts); all three check it
// with `isBuildMeta`. Pure, no imports, so the scripts can load it with Node's type stripping.

export const LIGHTHOUSE_LABEL = 'CI lab run (mobile, simulated throttling)';

export type BuildMeta = {
  commit: string;
  builtAt: string;
  unitTests: { passed: number; total: number };
  e2eTests: { passed: number; total: number };
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

/** Passed and total from a run that ran at least one test. */
export const isTally = (v: unknown): v is { passed: number; total: number } =>
  isObject(v) && count(v.passed) && count(v.total) && v.total >= 1 && v.passed <= v.total;

export function isBuildMeta(v: unknown): v is BuildMeta {
  if (!isObject(v)) return false;
  const l = v.lighthouse;
  return (
    isCommit(v.commit) &&
    typeof v.builtAt === 'string' &&
    /^\d{4}-\d{2}-\d{2}T/.test(v.builtAt) &&
    Number.isFinite(Date.parse(v.builtAt)) &&
    isTally(v.unitTests) &&
    isTally(v.e2eTests) &&
    count(v.axeViolations) &&
    isObject(l) &&
    score(l.performance) &&
    score(l.accessibility) &&
    score(l.bestPractices) &&
    score(l.seo) &&
    v.lighthouseLabel === LIGHTHOUSE_LABEL
  );
}
