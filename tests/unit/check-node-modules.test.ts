import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { nodeModulesProblems } from '../../scripts/check-node-modules.ts';

// The integrity check the hosted lhci job runs on a node_modules folder restored from a cache: any
// difference from package-lock.json sends the job to a clean `npm ci`.
const ROOT = join(import.meta.dirname, '../..');

const LOCK = {
  name: 'fixture',
  lockfileVersion: 3,
  packages: {
    '': { name: 'fixture', devDependencies: { a: '1.0.0' } },
    'node_modules/a': { version: '1.0.0', resolved: 'https://registry.npmjs.org/a/-/a-1.0.0.tgz', integrity: 'sha512-a', dev: true },
    'node_modules/a/node_modules/b': { version: '2.0.0', resolved: 'https://registry.npmjs.org/b/-/b-2.0.0.tgz', integrity: 'sha512-b', dev: true },
    'node_modules/@x/linux-x64': { version: '3.0.0', resolved: 'https://registry.npmjs.org/@x/linux-x64/-/linux-x64-3.0.0.tgz', integrity: 'sha512-x', optional: true },
  },
};

type Lock = typeof LOCK;

/** A project root holding the lockfile, npm's hidden lockfile and the installed package.json files. */
function project(edit: (p: { lock: Lock; hidden: Record<string, Record<string, unknown>>; installed: Record<string, string> }) => void = () => {}) {
  const root = mkdtempSync(join(tmpdir(), 'node-modules-check-'));
  const lock = structuredClone(LOCK);
  const hidden: Record<string, Record<string, unknown>> = {
    'node_modules/a': { ...LOCK.packages['node_modules/a'] },
    'node_modules/a/node_modules/b': { ...LOCK.packages['node_modules/a/node_modules/b'] },
  };
  const installed: Record<string, string> = { 'node_modules/a': '1.0.0', 'node_modules/a/node_modules/b': '2.0.0' };
  edit({ lock, hidden, installed });
  writeFileSync(join(root, 'package-lock.json'), JSON.stringify(lock));
  mkdirSync(join(root, 'node_modules'), { recursive: true });
  writeFileSync(join(root, 'node_modules/.package-lock.json'), JSON.stringify({ name: 'fixture', lockfileVersion: 3, packages: hidden }));
  for (const [path, version] of Object.entries(installed)) {
    mkdirSync(join(root, path), { recursive: true });
    writeFileSync(join(root, path, 'package.json'), JSON.stringify({ name: path.split('node_modules/').at(-1), version }));
  }
  return root;
}

describe('scripts/check-node-modules.ts', () => {
  it('accepts a tree that matches the lockfile, with an absent optional platform package', () => {
    const root = project();
    expect(nodeModulesProblems(root)).toEqual([]);
    rmSync(root, { recursive: true });
  });

  it('rejects a missing package, as after a partial restore', () => {
    const root = project(({ installed }) => delete installed['node_modules/a/node_modules/b']);
    expect(nodeModulesProblems(root)).toEqual(['node_modules/a/node_modules/b: not installed']);
    rmSync(root, { recursive: true });
  });

  it('rejects an installed version other than the locked one', () => {
    const root = project(({ installed }) => (installed['node_modules/a'] = '1.0.1'));
    expect(nodeModulesProblems(root)).toEqual(['node_modules/a: 1.0.1 installed, 1.0.0 locked']);
    rmSync(root, { recursive: true });
  });

  it('rejects a tree installed from another lockfile', () => {
    const root = project(({ lock }) => (lock.packages['node_modules/a'].integrity = 'sha512-other'));
    expect(nodeModulesProblems(root)).toEqual(['node_modules/a: integrity differs from package-lock.json']);
    rmSync(root, { recursive: true });
  });

  it('rejects a package npm installed that the lockfile does not list', () => {
    const root = project(({ hidden, installed }) => {
      hidden['node_modules/extra'] = { version: '1.0.0' };
      installed['node_modules/extra'] = '1.0.0';
    });
    expect(nodeModulesProblems(root)).toEqual(['node_modules/extra: not in package-lock.json']);
    rmSync(root, { recursive: true });
  });

  it('rejects a package missing from npm\'s own record, and a present optional package at another version', () => {
    const root = project(({ hidden, installed }) => {
      delete hidden['node_modules/a'];
      installed['node_modules/@x/linux-x64'] = '2.9.0';
      hidden['node_modules/@x/linux-x64'] = { ...LOCK.packages['node_modules/@x/linux-x64'] };
    });
    expect(nodeModulesProblems(root).sort()).toEqual([
      'node_modules/@x/linux-x64: 2.9.0 installed, 3.0.0 locked',
      'node_modules/a: missing from node_modules/.package-lock.json',
    ]);
    rmSync(root, { recursive: true });
  });

  it('rejects a folder without npm\'s record or without a lockfile', () => {
    const root = project();
    rmSync(join(root, 'node_modules/.package-lock.json'));
    expect(nodeModulesProblems(root)).toEqual(['node_modules/.package-lock.json is missing or has no packages']);
    rmSync(join(root, 'package-lock.json'));
    expect(nodeModulesProblems(root)).toEqual(['package-lock.json is missing or has no packages']);
    rmSync(root, { recursive: true });
  });

  it('exits 0 on a match and 1 with the problems printed otherwise', () => {
    const run = (root: string) =>
      spawnSync(process.execPath, ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', join(ROOT, 'scripts/check-node-modules.ts'), root], { encoding: 'utf8' });
    const good = project();
    expect(run(good)).toMatchObject({ status: 0, stdout: '' });
    const bad = project(({ installed }) => (installed['node_modules/a'] = '9.9.9'));
    expect(run(bad)).toMatchObject({ status: 1, stdout: 'node_modules/a: 9.9.9 installed, 1.0.0 locked\n' });
    rmSync(good, { recursive: true });
    rmSync(bad, { recursive: true });
  });

  it('accepts this repository\'s own installed tree', () => {
    // Only where node_modules was installed by npm ci from this lockfile (always in CI's static job).
    const problems = nodeModulesProblems(ROOT);
    expect(problems).toEqual([]);
  });
});
