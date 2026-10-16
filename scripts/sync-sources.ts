// Vendors the site exports of the source repos into data/sources/ at the commits pinned in
// sources.lock.json, and regenerates src/lib/facts/facts.generated.ts from them and the profile.
//
//   npm run sources:sync                                  vendor every pinned export, regenerate
//   npm run sources:sync -- --update <id> --ref <ref>     pin <ref> of a local clone, vendor, regenerate
//   npm run sources:sync -- --check                       verify the vendored files (no network, no clones)
//   npm run sources:sync -- --verify-remote               compare the lock with raw.githubusercontent.com
//
// Local clones live at ${SOURCES_ROOT ?? ~/code}/<repo name>.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SOURCE_IDS, type SourceId } from '../src/lib/facts/types.ts';
import { collectFacts, renderFactsModule } from './sources/facts.ts';
import { parseLock, serializeLock, sha256Hex, type Lock, type LockEntry } from './sources/lock.ts';
import { validateExport } from './sources/schema.ts';

const LOCK_FILE = 'sources.lock.json';
const PROFILE = 'data/facts/profile.json';
const SOURCES_DIR = 'data/sources';
const GENERATED = 'src/lib/facts/facts.generated.ts';

// Used for the first --update of a source, before the lock names its repo.
export const DEFAULT_CLONE_DIRS: Record<SourceId, string> = {
  retention: 'customer-retention-rfm',
  retail: 'retail-kpi-dashboard',
  weather: 'weather-sql-pipeline',
  pulse: 'amplitude-demo',
};

const exportPath = (id: SourceId) => `reports/site/${id}.json`;
const vendoredPath = (root: string, id: string) => join(root, SOURCES_DIR, `${id}.json`);
const cloneDir = (sourcesRoot: string, repo: string) => join(sourcesRoot, repo.split('/')[1] as string);
const entries = (lock: Lock) =>
  SOURCE_IDS.flatMap((id) => {
    const entry = lock.sources[id];
    return entry ? [{ id, entry }] : [];
  });

