// The test-build host preloads the real home page's fonts (the font manifest misses `page.dev.tsx`
// pages), so its layout-shift measurement matches the home page's.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { HOME_FONT_ENTRY, homeFontFiles } from '@/app/kitchen-sink/home/FontPreload';

const ROOT = path.resolve(__dirname, '../../..');

function distWith(manifest: unknown): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'font-preload-'));
  mkdirSync(path.join(dir, 'server'));
  writeFileSync(path.join(dir, 'server', 'next-font-manifest.json'), JSON.stringify(manifest));
  return dir;
}

describe('host font preload', () => {
  it('names the real home page module', () => {
    const rel = `${HOME_FONT_ENTRY.replace('[project]/', '')}.tsx`;
    expect(existsSync(path.join(ROOT, rel)), rel).toBe(true);
  });

  it("reads the home page's font files from the manifest", () => {
    const files = ['static/media/Inter-s.p.abc.woff2'];
    expect(homeFontFiles(distWith({ app: { [HOME_FONT_ENTRY]: files, '[project]/src/app/privacy/page': ['x.woff2'] } }))).toEqual(files);
    expect(homeFontFiles(distWith({ app: {} }))).toEqual([]);
  });

  it('gives null without a manifest (next dev)', () => {
    expect(homeFontFiles(mkdtempSync(path.join(os.tmpdir(), 'font-preload-')))).toBeNull();
  });

  it('every host page renders through HostHome, which renders the preload', () => {
    const host = readFileSync(path.join(ROOT, 'src/app/kitchen-sink/home/HostHome.tsx'), 'utf8');
    expect(host).toMatch(/<HomeFontPreload \/>/);
  });
});
