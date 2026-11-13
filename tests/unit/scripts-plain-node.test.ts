// The package.json scripts that run a TypeScript file with plain Node (type stripping, no bundler and no
// Vitest aliases) must not reach a module that only resolves inside Next or Vitest. `server-only` is the
// one such module here: Vitest aliases it, Next provides it, plain Node cannot find it.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as { scripts: Record<string, string> };

const workflows = fs
  .readdirSync(path.join(ROOT, '.github/workflows'))
  .filter((f) => f.endsWith('.yml'))
  .map((f) => fs.readFileSync(path.join(ROOT, '.github/workflows', f), 'utf8'));

// Every scripts/*.ts file a package.json script or a workflow step runs with `node`.
const nodeScripts = [
  ...new Set(
    [...Object.values(pkg.scripts), ...workflows].flatMap((command) =>
      [...command.matchAll(/\bnode\b[^&|;\n]*?\b(scripts\/[\w.-]+\.ts)\b/g)].map((m) => m[1]!),
    ),
  ),
].sort();

// A static import (`import x from '...'`, `import '...'`) or re-export (`export ... from '...'`) and its
// specifier. Node's type stripping erases `import type` and `export type` statements, so those never
// load a module and are skipped.
const IMPORT = /^\s*(?:import\s+(?!type\b)(?:[^'";]*?\bfrom\s*)?|export\s+(?!type\b)[^'";]*?\bfrom\s*)['"]([^'"]+)['"]/gm;

/** Every local module a file reaches through static imports, the file itself included. */
function reach(file: string, seen = new Set<string>()): Set<string> {
  if (seen.has(file)) return seen;
  seen.add(file);
  for (const [, spec] of fs.readFileSync(file, 'utf8').matchAll(IMPORT)) {
    if (!spec!.startsWith('.')) continue;
    reach(path.resolve(path.dirname(file), spec!), seen);
  }
  return seen;
}

describe('scripts run with plain Node', () => {
  it('finds the scripts, including the canonical-origin check and the deploy\'s production URL step', () => {
    expect(nodeScripts).toContain('scripts/seo-origin-check.ts');
    expect(nodeScripts).toContain('scripts/pulled-env-canonical.ts');
    expect(nodeScripts).toContain('scripts/pulled-env-check.ts');
  });

  it.each(nodeScripts)('%s reaches no module that imports server-only', (script) => {
    const offenders = [...reach(path.join(ROOT, script))]
      .filter((file) => /^\s*import\s+['"]server-only['"]/m.test(fs.readFileSync(file, 'utf8')))
      .map((file) => path.relative(ROOT, file));
    expect(offenders).toEqual([]);
  });

  it('npm run seo:origin-check runs for real: 0 on a clean build output, 2 without --canonical', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seo-origin-node-'));
    try {
      const app = path.join(dir, 'server/app');
      fs.mkdirSync(app, { recursive: true });
      fs.writeFileSync(
        path.join(app, 'lab.html'),
        '<html><head><link rel="canonical" href="https://site.example.com/lab"></head><body></body></html>',
      );
      fs.writeFileSync(path.join(app, 'sitemap.xml.body'), '<urlset><url><loc>https://site.example.com/lab</loc></url></urlset>');
      const run = (...args: string[]) =>
        spawnSync('npm', ['run', '--silent', 'seo:origin-check', '--', ...args], { cwd: ROOT, encoding: 'utf8' });
      const clean = run('--canonical', 'site.example.com', '--dir', dir);
      expect(clean.stderr).not.toContain('ERR_MODULE_NOT_FOUND');
      expect(clean.status).toBe(0);
      expect(clean.stdout).toContain('only https://site.example.com');
      expect(run('--dir', dir).status).toBe(2);
      // The test origin, as in any build that is not production: exit 1 naming it, not a crash.
      fs.writeFileSync(path.join(app, 'index.html'), '<html><head><link rel="canonical" href="https://canonical.invalid/"></head></html>');
      const dirty = run('--canonical', 'site.example.com', '--dir', dir);
      expect(dirty.stderr).not.toContain('ERR_MODULE_NOT_FOUND');
      expect(dirty.status).toBe(1);
      expect(dirty.stdout).toContain('server/app/index.html: test origin canonical.invalid');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('scripts/pulled-env-canonical.ts runs for real: it fills the pulled file, and refuses a bad CANONICAL_HOST', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulled-env-canonical-node-'));
    try {
      const file = path.join(dir, '.env.production.local');
      fs.writeFileSync(file, 'VERCEL_ENV="production"\n');
      const run = (host: string) =>
        spawnSync(
          'node',
          ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', 'scripts/pulled-env-canonical.ts', file],
          { cwd: ROOT, encoding: 'utf8', env: { PATH: process.env.PATH, CANONICAL_HOST: host } as Record<string, string | undefined> as NodeJS.ProcessEnv },
        );
      const filled = run('site.example.com');
      expect(filled.stderr).not.toContain('ERR_MODULE_NOT_FOUND');
      expect(filled.status).toBe(0);
      expect(fs.readFileSync(file, 'utf8')).toBe('VERCEL_ENV="production"\nVERCEL_PROJECT_PRODUCTION_URL="site.example.com"\n');
      const bad = run('site.example.com:443');
      expect(bad.stderr).not.toContain('ERR_MODULE_NOT_FOUND');
      expect(bad.status).toBe(1);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
