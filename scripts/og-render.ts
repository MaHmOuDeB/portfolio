// Renders the sharing (Open Graph) images, public/og/<card>.png at 1200 x 630, from the cards in
// content/seo.ts and the template in src/lib/seo/og-template.ts, with Playwright's Chromium:
//
//   npm run og:render                    # writes public/og/*.png and scripts/og-images.lock.json
//   npm run og:render -- --preview DIR   # also writes DIR/<card>-350.png, each card at 350 px wide
//
// Everything is local: the colours are read from src/styles/tokens.css, the font is the vendored
// src/app/fonts/InterVariable-latin.woff2 embedded as a data URL, and every network request from the
// page is refused. The lock records a hash of the generator input (every card's HTML, which holds the
// text, colours and font, plus the viewport) and each PNG's hash and size;
// tests/unit/seo/metadata.test.ts fails when the input changed without a new render, or when a
// committed PNG is not the one this script wrote. Re-run it after changing a card, the template,
// the tokens or the font.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { OG_CARDS } from '../content/seo.ts';
import { OG_HEIGHT, OG_WIDTH, ogHtml, themeFromTokens } from '../src/lib/seo/og-template.ts';

export const OG_LOCK_PATH = 'scripts/og-images.lock.json';
const OUT_DIR = 'public/og';
const FONT = 'src/app/fonts/InterVariable-latin.woff2';
const TOKENS = 'src/styles/tokens.css';
const PREVIEW_WIDTH = 350;
const VIEWPORT = { width: OG_WIDTH, height: OG_HEIGHT, deviceScaleFactor: 1 };

type Plan = { cards: { file: string; html: string }[]; inputHash: string };

/** The page of every card, and the hash of everything that decides the pixels. */
export function renderPlan(root: string): Plan {
  const theme = themeFromTokens(readFileSync(join(root, TOKENS), 'utf8'));
  const fontUrl = `data:font/woff2;base64,${readFileSync(join(root, FONT)).toString('base64')}`;
  const cards = OG_CARDS.map((card) => ({ file: `${card.name}.png`, html: ogHtml(card, theme, fontUrl) }));
  const inputHash = createHash('sha256').update(JSON.stringify({ viewport: VIEWPORT, cards })).digest('hex');
  return { cards, inputHash };
}

const sha256 = (data: Buffer) => createHash('sha256').update(data).digest('hex');

async function main(argv: string[]): Promise<number> {
  const at = argv.indexOf('--preview');
  const previewDir = at === -1 ? undefined : argv[at + 1];
  if (at !== -1 && !previewDir) {
    console.error('usage: npm run og:render [-- --preview <dir>]');
    return 2;
  }
  const root = process.cwd();
  const plan = renderPlan(root);
  const { chromium } = await import('@playwright/test');
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: OG_WIDTH, height: OG_HEIGHT }, deviceScaleFactor: 1 });
    // Nothing leaves the machine: data: URLs are not requests, and any other request is refused.
    await context.route('**/*', (route) => route.abort());
    const page = await context.newPage();
    const out = join(root, OUT_DIR);
    mkdirSync(out, { recursive: true });
    for (const stale of readdirSync(out).filter((f) => f.endsWith('.png'))) rmSync(join(out, stale));
    const images: Record<string, { sha256: string; width: number; height: number }> = {};
    for (const card of plan.cards) {
      await page.setContent(card.html, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      const loaded = await page.evaluate(() => document.fonts.check('600 80px Inter') && document.fonts.check('500 32px Inter'));
      if (!loaded) throw new Error(`${card.file}: the embedded Inter did not load`);
      // Everything inside the padding, nothing overlapping: the text block ends above the footer
      // rule, the footer ends at the bottom padding, and no line is wider than the content box.
      const fit = await page.evaluate(() => {
        const box = (sel: string) => document.querySelector(sel)!.getBoundingClientRect();
        const text = document.querySelector('.frame > div:nth-child(2)')!;
        const foot = box('.foot');
        const lines = [...text.children].map((el) => el.getBoundingClientRect());
        const right = Math.max(...lines.map((r) => r.right), foot.right);
        const h1Lines = Math.round(box('h1').height / (80 * 1.04));
        return {
          ok: text.getBoundingClientRect().bottom <= foot.top && foot.bottom <= 630 - 72 + 0.5 && right <= 1200 - 80 + 0.5 && box('.glyph').top >= 72 - 0.5,
          h1Lines,
          gap: Math.round(foot.top - text.getBoundingClientRect().bottom),
        };
      });
      if (!fit.ok) throw new Error(`${card.file}: the card does not fit inside its padding`);
      console.log(`og:render ${card.file}: title on ${fit.h1Lines} line(s), ${fit.gap} px above the footer`);
      const png = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: OG_WIDTH, height: OG_HEIGHT } });
      writeFileSync(join(out, card.file), png);
      images[card.file] = { sha256: sha256(png), width: OG_WIDTH, height: OG_HEIGHT };
      if (previewDir) {
        const preview = await context.newPage();
        await preview.setViewportSize({ width: PREVIEW_WIDTH, height: Math.round((PREVIEW_WIDTH * OG_HEIGHT) / OG_WIDTH) });
        await preview.setContent(
          `<body style="margin:0"><img alt="" style="display:block;width:${PREVIEW_WIDTH}px" src="data:image/png;base64,${png.toString('base64')}"></body>`,
          { waitUntil: 'load' },
        );
        mkdirSync(resolve(previewDir), { recursive: true });
        await preview.screenshot({ path: join(resolve(previewDir), card.file.replace(/\.png$/, `-${PREVIEW_WIDTH}.png`)) });
        await preview.close();
      }
      console.log(`og:render ${OUT_DIR}/${card.file}`);
    }
    const lock = { inputHash: plan.inputHash, renderer: `chromium ${browser.version()}`, images };
    writeFileSync(join(root, OG_LOCK_PATH), `${JSON.stringify(lock, null, 2)}\n`);
    console.log(`og:render ${plan.cards.length} images, input ${plan.inputHash.slice(0, 12)}`);
    return 0;
  } finally {
    await browser.close();
  }
}

if (process.argv[1]?.endsWith('og-render.ts')) process.exitCode = await main(process.argv.slice(2));
