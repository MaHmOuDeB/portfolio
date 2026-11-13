import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EXPERIMENT, type ExperimentConfig } from '../../src/experiment.values.ts';
import { GITHUB_REPO, GITHUB_SECRETS, GITHUB_VARIABLES, REQUIRED_LOG_CHECKS, VERCEL_SECRETS, destinationsUnmet, main, vercelScopeFrom, type LaunchDeps, type RunResult } from '../../scripts/launch-check.ts';
import type { LaunchFact } from '../../content/privacy.ts';
import { HOME_DESTINATIONS } from '../../content/home-destinations.ts';
import { LIVE_ROUTES } from '../../src/lib/site.ts';

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

function built(html: string, page = 'privacy') {
  mkdirSync(join(root, '.next/server/app', page, '..'), { recursive: true });
  writeFileSync(join(root, `.next/server/app/${page}.html`), html);
}

/**
 * A site whose Home destinations all resolve: a section page with both fragments, a live route
 * without one, a file in public/, and links that are not site paths (never checked).
 */
const SITE_DESTINATIONS = ['/work/audible#why-so-many', '/work/audible#automation', '/privacy', '/cv.pdf', 'https://www.linkedin.com/in/someone', 'mailto:someone@example.com'];
const SITE_ROUTES = ['/', '/privacy', '/work/audible'];
function site() {
  built('<main><h1>Audible</h1><section id="why-so-many"><h2>Why so many?</h2></section><section id="automation"></section></main>', 'work/audible');
  mkdirSync(join(root, 'public'), { recursive: true });
  writeFileSync(join(root, 'public/cv.pdf'), '%PDF-1.7');
}

function vercelTable(names: readonly string[]): string {
  return ['> Environment Variables found for example-team/portfolio', '', ' name   value   environments   created', ...names.map((n) => ` ${n}   Encrypted   Production   1d ago`)].join('\n');
}

