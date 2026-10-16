import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sha256Hex, type Lock } from '../../../scripts/sources/lock.ts';
import {
  checkVendored,
  readAtCommit,
  updateEntry,
  vendorAll,
  verifyRemote,
  writeFactsModule,
} from '../../../scripts/sync-sources.ts';

const FIXTURES = new URL('../../fixtures/sources/', import.meta.url).pathname;
const RETENTION_BYTES = readFileSync(join(FIXTURES, 'retention.valid.json'));
const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

type World = { base: string; root: string; sourcesRoot: string; repoDir: string; bare: string };
let w: World;
const empty = (): Lock => ({ version: 1, sources: {} });

// A temp portfolio root (profile fixture, no sources), a source repo with the fixture committed at
// reports/site/retention.json, and a bare repo as origin. The https fetch URL names the GitHub repo;
// pushes go to the bare repo through a separate push URL.
function makeWorld(): World {
  const base = mkdtempSync(join(tmpdir(), 'sync-sources-'));
  const root = join(base, 'portfolio');
  const sourcesRoot = join(base, 'code');
  const repoDir = join(sourcesRoot, 'customer-retention-rfm');
  const bare = join(base, 'origin.git');
  mkdirSync(join(root, 'data/facts'), { recursive: true });
  mkdirSync(join(root, 'src/lib/facts'), { recursive: true });
  copyFileSync(join(FIXTURES, 'profile.valid.json'), join(root, 'data/facts/profile.json'));
  mkdirSync(join(repoDir, 'reports/site'), { recursive: true });
  copyFileSync(join(FIXTURES, 'retention.valid.json'), join(repoDir, 'reports/site/retention.json'));
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', bare]);
  git(repoDir, 'init', '-q', '-b', 'main');
  git(repoDir, 'config', 'user.email', 'test@example.org');
  git(repoDir, 'config', 'user.name', 'Test');
  git(repoDir, 'config', 'commit.gpgsign', 'false');
  git(repoDir, 'add', '.');
  git(repoDir, 'commit', '-q', '-m', 'export');
  git(repoDir, 'remote', 'add', 'origin', 'https://github.com/mahmoud/customer-retention-rfm.git');
  git(repoDir, 'remote', 'set-url', '--push', 'origin', bare);
  return { base, root, sourcesRoot, repoDir, bare };
}

// Pushed, pinned, vendored, generated: the state `npm run sources:sync -- --update` leaves behind.
function syncedLock(): Lock {
  git(w.repoDir, 'push', '-q', '-u', 'origin', 'main');
  const lock = updateEntry({ id: 'retention', ref: 'HEAD', lock: empty(), root: w.root, sourcesRoot: w.sourcesRoot });
  vendorAll({ lock, root: w.root, sourcesRoot: w.sourcesRoot });
  writeFactsModule(w.root, lock);
  return lock;
}

beforeEach(() => {
  w = makeWorld();
});
afterEach(() => {
  rmSync(w.base, { recursive: true, force: true });
});

describe('readAtCommit', () => {
  it('returns the exact bytes committed at the path', () => {
    const commit = git(w.repoDir, 'rev-parse', 'HEAD');
    expect(readAtCommit(w.repoDir, commit, 'reports/site/retention.json').equals(RETENTION_BYTES)).toBe(true);
  });

  it('throws for a path that is not in the commit', () => {
    expect(() => readAtCommit(w.repoDir, 'HEAD', 'reports/site/nope.json')).toThrow();
  });
});

describe('updateEntry', () => {
  it('refuses a commit that exists only on this machine', () => {
    expect(() =>
      updateEntry({ id: 'retention', ref: 'HEAD', lock: empty(), root: w.root, sourcesRoot: w.sourcesRoot }),
    ).toThrow(/not pushed/);
  });

  it('pins a pushed commit with the repo from origin, the export path and its schema', () => {
    git(w.repoDir, 'push', '-q', '-u', 'origin', 'main');
    const lock = updateEntry({ id: 'retention', ref: 'main', lock: empty(), root: w.root, sourcesRoot: w.sourcesRoot });
    expect(lock.sources.retention).toEqual({
      repo: 'mahmoud/customer-retention-rfm',
      commit: git(w.repoDir, 'rev-parse', 'HEAD'),
      path: 'reports/site/retention.json',
      sha256: sha256Hex(RETENTION_BYTES),
      schema: 'retention/1',
    });
  });

  it('accepts the ssh form of the origin URL', () => {
    git(w.repoDir, 'push', '-q', '-u', 'origin', 'main');
    git(w.repoDir, 'remote', 'set-url', 'origin', 'git@github.com:mahmoud/customer-retention-rfm.git');
    const lock = updateEntry({ id: 'retention', ref: 'HEAD', lock: empty(), root: w.root, sourcesRoot: w.sourcesRoot });
    expect(lock.sources.retention?.repo).toBe('mahmoud/customer-retention-rfm');
  });

  it('rejects an origin that is not on GitHub', () => {
    git(w.repoDir, 'push', '-q', '-u', 'origin', 'main');
    git(w.repoDir, 'remote', 'set-url', 'origin', 'https://example.org/x/y.git');
    expect(() =>
      updateEntry({ id: 'retention', ref: 'HEAD', lock: empty(), root: w.root, sourcesRoot: w.sourcesRoot }),
    ).toThrow(/origin/);
  });

  it('does not change the lock it was given', () => {
    git(w.repoDir, 'push', '-q', '-u', 'origin', 'main');
    const lock = empty();
    updateEntry({ id: 'retention', ref: 'HEAD', lock, root: w.root, sourcesRoot: w.sourcesRoot });
    expect(lock).toEqual(empty());
  });
});

