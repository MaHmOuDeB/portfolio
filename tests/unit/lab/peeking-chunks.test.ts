// What the build ships for the peeking Figure, read from the built files of its dev host. It needs a
// fresh build with the dev host (`KITCHEN_SINK=1 npm run build`), so it skips with a notice unless
// REQUIRE_PEEK_CHUNK_SCAN=1; `npm run check` never depends on `.next`.
//
//   KITCHEN_SINK=1 npm run build && REQUIRE_PEEK_CHUNK_SCAN=1 npx vitest run tests/unit/lab/peeking-chunks.test.ts
//
// - The scripts the page names in its HTML (what loads at once) never hold the precomputed table.
// - Some other client chunk does: the island's, fetched on intent.
// - No client chunk holds the simulation engine: its name, or the seed constant of its generator.
// It prints the lazy chunk's size, raw and gzipped.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

const REPO = resolve(import.meta.dirname, '../../..');
const NEXT = join(REPO, '.next');
const HOST_HTML = join(NEXT, 'server/app/kitchen-sink/lab/peeking.html');
const STATIC = join(NEXT, 'static');
const REQUIRED = process.env.REQUIRE_PEEK_CHUNK_SCAN === '1';
const TABLE_KEY = 'daily/naive/20';
/** The engine's name and sfc32's seed constant in decimal and hex. */
const ENGINE = ['simulatePeeking', '2654435769', '0x9e3779b9'];
/** A string only the client-safe values hold: the eager file reached them. */
const VALUES_MARK = 'One look at the end needs no fix.';

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)]));
}

describe.skipIf(!REQUIRED)('the built peeking chunks', () => {
  it('keeps the table out of the eager scripts, puts it in a lazy chunk, and ships no engine', () => {
    expect(existsSync(HOST_HTML), `${HOST_HTML} (build with KITCHEN_SINK=1)`).toBe(true);
    const html = readFileSync(HOST_HTML, 'utf8');
    const eager = [...new Set([...html.matchAll(/\/_next\/static\/[^"'\s]+?\.js/g)].map((m) => m[0]))].map((p) => join(STATIC, p.slice('/_next/static/'.length)));
    expect(eager.length).toBeGreaterThan(0);
    for (const f of eager) expect(existsSync(f), f).toBe(true);
    const all = files(STATIC).filter((f) => f.endsWith('.js'));
    const text = new Map(all.map((f) => [f, readFileSync(f, 'utf8')]));

    const eagerWithTable = eager.filter((f) => text.get(f)!.includes(TABLE_KEY));
    expect(eagerWithTable).toEqual([]);
    expect(eager.some((f) => text.get(f)!.includes(VALUES_MARK))).toBe(true);
    const lazy = all.filter((f) => text.get(f)!.includes(TABLE_KEY));
    expect(lazy.length).toBeGreaterThan(0);
    for (const f of lazy) expect(eager).not.toContain(f);

    const engine = all.filter((f) => ENGINE.some((term) => text.get(f)!.includes(term)));
    expect(engine.map((f) => relative(REPO, f))).toEqual([]);

    console.log(`peeking chunks: ${eager.length} eager scripts, ${all.length} client chunks, ${lazy.length} with the table`);
    for (const f of lazy) {
      const raw = statSync(f).size;
      console.log(`lazy chunk ${relative(REPO, f)}: ${raw} B raw, ${gzipSync(readFileSync(f), { level: 9 }).length} B gzip (level 9)`);
    }
  });
});

describe.skipIf(REQUIRED)('the built peeking chunks (skipped)', () => {
  it('runs only with REQUIRE_PEEK_CHUNK_SCAN=1 after KITCHEN_SINK=1 npm run build', () => {
    console.log('peeking chunk scan skipped: set REQUIRE_PEEK_CHUNK_SCAN=1 after KITCHEN_SINK=1 npm run build');
  });
});
