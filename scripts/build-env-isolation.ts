// Keeps the store's write token out of the deploy build. `vercel build` loads the environment that
// `vercel pull` wrote to .vercel/.env.<target>.local into every process of the build, so unsetting
// the variable in the shell is not enough. scripts/vercel-build-isolated.sh runs:
//
//   build-env-isolation.ts sanitize <env file> <work dir>  before the build: keeps the pulled file
//       in the work dir (mode 600) and leaves the build a copy without KV_REST_API_TOKEN;
//   build-env-isolation.ts restore <env file> <work dir>   after the build: puts the pulled file
//       back byte for byte, and refuses if the build changed the copy (pulled it again);
//   build-env-isolation.ts verify <env file> <work dir>    reads the records that
//       scripts/build-env-canary.cjs wrote from inside every Node process of the build, and fails
//       unless the write token was in none of them, the Next build ran, the read-only token was in
//       the Next build exactly when it was pulled, and the restored file is the pulled one.
//
// It prints variable names and counts only, never a value.
import { createHash } from 'node:crypto';
import { chmodSync, copyFileSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

export const WRITE_TOKEN = 'KV_REST_API_TOKEN';
export const READ_TOKEN = 'KV_REST_API_READ_ONLY_TOKEN';

// The Vercel CLI reads the pulled file with a line-based dotenv parser (one KEY=value per line). A
// line it reads as the write token is removed, and so is an `export KEY=` line, which other
// parsers accept.
const LINE_KEY = /^\s*(?:export\s+)?([\w.-]+)\s*=/;

/** The keys of a dotenv file, read line by line. */
export function keysOf(text: string): Set<string> {
  const keys = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const key = LINE_KEY.exec(line)?.[1];
    if (key !== undefined) keys.add(key);
  }
  return keys;
}

/** The file without any line that sets the write token; every other byte is kept. */
export function withoutWriteToken(text: string): string {
  return text
    .split(/(?<=\n)/)
    .filter((line) => LINE_KEY.exec(line)?.[1] !== WRITE_TOKEN)
    .join('');
}

export type CanaryResult = { ok: boolean; processes: number; failures: string[] };

type CanaryRecord = { at: 'start' | 'exit'; nextBuild: boolean; write: boolean; read: boolean };

function isRecord(value: unknown): value is CanaryRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const r = value as Record<string, unknown>;
  return (
    (r.at === 'start' || r.at === 'exit') &&
    typeof r.nextBuild === 'boolean' &&
    typeof r.write === 'boolean' &&
    typeof r.read === 'boolean' &&
    Object.keys(r).length === 4
  );
}

/** Checks the canary's records (one JSON object per line) against what was pulled. */
export function checkCanary(text: string, pulledRead: boolean): CanaryResult {
  const failures: string[] = [];
  const records: CanaryRecord[] = [];
  text.split('\n').forEach((line, i) => {
    if (line.trim() === '') return;
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      value = undefined;
    }
    if (isRecord(value)) records.push(value);
    else failures.push(`malformed canary record on line ${i + 1}`);
  });
  const withWrite = records.filter((r) => r.write).length;
  if (withWrite > 0) failures.push(`${WRITE_TOKEN} reached ${withWrite} of ${records.length} build process records`);
  const next = records.filter((r) => r.nextBuild);
  if (!next.some((r) => r.at === 'start')) failures.push('the canary saw no Next build');
  else if (!next.some((r) => r.at === 'exit')) failures.push('the canary saw no Next build exit');
  if (pulledRead && next.some((r) => !r.read)) failures.push(`${READ_TOKEN} was pulled but missing in the Next build`);
  if (!pulledRead && next.some((r) => r.read)) failures.push(`${READ_TOKEN} was not pulled but present in the Next build`);
  return { ok: failures.length === 0, processes: records.length, failures };
}

type State = { hadWrite: boolean; hadRead: boolean; pulled: string; sanitized: string };

const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

export type Deps = { out: (line: string) => void };

