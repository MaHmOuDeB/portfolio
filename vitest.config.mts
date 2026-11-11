import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  // JSX in .tsx tests compiles with the automatic runtime whatever tsconfig's jsx setting is.
  oxc: { jsx: { runtime: 'automatic' } },
  test: {
    include: ['tests/unit/**/*.test.{ts,tsx}'],
    passWithNoTests: false,
    // 20 s, not Vitest's 5 s: on a loaded machine (CI's self-hosted runners under their CPU cap, or a
    // Mac running several checks at once) the property tests in experiment/snapshot.test.ts took up
    // to 6 s, against about 1 s on an idle hosted runner. A hung test still fails, just later.
    testTimeout: 20_000,
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
