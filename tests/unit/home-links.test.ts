import { globSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The home page is a counted experiment view: the proxy draws a group per request to /, and a
// prefetch is a request. So a next/link to / (or to /#fragment) must switch prefetch off, or take
// its value from prefetchFor(), which does so for the home path.
const ROOT = join(import.meta.dirname, '../..');

/** The opening tags of every `<Link ...>` in a source text, with their line numbers. Brace-aware. */
export function linkTags(source: string): { tag: string; line: number }[] {
  const tags: { tag: string; line: number }[] = [];
  for (const m of source.matchAll(/<Link\b/g)) {
    let i = m.index! + m[0].length;
    let depth = 0;
    let quote = '';
    for (; i < source.length; i++) {
      const c = source[i]!;
      if (quote) {
        if (c === quote) quote = '';
      } else if (c === '"' || c === "'" || (c === '`' && depth > 0)) quote = c;
      else if (c === '{') depth++;
      else if (c === '}') depth--;
      else if (c === '>' && depth === 0) break;
    }
    tags.push({ tag: source.slice(m.index!, i + 1), line: source.slice(0, m.index!).split('\n').length });
  }
  return tags;
}

const HOME_HREF = /\bhref=(?:"\/(?:#[^"]*)?"|'\/(?:#[^']*)?'|\{\s*["'`]\/(?:#[^"'`]*)?["'`]\s*\})/;
const SAFE = /\bprefetch=\{\s*(?:false|prefetchFor\()/;

/** The `<Link>` tags in a source text that go to the home page without turning prefetch off. */
export function unsafeHomeLinks(source: string): { tag: string; line: number }[] {
  return linkTags(source).filter(({ tag }) => HOME_HREF.test(tag) && !SAFE.test(tag));
}

describe('links to the home page', () => {
  it('flags a home link that does not switch prefetch off', () => {
    expect(unsafeHomeLinks('<Link href="/">Home</Link>')).toHaveLength(1);
    expect(unsafeHomeLinks('<Link href="/#top" className="a">Top</Link>')).toHaveLength(1);
    expect(unsafeHomeLinks("<Link\n  href={'/'}\n  prefetch>x</Link>")).toHaveLength(1);
    expect(unsafeHomeLinks('<Link href="/" prefetch={true}>x</Link>')).toHaveLength(1);
  });

  it('accepts prefetch={false} and prefetchFor(), and ignores other targets', () => {
    expect(unsafeHomeLinks('<Link href="/" prefetch={false}>x</Link>')).toEqual([]);
    expect(unsafeHomeLinks('<Link href="/#top" prefetch={prefetchFor("/#top")}>x</Link>')).toEqual([]);
    expect(unsafeHomeLinks('<Link href="/lab">x</Link>')).toEqual([]);
    expect(unsafeHomeLinks('<Link href={item.href} onClick={() => go()}>x</Link>')).toEqual([]);
  });

  it('has no unguarded home link in src', () => {
    const offenders: string[] = [];
    for (const file of globSync('src/**/*.{ts,tsx}', { cwd: ROOT })) {
      const source = readFileSync(join(ROOT, file), 'utf8');
      for (const { line } of unsafeHomeLinks(source)) offenders.push(`${file}:${line}`);
    }
    expect(offenders).toEqual([]);
  });
});
