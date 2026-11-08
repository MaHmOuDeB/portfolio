import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EXPERIMENT, type ExperimentConfig } from '../../src/experiment.values.ts';
import { GITHUB_SECRETS, REQUIRED_LOG_CHECKS, VERCEL_SECRETS, main, type LaunchDeps, type RunResult } from '../../scripts/launch-check.ts';
import type { LaunchFact } from '../../content/privacy.ts';

const STARTED = { ...EXPERIMENT, calibration: { ...EXPERIMENT.calibration, startedOn: '2026-11-09T00:00:00+01:00' } } as unknown as ExperimentConfig;
const HASH = 'a'.repeat(64);
const VERIFIED: LaunchFact[] = [{ id: 'x', question: 'q', verified: { on: '2026-10-26', source: 'https://example.com/doc' } }];
const UNVERIFIED: LaunchFact[] = [{ id: 'upstash-backups', question: 'Whether the counter database keeps backups', verified: null }];
const PASSED_LOG = [
  '## Log',
  '',
  '| Date | Deployment | Check | Result | Notes |',
  '|---|---|---|---|---|',
  ...REQUIRED_LOG_CHECKS.map((c) => `| 2026-11-01 | https://portfolio.example | ${c} | PASS | ok |`),
].join('\n');
const ARGS = ['--canonical', 'portfolio.example'];
const SECRET_VALUE = 'a-secret-value-that-must-never-be-printed';

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'launch-'));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function built(html: string) {
  mkdirSync(join(root, '.next/server/app'), { recursive: true });
  writeFileSync(join(root, '.next/server/app/privacy.html'), html);
}

function vercelTable(names: readonly string[]): string {
  return ['> Environment Variables found for mahmoud-s-team/portfolio', '', ' name   value   environments   created', ...names.map((n) => ` ${n}   Encrypted   Production   1d ago`)].join('\n');
}

function deps(over: Partial<LaunchDeps> = {}): { deps: Partial<LaunchDeps>; lines: string[]; calls: string[][] } {
  const lines: string[] = [];
  const calls: string[][] = [];
  const run = (cmd: string, args: string[]): RunResult => {
    calls.push([cmd, ...args]);
    if (cmd === 'git' && args[0] === 'rev-parse') return { status: 0, stdout: 'abc\n' };
    if (cmd === 'git' && args[0] === 'ls-remote') return { status: 0, stdout: 'abc\trefs/tags/prereg-v1\n' };
    if (cmd === 'git' && args[0] === 'show') return { status: 0, stdout: `# Pre-registration\n\nPre-registration hash: ${HASH}\n` };
    if (cmd === 'gh') return { status: 0, stdout: GITHUB_SECRETS.map((n) => `${n}\tUpdated 2026-11-01`).join('\n') };
    if (args.includes('vercel')) return { status: 0, stdout: `${vercelTable(VERCEL_SECRETS)}\n${SECRET_VALUE}` };
    return { status: 1, stdout: '' };
  };
  built('<main><h1>Privacy</h1></main>');
  return {
    deps: { root, out: (l) => lines.push(l), run, config: STARTED, facts: VERIFIED, deployedChecksLog: PASSED_LOG, preregHash: () => HASH, ...over },
    lines,
    calls,
  };
}

