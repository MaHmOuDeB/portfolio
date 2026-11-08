import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findPlaceholders, main } from '../../scripts/launch-placeholders.ts';

const FIXTURES = join(import.meta.dirname, '../fixtures/launch-placeholders');

describe('findPlaceholders', () => {
  it('finds the marker in a built page, with its fact and text', () => {
    const found = findPlaceholders([join(FIXTURES, 'with.html')]);
    expect(found).toEqual([{ file: join(FIXTURES, 'with.html'), text: expect.stringContaining('upstash-backups') }]);
    expect(found[0]!.text).toContain('Whether the counter database keeps backups.');
  });

  it('returns nothing for a page without it (a mention in prose is not a marker)', () => {
    expect(findPlaceholders([join(FIXTURES, 'without.html')])).toEqual([]);
  });
});

describe('main', () => {
  let dir: string;
  const lines: string[] = [];
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'placeholders-'));
    lines.length = 0;
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  function page(rel: string, html: string) {
    const path = join(dir, '.next/server/app', rel);
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, html);
  }

  it('exits 1 and names each placeholder in the built pages', () => {
    page('privacy.html', '<p data-launch-placeholder="upstash-backups">Not confirmed yet</p>');
    page('index.html', '<p>Fine</p>');
    expect(main(['--root', dir], (l) => lines.push(l))).toBe(1);
    expect(lines.join('\n')).toMatch(/privacy\.html.*upstash-backups/);
  });

  it('exits 0 when no built page has one', () => {
    page('privacy.html', '<p>All confirmed</p>');
    expect(main(['--root', dir], (l) => lines.push(l))).toBe(0);
  });

  it('exits 1 when there is no build to scan', () => {
    expect(main(['--root', dir], (l) => lines.push(l))).toBe(1);
    expect(lines.join('\n')).toMatch(/no built pages/);
  });
});
