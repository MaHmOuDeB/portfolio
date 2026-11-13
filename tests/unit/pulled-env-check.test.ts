import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { REQUIRED, checkPulledEnv, main } from '../../scripts/pulled-env-check.ts';

// Before a production build, the deploy checks the environment `vercel pull --environment=production`
// wrote: the canonical origin comes from VERCEL_ENV and VERCEL_PROJECT_PRODUCTION_URL
// (src/lib/seo/metadata.ts), and a build without VERCEL_ENV="production" would silently use the
// test origin. The check prints variable names and pass or fail only, never a value.
const HOST = 'synthetic-production-host.example';
const OTHER = 'synthetic-other-value';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pulled-env-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function run(text: string | null): { status: number; out: string } {
  const file = join(dir, '.env.production.local');
  if (text !== null) writeFileSync(file, text);
  const lines: string[] = [];
  const status = main([file], { log: (l) => lines.push(l), error: (l) => lines.push(l) });
  return { status, out: lines.join('\n') };
}

const PULLED = ['# Created by Vercel CLI', 'OTHER="kept"', 'VERCEL_ENV="production"', `VERCEL_PROJECT_PRODUCTION_URL="${HOST}"`, `X="${OTHER}"`, ''].join('\n');

describe('checkPulledEnv', () => {
  it('requires exactly VERCEL_ENV and VERCEL_PROJECT_PRODUCTION_URL', () => {
    expect(REQUIRED).toEqual(['VERCEL_ENV', 'VERCEL_PROJECT_PRODUCTION_URL']);
  });

  it('passes a production pull with a production URL', () => {
    expect(checkPulledEnv(PULLED)).toEqual({ VERCEL_ENV: true, VERCEL_PROJECT_PRODUCTION_URL: true });
  });

  it('fails VERCEL_ENV when it is missing, empty, another environment or not exactly "production"', () => {
    const without = PULLED.replace('VERCEL_ENV="production"\n', '');
    for (const text of [
      without,
      PULLED.replace('VERCEL_ENV="production"', 'VERCEL_ENV=""'),
      PULLED.replace('VERCEL_ENV="production"', 'VERCEL_ENV="preview"'),
      PULLED.replace('VERCEL_ENV="production"', 'VERCEL_ENV="development"'),
      PULLED.replace('VERCEL_ENV="production"', 'VERCEL_ENV="Production"'),
      PULLED.replace('VERCEL_ENV="production"', 'VERCEL_ENV=" production"'),
      PULLED.replace('VERCEL_ENV="production"', '# VERCEL_ENV="production"'),
    ]) {
      expect(checkPulledEnv(text).VERCEL_ENV, text).toBe(false);
    }
  });

  it('fails VERCEL_PROJECT_PRODUCTION_URL when it is missing, empty or only whitespace', () => {
    for (const text of [
      PULLED.replace(`VERCEL_PROJECT_PRODUCTION_URL="${HOST}"\n`, ''),
      PULLED.replace(`VERCEL_PROJECT_PRODUCTION_URL="${HOST}"`, 'VERCEL_PROJECT_PRODUCTION_URL=""'),
      PULLED.replace(`VERCEL_PROJECT_PRODUCTION_URL="${HOST}"`, 'VERCEL_PROJECT_PRODUCTION_URL="   "'),
    ]) {
      expect(checkPulledEnv(text).VERCEL_PROJECT_PRODUCTION_URL, text).toBe(false);
    }
  });

  it('reads the file as dotenv does: unquoted and export lines, CRLF, and the last of two lines wins', () => {
    expect(checkPulledEnv(`VERCEL_ENV=production\r\nexport VERCEL_PROJECT_PRODUCTION_URL=${HOST}\r\n`)).toEqual({
      VERCEL_ENV: true,
      VERCEL_PROJECT_PRODUCTION_URL: true,
    });
    expect(checkPulledEnv(`${PULLED}VERCEL_ENV="preview"\n`).VERCEL_ENV).toBe(false);
  });
});

describe('pulled-env-check main', () => {
  it('exits 0 on a good pull and prints only the names and pass', () => {
    const r = run(PULLED);
    expect(r.status).toBe(0);
    expect(r.out).toBe(['VERCEL_ENV: pass', 'VERCEL_PROJECT_PRODUCTION_URL: pass', 'pulled environment: pass'].join('\n'));
  });

  it('exits 1 naming each failing variable, with no value', () => {
    const r = run(PULLED.replace('VERCEL_ENV="production"', 'VERCEL_ENV="preview"').replace(HOST, ''));
    expect(r.status).toBe(1);
    expect(r.out).toBe(
      [
        'VERCEL_ENV: fail (missing or not "production")',
        'VERCEL_PROJECT_PRODUCTION_URL: fail (missing or empty)',
        '::error::The pulled production environment fails VERCEL_ENV, VERCEL_PROJECT_PRODUCTION_URL; the canonical origin would be wrong, so nothing is built or deployed.',
      ].join('\n'),
    );
  });

  it('never prints a value from the file, on pass or on fail', () => {
    for (const text of [PULLED, PULLED.replace('VERCEL_ENV="production"', `VERCEL_ENV="${OTHER}"`)]) {
      const r = run(text);
      expect(r.out).not.toContain(HOST);
      expect(r.out).not.toContain(OTHER);
      expect(r.out).not.toContain('kept');
    }
  });

  it('exits 1 when the pulled file is missing (fails closed)', () => {
    const r = run(null);
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/^::error::The pulled environment file \.env\.production\.local is missing; nothing is built or deployed\.$/m);
  });

  it('exits 2 without exactly one file argument', () => {
    const lines: string[] = [];
    const out = { log: (l: string) => lines.push(l), error: (l: string) => lines.push(l) };
    expect(main([], out)).toBe(2);
    expect(main(['a', 'b'], out)).toBe(2);
    expect(lines.every((l) => l.startsWith('usage: '))).toBe(true);
  });
});
