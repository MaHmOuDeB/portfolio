import { availableParallelism } from 'node:os';
import { defineConfig } from 'vitest/config';

// In CI, two workers: the static job's runner has 3 CPUs, and Vitest's main process (transform,
// coverage, reporters) needs one of them. Vitest's own default is availableParallelism() - 1, and
// whether that number follows the container's CPU cap is not certain, so the count is pinned, and
// what Node reports is logged once at startup. Local runs keep Vitest's default.
const CI_WORKERS = 2;
if (process.env.CI) {
  console.log(`vitest: os.availableParallelism() = ${availableParallelism()}, maxWorkers = ${CI_WORKERS} (CI)`);
}

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    // Next resolves 'server-only' itself (an empty module on the server, a throwing one in a client
    // bundle); the package is not installed, so the tests use Next's own server-side copy.
    alias: { 'server-only': 'next/dist/compiled/server-only/empty.js' },
  },
  // JSX in .tsx tests compiles with the automatic runtime whatever tsconfig's jsx setting is.
  oxc: { jsx: { runtime: 'automatic' } },
  test: {
    include: ['tests/unit/**/*.test.{ts,tsx}'],
    passWithNoTests: false,
    // 60 s, not Vitest's 5 s: the timeout only catches a hung test, and a hung test still fails, at
    // 60 s. On a loaded machine (CI's self-hosted runners under their CPU cap, or a Mac running
    // several checks at once) a property test in experiment/snapshot.test.ts took 23.9 s, and other
    // tests 14.6 s and 17.2 s, against about 1 s on an idle hosted runner.
    testTimeout: 60_000,
    ...(process.env.CI ? { maxWorkers: CI_WORKERS } : {}),
    environment: 'node',
    globals: true,
    reporters: ['default', 'json'],
    outputFile: { json: 'reports/vitest.json' },
    coverage: {
      provider: 'v8',
      // Measured explicitly so the gate cannot pass because nothing was measured.
      include: ['src/lib/stats/**/*.ts'],
      thresholds: {
        // The gate covers the statistics library only; other folders are not held to it.
        'src/lib/stats/**': { lines: 95, branches: 95, statements: 95, functions: 95 },
      },
    },
  },
});
