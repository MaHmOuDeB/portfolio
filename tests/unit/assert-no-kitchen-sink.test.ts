import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findKitchenSinkRoutes } from '../../scripts/assert-no-kitchen-sink.ts';

const SCRIPT = new URL('../../scripts/assert-no-kitchen-sink.ts', import.meta.url).pathname;

describe('findKitchenSinkRoutes', () => {
  it('returns the manifest keys that contain kitchen-sink', () => {
    expect(findKitchenSinkRoutes({ '/page': 'a', '/kitchen-sink/page': 'b' })).toEqual([
      '/kitchen-sink/page',
    ]);
  });

  it('returns every kitchen-sink route, nested ones included', () => {
    const manifest = {
      '/page': 'app/page.js',
      '/kitchen-sink/page': 'app/kitchen-sink/page.js',
      '/kitchen-sink/live/page': 'app/kitchen-sink/live/page.js',
    };
    expect(findKitchenSinkRoutes(manifest)).toEqual(['/kitchen-sink/page', '/kitchen-sink/live/page']);
  });

  it('returns nothing for an empty manifest or one without the route', () => {
    expect(findKitchenSinkRoutes({})).toEqual([]);
    expect(findKitchenSinkRoutes({ '/page': 'a', '/_not-found/page': 'b' })).toEqual([]);
  });
});

describe('assert-no-kitchen-sink command', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'no-sink-'));
    mkdirSync(join(dir, '.next/server'), { recursive: true });
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const run = (manifest: Record<string, string> | undefined) => {
    if (manifest) writeFileSync(join(dir, '.next/server/app-paths-manifest.json'), JSON.stringify(manifest));
    return spawnSync(
      process.execPath,
      ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', SCRIPT],
      { cwd: dir, encoding: 'utf8' },
    );
  };

  it('exits 0 when the build has no kitchen-sink route', () => {
    const result = run({ '/page': 'app/page.js' });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('no kitchen-sink route');
  });

  it('exits 1 and names the routes when the build has one', () => {
    const result = run({ '/page': 'a', '/kitchen-sink/page': 'b', '/kitchen-sink/live/page': 'c' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('/kitchen-sink/page');
    expect(result.stderr).toContain('/kitchen-sink/live/page');
  });

  it('exits 1 when there is no build to check', () => {
    const result = run(undefined);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('app-paths-manifest.json');
  });
});
