// What the documentation and the route lists promise, checked against the files that exist:
//
// - every row of the component catalogues in CLAUDE.md (the kit's primitives and the page
//   composites) names a file that exists, every name in the row is exported by that file, and the
//   "(client)" mark is there exactly when the file is a client module; every composite file is in
//   the catalogue;
// - every list of site paths (the navigation, the footer, the Work directory, the home page's
//   destinations, the sitemap and the sharing metadata) names only pages that ship, and every page
//   that ships is in the sharing inventory or explicitly left out of it;
// - no client module reaches, through any value or dynamic import, the server's experiment reader,
//   its store, the page projections or the build-time fixtures: the raw experiment snapshot never
//   enters a browser bundle.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { HOME_LINKS } from '../../../content/home-destinations.ts';
import { SEO_EXCLUDED_ROUTES, SEO_PAGES } from '../../../content/seo.ts';
import { WORK_GROUPS } from '../../../content/work.tsx';
import sitemap from '@/app/sitemap';
import { CONTACT_HREF, CV_LINK, LIVE_ROUTES, NAV, PRIVACY_HREF } from '@/lib/site';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const read = (f: string) => readFileSync(path.join(ROOT, f), 'utf8');
const claudeMd = read('CLAUDE.md');

// ───────────────────────────── the catalogues ─────────────────────────────

type Row = { names: string[]; file: string; client: boolean; line: string };

