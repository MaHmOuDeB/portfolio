import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// The integrity check of a node_modules folder restored from a cache (the lhci job in
// .github/workflows/ci.yml). Every package that package-lock.json lists under node_modules/ must be
// installed at exactly the locked version, except an optional one that is absent (a platform
// package for another OS or CPU); npm's own record of the install (node_modules/.package-lock.json)
// must list the same version, integrity and source for every package it holds. A partial restore, a
// tree from another lockfile or a stray edit to a package's version fails, and the job then runs a
// clean `npm ci`. It compares metadata only: it does not hash the files, so it cannot detect a
// deliberately poisoned tree that keeps the versions.
//
//   node scripts/check-node-modules.ts [project root]
//
// prints at most 10 problems and exits 0 when there are none, 1 otherwise.

interface LockedPackage {
  version?: string;
  integrity?: string;
  resolved?: string;
  optional?: boolean;
  link?: boolean;
}

function packages(file: string): Record<string, LockedPackage> | null {
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as { packages?: unknown };
    return parsed.packages && typeof parsed.packages === 'object' ? (parsed.packages as Record<string, LockedPackage>) : null;
  } catch {
    return null;
  }
}

function installedVersion(root: string, path: string): string | null {
  try {
    const version = (JSON.parse(readFileSync(join(root, path, 'package.json'), 'utf8')) as { version?: unknown }).version;
    return typeof version === 'string' ? version : null;
  } catch {
    return null;
  }
}

/** The problems of root's node_modules against root's package-lock.json; empty when it matches. */
export function nodeModulesProblems(root: string): string[] {
  const locked = packages(join(root, 'package-lock.json'));
  if (!locked) return ['package-lock.json is missing or has no packages'];
  const recorded = packages(join(root, 'node_modules/.package-lock.json'));
  if (!recorded) return ['node_modules/.package-lock.json is missing or has no packages'];
  const problems: string[] = [];
  for (const [path, lock] of Object.entries(locked)) {
    if (!path.startsWith('node_modules/') || lock.link) continue;
    const installed = installedVersion(root, path);
    if (installed === null) {
      if (!lock.optional || existsSync(join(root, path))) problems.push(`${path}: not installed`);
      continue;
    }
    if (installed !== lock.version) problems.push(`${path}: ${installed} installed, ${lock.version} locked`);
    if (!recorded[path]) problems.push(`${path}: missing from node_modules/.package-lock.json`);
  }
  for (const [path, entry] of Object.entries(recorded)) {
    const lock = locked[path];
    if (!lock) {
      problems.push(`${path}: not in package-lock.json`);
      continue;
    }
    for (const field of ['version', 'integrity', 'resolved'] as const) {
      if (entry[field] !== lock[field]) problems.push(`${path}: ${field} differs from package-lock.json`);
    }
  }
  return problems;
}

function main(): number {
  const problems = nodeModulesProblems(process.argv[2] ?? '.');
  for (const problem of problems.slice(0, 10)) process.stdout.write(`${problem}\n`);
  if (problems.length > 10) process.stdout.write(`... and ${problems.length - 10} more\n`);
  return problems.length === 0 ? 0 : 1;
}

if (import.meta.main) process.exitCode = main();
