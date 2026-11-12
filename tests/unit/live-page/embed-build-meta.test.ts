// The build metadata is embedded while next.config.ts loads (the build), never read from public/
// at run time. embeddedBuildMeta decides what is embedded: the validated file, "null" for a build
// with no deploy signal and no file, and a thrown error for every other case, so a deploy build
// without its report, or with a broken one, fails instead of printing zeros.
import { describe, expect, it } from 'vitest';
import { BUILD_META_PATH, embeddedBuildMeta } from '../../../scripts/embed-build-meta.ts';
import { LIGHTHOUSE_LABEL, type BuildMeta } from '@/lib/live-page/build-meta-shape';

const META: BuildMeta = {
  commit: '0123456789abcdef0123456789abcdef01234567',
  builtAt: '2026-11-12T08:00:00.000Z',
  unitTests: { passed: 12, total: 12 },
  e2eTests: { passed: 4, total: 4 },
  axeViolations: 0,
  lighthouse: { performance: 100, accessibility: 95, bestPractices: 93, seo: 99 },
  lighthouseLabel: LIGHTHOUSE_LABEL,
};

const absent = (path: string): string => {
  const e = new Error(`ENOENT: no such file or directory, open '${path}'`) as NodeJS.ErrnoException;
  e.code = 'ENOENT';
  throw e;
};
const file = (content: string) => (path: string) => {
  expect(path).toMatch(new RegExp(`${BUILD_META_PATH.replace('.', '\\.')}$`));
  return content;
};

describe('embeddedBuildMeta', () => {
  it('reads public/build-meta.json', () => {
    expect(BUILD_META_PATH).toBe('public/build-meta.json');
  });

  it('embeds "null" when the file is absent and nothing says this is a deploy build', () => {
    expect(embeddedBuildMeta({}, absent)).toBe('null');
    expect(embeddedBuildMeta({ VERCEL: '', VERCEL_ENV: '' }, absent)).toBe('null');
  });

  it('throws when the file is absent on a deploy build (VERCEL_ENV or VERCEL set)', () => {
    expect(() => embeddedBuildMeta({ VERCEL_ENV: 'production' }, absent)).toThrow(/build-meta/);
    expect(() => embeddedBuildMeta({ VERCEL_ENV: 'preview' }, absent)).toThrow(/build-meta/);
    expect(() => embeddedBuildMeta({ VERCEL: '1' }, absent)).toThrow(/build-meta/);
  });

  it('embeds a valid file as JSON', () => {
    expect(JSON.parse(embeddedBuildMeta({}, file(JSON.stringify(META))))).toEqual(META);
    expect(JSON.parse(embeddedBuildMeta({ VERCEL: '1', VERCEL_ENV: 'production' }, file(`${JSON.stringify(META, null, 2)}\n`)))).toEqual(META);
  });

  it.each([
    ['empty', ''],
    ['whitespace', '  \n'],
    ['malformed', '{"commit":'],
    ['not build metadata', '{"commit":"abc"}'],
    ['a zero-test report', JSON.stringify({ ...META, unitTests: { passed: 0, total: 0 } })],
    ['passed above total', JSON.stringify({ ...META, e2eTests: { passed: 5, total: 4 } })],
    ['a short commit', JSON.stringify({ ...META, commit: 'unknown' })],
    ['no Lighthouse scores', JSON.stringify({ ...META, lighthouse: null })],
    ['a score out of range', JSON.stringify({ ...META, lighthouse: { ...META.lighthouse, seo: 101 } })],
    ['another label', JSON.stringify({ ...META, lighthouseLabel: 'field data' })],
  ])('throws on a file that is %s, with or without a deploy signal', (_name, content) => {
    expect(() => embeddedBuildMeta({}, file(content))).toThrow(/build-meta/);
    expect(() => embeddedBuildMeta({ VERCEL: '1' }, file(content))).toThrow(/build-meta/);
  });

  it('throws on a read error other than a missing file', () => {
    const denied = () => {
      const e = new Error('EACCES') as NodeJS.ErrnoException;
      e.code = 'EACCES';
      throw e;
    };
    expect(() => embeddedBuildMeta({}, denied)).toThrow(/EACCES/);
  });
});