/** The table rows of one CLAUDE.md section: its backticked names, its file and its client mark. */
function rows(from: string, to: string, base: string): Row[] {
  const start = claudeMd.indexOf(from);
  const end = claudeMd.indexOf(to, start + from.length);
  expect(start, from).toBeGreaterThan(-1);
  expect(end, to).toBeGreaterThan(start);
  return claudeMd
    .slice(start, end)
    .split('\n')
    .filter((l) => l.startsWith('| `'))
    .map((line) => {
      const cells = line.split('|').map((c) => c.trim());
      const names = [...cells[1]!.matchAll(/`([^`]+)`/g)].map((m) => m[1]!);
      const file = /`([^`]+)`/.exec(cells[2]!)![1]!;
      return { names, file: file.startsWith('src/') ? file : `${base}/${file}`, client: /\(client\)/.test(cells[2]!), line: line.slice(0, 120) };
    });
}

const KIT = rows('## Primitives catalogue', '### Figure rules', 'src/components/kit');
const COMPOSITES = rows('### Composites', '\n## ', 'src/components');

/** A 'use client' directive: the first statement, after comments only. */
const isClient = (f: string) => /^(?:\s*(?:\/\/[^\n]*|\/\*[\s\S]*?\*\/))*\s*['"]use client['"]/.test(read(f));

/** Every name a module exports: declarations, export lists (with `as` renames) and re-exports. */
function exportedNames(f: string): Set<string> {
  const src = read(f);
  const names = new Set<string>();
  for (const m of src.matchAll(/export\s+(?:default\s+)?(?:declare\s+)?(?:async\s+)?(?:function\*?|const|let|var|class|type|interface|enum)\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]!);
  for (const m of src.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}/g)) {
    for (const part of m[1]!.split(',')) {
      const name = part.trim().replace(/^type\s+/, '').split(/\s+as\s+/).pop()!.trim();
      if (name) names.add(name);
    }
  }
  return names;
}

describe('the component catalogues in CLAUDE.md', () => {
  it('has rows to check', () => {
    expect(KIT.length).toBeGreaterThan(20);
    expect(COMPOSITES.length).toBeGreaterThan(40);
  });

  it.each([...KIT, ...COMPOSITES].map((r) => [r.file, r] as const))('%s: exists, exports every name its row lists and is a client module exactly when marked', (file, r) => {
    expect(existsSync(path.join(ROOT, file)), r.line).toBe(true);
    const names = exportedNames(file);
    expect(r.names.filter((n) => !names.has(n)), `${file}: listed but not exported`).toEqual([]);
    expect(isClient(file), `${file}: "(client)" mark`).toBe(r.client);
  });

  it('lists every composite file under the folders it names', () => {
    const folders = [...claudeMd.slice(claudeMd.indexOf('### Composites')).split('\n## ')[0]!.matchAll(/`(src\/components\/[a-z-]+)`/g)].map((m) => m[1]!);
    expect(folders.length).toBeGreaterThan(10);
    const listed = new Set(COMPOSITES.map((r) => r.file));
    const files = [...new Set(folders)].flatMap((d) =>
      readdirSync(path.join(ROOT, d))
        .filter((f) => /\.tsx$/.test(f))
        .map((f) => `${d}/${f}`),
    );
    // A module that exports a component (a capitalised function, or a capitalised arrow function or
    // wrapped component) is a composite.
    const COMPONENT = /export\s+(?:default\s+)?(?:async\s+)?function\s+[A-Z]|export\s+const\s+[A-Z]\w*\s*(?::[^=]+)?=\s*(?:(?:async\s*)?\([^)]*\)\s*(?::[^=]+)?=>|(?:memo|forwardRef|lazy|dynamic|catchError)\s*[(<])/;
    const components = files.filter((f) => COMPONENT.test(read(f)));
    expect(components.filter((f) => !listed.has(f))).toEqual([]);
  });

  it('the parser is not vacuous: it reads a client mark, a renamed export and a type export', () => {
    const r = rows('## Primitives catalogue', '### Figure rules', 'src/components/kit').find((x) => x.names.includes('Slider'));
    expect(r).toMatchObject({ file: 'src/components/kit/Slider.tsx', client: true });
    expect(exportedNames('src/components/kit/index.ts').size).toBeGreaterThan(10);
  });
});

// ───────────────────────────── the route lists ─────────────────────────────

const pathOf = (href: string) => new URL(href, 'https://site.invalid').pathname.replace(/(.)\/$/, '$1');
const ships = (href: string) => LIVE_ROUTES.includes(pathOf(href));

describe('every list of site paths names only pages that ship', () => {
  it('the navigation, the CV link and the footer', () => {
    const hrefs = [...NAV.map((l) => l.href), CV_LINK.href, CONTACT_HREF, PRIVACY_HREF];
    expect(hrefs.length).toBeGreaterThan(3);
    expect(hrefs.filter((h) => !ships(h))).toEqual([]);
  });

  it('the Work directory', () => {
    const hrefs = WORK_GROUPS.flatMap((g) => g.items.map((i) => i.href));
    expect(hrefs.length).toBe(8);
    expect(hrefs.filter((h) => !ships(h))).toEqual([]);
  });

  it("the home page's destinations", () => {
    const hrefs = Object.values(HOME_LINKS).map(String).filter((h) => h.startsWith('/'));
    expect(hrefs.length).toBeGreaterThan(3);
    expect(hrefs.filter((h) => !ships(h))).toEqual([]);
  });

  it('the sitemap', () => {
    const paths = sitemap().map((e) => new URL(e.url).pathname.replace(/(.)\/$/, '$1'));
    expect(paths.length).toBeGreaterThan(10);
    expect(paths.filter((p) => !LIVE_ROUTES.includes(p))).toEqual([]);
    expect(paths.filter((p) => SEO_EXCLUDED_ROUTES.includes(p))).toEqual([]);
  });

  it('the sharing inventory: every page that ships is in it or explicitly left out, and nothing else', () => {
    const inventory = [...SEO_PAGES.map((p) => p.path), ...SEO_EXCLUDED_ROUTES].sort();
    expect(inventory).toEqual([...LIVE_ROUTES].sort());
  });
});

// ───────────────────────────── the client boundary ─────────────────────────────

/** Server-only modules: the experiment reader and store, the page projections and the build-time fixtures. */
const SERVER_ONLY = [
  'src/lib/experiment/live.ts',
  'src/lib/experiment/store.ts',
  'src/lib/experiment/redis-rest.ts',
  'src/lib/experiment/memory-redis.ts',
  'src/lib/experiment/handler.ts',
  'src/lib/experiment/close.ts',
  'src/lib/experiment/internal.ts',
  'src/lib/experiment/public-data.ts',
  'src/lib/experiment/snapshot.ts',
  'src/lib/home/model.ts',
  'src/lib/home/fixtures.ts',
  'src/lib/home/narrative-fixtures.ts',
  'src/lib/live-page/model.ts',
  'src/lib/live-page/fixtures.ts',
  'src/lib/live-page/build-meta-file.ts',
];

function sourceFiles(dir: string): string[] {
  return readdirSync(path.join(ROOT, dir)).flatMap((f) => {
    const rel = `${dir}/${f}`;
    if (statSync(path.join(ROOT, rel)).isDirectory()) return sourceFiles(rel);
    return /\.(tsx?)$/.test(f) && !/\.d\.ts$/.test(f) ? [rel] : [];
  });
}

/** The repository file an import specifier names, or null for a package. */
function resolveImport(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith('@/')) base = `src/${spec.slice(2)}`;
  else if (spec.startsWith('.')) base = path.posix.join(path.posix.dirname(from), spec);
  else return null;
  base = base.replace(/\.(tsx?|jsx?)$/, '');
  for (const candidate of [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) {
    if (existsSync(path.join(ROOT, candidate))) return candidate;
  }
  return null;
}

/** Every value import, re-export and dynamic import() of a file (type-only imports are erased). */
function valueImports(f: string): string[] {
  const src = read(f);
  const specs: string[] = [];
  for (const m of src.matchAll(/^\s*(?:import|export)\s+(type\s+)?([^;'"]*?)\s*from\s*['"]([^'"]+)['"]/gm)) {
    const clause = m[2]!.trim();
    const allTypes = /^\{([^}]*)\}$/.test(clause) && clause.slice(1, -1).split(',').every((p) => !p.trim() || /^type\s/.test(p.trim()));
    if (m[1] === undefined && !allTypes) specs.push(m[3]!);
  }
  for (const m of src.matchAll(/^\s*import\s*['"]([^'"]+)['"]/gm)) specs.push(m[1]!);
  for (const m of src.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)) specs.push(m[1]!);
  return specs.map((s) => resolveImport(f, s)).filter((x): x is string => x !== null);
}

/** Every repository module a file reaches through value imports, with the module that imported it. */
function reachable(f: string): Map<string, string> {
  const seen = new Map<string, string>([[f, '(start)']]);
  const queue = [f];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const next of valueImports(cur)) {
      if (!seen.has(next)) {
        seen.set(next, cur);
        queue.push(next);
      }
    }
  }
  return seen;
}

