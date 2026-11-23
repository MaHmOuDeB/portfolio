// What a client component may never reach through static imports: German copy and the dictionaries.
// Client files get their strings as props from a server component.
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '../../..');

/** Static value imports and re-exports only: `import type` is erased, and import() is a separate chunk. */
function staticSpecifiers(text: string): string[] {
  const found: string[] = [];
  for (const m of text.matchAll(/^\s*(?:import|export)\s+(?!type\b)(?:[^'"`;]*?\sfrom\s+)?['"]([^'"]+)['"]/gm)) found.push(m[1]!);
  return found;
}

const isFile = (p: string) => existsSync(p) && statSync(p).isFile();

function resolveSpecifier(root: string, from: string, spec: string): string | null {
  const base = spec.startsWith('@/')
    ? join(root, 'src', spec.slice(2))
    : spec.startsWith('@content/')
      ? join(root, 'content', spec.slice(9))
      : spec.startsWith('.')
        ? resolve(dirname(from), spec)
        : null;
  if (base === null) return null;
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]) {
    if (isFile(candidate)) return candidate;
  }
  return null;
}

function sourceFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    return e.isDirectory() ? sourceFiles(p) : /\.tsx?$/.test(e.name) ? [p] : [];
  });
}

const CLIENT = /^\s*['"]use client['"]/;
const isClient = (file: string) => CLIENT.test(readFileSync(file, 'utf8').split('\n').find((l) => l.trim() !== '' && !l.trim().startsWith('//')) ?? '');

function forbidden(root: string, file: string): boolean {
  const rel = file.slice(root.length + 1);
  return rel.startsWith('content/de/') || rel.startsWith('content/i18n/') || /^src\/lib\/i18n\/dict[^/]*/.test(rel);
}

/** Every forbidden file a client file reaches, with the import chain's last hop; also the client count. */
function audit(root: string): { clients: number; leaks: string[] } {
  const clients = [...sourceFiles(join(root, 'src')), ...sourceFiles(join(root, 'content'))].filter(isClient);
  const leaks: string[] = [];
  for (const start of clients) {
    const seen = new Set<string>();
    const queue: Array<[string, string]> = [[start, '(client)']];
    while (queue.length > 0) {
      const [file, via] = queue.shift()!;
      if (seen.has(file)) continue;
      seen.add(file);
      if (forbidden(root, file)) leaks.push(`${start.slice(root.length + 1)} reaches ${file.slice(root.length + 1)} (via ${via.slice(root.length + 1)})`);
      for (const spec of staticSpecifiers(readFileSync(file, 'utf8'))) {
        const next = resolveSpecifier(root, file, spec);
        if (next !== null) queue.push([next, file]);
      }
    }
  }
  return { clients: clients.length, leaks };
}

const temps: string[] = [];
afterAll(() => temps.forEach((d) => rmSync(d, { recursive: true, force: true })));

describe('client files and German copy', () => {
  it('no client file reaches content/de, content/i18n or a dictionary', () => {
    const { clients, leaks } = audit(ROOT);
    console.log(`client-bundle: walked ${clients} client files`);
    expect(clients).toBeGreaterThan(0);
    expect(leaks).toEqual([]);
  });

  it('rejects a planted client file that imports German copy, directly or through a helper', () => {
    const root = mkdtempSync(join(tmpdir(), 'client-bundle-'));
    temps.push(root);
    mkdirSync(join(root, 'src/lib/i18n'), { recursive: true });
    mkdirSync(join(root, 'content/de'), { recursive: true });
    writeFileSync(join(root, 'content/de/home.ts'), 'export const HOME_DE = {};\n');
    writeFileSync(join(root, 'src/lib/i18n/dict.ts'), 'export const D = {};\n');
    writeFileSync(join(root, 'src/lib/helper.ts'), "export { HOME_DE } from '../../content/de/home';\n");
    writeFileSync(join(root, 'src/a.tsx'), "'use client';\nimport { HOME_DE } from '../content/de/home';\nexport const A = HOME_DE;\n");
    writeFileSync(join(root, 'src/b.tsx'), "'use client';\nimport { HOME_DE } from '@/lib/helper';\nexport const B = HOME_DE;\n");
    writeFileSync(join(root, 'src/c.tsx'), "'use client';\nimport { D } from '@/lib/i18n/dict';\nexport const C = D;\n");
    writeFileSync(join(root, 'src/ok.tsx'), "'use client';\nimport type { HOME_DE } from '../content/de/home';\nexport const O = 1;\n");
    const { clients, leaks } = audit(root);
    expect(clients).toBe(4);
    expect(leaks.map((l) => l.split(' ')[0]).sort()).toEqual(['src/a.tsx', 'src/b.tsx', 'src/c.tsx']);
  });
});
