import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NextRequest } from 'next/server';
import { config, proxy } from '@/proxy';

const CHROME = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const GOOGLEBOT = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

const VARS = ['VERCEL_ENV', 'VERCEL_PROJECT_PRODUCTION_URL'] as const;
const saved: Record<string, string | undefined> = {};
beforeEach(() => {
  for (const name of VARS) {
    saved[name] = process.env[name];
    delete process.env[name];
  }
});
afterEach(() => {
  for (const name of VARS) {
    if (saved[name] === undefined) delete process.env[name];
    else process.env[name] = saved[name];
  }
});

function request(url: string, ua: string | null = CHROME): NextRequest {
  return new NextRequest(url, { headers: ua === null ? {} : { 'user-agent': ua } });
}

/** The rewrite target Next applies, as a path with its query. */
function rewriteOf(res: Response): string | null {
  const target = res.headers.get('x-middleware-rewrite');
  if (target === null) return null;
  const u = new URL(target);
  return `${u.pathname}${u.search}`;
}

describe('proxy on /', () => {
  it('rewrites to /v/a or /v/b with x-arm set, and sets no cookie', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const res = proxy(request('http://localhost:3123/'));
      const target = rewriteOf(res);
      expect(target).toMatch(/^\/v\/[ab]$/);
      expect(res.headers.get('x-arm')).toBe(target!.slice(3));
      expect(res.headers.get('set-cookie')).toBeNull();
      seen.add(target!);
    }
    expect([...seen].sort()).toEqual(['/v/a', '/v/b']);
  });

  it('keeps the search params, and ?variant=b forces group b', () => {
    const res = proxy(request('http://localhost:3123/?variant=b&utm_source=x'));
    expect(rewriteOf(res)).toBe('/v/b?variant=b&utm_source=x');
    expect(res.headers.get('x-arm')).toBe('b');
  });

  it('sends a Googlebot user agent to group a whatever it asks for', () => {
    for (const url of ['http://localhost:3123/', 'http://localhost:3123/?variant=b']) {
      const res = proxy(request(url, GOOGLEBOT));
      expect(rewriteOf(res)?.startsWith('/v/a')).toBe(true);
      expect(res.headers.get('x-arm')).toBe('a');
    }
  });

  it('in production, redirects a host other than the canonical one to it with a 308', () => {
    process.env.VERCEL_ENV = 'production';
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'mahmoud.example';
    const res = proxy(request('https://portfolio-xyz.vercel.app/?variant=a'));
    expect(res.status).toBe(308);
    expect(res.headers.get('location')).toBe('https://mahmoud.example/?variant=a');
    expect(res.headers.get('x-arm')).toBeNull();
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('in production, rewrites on the canonical host (any letter case)', () => {
    process.env.VERCEL_ENV = 'production';
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'mahmoud.example';
    const res = proxy(request('https://Mahmoud.Example/'));
    expect(res.status).toBe(200);
    expect(rewriteOf(res)).toMatch(/^\/v\/[ab]$/);
  });

  it('outside production, never redirects for the host', () => {
    process.env.VERCEL_ENV = 'preview';
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'mahmoud.example';
    const res = proxy(request('https://portfolio-git-branch.vercel.app/'));
    expect(res.headers.get('location')).toBeNull();
    expect(rewriteOf(res)).toMatch(/^\/v\/[ab]$/);
  });
});

describe('proxy on /v/*', () => {
  it('rewrites every direct request to /v/_, which has no page (404), never to /_not-found', () => {
    for (const path of ['/v/a', '/v/b', '/v/zz', '/v/a/extra']) {
      const res = proxy(request(`http://localhost:3123${path}`));
      expect(rewriteOf(res), path).toBe('/v/_');
      expect(res.headers.get('x-arm'), path).toBeNull();
    }
  });
});

describe('proxy config and source', () => {
  it('matches / and /v/:path*, the latter only without the revalidation header', () => {
    expect(config).toEqual({
      matcher: [{ source: '/' }, { source: '/v/:path*', missing: [{ type: 'header', key: 'x-prerender-revalidate' }] }],
    });
  });

  it('draws with crypto.getRandomValues, never Math.random, and logs nothing', () => {
    const source = readFileSync(join(import.meta.dirname, '../../../src/proxy.ts'), 'utf8');
    expect(source).toContain('crypto.getRandomValues');
    expect(source).not.toContain('Math.random');
    expect(source).not.toMatch(/console\./);
  });
});
