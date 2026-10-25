import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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
    expect(code).toMatch(/if \(verdict === 'opt_out'\) return;/);
  });

  it('keeps the document-view flag in module memory', () => {
    expect(code).toMatch(/^let viewedInThisDocument = false;$/m);
    expect(code).toMatch(/const priorViewInDocument = viewedInThisDocument;\s+viewedInThisDocument = true;/);
  });
});
