// The sharing (Open Graph) image template: a 1200 x 630 page that scripts/og-render.ts draws with
// Playwright's Chromium into public/og/*.png. Pure: the colours come from tokens.css and the font
// from a URL the caller passes (the vendored Inter as a data URL), so the page loads nothing remote.
//
// Layout: the large interval glyph (96 x 16) at the top, then an 80 px title, 32 px lines under it
// and a 24 px footer above a rule, inside 72 px by 80 px padding. The site card's title is the site's
// headline and its line the role line; a case card's title is its finding and its line the study's
// name. Both carry the name in the footer. A proof line under the line is optional.
//
// Imports are relative with the .ts extension so scripts run with Node's type stripping can read
// this module.
import type { FactId } from '../facts/index.ts';

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

export type OgCard = {
  /** The file name under public/og, without .png. */
  name: string;
  variant: 'site' | 'case';
  title: string;
  sub: string;
  /** The site card's proof line: `strong` in ink, then `rest`. Numbers come from factText. */
  proof?: { strong: string; rest: string };
  footer: string;
  /** The facts whose numbers the card prints. */
  factIds: readonly FactId[];
};

export type OgTheme = { bg: string; ink: string; muted: string; line: string; series1: string; series2: string };

const TOKEN_NAMES: Record<keyof OgTheme, string> = {
  bg: 'bg',
  ink: 'ink',
  muted: 'muted',
  line: 'line',
  series1: 'series-1',
  series2: 'series-2',
};

/** The card's colours, read from the `--color-*` declarations of tokens.css. */
export function themeFromTokens(css: string): OgTheme {
  const theme = {} as OgTheme;
  for (const [key, token] of Object.entries(TOKEN_NAMES) as [keyof OgTheme, string][]) {
    const match = new RegExp(`--color-${token}:\\s*([^;]+);`).exec(css);
    if (!match) throw new Error(`tokens.css has no --color-${token}`);
    theme[key] = match[1]!.trim();
  }
  return theme;
}

const escapeHtml = (s: string) =>
  s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

/** Ends a part with a full stop unless it already ends a sentence. */
const sentence = (s: string) => (/[.!?]$/.test(s) ? s : `${s}.`);

/** The image's text alternative: what the card says, in reading order. */
export function ogAlt(card: OgCard): string {
  const parts = [card.title, card.sub];
  if (card.proof) parts.push(`${card.proof.strong}${card.proof.rest}`);
  parts.push(card.footer);
  return parts.map(sentence).join(' ');
}

/** The card as a standalone HTML page of exactly 1200 x 630 CSS pixels. */
export function ogHtml(card: OgCard, theme: OgTheme, fontUrl: string): string {
  const proof = card.proof
    ? `<p class="sub proof"><strong>${escapeHtml(card.proof.strong)}</strong>${escapeHtml(card.proof.rest)}</p>`
    : '';
  const css = [
    `@font-face{font-family:'Inter';font-style:normal;font-weight:100 900;src:url("${fontUrl}") format('woff2')}`,
    `:root{--bg:${theme.bg};--ink:${theme.ink};--muted:${theme.muted};--line:${theme.line};--s1:${theme.series1};--s2:${theme.series2}}`,
    '*{box-sizing:border-box}',
    'html,body{margin:0}',
    'body{width:1200px;height:630px;background:var(--bg);color:var(--ink);font-family:\'Inter\',sans-serif;font-optical-sizing:auto;font-feature-settings:"cv05","tnum";position:relative;overflow:hidden}',
    '.frame{position:absolute;inset:0;padding:72px 80px;display:flex;flex-direction:column;justify-content:space-between}',
    '.glyph{width:96px; height:16px;position:relative}',
    '.glyph b{position:absolute;left:0;right:0;top:7px;height:2px;background:var(--s1)}',
    '.glyph b::before,.glyph b::after{content:"";position:absolute;top:-5.4px;width:2.4px;height:12.8px;background:var(--s1)}',
    '.glyph b::before{left:0}.glyph b::after{right:0}',
    '.glyph i{position:absolute;left:62%;top:1.6px;width:12.8px;height:12.8px;margin-left:-6.4px;border-radius:50%;background:var(--s2);outline:3.2px solid var(--bg)}',
    'h1{font-size:80px;line-height:1.04;font-weight:600;letter-spacing:-.02em;margin:0;max-width:1040px}',
    '.sub{font-size:32px;line-height:1.3;color:var(--muted);margin:20px 0 0;font-weight:500;max-width:1040px}',
    '.sub.proof{margin-top:8px}',
    '.sub strong{color:var(--ink);font-weight:600}',
    '.foot{font-size:24px;color:var(--muted);border-top:1px solid var(--line);padding-top:22px}',
  ].join('\n');
  return [
    '<!doctype html><html lang="en"><head><meta charset="utf-8">',
    `<style>${css}</style></head><body>`,
    '<div class="frame">',
    '<div class="glyph" aria-hidden="true"><b></b><i></i></div>',
    `<div><h1>${escapeHtml(card.title)}</h1><p class="sub">${escapeHtml(card.sub)}</p>${proof}</div>`,
    `<div class="foot">${escapeHtml(card.footer)}</div>`,
    '</div></body></html>',
  ].join('');
}
