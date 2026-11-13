// Dev-only: preload the font files the real home page preloads, so a host page loads its fonts the
// way the home page does (Lighthouse's layout-shift budget depends on it).
//
// Why it is needed: next/font adds its preload through the font manifest, keyed by page module path
// without its extension. Turbopack keys a `page.dev.tsx` page as `.../page`, but the render looks
// it up as `.../page.dev`, so no test-build page gets a font preload while every real page does.
// This reads the real home page's entry from the same manifest and calls the same
// `ReactDOM.preload(href, { as: 'font', type })` that Next calls, so the tag is identical while
// next.config sets no `assetPrefix`, deployment id or cross-origin setting (Next would apply those;
// this does not), and while the build is Turbopack's (the manifest key form below).
import fs from 'node:fs';
import path from 'node:path';
import { preload } from 'react-dom';

/** The manifest key of the real home page (`src/app/v/[arm]/page.tsx`). */
export const HOME_FONT_ENTRY = '[project]/src/app/v/[arm]/page';

/** The font files the manifest lists for the real home page, or null without a production manifest. */
export function homeFontFiles(distDir = path.join(process.cwd(), '.next')): string[] | null {
  const file = path.join(distDir, 'server', 'next-font-manifest.json');
  if (!fs.existsSync(file)) return null;
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8')) as { app?: Record<string, string[]> };
  return manifest.app?.[HOME_FONT_ENTRY] ?? [];
}

export function HomeFontPreload() {
  const files = homeFontFiles();
  if (files === null) {
    // `next dev` keeps its manifest elsewhere; a production build must always find it.
    if (process.env.NODE_ENV === 'production') throw new Error('next-font-manifest.json not found');
    return null;
  }
  if (process.env.NODE_ENV === 'production' && files.length === 0) {
    throw new Error(`no font preload listed for ${HOME_FONT_ENTRY}`);
  }
  for (const file of files) {
    const ext = /\.(woff2?|eot|ttf|otf)$/.exec(file)?.[1] ?? 'woff2';
    preload(`/_next/${file}`, { as: 'font', type: `font/${ext}` });
  }
  return null;
}
