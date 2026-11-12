// Writes public/build-meta.json from the CI reports, in the deploy only (npm run build:meta, before
// `vercel build`, which embeds it: scripts/embed-build-meta.ts). The Live test page's colophon
// prints it. Every report must be there and well formed: a missing, empty or malformed unit test,
// e2e, axe or Lighthouse report, or an unreadable git HEAD, throws and fails the deploy step, so
// the site never prints zeros or a made-up commit for a report that was not there.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { LIGHTHOUSE_LABEL, isCommit, isTally, type BuildMeta } from '../src/lib/live-page/build-meta-shape.ts';

export { LIGHTHOUSE_LABEL, type BuildMeta };

export type BuildMetaInput = {
  commit: string;
  builtAt: string;
  vitestJson: unknown;
  e2eJson: unknown;
  lhciManifest: unknown;
};

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const count = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

function unitTests(report: unknown): BuildMeta['unitTests'] {
  const tally = isObject(report) ? { passed: report.numPassedTests, total: report.numTotalTests } : null;
  if (!isTally(tally)) throw new Error('build-meta: the unit test report is missing or malformed');
  return tally;
}

function e2eTests(report: Json): BuildMeta['e2eTests'] {
  const stats = report.stats;
  if (!isObject(stats) || !count(stats.expected) || !count(stats.unexpected) || !count(stats.flaky)) {
    throw new Error('build-meta: the e2e report is malformed');
  }
  const tally = { passed: stats.expected, total: stats.expected + stats.unexpected + stats.flaky };
  if (!isTally(tally)) throw new Error('build-meta: the e2e report ran no tests');
  return tally;
}

/**
 * The `axe-violations` count of one Playwright test, or null when it has none. Real reports mirror a
 * test's annotations onto each of its results, so the test-level list wins and the results are a
 * fallback. An annotation that is not a whole number of violations makes the axe report malformed.
 */
function axeCountForTest(test: unknown): number | null {
  if (!isObject(test)) throw new Error('build-meta: the e2e report is malformed');
  const sum = (annotations: unknown): number | null => {
    let total: number | null = null;
    for (const annotation of Array.isArray(annotations) ? annotations : []) {
      if (!isObject(annotation) || annotation.type !== 'axe-violations') continue;
      const text = annotation.description;
      if (typeof text !== 'string' || !/^\d+$/.test(text) || !Number.isSafeInteger(Number(text))) {
        throw new Error(`build-meta: the axe report holds a malformed count (${JSON.stringify(text)})`);
      }
      total = (total ?? 0) + Number(text);
    }
    return total;
  };
  const direct = sum(test.annotations);
  if (direct !== null) return direct;
  let best: number | null = null;
  for (const result of Array.isArray(test.results) ? test.results : []) {
    const n = isObject(result) ? sum(result.annotations) : null;
    if (n !== null) best = Math.max(best ?? 0, n);
  }
  return best;
}

/** Violations, and how many tests reported an axe count, over a suite and its children. */
function axeForSuite(suite: unknown): { violations: number; checks: number } {
  if (!isObject(suite)) throw new Error('build-meta: the e2e report is malformed');
  let violations = 0;
  let checks = 0;
  for (const spec of Array.isArray(suite.specs) ? suite.specs : []) {
    if (!isObject(spec)) throw new Error('build-meta: the e2e report is malformed');
    for (const test of Array.isArray(spec.tests) ? spec.tests : []) {
      const n = axeCountForTest(test);
      if (n !== null) {
        violations += n;
        checks += 1;
      }
    }
  }
  for (const child of Array.isArray(suite.suites) ? suite.suites : []) {
    const r = axeForSuite(child);
    violations += r.violations;
    checks += r.checks;
  }
  return { violations, checks };
}

function axeViolations(report: Json): number {
  if (!Array.isArray(report.suites)) throw new Error('build-meta: the e2e report is malformed');
  let violations = 0;
  let checks = 0;
  for (const suite of report.suites) {
    const r = axeForSuite(suite);
    violations += r.violations;
    checks += r.checks;
  }
  if (checks === 0) throw new Error('build-meta: the e2e report holds no axe check (the axe report is missing)');
  return violations;
}

function lighthouseScores(manifest: unknown): BuildMeta['lighthouse'] {
  if (!Array.isArray(manifest)) throw new Error('build-meta: the Lighthouse manifest is missing or malformed');
  const run = manifest.find((entry) => isObject(entry) && entry.isRepresentativeRun === true);
  if (!isObject(run)) throw new Error('build-meta: the Lighthouse manifest has no representative run');
  const summary = run.summary;
  const keys = ['performance', 'accessibility', 'best-practices', 'seo'] as const;
  const scores = isObject(summary) ? keys.map((key) => summary[key]) : [];
  const valid = scores.length === keys.length && scores.every((s) => typeof s === 'number' && Number.isFinite(s) && s >= 0 && s <= 1);
  if (!valid) throw new Error('build-meta: the Lighthouse representative run has no usable summary');
  const [performance, accessibility, bestPractices, seo] = (scores as number[]).map((s) => Math.round(s * 100)) as [number, number, number, number];
  return { performance, accessibility, bestPractices, seo };
}

export function buildMeta(input: BuildMetaInput): BuildMeta {
  if (!isCommit(input.commit)) throw new Error('build-meta: the commit is not a full SHA');
  const unit = unitTests(input.vitestJson);
  if (!isObject(input.e2eJson)) throw new Error('build-meta: the e2e report is missing or malformed');
  return {
    commit: input.commit,
    builtAt: input.builtAt,
    unitTests: unit,
    e2eTests: e2eTests(input.e2eJson),
    axeViolations: axeViolations(input.e2eJson),
    lighthouse: lighthouseScores(input.lhciManifest),
    lighthouseLabel: LIGHTHOUSE_LABEL,
  };
}

/** A report as JSON; a missing, empty or unparsable file throws, naming its path. */
export function readReport(path: string, read: (path: string, encoding: 'utf8') => string = readFileSync): unknown {
  let raw: string;
  try {
    raw = read(path, 'utf8');
  } catch (e) {
    throw new Error(`build-meta: could not read ${path} (${(e as Error).message})`);
  }
  if (raw.trim() === '') throw new Error(`build-meta: ${path} is empty`);
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`build-meta: ${path} is not valid JSON`);
  }
}

/** The commit HEAD points to; anything but a full SHA throws. */
export function gitCommit(run: () => string = () => execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' })): string {
  let out: string;
  try {
    out = run().trim();
  } catch (e) {
    throw new Error(`build-meta: could not read git HEAD (${(e as Error).message})`);
  }
  if (!isCommit(out)) throw new Error('build-meta: git HEAD is not a full commit SHA');
  return out;
}

function main(): void {
  const meta = buildMeta({
    commit: gitCommit(),
    builtAt: new Date().toISOString(),
    vitestJson: readReport('reports/vitest.json'),
    e2eJson: readReport('reports/e2e.json'),
    lhciManifest: readReport('reports/lhci/manifest.json'),
  });
  mkdirSync('public', { recursive: true });
  writeFileSync('public/build-meta.json', `${JSON.stringify(meta, null, 2)}\n`);
  process.stdout.write('build-meta: wrote public/build-meta.json\n');
}

if (import.meta.main) main();
