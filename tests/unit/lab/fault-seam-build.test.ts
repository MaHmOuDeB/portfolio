// The fault seam in a finished build. The source guard (fault-seam-guard.test.ts) proves no
// production module sets `faultAfterChange`; this scan checks the output of a plain build for the
// seam switched on, in any form a bundler or the server renderer may write it.
//
//   npm run build && REQUIRE_SEAM_BUILD_SCAN=1 npx vitest run tests/unit/lab/fault-seam-build.test.ts
//
// It needs a fresh plain build (no KITCHEN_SINK), so without REQUIRE_SEAM_BUILD_SCAN=1 it skips
// with a notice and `npm run check` never depends on .next. In required mode it fails when .next is
// missing, when no relevant file is inspected in either directory, or when the build holds a
// kitchen-sink route (the test build's hosts set the seam on purpose).
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findKitchenSinkRoutes } from '../../../scripts/assert-no-kitchen-sink.ts';

const ROOT = resolve(import.meta.dirname, '../../..');
const NEXT = join(ROOT, '.next');
const DIRS = ['server', 'static'] as const;
const RELEVANT = /\.(js|mjs|html|rsc|body|json)$/;
export const SEAM_ON = /["']?faultAfterChange["']?\s*:\s*(!0|true)\b/;

const required = process.env.REQUIRE_SEAM_BUILD_SCAN === '1';

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(dir, e.name)) : RELEVANT.test(e.name) ? [join(dir, e.name)] : [],
  );
}

describe('the seam pattern', () => {
  it('matches the seam switched on as a bundler or the renderer writes it, and nothing else', () => {
    for (const on of ['faultAfterChange:!0', 'faultAfterChange: true', '"faultAfterChange":true', "'faultAfterChange' : !0"]) {
      expect(SEAM_ON.test(on), on).toBe(true);
    }
    for (const off of ['faultAfterChange:e', 'faultAfterChange: undefined', '"faultAfterChange":trueish', 'faultAfterChange:!1', 'faultAfterChange']) {
      expect(SEAM_ON.test(off), off).toBe(false);
    }
  });
});

describe.skipIf(!required)('a plain production build', () => {
  it('holds no kitchen-sink route and never switches the seam on', () => {
    for (const d of DIRS) expect(existsSync(join(NEXT, d)), `.next/${d} is missing: run "npm run build" first`).toBe(true);
    const manifest = JSON.parse(readFileSync(join(NEXT, 'server', 'app-paths-manifest.json'), 'utf8')) as Record<string, string>;
    expect(findKitchenSinkRoutes(manifest), 'build without KITCHEN_SINK=1').toEqual([]);
    const hits: string[] = [];
    for (const d of DIRS) {
      const list = files(join(NEXT, d));
      console.log(`fault seam scan: .next/${d}: ${list.length} files inspected`);
      expect(list.length, `no relevant file in .next/${d}`).toBeGreaterThan(0);
      for (const f of list) if (SEAM_ON.test(readFileSync(f, 'utf8'))) hits.push(relative(ROOT, f));
    }
    expect(hits).toEqual([]);
  });
});

if (!required) {
  console.log('fault seam build scan skipped: set REQUIRE_SEAM_BUILD_SCAN=1 after a fresh plain "npm run build"');
}