describe('vendorAll', () => {
  it('writes the exact bytes of every pinned export to data/sources/<id>.json', () => {
    const lock = syncedLock();
    expect(readFileSync(join(w.root, 'data/sources/retention.json')).equals(RETENTION_BYTES)).toBe(true);
    expect(lock.sources.retention?.sha256).toBe(sha256Hex(RETENTION_BYTES));
  });

  it('refuses a commit whose bytes no longer match the locked sha256', () => {
    const lock = syncedLock();
    const bad: Lock = { version: 1, sources: { retention: { ...lock.sources.retention!, sha256: '0'.repeat(64) } } };
    expect(() => vendorAll({ lock: bad, root: w.root, sourcesRoot: w.sourcesRoot })).toThrow(/retention.*sha256/);
  });
});

describe('checkVendored', () => {
  it('passes for an empty lock with only the profile', () => {
    writeFactsModule(w.root, empty());
    expect(checkVendored({ lock: empty(), root: w.root })).toEqual([]);
  });

  it('passes after update, vendor and generate', () => {
    const lock = syncedLock();
    expect(checkVendored({ lock, root: w.root })).toEqual([]);
  });

  it('reports one problem when a single byte of the vendored file changes', () => {
    const lock = syncedLock();
    const file = join(w.root, 'data/sources/retention.json');
    const text = readFileSync(file, 'utf8');
    writeFileSync(file, text.replace('0.201', '0.202'));
    const problems = checkVendored({ lock, root: w.root });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/retention.*sha256/);
  });

  it('reports a vendored file whose lock entry was deleted', () => {
    syncedLock();
    const problems = checkVendored({ lock: empty(), root: w.root });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/data\/sources\/retention.json.*no lock entry/);
  });

  it('reports a lock entry without a file', () => {
    const lock = syncedLock();
    rmSync(join(w.root, 'data/sources/retention.json'));
    const problems = checkVendored({ lock, root: w.root });
    expect(problems.some((p) => /retention.*no file/.test(p))).toBe(true);
  });

  it('reports a _meta.schema or _meta.source that disagrees with the lock', () => {
    const lock = syncedLock();
    const file = join(w.root, 'data/sources/retention.json');
    const json = JSON.parse(readFileSync(file, 'utf8'));
    json._meta.source = 'weather';
    const edited = JSON.stringify(json);
    writeFileSync(file, edited);
    const fixed: Lock = { version: 1, sources: { retention: { ...lock.sources.retention!, sha256: sha256Hex(edited) } } };
    const problems = checkVendored({ lock: fixed, root: w.root });
    expect(problems.some((p) => /retention.*_meta\.source/.test(p))).toBe(true);
  });

  it('reports a schema failure', () => {
    const lock = syncedLock();
    const file = join(w.root, 'data/sources/retention.json');
    const json = JSON.parse(readFileSync(file, 'utf8'));
    delete json.facts;
    const edited = JSON.stringify(json);
    writeFileSync(file, edited);
    const fixed: Lock = { version: 1, sources: { retention: { ...lock.sources.retention!, sha256: sha256Hex(edited) } } };
    const problems = checkVendored({ lock: fixed, root: w.root });
    expect(problems.some((p) => /retention.*schema/.test(p))).toBe(true);
  });

  it('reports a hand-edited facts.generated.ts as stale', () => {
    const lock = syncedLock();
    const file = join(w.root, 'src/lib/facts/facts.generated.ts');
    writeFileSync(file, `${readFileSync(file, 'utf8')}// hand edit\n`);
    const problems = checkVendored({ lock, root: w.root });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/facts\.generated\.ts is stale/);
  });

  it('reports a missing facts.generated.ts as stale', () => {
    expect(checkVendored({ lock: empty(), root: w.root })[0]).toMatch(/facts\.generated\.ts is stale/);
  });
});

describe('verifyRemote', () => {
  const urlOf = (lock: Lock) => {
    const e = lock.sources.retention!;
    return `https://raw.githubusercontent.com/${e.repo}/${e.commit}/${e.path}`;
  };
  const reply = (status: number, body: Uint8Array | string = ''): typeof fetch =>
    (async () => new Response(typeof body === 'string' ? body : Buffer.from(body), { status })) as typeof fetch;

  it('reports a 404 naming the source', async () => {
    const lock = syncedLock();
    const problems = await verifyRemote({ lock, fetch: reply(404) });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/retention.*404/);
  });

  it('asks raw.githubusercontent.com for the pinned commit and path', async () => {
    const lock = syncedLock();
    const seen: string[] = [];
    const spy = (async (input: unknown) => {
      seen.push(String(input));
      return new Response(Buffer.from(RETENTION_BYTES), { status: 200 });
    }) as typeof fetch;
    await verifyRemote({ lock, fetch: spy });
    expect(seen).toEqual([urlOf(lock)]);
  });

  it('passes when the remote bytes match the lock', async () => {
    const lock = syncedLock();
    expect(await verifyRemote({ lock, fetch: reply(200, RETENTION_BYTES) })).toEqual([]);
  });

  it('reports other bytes as a sha256 mismatch', async () => {
    const lock = syncedLock();
    const problems = await verifyRemote({ lock, fetch: reply(200, 'something else') });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/retention.*sha256/);
  });

  it('reports a network failure naming the source', async () => {
    const lock = syncedLock();
    const down = (async () => {
      throw new Error('offline');
    }) as typeof fetch;
    const problems = await verifyRemote({ lock, fetch: down });
    expect(problems[0]).toMatch(/retention.*offline/);
  });

  it('is fine with an empty lock', async () => {
    expect(await verifyRemote({ lock: empty(), fetch: reply(500) })).toEqual([]);
  });
});
