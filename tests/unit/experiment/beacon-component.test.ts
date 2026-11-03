import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { post } from '@/components/experiment/ExperimentBeacon';
import { createSender } from '@/lib/experiment/beacon';
import type { BeaconBatch } from '@/lib/experiment/events';

// The browser half of the beacon is exercised in tests/e2e/experiment.spec.ts; these pin what its
// source may and may not touch.
const source = readFileSync(join(import.meta.dirname, '../../../src/components/experiment/ExperimentBeacon.tsx'), 'utf8');
const code = source.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

describe('ExperimentBeacon source', () => {
  it('is a client component', () => {
    expect(source.startsWith("'use client';")).toBe(true);
  });

  it('reads and writes no storage and no cookie', () => {
    for (const api of ['localStorage', 'sessionStorage', 'indexedDB', 'document.cookie', 'caches.', 'cookieStore']) {
      expect(code, api).not.toContain(api);
    }
  });

  it('posts to exactly /api/e, where the owner cookie is scoped', () => {
    expect(code).toContain("const ENDPOINT = '/api/e';");
    expect(code.match(/['"`]\/api\//g)).toHaveLength(1);
  });

  it('sends text/plain with fetch keepalive, or a text/plain Blob with sendBeacon', () => {
    expect(code).toMatch(/keepalive: true/);
    expect(code).toMatch(/'Content-Type': 'text\/plain'/);
    expect(code).toMatch(/new Blob\(\[body\], \{ type: 'text\/plain' \}\)/);
  });

  it('honours Global Privacy Control and Do Not Track before anything else', () => {
    expect(code).toMatch(/globalPrivacyControl === true \|\| n\.doNotTrack === '1'/);
    expect(code).toMatch(/if \(verdict === 'opt_out'\) return \(\) => \{\};/);
  });

  it('keeps the document-view flag in module memory', () => {
    expect(code).toMatch(/^let viewedInThisDocument = false;$/m);
    expect(code).toMatch(/const priorViewInDocument = viewedInThisDocument;\s+viewedInThisDocument = true;/);
  });

  it('waits for prerenderingchange before a prerendered page sends anything', () => {
    expect(code).toMatch(/if \(doc\.prerendering !== true\) return startView\(arm, ns\);/);
    expect(code).toMatch(/addEventListener\('prerenderingchange', activate, \{ once: true \}\)/);
  });
});

describe('ExperimentBeacon transport', () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    [() => new Response(null, { status: 429 }), { ok: false, reason: 'rate_limited' }],
    [() => new Response(null, { status: 403 }), { ok: false, reason: 'unavailable' }],
    [() => Response.json({ ok: false, reason: 'unknown' }, { status: 400 }), { ok: false, reason: 'unavailable' }],
    [() => new Response('{', { status: 400, headers: { 'content-type': 'application/json' } }), { ok: false, reason: 'unavailable' }],
    [() => Response.json({ ok: false, reason: 'paused' }, { status: 403 }), { ok: false, reason: 'paused' }],
    [() => Response.json({ ok: false, reason: 'paused' }), { ok: false, reason: 'paused' }],
    [() => Response.json({ ok: false, reason: 'unavailable' }, { status: 503 }), null],
    [() => new Response('bad gateway', { status: 502 }), null],
  ])('classifies the response and only flushes an ambiguous entry', async (response, expected) => {
    const fetch = vi.fn(async () => response());
    const sendBeacon = vi.fn((_endpoint: string, _body: Blob) => true);
    vi.stubGlobal('fetch', fetch);
    vi.stubGlobal('navigator', { sendBeacon });
    const batch: BeaconBatch = { v: 1, ns: 'aa-v1', pv: 'view-id', arm: 'b', events: [{ type: 'entry' }] };
    const entryResponse = post(batch, 'fetch');
    const sender = createSender({
      ns: batch.ns,
      arm: batch.arm,
      entry: 'entry',
      newId: () => batch.pv,
      post: (value, mode) => mode === 'fetch' ? entryResponse : post(value, mode),
    });
    sender.enqueue('inview', 'card');
    expect(await entryResponse).toEqual(expected);
    await Promise.resolve();
    expect(fetch).toHaveBeenCalledExactlyOnceWith('/api/e', {
      method: 'POST', body: JSON.stringify(batch), keepalive: true,
      credentials: 'same-origin', headers: { 'Content-Type': 'text/plain' },
    });
    expect(sendBeacon).not.toHaveBeenCalled();
    sender.flush();
    sender.flush();
    if (expected === null) {
      expect(sendBeacon).toHaveBeenCalledTimes(1);
      const [endpoint, body] = sendBeacon.mock.lastCall!;
      expect(endpoint).toBe('/api/e');
      expect(body.type).toBe('text/plain');
      expect(JSON.parse(await body.text())).toEqual({
        ...batch, events: [{ type: 'entry' }, { type: 'inview' }, { type: 'card' }],
      });
    } else {
      expect(sendBeacon).not.toHaveBeenCalled();
    }
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
