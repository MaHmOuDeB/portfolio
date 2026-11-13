// The Home and Figure composites keep the server/client split: a server file never pulls the kit's
// client barrel in by accident (only the hook and control wrappers are client modules), and a client
// module never brings the server-only Home model or live reader into the browser bundle, directly or
// through any module it imports (followed through every value import and dynamic import(), so a
// client file that imports, say, the scroll copy module would fail here). It may use the model's
// types (erased at build); for freshness it uses the client-safe freshness module.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const DIRS = ['src/components/home', 'src/components/figures'];
/** Client-safe by contract, though it has no directive: it runs only inside ScrollShell. */
const CLIENT_SAFE = ['src/lib/home/scroll-controller.ts'];

const files = DIRS.flatMap((d) => readdirSync(path.join(ROOT, d)).filter((f) => /\.tsx?$/.test(f)).map((f) => `${d}/${f}`));
const source = (f: string) => readFileSync(path.join(ROOT, f), 'utf8');
/** A 'use client' directive: the first statement, after comments only. */
const isClient = (f: string) => /^(?:\s*(?:\/\/[^\n]*|\/\*[\s\S]*?\*\/))*\s*['"]use client['"]/.test(source(f));

type Import = { typeOnly: boolean; specifier: string; target: string };
/** Every static import or re-export, and every dynamic import(), with its resolved repository path. */
function imports(f: string): Import[] {
  const src = source(f);
  const out: Import[] = [];
  const resolve = (spec: string) => {
    if (spec.startsWith('@/')) return `src/${spec.slice(2)}`.replace(/\.(tsx?)$/, '');
    if (spec.startsWith('.')) return path.posix.join(path.posix.dirname(f), spec).replace(/\.(tsx?)$/, '');
    return spec;
  };
  for (const m of src.matchAll(/^\s*(import|export)\s+(type\s+)?([^;'"]*?)\s*from\s*['"]([^'"]+)['"]/gm)) {
    out.push({ typeOnly: m[2] !== undefined, specifier: m[4]!, target: resolve(m[4]!) });
  }
  for (const m of src.matchAll(/^\s*import\s*['"]([^'"]+)['"]/gm)) out.push({ typeOnly: false, specifier: m[1]!, target: resolve(m[1]!) });
  for (const m of src.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)) out.push({ typeOnly: false, specifier: m[1]!, target: resolve(m[1]!) });
  return out;
}

const SERVER = files.filter((f) => !isClient(f));
const CLIENT = [...files.filter(isClient), ...CLIENT_SAFE];

describe('the composites keep the server/client split', () => {
  it('finds the modules it guards', () => {
    expect(SERVER).toEqual(expect.arrayContaining(['src/components/home/HomeSections.tsx', 'src/components/home/LiveNote.tsx', 'src/components/home/ScrollMoment.tsx']));
    expect(CLIENT).toEqual(
      expect.arrayContaining(['src/components/home/NoteFreshness.tsx', 'src/components/home/ScrollShell.tsx', 'src/components/home/HomeChart.tsx', 'src/lib/home/scroll-controller.ts']),
    );
  });

  it.each(SERVER)('%s (server): never imports the kit client barrel', (f) => {
    expect(imports(f).filter((i) => i.target === 'src/components/kit/client')).toEqual([]);
  });

  it.each(CLIENT)('%s (client): only types from the Home model, never the live reader', (f) => {
    const all = imports(f);
    expect(all.filter((i) => i.target === 'src/lib/home/model' && !i.typeOnly)).toEqual([]);
    expect(all.filter((i) => i.target === 'src/lib/experiment/live')).toEqual([]);
  });

  it('the guard sees a value import and a relative path', () => {
    // A self-check of the parser on a made-up file body, so a missed form cannot pass silently.
    const probe = (body: string) => {
      const src = body.matchAll(/^\s*(import|export)\s+(type\s+)?([^;'"]*?)\s*from\s*['"]([^'"]+)['"]/gm);
      return [...src].map((m) => ({ typeOnly: m[2] !== undefined, spec: m[4] }));
    };
    expect(probe("import { homeFreshnessAt, type HomeModel } from '@/lib/home/model';")).toEqual([{ typeOnly: false, spec: '@/lib/home/model' }]);
    expect(probe("import type {\n  HomeModel,\n} from '../../lib/home/model';")).toEqual([{ typeOnly: true, spec: '../../lib/home/model' }]);
  });

  it.each(CLIENT)('%s (client): no module it reaches through value or dynamic imports is the Home model or the live reader', (f) => {
    const reached = reachable(f);
    expect([...reached].filter(([file]) => SERVER_ONLY.includes(file)).map(([file, via]) => `${file} (imported by ${via})`)).toEqual([]);
  });

  it('the transitive walk is real: from the scroll copy module it reaches the live reader', () => {
    expect([...reachable('src/lib/home/scroll.tsx').keys()]).toContain('src/lib/experiment/live.ts');
    // and from a client module it reaches more than its direct imports
    expect([...reachable('src/components/home/ScrollShell.tsx').keys()]).toEqual(expect.arrayContaining(['src/components/home/HomeChart.tsx', 'src/components/home/HomeChartView.tsx', 'src/components/kit/ConfidenceChart.tsx']));
  });
});

/** The server-only modules no client module may reach. */
const SERVER_ONLY = ['src/lib/home/model.ts', 'src/lib/experiment/live.ts'];

/** Every repository file reachable from `root` through value imports, re-exports and dynamic import(); type-only imports are erased and not followed. */
function reachable(root: string): Map<string, string> {
  const seen = new Map<string, string>();
  const queue: [string, string][] = [[root, '(root)']];
  const file = (target: string): string | null => {
    for (const c of [target, `${target}.ts`, `${target}.tsx`, `${target}/index.ts`, `${target}/index.tsx`]) {
      if (existsSync(path.join(ROOT, c)) && statSync(path.join(ROOT, c)).isFile()) return c;
    }
    return null;
  };
  while (queue.length > 0) {
    const [f, via] = queue.shift()!;
    if (seen.has(f)) continue;
    seen.set(f, via);
    for (const i of imports(f)) {
      if (i.typeOnly) continue;
      const next = file(i.target);
      if (next !== null) queue.push([next, f]);
    }
  }
  return seen;
}

