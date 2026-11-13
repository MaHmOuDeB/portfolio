import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// package.json's `overrides.vercel` patches vulnerable transitive packages of the Vercel CLI within
// their own majors (the reasons and the open advisories are in docs/dependencies.md). Each value is
// an exact version chosen for vercel 62.2.0: after a CLI bump the same override could silently
// downgrade a newer pinned copy. Re-check every key (and npm audit) before changing the version here.
const pkg = JSON.parse(readFileSync(join(import.meta.dirname, '../../package.json'), 'utf8')) as {
  devDependencies: Record<string, string>;
  overrides?: { vercel?: Record<string, string> };
};
const overrides = pkg.overrides?.vercel ?? {};

it('the vercel overrides were reviewed for this exact CLI version', () => {
  if (Object.keys(overrides).length > 0) expect(pkg.devDependencies.vercel).toBe('62.2.0');
});

it('every override is keyed name@major and stays in that major', () => {
  for (const [key, value] of Object.entries(overrides)) {
    const m = /^(@?[^@]+)@(\d+)$/.exec(key);
    expect(m, key).not.toBeNull();
    expect(value, key).toMatch(/^\d+\.\d+\.\d+$/);
    expect(value.split('.')[0], key).toBe(m![2]);
  }
});
