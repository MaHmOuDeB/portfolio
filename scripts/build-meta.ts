import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

export const LIGHTHOUSE_LABEL = 'CI lab run (mobile, simulated throttling)';

export type BuildMeta = {
  commit: string;
  builtAt: string;
  unitTests: { passed: number; total: number };
  e2eTests: { passed: number; total: number };
  axeViolations: number;
  lighthouse: {
    performance: number;
    accessibility: number;
    bestPractices: number;
    seo: number;
  } | null;
  lighthouseLabel: typeof LIGHTHOUSE_LABEL;
};

export type BuildMetaInput = {
  commit: string;
  builtAt: string;
  vitestJson: unknown;
  e2eJson: unknown;
  lhciManifest: unknown | null;
};

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

// Sum of every `axe-violations` annotation on one Playwright test. Real reports mirror a test's
// annotations onto each of its results, so the test-level list wins and results are a fallback.
function axeCountForTest(test: unknown): number {
  if (!isObject(test)) return 0;
  const sum = (annotations: unknown): number =>
    list(annotations).reduce<number>(
      (total, annotation) =>
        isObject(annotation) && annotation.type === 'axe-violations'
          ? total + (Number(annotation.description) || 0)
          : total,
      0,
    );
  const direct = sum(test.annotations);
  if (direct > 0) return direct;
  return list(test.results).reduce<number>(
    (best, result) => Math.max(best, isObject(result) ? sum(result.annotations) : 0),
    0,
  );
}

function axeCountForSuite(suite: unknown): number {
  if (!isObject(suite)) return 0;
  let total = 0;
  for (const spec of list(suite.specs)) {
    if (!isObject(spec)) continue;
    for (const test of list(spec.tests)) total += axeCountForTest(test);
  }
  for (const child of list(suite.suites)) total += axeCountForSuite(child);
  return total;
}

function lighthouseScores(manifest: unknown): BuildMeta['lighthouse'] {
  const run = list(manifest).find((entry) => isObject(entry) && entry.isRepresentativeRun === true);
  if (!isObject(run) || !isObject(run.summary)) return null;
  const { summary } = run;
  const score = (key: string): number => Math.round(num(summary[key]) * 100);
  return {
    performance: score('performance'),
    accessibility: score('accessibility'),
    bestPractices: score('best-practices'),
    seo: score('seo'),
  };
}

export function buildMeta(input: BuildMetaInput): BuildMeta {
  const vitest = isObject(input.vitestJson) ? input.vitestJson : {};
  const e2e = isObject(input.e2eJson) ? input.e2eJson : {};
  const stats = isObject(e2e.stats) ? e2e.stats : {};

  return {
    commit: input.commit,
    builtAt: input.builtAt,
    unitTests: { passed: num(vitest.numPassedTests), total: num(vitest.numTotalTests) },
    e2eTests: {
      passed: num(stats.expected),
      total: num(stats.expected) + num(stats.unexpected) + num(stats.flaky),
    },
    axeViolations: list(e2e.suites).reduce<number>(
      (total, suite) => total + axeCountForSuite(suite),
      0,
    ),
    lighthouse: lighthouseScores(input.lhciManifest),
    lighthouseLabel: LIGHTHOUSE_LABEL,
  };
}

function readReport(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    process.stderr.write(`build-meta: could not read ${path}, using empty values\n`);
    return null;
  }
}

function gitCommit(): string {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    process.stderr.write('build-meta: could not read git HEAD, using "unknown"\n');
    return 'unknown';
  }
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