describe('launch:check', () => {
  it('exits 0 when every launch condition is met, and prints no command output', () => {
    const d = deps();
    expect(main(ARGS, d.deps)).toBe(0);
    expect(d.lines.join('\n')).toMatch(/all launch conditions met/);
    expect(d.lines.join('\n')).not.toContain(SECRET_VALUE);
  });

  it('never asks the Vercel CLI for values (no --json or --format)', () => {
    const d = deps();
    main(ARGS, d.deps);
    const vercel = d.calls.find((c) => c.includes('vercel'))!;
    expect(vercel).toEqual(expect.arrayContaining(['env', 'ls', 'production']));
    expect(vercel.some((a) => a === '--json' || a.startsWith('--format') || a === '-F')).toBe(false);
  });

  it('names an unset calibration start', () => {
    const d = deps({ config: EXPERIMENT });
    expect(main(ARGS, d.deps)).toBe(1);
    expect(d.lines.join('\n')).toMatch(/^unmet: .*calibration\.startedOn/m);
  });

  it('names each privacy fact that is still unverified, and each placeholder in the built pages', () => {
    const d = deps({ facts: UNVERIFIED });
    built('<main><div data-launch-placeholder="upstash-backups">Not confirmed yet</div></main>');
    expect(main(ARGS, d.deps)).toBe(1);
    const out = d.lines.join('\n');
    expect(out).toMatch(/^unmet: privacy fact not verified: upstash-backups/m);
    expect(out).toMatch(/^unmet: launch placeholder in .*privacy\.html/m);
  });

  it('names a missing build', () => {
    const d = deps();
    rmSync(join(root, '.next'), { recursive: true, force: true });
    expect(main(ARGS, d.deps)).toBe(1);
    expect(d.lines.join('\n')).toMatch(/^unmet: no built pages/m);
  });

  it('names each deployed check that is not recorded as passed', () => {
    const log = PASSED_LOG.replace(/\| isr \| PASS \|/, '| isr | FAIL |').split('\n').filter((l) => !/\| firewall \|/.test(l)).join('\n');
    const d = deps({ deployedChecksLog: log });
    expect(main(ARGS, d.deps)).toBe(1);
    const out = d.lines.join('\n');
    expect(out).toMatch(/^unmet: deployed check not recorded as passed: isr/m);
    expect(out).toMatch(/^unmet: deployed check not recorded as passed: firewall/m);
    expect(out).not.toMatch(/passed: split/);
  });

  it('names each secret missing from Vercel or GitHub, by name only', () => {
    const d = deps();
    const base = d.deps.run!;
    d.deps.run = (cmd, args) => {
      if (args.includes('vercel')) return { status: 0, stdout: vercelTable(VERCEL_SECRETS.filter((n) => n !== 'EXCLUDE_TOKEN')) };
      if (cmd === 'gh') return { status: 0, stdout: 'INTERNAL_TRAFFIC_SECRET\tUpdated' };
      return base(cmd, args);
    };
    expect(main(ARGS, d.deps)).toBe(1);
    const out = d.lines.join('\n');
    expect(out).toMatch(/^unmet: secret missing in Vercel production: EXCLUDE_TOKEN$/m);
    expect(out).toMatch(/^unmet: secret missing in GitHub: VERCEL_AUTOMATION_BYPASS_SECRET$/m);
  });

  it('a CLI that cannot list counts as unmet, with no output of its own', () => {
    const d = deps();
    const base = d.deps.run!;
    d.deps.run = (cmd, args) => (cmd === 'gh' || args.includes('vercel') ? { status: 1, stdout: SECRET_VALUE } : base(cmd, args));
    expect(main(ARGS, d.deps)).toBe(1);
    const out = d.lines.join('\n');
    expect(out).toMatch(/^unmet: could not list the Vercel production variables/m);
    expect(out).toMatch(/^unmet: could not list the GitHub secrets/m);
    expect(out).not.toContain(SECRET_VALUE);
  });

  it('names a missing prereg tag, and a design changed since the tag', () => {
    const d = deps();
    const base = d.deps.run!;
    d.deps.run = (cmd, args) => (cmd === 'git' && args[0] === 'rev-parse' ? { status: 1, stdout: '' } : base(cmd, args));
    expect(main(ARGS, d.deps)).toBe(1);
    expect(d.lines.join('\n')).toMatch(/^unmet: the prereg-v1 tag does not exist/m);
    const changed = deps({ preregHash: () => 'b'.repeat(64) });
    expect(main(ARGS, changed.deps)).toBe(1);
    expect(changed.lines.join('\n')).toMatch(/^unmet: the design changed since prereg-v1/m);
  });

  it('names a tag that was never pushed to origin', () => {
    const d = deps();
    const base = d.deps.run!;
    d.deps.run = (cmd, args) => (cmd === 'git' && args[0] === 'ls-remote' ? { status: 0, stdout: '' } : base(cmd, args));
    expect(main(ARGS, d.deps)).toBe(1);
    expect(d.lines.join('\n')).toMatch(/^unmet: the prereg-v1 tag is not on origin/m);
  });

  it('counts a headers PASS only when it ran on the canonical domain, which must be given', () => {
    const preview = PASSED_LOG.replace('| https://portfolio.example | headers |', '| https://portfolio-abc.vercel.app | headers |');
    const d = deps({ deployedChecksLog: preview });
    expect(main(ARGS, d.deps)).toBe(1);
    expect(d.lines.join('\n')).toMatch(/^unmet: deployed check not recorded as passed on the canonical domain: headers \(portfolio\.example\)$/m);
    const none = deps();
    expect(main([], none.deps)).toBe(1);
    expect(none.lines.join('\n')).toMatch(/^unmet: the canonical domain is not given/m);
    const bare = deps({ deployedChecksLog: PASSED_LOG.replace('| https://portfolio.example | headers |', '| portfolio.example | headers |') });
    expect(main(['--canonical', 'https://Portfolio.example/'], bare.deps)).toBe(0);
  });

  it('does not treat a missing processor contract (DPA) as a launch condition', () => {
    const d = deps();
    main(ARGS, d.deps);
    expect(d.lines.join('\n')).not.toMatch(/DPA|processing agreement/i);
  });
});

describe('launch:check stays out of the everyday gates', () => {
  const ROOT = join(import.meta.dirname, '../..');
  it('is not part of npm run check, and no workflow runs it', async () => {
    const { readFileSync, readdirSync } = await import('node:fs');
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
    expect(pkg.scripts['launch:check']).toMatch(/scripts\/launch-check\.ts$/);
    expect(pkg.scripts.check).not.toMatch(/launch/);
    expect(pkg.scripts.test).not.toMatch(/launch/);
    for (const wf of readdirSync(join(ROOT, '.github/workflows'))) {
      expect(readFileSync(join(ROOT, '.github/workflows', wf), 'utf8'), wf).not.toMatch(/launch[:-]check|launch-placeholders/);
    }
  });
});

describe('the scripts load under Node type stripping', () => {
  const ROOT = join(import.meta.dirname, '../..');
  it('launch-check, launch-placeholders and experiment-check import, and the CLIs answer', async () => {
    const { spawnSync } = await import('node:child_process');
    const flags = ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON'];
    const load = spawnSync(process.execPath, [...flags, '--input-type=module', '-e', "await import('./scripts/launch-check.ts'); console.log('loaded')"], { cwd: ROOT, encoding: 'utf8' });
    expect(load.stdout.trim()).toBe('loaded');
    const usage = spawnSync(process.execPath, [...flags, 'scripts/experiment-check.ts'], { cwd: ROOT, encoding: 'utf8' });
    expect(usage.status).toBe(2);
    const none = spawnSync(process.execPath, [...flags, 'scripts/launch-placeholders.ts', '--root', root], { cwd: ROOT, encoding: 'utf8' });
    expect(none.status).toBe(1);
    expect(none.stdout).toMatch(/no built pages/);
  });
});
