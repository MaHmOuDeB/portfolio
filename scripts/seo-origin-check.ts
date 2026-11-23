// Checks that a production build names only its canonical origin: no test origin (any .invalid
// host) anywhere in the built pages, sitemap or robots, and every canonical link, og:url, og:image
// and twitter:image, every hreflang alternate link (in the pages, the RSC payloads and the sitemap's
// xhtml:link elements), every sitemap <loc> and the robots Sitemap line on https://<canonical>.
//
//   npm run seo:origin-check -- --canonical <host> [--dir .next]
//
// It reads the prerendered output under <dir>/server/app: *.html, the RSC payloads (*.rsc, including
// the *.segments/**/*.segment.rsc files), which carry the same metadata for client-side navigations,
// and the *.body files of the sitemap and robots routes. It exits 0 when clean, 1 on any problem (each printed), 2 on bad
// arguments. It also exits 1, with one line, when it checked no canonical link or no sitemap
// location, so an output whose metadata or sitemap went missing never passes on nothing. A build
// without VERCEL_ENV=production uses the test origin on purpose, so run this on a production build
// only.
//
// The deploy runs it on .next after `vercel build` and then ships .vercel/output. Both come from the
// same `vercel build`: Next writes its output to .next, and Vercel's Next builder makes
// .vercel/output from it, so the prerendered pages checked are the ones deployed.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { bareHostname } from '../src/lib/seo/hostname.ts';
import { DE_PAGES } from '../src/lib/i18n/pages.ts';

export type BuiltFile = { path: string; text: string };

