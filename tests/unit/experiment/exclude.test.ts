import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ServerEnv } from '@/lib/env';
import { OWNER_COOKIE, handleExclude, ownerCookieValid, ownerCookieValue } from '@/lib/experiment/exclude';

const TOKEN = 'a-long-random-owner-token-for-tests';
const ENV: ServerEnv = { vercelEnv: 'production', fakeStore: false, excludeToken: TOKEN };
const NO_TOKEN: ServerEnv = { vercelEnv: 'production', fakeStore: false };

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('https://portfolio.example/api/exclude', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}
const del = (headers: Record<string, string> = {}) =>
  new Request('https://portfolio.example/api/exclude', { method: 'DELETE', headers });

describe('handleExclude', () => {
  it('answers 404 when EXCLUDE_TOKEN is not set, for every method', async () => {
    for (const request of [post({ t: TOKEN }), del()]) {
      const res = await handleExclude(request, NO_TOKEN);
      expect(res.status).toBe(404);
      expect(res.headers.get('set-cookie')).toBeNull();
      expect(res.headers.get('cache-control')).toBe('no-store');
    }
  });

  it('answers 403 with no cookie for a wrong token', async () => {
    for (const t of ['wrong', '', TOKEN.slice(0, -1), `${TOKEN}x`]) {
      const res = await handleExclude(post({ t }), ENV);
      expect(res.status, JSON.stringify(t)).toBe(403);
      expect(res.headers.get('set-cookie')).toBeNull();
      expect(res.headers.get('cache-control')).toBe('no-store');
    }
  });

  it('answers 400 with no cookie for a body that is not {t: string}', async () => {
    for (const body of ['not json', '{}', '{"t":5}', '[]', 'null', '"x"']) {
      const res = await handleExclude(post(body), ENV);
      expect(res.status, body).toBe(400);
      expect(res.headers.get('set-cookie')).toBeNull();
    }
  });

  it('answers 413 for an oversized body, before reading it as a token', async () => {
    const res = await handleExclude(post(JSON.stringify({ t: 'x'.repeat(5000) })), ENV);
    expect(res.status).toBe(413);
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('answers 403 for a cross-site request even with the right token', async () => {
    for (const site of ['cross-site', 'same-site']) {
      const res = await handleExclude(post({ t: TOKEN }, { 'sec-fetch-site': site }), ENV);
      expect(res.status, site).toBe(403);
      expect(res.headers.get('set-cookie')).toBeNull();
    }
    expect((await handleExclude(del({ 'sec-fetch-site': 'cross-site' }), ENV)).status).toBe(403);
    expect((await handleExclude(post({ t: TOKEN }, { 'sec-fetch-site': 'same-origin' }), ENV)).status).toBe(204);
  });

  it('sets exactly the owner cookie for the right token', async () => {
    const res = await handleExclude(post({ t: TOKEN }), ENV);
    expect(res.status).toBe(204);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('set-cookie')).toBe(
      `${OWNER_COOKIE}=${ownerCookieValue(TOKEN)}; Path=/api/e; HttpOnly; Secure; SameSite=Strict; Max-Age=31536000`,
    );
    expect(await res.text()).toBe('');
  });

  it('never puts the token in a response', async () => {
    for (const res of [await handleExclude(post({ t: TOKEN }), ENV), await handleExclude(post({ t: 'x' }), ENV)]) {
      const everything = [...res.headers.entries()].flat().join('\n') + (await res.text());
      expect(everything).not.toContain(TOKEN);
    }
  });

  it('expires the cookie on DELETE', async () => {
    const res = await handleExclude(del(), ENV);
    expect(res.status).toBe(204);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('set-cookie')).toBe(
      `${OWNER_COOKIE}=; Path=/api/e; HttpOnly; Secure; SameSite=Strict; Max-Age=0`,
    );
  });

  it('answers 405 to any other method', async () => {
    const res = await handleExclude(new Request('https://portfolio.example/api/exclude', { method: 'PUT' }), ENV);
    expect(res.status).toBe(405);
  });
});

