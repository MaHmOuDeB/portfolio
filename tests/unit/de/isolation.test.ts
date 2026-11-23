// The German tree stays apart from the English home's machinery: the proxy never sees /de, and no
// file under src/app/de reaches the Home model, the phase note or the beacon.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { unstable_doesMiddlewareMatch as matches } from 'next/experimental/testing/server';
import { NextRequest } from 'next/server';
import { config, proxy } from '@/proxy';

const ROOT = resolve(import.meta.dirname, '../../..');

describe('the proxy and /de', () => {
  it('does not match /de or anything under it', () => {
    for (const url of ['/de', '/de/', '/de/work', '/de/x/y', '/de?a=1']) {
      expect(matches({ config, url }), url).toBe(false);
    }
  });

  it('still matches / and /v/*', () => {
    expect(matches({ config, url: '/' })).toBe(true);
    expect(matches({ config, url: '/v/a' })).toBe(true);
  });

  it('never rewrites /de to a group page: it only rewrites / and /v/*', () => {
    const source = readFileSync(join(ROOT, 'src/proxy.ts'), 'utf8');
    expect(source).not.toMatch(/['"`]\/de\b/);
    const res = proxy(new NextRequest('http://localhost/de'));
    // Only a direct /v/* request is sent to the group that does not exist; /de is not in the matcher,
    // so Next never calls the proxy for it.
    expect(res.headers.get('x-arm')).toBeNull();
  });
});

function files(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(n) ? [p] : [];
  });
}

describe('src/app/de', () => {
  const de = files(join(ROOT, 'src/app/de'));

  it('has its layout, 404, catch-all and error page', () => {
    for (const f of ['layout.tsx', 'not-found.tsx', 'error.tsx', '[...rest]/page.tsx']) {
      expect(existsSync(join(ROOT, 'src/app/de', f)), f).toBe(true);
    }
  });

  it('imports neither the Home model, the phase note nor the beacon', () => {
    for (const file of de) {
      const text = readFileSync(file, 'utf8');
      expect(text, file).not.toMatch(/lib\/home\/model|PhaseLabel|TestNote|Beacon|beacon|ViewBeacon/);
    }
  });
});

// The German Home composition must not reach the Home model, the phase note, the live note or the
// beacon through any import (a type-only import is erased and does not count).
function importClosure(entry: string): string[] {
  const seen = new Set<string>();
  const resolveSpec = (from: string, spec: string): string | null => {
    const base = spec.startsWith('@/') ? join(ROOT, 'src', spec.slice(2)) : spec.startsWith('.') ? resolve(from, '..', spec) : null;
    if (base === null) return null;
    for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]) {
      if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
    }
    return null;
  };
  const visit = (file: string) => {
    if (seen.has(file)) return;
    seen.add(file);
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(/^(?:import|export)\s+(?!type\b)[^;]*?from\s+['"]([^'"]+)['"]/gm)) {
      const next = resolveSpec(file, m[1]!);
      if (next !== null) visit(next);
    }
  };
  visit(join(ROOT, entry));
  return [...seen];
}

describe('the German Home composition', () => {
  const closure = importClosure('src/components/home/HomeStatic.tsx');

  it('reaches no Home model, phase note, live note or beacon', () => {
    expect(closure.length).toBeGreaterThan(10);
    for (const file of closure) expect(file, file).not.toMatch(/lib\/home\/model|PhaseLabel|TestNote|LiveNote|Beacon|lib\/experiment\/live/);
  });

  it('is a static page: no revalidate, no dynamic marker', () => {
    for (const page of ['src/app/de/page.tsx', 'src/app/de/work/page.tsx']) {
      expect(readFileSync(join(ROOT, page), 'utf8'), page).not.toMatch(/export const (revalidate|dynamic)/);
    }
  });
});