const TEST_HOST = /\b[a-z0-9.-]*\.invalid\b/gi;
const LINK_CANONICAL = /<link\b[^>]*\brel="canonical"[^>]*>/gi;
const LINK = /<link\b[^>]*>/gi;
const META = /<meta\b[^>]*>/gi;
const ATTR = (name: string) => new RegExp(`\\b${name}="([^"]*)"`, 'i');
// Metadata in an RSC payload: {"rel":"canonical","href":"..."} or {"property"|"name":"og:url","content":"..."}.
const RSC_TAG = /\{"(rel|property|name)":"([^"]*)","(href|content)":"([^"]*)"/g;
// An alternate link in an RSC payload: an object with "rel":"alternate", an "hrefLang" and an "href".
const RSC_ALTERNATE = /\{[^{}]*"rel":"alternate"[^{}]*\}/g;
// A sitemap alternate: <xhtml:link rel="alternate" hreflang="de" href="..."/>.
const XHTML_LINK = /<xhtml:link\b[^>]*>/gi;
const URL_META = new Set(['og:url', 'og:image', 'og:image:url', 'og:image:secure_url', 'twitter:image', 'twitter:image:src']);

/** The href of each hreflang alternate among the link tags (an alternate with no hreflang, such as a feed, is not one). */
function alternateHrefs(tags: readonly string[]): string[] {
  return tags
    .filter((tag) => /\brel="alternate"/i.test(tag) && ATTR('hreflang').test(tag))
    .map((tag) => ATTR('href').exec(tag)?.[1] ?? '');
}

/** Every problem in the built files, as one line each; empty when the output is clean. */
export function findOriginProblems(files: readonly BuiltFile[], canonicalHost: string): string[] {
  const origin = `https://${canonicalHost.toLowerCase()}`;
  const problems: string[] = [];
  const onCanonical = (file: string, what: string, url: string) => {
    let parsed: URL | undefined;
    try {
      parsed = new URL(url);
    } catch {
      parsed = undefined;
    }
    if (parsed === undefined || parsed.origin !== origin) problems.push(`${file}: ${what} ${url} is not on ${origin}`);
  };
  for (const file of files) {
    for (const host of new Set((file.text.match(TEST_HOST) ?? []).map((h) => h.toLowerCase()))) {
      problems.push(`${file.path}: test origin ${host}`);
    }
    if (file.path.endsWith('.html')) {
      const canonicals = file.text.match(LINK_CANONICAL) ?? [];
      if (canonicals.length > 1) problems.push(`${file.path}: ${canonicals.length} canonical links`);
      for (const link of canonicals) onCanonical(file.path, 'canonical', ATTR('href').exec(link)?.[1] ?? '');
      for (const href of alternateHrefs(file.text.match(LINK) ?? [])) onCanonical(file.path, 'hreflang alternate', href);
      for (const tag of file.text.match(META) ?? []) {
        const key = (ATTR('property').exec(tag)?.[1] ?? ATTR('name').exec(tag)?.[1] ?? '').toLowerCase();
        if (URL_META.has(key)) onCanonical(file.path, key, ATTR('content').exec(tag)?.[1] ?? '');
      }
    } else if (file.path.endsWith('.rsc')) {
      for (const [, key, name, , url] of file.text.matchAll(RSC_TAG)) {
        const what = name!.toLowerCase();
        if (key === 'rel' ? what === 'canonical' : URL_META.has(what)) onCanonical(file.path, what, url!);
      }
      for (const tag of file.text.match(RSC_ALTERNATE) ?? []) {
        if (/"hrefLang":/i.test(tag)) onCanonical(file.path, 'hreflang alternate', /"href":"([^"]*)"/.exec(tag)?.[1] ?? '');
      }
    } else {
      // The sitemap's <loc> URLs and the robots Sitemap line; the XML namespace is not a site URL.
      for (const match of file.text.matchAll(/<loc>\s*([^<]*?)\s*<\/loc>/g)) onCanonical(file.path, 'sitemap loc', match[1]!);
      for (const href of alternateHrefs(file.text.match(XHTML_LINK) ?? [])) onCanonical(file.path, 'sitemap alternate', href);
      for (const match of file.text.matchAll(/^sitemap:\s*(\S+)/gim)) onCanonical(file.path, 'robots Sitemap', match[1]!);
    }
  }
  return problems;
}

/** How many canonical links (HTML and RSC) and sitemap locations the files hold. */
export function checkedCounts(files: readonly BuiltFile[]): { canonicals: number; sitemapLocations: number; alternates: number } {
  let canonicals = 0;
  let sitemapLocations = 0;
  let alternates = 0;
  for (const file of files) {
    if (file.path.endsWith('.html')) {
      canonicals += (file.text.match(LINK_CANONICAL) ?? []).length;
      alternates += alternateHrefs(file.text.match(LINK) ?? []).length;
    } else if (file.path.endsWith('.rsc')) {
      for (const [, key, name] of file.text.matchAll(RSC_TAG)) if (key === 'rel' && name!.toLowerCase() === 'canonical') canonicals += 1;
    } else if (file.path.endsWith('sitemap.xml.body')) {
      sitemapLocations += [...file.text.matchAll(/<loc>\s*([^<]*?)\s*<\/loc>/g)].length;
      alternates += alternateHrefs(file.text.match(XHTML_LINK) ?? []).length;
    }
  }
  return { canonicals, sitemapLocations, alternates };
}

/** The built pages, their RSC payloads, the sitemap and robots under <dir>/server/app. */
function builtFiles(dir: string): BuiltFile[] {
  const app = join(dir, 'server/app');
  if (!existsSync(app)) return [];
  return readdirSync(app, { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.html') || f.endsWith('.rsc') || /^(sitemap\.xml|robots\.txt)\.body$/.test(f.replaceAll('\\', '/')))
    .sort()
    .map((f) => ({ path: `server/app/${f.replaceAll('\\', '/')}`, text: readFileSync(join(app, f), 'utf8') }));
}

type Out = { log: (line: string) => void; error: (line: string) => void };

/** True when the German registry lists pages but the build carries no hreflang alternate: they were lost. */
export function missingAlternates(counts: { alternates: number }, dePages: readonly string[] = DE_PAGES): boolean {
  return dePages.length > 0 && counts.alternates === 0;
}

export function main(argv: readonly string[], out: Out = console): number {
  const value = (flag: string) => {
    const i = argv.indexOf(flag);
    return i === -1 ? undefined : argv[i + 1];
  };
  const raw = value('--canonical');
  const host = raw === undefined ? undefined : bareHostname(raw);
  if (host === undefined || host.endsWith('.invalid')) {
    out.error('usage: npm run seo:origin-check -- --canonical <bare production hostname> [--dir .next]');
    return 2;
  }
  const files = builtFiles(value('--dir') ?? '.next');
  if (files.length === 0) {
    out.error('no built pages under <dir>/server/app (run a production build first)');
    return 2;
  }
  const problems = findOriginProblems(files, host);
  for (const p of problems) out.log(p);
  const { canonicals, sitemapLocations, alternates } = checkedCounts(files);
  const read = `${files.length} file${files.length === 1 ? '' : 's'}`;
  if (canonicals === 0 && sitemapLocations === 0) {
    out.error(`seo origin check: found no canonical link and no sitemap location in ${read}; a production build has both`);
    return 1;
  }
  if (canonicals === 0) {
    out.error(`seo origin check: found no canonical link in ${read}; a production build has one on every page`);
    return 1;
  }
  if (sitemapLocations === 0) {
    out.error(`seo origin check: found no sitemap location in ${read}; a production build lists its pages in sitemap.xml`);
    return 1;
  }
  if (missingAlternates({ alternates })) {
    out.error(`seo origin check: found no hreflang alternate in ${read}; a production build links each page to its German twin`);
    return 1;
  }
  if (problems.length > 0) return 1;
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const alternate = alternates > 0 ? `, ${plural(alternates, 'hreflang alternate', 'hreflang alternates')}` : '';
  out.log(
    `seo origin check: ${read}, ${plural(canonicals, 'canonical link', 'canonical links')} and ${plural(sitemapLocations, 'sitemap location', 'sitemap locations')}${alternate}, only https://${host}`,
  );
  return 0;
}

if (process.argv[1]?.endsWith('seo-origin-check.ts')) process.exitCode = main(process.argv.slice(2));
