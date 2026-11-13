// Checks that a production build names only its canonical origin: no test origin (any .invalid
// host) anywhere in the built pages, sitemap or robots, and every canonical link, og:url, og:image
// and twitter:image, every sitemap <loc> and the robots Sitemap line on https://<canonical>.
//
//   npm run seo:origin-check -- --canonical <host> [--dir .next]
//
// It reads the prerendered output under <dir>/server/app: *.html, the RSC payloads (*.rsc, including
// the *.segments/**/*.segment.rsc files), which carry the same metadata for client-side navigations,
// and the *.body files of the sitemap and robots routes. It exits 0 when clean, 1 on any problem (each printed), 2 on bad
// arguments. A build without VERCEL_ENV=production uses the test origin on purpose, so run this
// on a production build only.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { bareHostname } from '../src/lib/seo/hostname.ts';

export type BuiltFile = { path: string; text: string };

const TEST_HOST = /\b[a-z0-9.-]*\.invalid\b/gi;
const LINK_CANONICAL = /<link\b[^>]*\brel="canonical"[^>]*>/gi;
const META = /<meta\b[^>]*>/gi;
const ATTR = (name: string) => new RegExp(`\\b${name}="([^"]*)"`, 'i');
// Metadata in an RSC payload: {"rel":"canonical","href":"..."} or {"property"|"name":"og:url","content":"..."}.
const RSC_TAG = /\{"(rel|property|name)":"([^"]*)","(href|content)":"([^"]*)"/g;
const URL_META = new Set(['og:url', 'og:image', 'og:image:url', 'og:image:secure_url', 'twitter:image', 'twitter:image:src']);

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
      for (const tag of file.text.match(META) ?? []) {
        const key = (ATTR('property').exec(tag)?.[1] ?? ATTR('name').exec(tag)?.[1] ?? '').toLowerCase();
        if (URL_META.has(key)) onCanonical(file.path, key, ATTR('content').exec(tag)?.[1] ?? '');
      }
    } else if (file.path.endsWith('.rsc')) {
      for (const [, key, name, , url] of file.text.matchAll(RSC_TAG)) {
        const what = name!.toLowerCase();
        if (key === 'rel' ? what === 'canonical' : URL_META.has(what)) onCanonical(file.path, what, url!);
      }
    } else {
      // The sitemap's <loc> URLs and the robots Sitemap line; the XML namespace is not a site URL.
      for (const match of file.text.matchAll(/<loc>\s*([^<]*?)\s*<\/loc>/g)) onCanonical(file.path, 'sitemap loc', match[1]!);
      for (const match of file.text.matchAll(/^sitemap:\s*(\S+)/gim)) onCanonical(file.path, 'robots Sitemap', match[1]!);
    }
  }
  return problems;
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
  if (problems.length > 0) return 1;
  out.log(`seo origin check: ${files.length} files, only https://${host}`);
  return 0;
}

if (process.argv[1]?.endsWith('seo-origin-check.ts')) process.exitCode = main(process.argv.slice(2));