export function main(argv: string[], deps: Deps = { out: (l) => process.stdout.write(`${l}\n`) }): number {
  const [command, envFile, work] = argv;
  if (!['sanitize', 'restore', 'verify'].includes(command ?? '') || !envFile || !work || argv.length !== 3) {
    deps.out('usage: build-env-isolation.ts sanitize|restore|verify <env file> <work dir>');
    return 2;
  }
  const name = basename(envFile);
  const backup = join(work, 'pulled.env');
  const statePath = join(work, 'state.json');
  const fail = (why: string) => {
    deps.out(`build-env: FAIL ${why}`);
    return 1;
  };

  if (command === 'sanitize') {
    if (!existsSync(envFile)) return fail(`${name} is missing (run vercel pull first)`);
    const pulled = readFileSync(envFile);
    const text = pulled.toString('utf8');
    const keys = keysOf(text);
    const sanitized = Buffer.from(withoutWriteToken(text), 'utf8');
    if (keysOf(sanitized.toString('utf8')).has(WRITE_TOKEN)) return fail(`${WRITE_TOKEN} is still in the build copy of ${name}`);
    writeFileSync(backup, pulled, { mode: 0o600 });
    chmodSync(backup, 0o600);
    const state: State = { hadWrite: keys.has(WRITE_TOKEN), hadRead: keys.has(READ_TOKEN), pulled: sha256(pulled), sanitized: sha256(sanitized) };
    writeFileSync(statePath, JSON.stringify(state), { mode: 0o600 });
    writeFileSync(envFile, sanitized, { mode: 0o600 });
    chmodSync(envFile, 0o600);
    deps.out(
      state.hadWrite
        ? `build-env: ${WRITE_TOKEN} removed from the build copy of ${name}`
        : `build-env: ${WRITE_TOKEN} was not in ${name}`,
    );
    deps.out(`build-env: ${READ_TOKEN} kept (${state.hadRead ? 'present' : 'absent'} in the pulled file)`);
    return 0;
  }

  if (!existsSync(statePath)) return fail(`no sanitize state in the work dir`);
  const state = JSON.parse(readFileSync(statePath, 'utf8')) as State;

  if (command === 'restore') {
    if (!existsSync(backup)) return fail('the pulled file was already restored or never kept');
    if (!existsSync(envFile) || sha256(readFileSync(envFile)) !== state.sanitized) {
      return fail(`${name} changed during the build (was it pulled again?)`);
    }
    copyFileSync(backup, envFile);
    chmodSync(envFile, 0o600);
    if (sha256(readFileSync(envFile)) !== state.pulled) return fail(`${name} could not be restored`);
    rmSync(backup);
    deps.out(`build-env: ${name} restored byte for byte`);
    return 0;
  }

  // verify
  if (existsSync(backup)) return fail(`${name} has not been restored`);
  if (!existsSync(envFile) || sha256(readFileSync(envFile)) !== state.pulled) return fail(`${name} is not the pulled file`);
  const canaryPath = join(work, 'canary.jsonl');
  const result = checkCanary(existsSync(canaryPath) ? readFileSync(canaryPath, 'utf8') : '', state.hadRead);
  if (!result.ok) {
    for (const failure of result.failures) deps.out(`build-env: FAIL ${failure}`);
    return 1;
  }
  const restoredWrite = keysOf(readFileSync(envFile, 'utf8')).has(WRITE_TOKEN);
  if (restoredWrite !== state.hadWrite) return fail(`${WRITE_TOKEN} in the restored file does not match the pulled file`);
  deps.out(`build-env: ${WRITE_TOKEN} absent in all ${result.processes} build process records, the Next build included`);
  deps.out(`build-env: ${READ_TOKEN} ${state.hadRead ? 'present' : 'absent'} in the Next build, as pulled`);
  deps.out(`build-env: ${WRITE_TOKEN} ${state.hadWrite ? 'present' : 'absent'} in the restored file for the deployment, as pulled`);
  return 0;
}

if (import.meta.main) process.exitCode = main(process.argv.slice(2));
