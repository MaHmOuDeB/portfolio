// The privacy page says the site uses no third-party analytics. These packages would add a script
// and their own processing of the IP address and browser type, so they may not be installed or
// imported without changing the page first.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '../..');
const BANNED = ['@vercel/analytics', '@vercel/speed-insights'];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : /\.(tsx?|jsx?|mjs|cjs|css|mdx?)$/.test(name) ? [path] : [];
  });
}

describe('no analytics package', () => {
  it('package.json lists none in any kind of dependency', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as Record<string, unknown>;
    for (const kind of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies', 'bundleDependencies', 'bundledDependencies', 'overrides']) {
      const deps = JSON.stringify(pkg[kind] ?? {});
      for (const name of BANNED) expect(deps, `${kind} ${name}`).not.toContain(name);
    }
  });

  it('package-lock.json resolves none', () => {
    const lock = readFileSync(join(ROOT, 'package-lock.json'), 'utf8');
    for (const name of BANNED) expect(lock, name).not.toContain(`"node_modules/${name}"`);
    for (const name of BANNED) expect(lock, name).not.toContain(`"${name}"`);
  });

  it('nothing under src imports one, or a script under /_vercel', () => {
    for (const file of files(join(ROOT, 'src'))) {
      const text = readFileSync(file, 'utf8');
      for (const name of BANNED) expect(text, `${file} ${name}`).not.toContain(name);
      expect(text, file).not.toMatch(/\/_vercel\/(insights|speed-insights)/);
    }
  });
});