describe('ownerCookieValue and ownerCookieValid', () => {
  it('is a 64-character hex HMAC that depends on the token', () => {
    expect(ownerCookieValue(TOKEN)).toMatch(/^[0-9a-f]{64}$/);
    expect(ownerCookieValue(TOKEN)).toBe(ownerCookieValue(TOKEN));
    expect(ownerCookieValue(TOKEN)).not.toBe(ownerCookieValue(`${TOKEN}2`));
  });

  it('accepts its own value, alone or among other cookies', () => {
    const v = ownerCookieValue(TOKEN);
    expect(ownerCookieValid(`${OWNER_COOKIE}=${v}`, TOKEN)).toBe(true);
    expect(ownerCookieValid(`a=1; ${OWNER_COOKIE}=${v}; b=2`, TOKEN)).toBe(true);
  });

  it('rejects a forged value, a value for another token, a prefix and a name look-alike', () => {
    const v = ownerCookieValue(TOKEN);
    expect(ownerCookieValid(`${OWNER_COOKIE}=${'0'.repeat(64)}`, TOKEN)).toBe(false);
    expect(ownerCookieValid(`${OWNER_COOKIE}=${ownerCookieValue('other')}`, TOKEN)).toBe(false);
    expect(ownerCookieValid(`${OWNER_COOKIE}=${v.slice(0, 10)}`, TOKEN)).toBe(false);
    expect(ownerCookieValid(`${OWNER_COOKIE}=${v}0`, TOKEN)).toBe(false);
    expect(ownerCookieValid(`x${OWNER_COOKIE}=${v}`, TOKEN)).toBe(false);
    expect(ownerCookieValid(`${OWNER_COOKIE}x=${v}`, TOKEN)).toBe(false);
    expect(ownerCookieValid(`${OWNER_COOKIE}=${TOKEN}`, TOKEN)).toBe(false);
  });

  it('rejects an empty header, no header, an empty cookie, and an unset or empty token, without throwing', () => {
    const v = ownerCookieValue(TOKEN);
    expect(ownerCookieValid('', TOKEN)).toBe(false);
    expect(ownerCookieValid(null, TOKEN)).toBe(false);
    expect(ownerCookieValid(`${OWNER_COOKIE}=`, TOKEN)).toBe(false);
    expect(ownerCookieValid(`${OWNER_COOKIE}=${v}`, undefined)).toBe(false);
    expect(ownerCookieValid(`${OWNER_COOKIE}=${v}`, '')).toBe(false);
    expect(ownerCookieValid(`${OWNER_COOKIE}=${ownerCookieValue('')}`, '')).toBe(false);
    expect(ownerCookieValid(';;;=;==', TOKEN)).toBe(false);
  });
});

describe('ExcludeThisBrowser source', () => {
  const source = readFileSync(join(import.meta.dirname, '../../../src/components/experiment/ExcludeThisBrowser.tsx'), 'utf8');

  it('reads the token from the fragment and never from the query string', () => {
    expect(source).toContain('location.hash');
    expect(source).not.toContain('location.search');
    expect(source).not.toContain('useSearchParams');
  });

  it('touches no Web Storage', () => {
    expect(source).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie/);
  });

  it('clears the fragment from the address bar', () => {
    expect(source).toContain('history.replaceState');
  });
});

describe('eventDeps wiring', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('marks a request as the owner only with the cookie for the configured token', async () => {
    const { eventDeps } = await import('@/lib/experiment/deps');
    const cookie = `${OWNER_COOKIE}=${ownerCookieValue(TOKEN)}`;
    vi.stubEnv('EXCLUDE_TOKEN', TOKEN);
    expect(eventDeps().ownerCookieValid(cookie)).toBe(true);
    expect(eventDeps().ownerCookieValid(`${OWNER_COOKIE}=${ownerCookieValue('other')}`)).toBe(false);
    vi.stubEnv('EXCLUDE_TOKEN', '');
    expect(eventDeps().ownerCookieValid(cookie)).toBe(false);
  });
});
