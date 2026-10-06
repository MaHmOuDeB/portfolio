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
    },
  },
});
