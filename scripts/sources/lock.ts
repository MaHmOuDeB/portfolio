// sources.lock.json: which commit of which source repo each vendored export (data/sources/<id>.json)
// was taken from, and the sha256 of its exact bytes.
import { createHash } from 'node:crypto';
import { SOURCE_IDS, type SourceId } from '../../src/lib/facts/types.ts';

export type LockEntry = {
  repo: string; // owner/name
  commit: string; // 40 hex
  path: string;
  sha256: string; // 64 hex
  schema: `${SourceId}/1`;
};
export type Lock = { version: 1; sources: Partial<Record<SourceId, LockEntry>> };

const ENTRY_FIELDS = ['commit', 'path', 'repo', 'schema', 'sha256'] as const;
const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const COMMIT = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;

export function sha256Hex(data: Uint8Array | string): string {
  return createHash('sha256').update(data).digest('hex');
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function parseEntry(id: SourceId, raw: unknown): LockEntry {
  const at = `sources.${id}`;
  if (!isObject(raw)) throw new Error(`${at} must be an object`);
  for (const key of Object.keys(raw)) {
    if (!(ENTRY_FIELDS as readonly string[]).includes(key)) throw new Error(`${at}.${key} is not a lock field`);
  }
  const str = (field: (typeof ENTRY_FIELDS)[number]): string => {
    const v = raw[field];
    if (typeof v !== 'string') throw new Error(`${at}.${field} must be a string`);
    return v;
  };
  const repo = str('repo');
  if (!REPO.test(repo)) throw new Error(`${at}.repo must be owner/name, got '${repo}'`);
  const commit = str('commit');
  if (!COMMIT.test(commit)) throw new Error(`${at}.commit must be 40 lowercase hex characters, got '${commit}'`);
  const path = str('path');
  if (path === '' || path.startsWith('/') || path.startsWith('-') || path.split('/').includes('..')) {
    throw new Error(`${at}.path must be a relative path inside the repo, got '${path}'`);
  }
  const sha256 = str('sha256');
  if (!SHA256.test(sha256)) throw new Error(`${at}.sha256 must be 64 lowercase hex characters, got '${sha256}'`);
  const schema = str('schema');
  if (schema !== `${id}/1`) throw new Error(`${at}.schema must be '${id}/1', got '${schema}'`);
  return { repo, commit, path, sha256, schema: `${id}/1` };
}

/** Parses sources.lock.json. Throws, naming the field, on a malformed entry or an unknown source id. */
export function parseLock(text: string): Lock {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new Error(`lock is not valid JSON: ${(e as Error).message}`);
  }
  if (!isObject(raw)) throw new Error('lock must be a JSON object');
  if (raw.version !== 1) throw new Error(`lock version must be 1, got ${JSON.stringify(raw.version)}`);
  if (!isObject(raw.sources)) throw new Error('lock sources must be an object');
  for (const key of Object.keys(raw)) {
    if (key !== 'version' && key !== 'sources') throw new Error(`lock has unknown field '${key}'`);
  }
  const sources: Lock['sources'] = {};
  for (const [id, entry] of Object.entries(raw.sources)) {
    if (!(SOURCE_IDS as readonly string[]).includes(id)) throw new Error(`sources.${id} is not a known source id`);
    sources[id as SourceId] = parseEntry(id as SourceId, entry);
  }
  return { version: 1, sources };
}

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (isObject(v)) {
    return Object.fromEntries(
      Object.keys(v)
        .sort()
        .map((k) => [k, sortKeys(v[k])]),
    );
  }
  return v;
}

/** Keys sorted at every level, 2-space indent, trailing newline. */
export function serializeLock(lock: Lock): string {
  return `${JSON.stringify(sortKeys(lock), null, 2)}\n`;
}