function git(repoDir: string, ...args: string[]): string {
  return execFileSync('git', ['-C', repoDir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

/** The exact bytes of `path` at `commit` in the clone at `repoDir`. */
export function readAtCommit(repoDir: string, commit: string, path: string): Buffer {
  return execFileSync('git', ['-C', repoDir, 'show', `${commit}:${path}`], {
    maxBuffer: 256 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function readJson(file: string): { json: unknown } | { error: string } {
  try {
    return { json: JSON.parse(readFileSync(file, 'utf8')) };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/** The text facts.generated.ts must have: the profile plus every vendored export of `lock`. */
export function expectedFactsModule(root: string, lock: Lock): string {
  const profile = JSON.parse(readFileSync(join(root, PROFILE), 'utf8')) as unknown;
  const inputs: { source: SourceId | 'profile'; json: unknown }[] = [{ source: 'profile', json: profile }];
  for (const { id } of entries(lock)) {
    inputs.push({ source: id, json: JSON.parse(readFileSync(vendoredPath(root, id), 'utf8')) as unknown });
  }
  return renderFactsModule(collectFacts(inputs));
}

export function writeFactsModule(root: string, lock: Lock): void {
  const file = join(root, GENERATED);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, expectedFactsModule(root, lock));
}

/** Problems with the vendored files, the lock and the generated module; [] means all consistent. */
export function checkVendored({ lock, root }: { lock: Lock; root: string }): string[] {
  const problems: string[] = [];
  const dir = join(root, SOURCES_DIR);
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')) : [];
  for (const f of files) {
    if (!(SOURCE_IDS as readonly string[]).includes(f.slice(0, -5)) || !lock.sources[f.slice(0, -5) as SourceId]) {
      problems.push(`${SOURCES_DIR}/${f} has no lock entry in ${LOCK_FILE}`);
    }
  }
  for (const { id, entry } of entries(lock)) {
    const rel = `${SOURCES_DIR}/${id}.json`;
    const file = vendoredPath(root, id);
    if (!existsSync(file)) {
      problems.push(`${id}: lock entry has no file ${rel}`);
      continue;
    }
    const bytes = readFileSync(file);
    const actual = sha256Hex(bytes);
    if (actual !== entry.sha256) {
      problems.push(`${id}: ${rel} sha256 ${actual} differs from the lock's ${entry.sha256}`);
    }
    const parsed = readJson(file);
    if ('error' in parsed) {
      problems.push(`${id}: ${rel} is not valid JSON: ${parsed.error}`);
      continue;
    }
    const meta = (parsed.json as { _meta?: { schema?: unknown; source?: unknown } } | null)?._meta;
    if (meta?.schema !== entry.schema) {
      problems.push(`${id}: _meta.schema ${JSON.stringify(meta?.schema)} disagrees with the lock's '${entry.schema}'`);
    }
    if (meta?.source !== id) {
      problems.push(`${id}: _meta.source ${JSON.stringify(meta?.source)} disagrees with the lock's '${id}'`);
    }
    const result = validateExport(parsed.json, entry.schema);
    if (!result.ok) problems.push(`${id}: ${rel} fails schema ${entry.schema}: ${result.errors.join('; ')}`);
  }
  // The generated module can only be recomputed from sound inputs.
  if (problems.length === 0) {
    const file = join(root, GENERATED);
    const current = existsSync(file) ? readFileSync(file, 'utf8') : null;
    if (current !== expectedFactsModule(root, lock)) {
      problems.push(`${GENERATED} is stale: run "npm run sources:sync" and commit it`);
    }
  }
  return problems;
}

/** Re-reads every source at its pinned commit from the local clones and rewrites data/sources/. */
export function vendorAll({ lock, root, sourcesRoot }: { lock: Lock; root: string; sourcesRoot: string }): void {
  for (const { id, entry } of entries(lock)) {
    const bytes = readAtCommit(cloneDir(sourcesRoot, entry.repo), entry.commit, entry.path);
    const actual = sha256Hex(bytes);
    if (actual !== entry.sha256) {
      throw new Error(`${id}: ${entry.path} at ${entry.commit} has sha256 ${actual}, the lock says ${entry.sha256}`);
    }
    mkdirSync(join(root, SOURCES_DIR), { recursive: true });
    writeFileSync(vendoredPath(root, id), bytes);
  }
}

function repoFromOrigin(url: string): string {
  const m = /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([^/\s]+\/[^/\s]+?)(?:\.git)?\/?$/.exec(url);
  if (!m) throw new Error(`origin '${url}' is not a github.com https or ssh URL`);
  return m[1] as string;
}

/** Returns a copy of `lock` with `id` pinned to `ref` of its local clone. Refuses an unpushed commit. */
export function updateEntry(o: { id: SourceId; ref: string; lock: Lock; root: string; sourcesRoot: string }): Lock {
  const dirName = o.lock.sources[o.id]?.repo.split('/')[1] ?? DEFAULT_CLONE_DIRS[o.id];
  const dir = join(o.sourcesRoot, dirName);
  if (!existsSync(dir)) throw new Error(`${o.id}: no local clone at ${dir} (set SOURCES_ROOT)`);
  const commit = git(dir, 'rev-parse', `${o.ref}^{commit}`);
  if (git(dir, 'branch', '-r', '--contains', commit) === '') {
    throw new Error(`${o.id}: commit ${commit} is not pushed to any remote branch of ${dir}; push it first (needs Mahmoud's OK)`);
  }
  const repo = repoFromOrigin(git(dir, 'remote', 'get-url', 'origin'));
  const path = exportPath(o.id);
  const bytes = readAtCommit(dir, commit, path);
  let json: unknown;
  try {
    json = JSON.parse(bytes.toString('utf8'));
  } catch (e) {
    throw new Error(`${o.id}: ${path} at ${commit} is not valid JSON: ${(e as Error).message}`);
  }
  const meta = (json as { _meta?: { schema?: unknown; source?: unknown } } | null)?._meta;
  if (meta?.schema !== `${o.id}/1`) {
    throw new Error(`${o.id}: ${path} declares _meta.schema ${JSON.stringify(meta?.schema)}, expected '${o.id}/1'`);
  }
  if (meta.source !== o.id) {
    throw new Error(`${o.id}: ${path} declares _meta.source ${JSON.stringify(meta.source)}, expected '${o.id}'`);
  }
  const result = validateExport(json, `${o.id}/1`);
  if (!result.ok) throw new Error(`${o.id}: ${path} fails schema ${o.id}/1: ${result.errors.join('; ')}`);
  const entry: LockEntry = { repo, commit, path, sha256: sha256Hex(bytes), schema: `${o.id}/1` };
  return { version: 1, sources: { ...o.lock.sources, [o.id]: entry } };
}

/** Fetches every pinned export from raw.githubusercontent.com and compares its sha256 with the lock. */
export async function verifyRemote({ lock, fetch: doFetch }: { lock: Lock; fetch: typeof fetch }): Promise<string[]> {
  const problems: string[] = [];
  for (const { id, entry } of entries(lock)) {
    const url = `https://raw.githubusercontent.com/${entry.repo}/${entry.commit}/${entry.path}`;
    try {
      const res = await doFetch(url);
      if (!res.ok) {
        problems.push(`${id}: ${url} returned ${res.status}`);
        continue;
      }
      const actual = sha256Hex(new Uint8Array(await res.arrayBuffer()));
      if (actual !== entry.sha256) problems.push(`${id}: remote sha256 ${actual} differs from the lock's ${entry.sha256}`);
    } catch (e) {
      problems.push(`${id}: could not fetch ${url}: ${(e as Error).message}`);
    }
  }
  return problems;
}

function flagValue(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i === -1 ? undefined : args[i + 1];
}

async function main(args: string[]): Promise<number> {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const sourcesRoot = process.env.SOURCES_ROOT ?? join(homedir(), 'code');
  let lock = parseLock(readFileSync(join(root, LOCK_FILE), 'utf8'));
  const report = (problems: string[]) => {
    for (const p of problems) console.error(p);
    return problems.length === 0 ? 0 : 1;
  };
  if (args.includes('--check')) return report(checkVendored({ lock, root }));
  if (args.includes('--verify-remote')) return report(await verifyRemote({ lock, fetch }));
  if (args.includes('--update')) {
    const id = flagValue(args, '--update');
    const ref = flagValue(args, '--ref');
    if (!(SOURCE_IDS as readonly (string | undefined)[]).includes(id) || ref === undefined) {
      console.error(`usage: sources:sync -- --update <${SOURCE_IDS.join('|')}> --ref <ref>`);
      return 1;
    }
    lock = updateEntry({ id: id as SourceId, ref, lock, root, sourcesRoot });
    writeFileSync(join(root, LOCK_FILE), serializeLock(lock));
  }
  vendorAll({ lock, root, sourcesRoot });
  writeFactsModule(root, lock);
  return 0;
}

if (process.argv[1]?.endsWith('sync-sources.ts')) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (e: unknown) => {
      console.error((e as Error).message);
      process.exit(1);
    },
  );
}