function deps(over: Partial<LaunchDeps> = {}): { deps: Partial<LaunchDeps>; lines: string[]; calls: string[][] } {
  const lines: string[] = [];
  const calls: string[][] = [];
  const run = (cmd: string, args: string[]): RunResult => {
    calls.push([cmd, ...args]);
    if (cmd === 'gh' && args[0] === 'api' && args[1]?.endsWith('/actions/runners')) return { status: 0, stdout: '0\n' };
    if (cmd === 'git' && args[0] === 'rev-parse') return { status: 0, stdout: 'abc\n' };
    if (cmd === 'git' && args[0] === 'ls-remote') return { status: 0, stdout: 'abc\trefs/tags/prereg-v1\n' };
    if (cmd === 'git' && args[0] === 'show') return { status: 0, stdout: `# Pre-registration\n\nPre-registration hash: ${HASH}\n` };
    if (cmd === 'gh' && args[0] === 'variable') return { status: 0, stdout: `${GITHUB_VARIABLES.join('\n')}\n` };
    if (cmd === 'gh') return { status: 0, stdout: GITHUB_SECRETS.map((n) => `${n}\tUpdated 2026-11-01`).join('\n') };
    if (args.includes('vercel')) return { status: 0, stdout: `${vercelTable(VERCEL_SECRETS)}\n${SECRET_VALUE}` };
    return { status: 1, stdout: '' };
  };
  built('<main><h1>Privacy</h1></main>');
  site();
  return {
    deps: {
      root,
      out: (l) => lines.push(l),
      run,
      config: STARTED,
      facts: VERIFIED,
      deployedChecksLog: PASSED_LOG,
      preregHash: () => HASH,
      destinations: SITE_DESTINATIONS,
      liveRoutes: SITE_ROUTES,
      vercelScope: 'example-team',
      ...over,
    },
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

  it('checks the Home destinations: every site path is a live route, every fragment is in its built page, the CV file exists', () => {
    const d = deps();
    expect(main(ARGS, d.deps)).toBe(0);
    expect(d.lines.join('\n')).not.toMatch(/home destination/);
  });

  it('names a Home destination that is not a live route, and does not look for its fragment', () => {
    const d = deps({ destinations: [...SITE_DESTINATIONS, '/lab', '/work/pulse#why'] });
    expect(main(ARGS, d.deps)).toBe(1);
    const out = d.lines.filter((l) => l.includes('home destination'));
    expect(out).toEqual([
      'unmet: home destination is not a live route: /lab (its page is not built yet, or LIVE_ROUTES does not list it)',
      'unmet: home destination is not a live route: /work/pulse#why (its page is not built yet, or LIVE_ROUTES does not list it)',
    ]);
  });

  it('names a fragment its built page lacks; text, a script payload or a name attribute is not an id', () => {
    const d = deps();
    built(
      '<main><p>id="automation"</p><a name="automation"></a><script>self.__next_f.push([1,"<section id=\\"automation\\">"])</script><section id="why-so-many"></section></main>',
      'work/audible',
    );
    expect(main(ARGS, d.deps)).toBe(1);
    expect(d.lines.filter((l) => l.includes('home destination'))).toEqual([
      'unmet: home destination fragment missing: /work/audible#automation (no element with id "automation" in the built page)',
    ]);
  });

  it('names a live route with a fragment whose page is not built', () => {
    const d = deps();
    rmSync(join(root, '.next/server/app/work'), { recursive: true, force: true });
    expect(main(ARGS, d.deps)).toBe(1);
    expect(d.lines.filter((l) => l.includes('home destination'))).toEqual([
      'unmet: home destination has no built page: /work/audible#why-so-many (run npm run build first)',
      'unmet: home destination has no built page: /work/audible#automation (run npm run build first)',
    ]);
  });

  it('checks /cv.pdf as a file in public/, not as a route', () => {
    const d = deps();
    rmSync(join(root, 'public/cv.pdf'));
    expect(main(ARGS, d.deps)).toBe(1);
    expect(d.lines.filter((l) => l.includes('home destination'))).toEqual(['unmet: home destination file missing: /cv.pdf (public/cv.pdf)']);
  });

  it('reads the Home destinations and LIVE_ROUTES by default', () => {
    const given = deps({ destinations: HOME_DESTINATIONS, liveRoutes: LIVE_ROUTES });
    const status = main(ARGS, given.deps);
    const d = deps();
    delete d.deps.destinations;
    delete d.deps.liveRoutes;
    expect(main(ARGS, d.deps)).toBe(status);
    expect(d.lines.filter((l) => l.includes('home destination'))).toEqual(given.lines.filter((l) => l.includes('home destination')));
  });

  it('the repository today: every Home destination is a live route (a fragment still needs a build to check)', () => {
    const repo = join(import.meta.dirname, '../..');
    const out = destinationsUnmet({ root: repo, destinations: HOME_DESTINATIONS, liveRoutes: LIVE_ROUTES });
    expect(out.filter((l) => /not a live route|file missing/.test(l))).toEqual([]);
    for (const line of out) expect(line).toMatch(/has no built page|fragment missing/);
  });

  it('never asks the Vercel CLI for values (no --json or --format)', () => {
    const d = deps();
    main(ARGS, d.deps);
    const vercel = d.calls.find((c) => c.includes('vercel'))!;
    expect(vercel).toEqual(expect.arrayContaining(['env', 'ls', 'production']));
    expect(vercel.some((a) => a === '--json' || a.startsWith('--format') || a === '-F')).toBe(false);
  });

  it('lists the Vercel variables in the given team', () => {
    const d = deps();
    main(ARGS, d.deps);
    const vercel = d.calls.find((c) => c.includes('vercel'))!;
    expect(vercel.slice(vercel.indexOf('--scope'), vercel.indexOf('--scope') + 2)).toEqual(['--scope', 'example-team']);
  });

  it('names an unknown Vercel team and does not call the Vercel CLI', () => {
    const d = deps({ vercelScope: null });
    expect(main(ARGS, d.deps)).toBe(1);
    expect(d.lines.join('\n')).toMatch(/^unmet: the Vercel team is unknown: set VERCEL_SCOPE, or run npx vercel link/m);
    expect(d.calls.some((c) => c.includes('vercel'))).toBe(false);
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

  it("checks the contact form's two Vercel secrets by name", () => {
    expect(VERCEL_SECRETS).toEqual(expect.arrayContaining(['RESEND_API_KEY', 'CONTACT_TO_EMAIL']));
    const d = deps();
    const base = d.deps.run!;
    d.deps.run = (cmd, args) =>
      args.includes('vercel') ? { status: 0, stdout: vercelTable(VERCEL_SECRETS.filter((n) => n !== 'RESEND_API_KEY' && n !== 'CONTACT_TO_EMAIL')) } : base(cmd, args);
    expect(main(ARGS, d.deps)).toBe(1);
    const out = d.lines.join('\n');
    expect(out).toMatch(/^unmet: secret missing in Vercel production: RESEND_API_KEY$/m);
    expect(out).toMatch(/^unmet: secret missing in Vercel production: CONTACT_TO_EMAIL$/m);
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

  it('names each GitHub variable the deploy needs that is missing, by name only', () => {
    expect(GITHUB_VARIABLES).toEqual(['LAUNCHED', 'LAUNCH_SHA']);
    const d = deps();
    const base = d.deps.run!;
    d.deps.run = (cmd, args) => (cmd === 'gh' && args[0] === 'variable' ? { status: 0, stdout: 'LAUNCHED\n' } : base(cmd, args));
    expect(main(ARGS, d.deps)).toBe(1);
    const out = d.lines.join('\n');
    expect(out).toMatch(
      /^unmet: variable missing in GitHub: LAUNCH_SHA \(expected before launch; never set it to clear this line: only the owner sets LAUNCH_SHA, then LAUNCHED, in the launch step\)$/m,
    );
    expect(out).not.toMatch(/variable missing in GitHub: LAUNCHED /m);
  });

  it('asks gh for the variable names only, never their values, and prints none of its output', () => {
    const d = deps();
    const base = d.deps.run!;
    d.deps.run = (cmd, args) =>
      cmd === 'gh' && args[0] === 'variable' ? { status: 0, stdout: `LAUNCHED\nLAUNCH_SHA\n${SECRET_VALUE}\n` } : base(cmd, args);
    expect(main(ARGS, d.deps)).toBe(0);
    expect(d.lines.join('\n')).not.toContain(SECRET_VALUE);
    const calls: string[][] = [];
    const record = deps();
    const recordBase = record.deps.run!;
    record.deps.run = (cmd, args) => {
      calls.push([cmd, ...args]);
      return recordBase(cmd, args);
    };
    main(ARGS, record.deps);
    expect(calls.filter((c) => c[0] === 'gh' && c[1] === 'variable')).toEqual([
      ['gh', 'variable', 'list', '--repo', GITHUB_REPO, '--json', 'name', '--jq', '.[].name'],
    ]);
  });

  it('a gh that cannot list the variables counts as unmet, with no output of its own', () => {
    const d = deps();
    const base = d.deps.run!;
    d.deps.run = (cmd, args) => (cmd === 'gh' && args[0] === 'variable' ? { status: 1, stdout: SECRET_VALUE } : base(cmd, args));
    expect(main(ARGS, d.deps)).toBe(1);
    const out = d.lines.join('\n');
    expect(out).toMatch(/^unmet: could not list the GitHub variables \(run gh auth login, then try again\)$/m);
    expect(out).not.toMatch(/variable missing in GitHub/);
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

  it('names each workflow that still names a self-hosted runner, and accepts hosted ones', () => {
    const d = deps();
    mkdirSync(join(root, '.github/workflows'), { recursive: true });
    writeFileSync(join(root, '.github/workflows/deploy.yml'), 'jobs:\n  deploy:\n    runs-on: ubuntu-24.04\n');
    expect(main(ARGS, d.deps)).toBe(0);
    writeFileSync(join(root, '.github/workflows/ci.yml'), 'jobs:\n  static:\n    runs-on: [self-hosted, linux, arm64, portfolio-mac]\n');
    writeFileSync(join(root, '.github/workflows/other.yaml'), '# label: portfolio-mac-2\n');
    expect(main(ARGS, d.deps)).toBe(1);
    const out = d.lines.join('\n');
    expect(out).toMatch(/^unmet: a workflow still names a self-hosted runner: \.github\/workflows\/ci\.yml \(self-hosted, portfolio-mac\); switch its jobs back to runs-on: ubuntu-24\.04$/m);
    expect(out).toMatch(/^unmet: a workflow still names a self-hosted runner: \.github\/workflows\/other\.yaml \(portfolio-mac\)/m);
    expect(out).not.toMatch(/deploy\.yml/);
  });

  it('names self-hosted runners still registered, asking gh read-only for the count alone', () => {
    const d = deps();
    const base = d.deps.run!;
    d.deps.run = (cmd, args) => (cmd === 'gh' && args[0] === 'api' ? { status: 0, stdout: '2\n' } : base(cmd, args));
    expect(main(ARGS, d.deps)).toBe(1);
    expect(d.lines.join('\n')).toMatch(/^unmet: self-hosted runners are still registered for the repository: 2 \(deregister and remove them first\)$/m);
    const calls = deps();
    main(ARGS, calls.deps);
    expect(calls.calls.filter((c) => c[0] === 'gh' && c[1] === 'api')).toEqual([
      ['gh', 'api', 'repos/MaHmOuDeB/portfolio/actions/runners', '--jq', '.total_count'],
    ]);
  });

  it('fails closed when the runners cannot be counted, printing none of the output', () => {
    for (const answer of [{ status: 1, stdout: SECRET_VALUE }, { status: 0, stdout: SECRET_VALUE }, { status: null, stdout: '' }]) {
      const d = deps();
      const base = d.deps.run!;
      d.deps.run = (cmd, args) => (cmd === 'gh' && args[0] === 'api' ? answer : base(cmd, args));
      expect(main(ARGS, d.deps)).toBe(1);
      const out = d.lines.join('\n');
      expect(out).toMatch(/^unmet: could not count the repository's self-hosted runners \(run gh auth login, then try again\)$/m);
      expect(out).not.toContain(SECRET_VALUE);
    }
  });

  it('flags neither of this repository\'s workflows: every job runs on the hosted runner', () => {
    const d = deps({ root: join(import.meta.dirname, '../..') });
    main(ARGS, d.deps);
    const flagged = d.lines.filter((l) => l.startsWith('unmet: a workflow still names a self-hosted runner'));
    expect(flagged).toEqual([]);
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

describe('vercelScopeFrom', () => {
  it('takes VERCEL_SCOPE first, trimmed', () => {
    mkdirSync(join(root, '.vercel'), { recursive: true });
    writeFileSync(join(root, '.vercel/project.json'), JSON.stringify({ orgId: 'team_fromfile', projectId: 'prj_x' }));
    expect(vercelScopeFrom(root, { VERCEL_SCOPE: ' example-team ' })).toBe('example-team');
  });

  it('falls back to the orgId in .vercel/project.json', () => {
    mkdirSync(join(root, '.vercel'), { recursive: true });
    writeFileSync(join(root, '.vercel/project.json'), JSON.stringify({ orgId: 'team_fromfile', projectId: 'prj_x' }));
    expect(vercelScopeFrom(root, {})).toBe('team_fromfile');
    expect(vercelScopeFrom(root, { VERCEL_SCOPE: '' })).toBe('team_fromfile');
  });

  it('is null without either, or with an unreadable or empty project file', () => {
    expect(vercelScopeFrom(root, {})).toBeNull();
    mkdirSync(join(root, '.vercel'), { recursive: true });
    writeFileSync(join(root, '.vercel/project.json'), '{not json');
    expect(vercelScopeFrom(root, {})).toBeNull();
    writeFileSync(join(root, '.vercel/project.json'), JSON.stringify({ orgId: '' }));
    expect(vercelScopeFrom(root, {})).toBeNull();
  });
});
