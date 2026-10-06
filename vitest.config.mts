import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    passWithNoTests: false,
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
