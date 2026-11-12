import { CSP } from '@/lib/csp';

// The config embeds public/build-meta.json, which is git-ignored and may exist in a working tree
// (after a local npm run build:meta). These tests read the config as a build with no such file.
vi.mock('node:fs', async (importOriginal) => {
  const fs = await importOriginal<typeof import('node:fs')>();
  const readFileSync = ((path: unknown, ...rest: unknown[]) => {
    if (path === 'public/build-meta.json') throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    return (fs.readFileSync as (...a: unknown[]) => unknown)(path, ...rest);
  }) as typeof fs.readFileSync;
  return { ...fs, readFileSync, default: { ...fs, readFileSync } };
});

const DEFAULTS = ['tsx', 'ts', 'jsx', 'js'];

let saved: string | undefined;

beforeEach(() => {
  saved = process.env.KITCHEN_SINK;
  vi.resetModules();
});

afterEach(() => {
  if (saved === undefined) delete process.env.KITCHEN_SINK;
  else process.env.KITCHEN_SINK = saved;
  vi.resetModules();
});

async function loadConfig() {
  return (await import('../../next.config.ts')).default;
}

describe('next.config', () => {
  it('does not include dev.tsx pages when KITCHEN_SINK is unset', async () => {
    delete process.env.KITCHEN_SINK;
    const config = await loadConfig();
    expect(config.pageExtensions).toEqual(DEFAULTS);
    expect(config.pageExtensions).not.toContain('dev.tsx');
  });

  it('does not include dev.tsx pages for other KITCHEN_SINK values', async () => {
    process.env.KITCHEN_SINK = '0';
    const config = await loadConfig();
    expect(config.pageExtensions).not.toContain('dev.tsx');
  });

  it('includes dev.tsx pages when KITCHEN_SINK is 1', async () => {
    process.env.KITCHEN_SINK = '1';
    const config = await loadConfig();
    expect(config.pageExtensions).toEqual([...DEFAULTS, 'dev.tsx']);
  });

  it('embeds the build metadata at build time: "null" for a build with no file and no deploy signal', async () => {
    vi.stubEnv('VERCEL', '');
    vi.stubEnv('VERCEL_ENV', '');
    const config = await loadConfig();
    vi.unstubAllEnvs();
    expect(config.env).toEqual({ BUILD_META_JSON: 'null' });
  });

  it('hides the X-Powered-By header', async () => {
    const config = await loadConfig();
    expect(config.poweredByHeader).toBe(false);
  });

  describe('security headers', () => {
    afterEach(() => vi.unstubAllEnvs());

    async function headersFor(nodeEnv: string) {
      vi.stubEnv('NODE_ENV', nodeEnv);
      const config = await loadConfig();
      return (await config.headers?.()) ?? [];
    }
    const valueOf = (entry: { headers: { key: string; value: string }[] } | undefined, key: string) =>
      entry?.headers.find((h) => h.key === key)?.value;

    it('sends the baseline headers on every route in a production build', async () => {
      const rules = await headersFor('production');
      const all = rules.find((r) => r.source === '/:path*');
      expect(all?.headers.map((h) => h.key).sort()).toEqual(
        ['Content-Security-Policy', 'Cross-Origin-Opener-Policy', 'Permissions-Policy', 'Referrer-Policy', 'X-Content-Type-Options'].sort(),
      );
      expect(valueOf(all, 'Content-Security-Policy')).toBe(CSP);
      expect(valueOf(all, 'X-Content-Type-Options')).toBe('nosniff');
      expect(valueOf(all, 'Referrer-Policy')).toBe('strict-origin-when-cross-origin');
      expect(valueOf(all, 'Permissions-Policy')).toBe('camera=(), microphone=(), geolocation=()');
      expect(valueOf(all, 'Cross-Origin-Opener-Policy')).toBe('same-origin');
    });

    it('sends no referrer and no cache from /exclude, after the site-wide rule so it wins', async () => {
      const rules = await headersFor('production');
      const exclude = rules.find((r) => r.source === '/exclude');
      expect(exclude?.headers).toEqual([
        { key: 'Referrer-Policy', value: 'no-referrer' },
        { key: 'Cache-Control', value: 'no-store' },
      ]);
      expect(rules.indexOf(exclude!)).toBeGreaterThan(rules.findIndex((r) => r.source === '/:path*'));
    });

    it('sends no security headers outside a production build', async () => {
      expect(await headersFor('development')).toEqual([]);
      expect(await headersFor('test')).toEqual([]);
    });
  });
});

describe('CSP', () => {
  const directive = (name: string) => CSP.split(';').map((d) => d.trim()).find((d) => d.startsWith(`${name} `));

  it('is the agreed policy, verbatim', () => {
    expect(CSP).toBe(
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
    );
  });

  it("limits requests from scripts to this site and forbids framing", () => {
    expect(directive('connect-src')).toBe("connect-src 'self'");
    expect(directive('frame-ancestors')).toBe("frame-ancestors 'none'");
  });

  it('allows no network source, no wildcard and no nonce', () => {
    expect(CSP).not.toMatch(/https?:|\*|nonce-|unsafe-eval|strict-dynamic/);
  });
});
