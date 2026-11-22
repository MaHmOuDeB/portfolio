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