const CLIENT_MODULES = sourceFiles('src').filter(isClient);

describe('no client module reaches the raw experiment data', () => {
  it('finds the client modules', () => {
    expect(CLIENT_MODULES.length).toBeGreaterThan(30);
    expect(CLIENT_MODULES).toEqual(expect.arrayContaining(['src/components/experiment/ExperimentBeacon.tsx', 'src/components/kit/LoadOnIntent.tsx']));
  });

  it.each(CLIENT_MODULES)('%s: reaches no server-only module', (f) => {
    const reached = reachable(f);
    expect([...reached].filter(([file]) => SERVER_ONLY.includes(file)).map(([file, via]) => `${file} (imported by ${via})`)).toEqual([]);
  });

  it('the walk is real: the Live test route reaches the reader and the projection, and a type-only import is not followed', () => {
    const fromRoute = [...reachable('src/app/experiment/page.tsx').keys()];
    expect(fromRoute).toEqual(expect.arrayContaining(['src/lib/experiment/live.ts', 'src/lib/live-page/model.ts']));
    for (const f of SERVER_ONLY) expect(existsSync(path.join(ROOT, f)), f).toBe(true);
    expect(valueImports('src/components/home/HomeChart.tsx')).not.toContain('src/lib/home/model.ts');
  });
});
