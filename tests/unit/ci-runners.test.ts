import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Where each CI job runs. Every job except lhci runs on the owner's self-hosted runners (two runner
// containers on one Mac that share the Docker VM's network); lhci and the deploy run on GitHub's
// hosted runners. The required checks are matched by job name, so the names must not change. The
// self-hosted layout must be switched back before the repository is made public (see the comment
// at the top of the jobs in ci.yml).
const ROOT = join(import.meta.dirname, '../..');
const CI = readFileSync(join(ROOT, '.github/workflows/ci.yml'), 'utf8');
const DEPLOY = readFileSync(join(ROOT, '.github/workflows/deploy.yml'), 'utf8');
const REDIS_DOC = readFileSync(join(ROOT, 'docs/experiment/redis-conformance.md'), 'utf8');
const VITEST_CONFIG = readFileSync(join(ROOT, 'vitest.config.mts'), 'utf8');
const LHCI_SCRIPT = readFileSync(join(ROOT, 'scripts/lhci-calibrated.sh'), 'utf8');

const SELF_HOSTED = '[self-hosted, linux, arm64, portfolio-mac]';
const INSTANCE_1 = '[self-hosted, linux, arm64, portfolio-mac, portfolio-mac-1]';
const INSTANCE_2 = '[self-hosted, linux, arm64, portfolio-mac, portfolio-mac-2]';
const PLAYWRIGHT_IMAGE = 'mcr.microsoft.com/playwright:v1.63.0-noble';
// Shared memory from the Docker VM (Playwright's Docker advice) and 5 GB: at 3.5 GB with Docker's
// 64 MB /dev/shm the heaviest pages crashed the browser; at 4.5 GB they passed at the cap.
const E2E_CAPS = '--cpus 3 --memory 5120m --memory-swap 5120m --ipc=host';
// Lighthouse measures on GitHub's hosted runner, where its budgets were calibrated. Hosted runs took
// 71 to 167 seconds; the limit leaves room for a cold npm cache and caps what a hung run can cost.
const LHCI_RUNNER = 'ubuntu-24.04';
const LHCI_TIMEOUT = '10';
// The local calibration script (no longer used by CI): empirical: on a quiet Mac (benchmark index 2810.5 under the Lighthouse lock) x1.5 under-throttled
// and the benchmark-ratio value x4.9 over-throttled against GitHub's hosted runs of the same commits;
// 2.8 is where TBT met the hosted values on the two references from GitHub's common hardware.
const LHCI_CPU_MULTIPLIER = '2.8';

/** The text of each job under `jobs:`, by job id. */
function jobs(workflow: string): Record<string, string> {
  const at = workflow.indexOf('\njobs:\n');
  expect(at).toBeGreaterThan(-1);
  const parts = workflow.slice(at + '\njobs:\n'.length).split(/^(?= {2}[a-z][\w-]*:$)/m);
  const out: Record<string, string> = {};
  for (const part of parts) {
    const id = /^ {2}([a-z][\w-]*):$/m.exec(part)?.[1];
    if (id) out[id] = part;
  }
  return out;
}

/** A job-level key (four spaces in), such as `runs-on` or `name`. */
function key(job: string, name: string): string | undefined {
  return new RegExp(`^ {4}${name}: (.+)$`, 'm').exec(job)?.[1];
}

const ci = jobs(CI);

/** The top-level events under `on:`, by name. */
function ciTriggers(): Record<string, string> {
  const on = CI.slice(CI.indexOf('\non:\n') + 5, CI.indexOf('\nconcurrency:'));
  const out: Record<string, string> = {};
  for (const part of on.split(/^(?= {2}[a-z_]+:)/m)) {
    const name = /^ {2}([a-z_]+):/.exec(part)?.[1];
    if (name) out[name] = part;
  }
  return out;
}

describe('the CI jobs and their check names', () => {
  it('keeps every job and its name', () => {
    expect(Object.fromEntries(Object.entries(ci).map(([id, job]) => [id, key(job, 'name')]))).toEqual({
      static: 'Static checks and unit tests',
      'stats-ref': 'Statistics reference data',
      'sources-remote': 'Pinned sources exist on GitHub',
      build: 'Production build',
      e2e: 'End-to-end tests',
      lhci: 'Lighthouse CI',
      links: 'Link check',
      'cv-pdf': 'CV PDF check',
      'build-isolation': 'Build token isolation',
      'lhci-gate': 'Lighthouse gate',
    });
  });

  it('runs every job but lhci on the self-hosted labels', () => {
    for (const id of ['stats-ref', 'sources-remote', 'build', 'lhci-gate', 'cv-pdf', 'build-isolation']) {
      expect(key(ci[id]!, 'runs-on'), id).toBe(SELF_HOSTED);
    }
    // Static (fixed Redis port) and links (fixed site port) only on instance 1; e2e (the longest
    // job) only on instance 2.
    expect(key(ci.static!, 'runs-on')).toBe(INSTANCE_1);
    expect(key(ci.links!, 'runs-on')).toBe(INSTANCE_1);
    expect(key(ci.e2e!, 'runs-on')).toBe(INSTANCE_2);
    // lhci is the one hosted job; every other job is self-hosted.
    expect(Object.entries(ci).filter(([, job]) => !selfHosted(job)).map(([id]) => id)).toEqual(['lhci']);
  });

  it('runs Lighthouse on the hosted runner, plain, with no container caps, only after every other job passed', () => {
    expect(key(ci.lhci!, 'runs-on')).toBe(LHCI_RUNNER);
    // Outside the comments, which explain where the downloaded build was made.
    const code = ci.lhci!.replace(/^\s*#.*\n/gm, '');
    expect(code).not.toMatch(/self-hosted|portfolio-mac/);
    expect(key(ci.lhci!, 'timeout-minutes')).toBe(LHCI_TIMEOUT);
    // No job container, so no `options` caps, no shared-memory flag and no runner-disk npm cache.
    expect(ci.lhci).not.toMatch(/^ {4}(?:container|services|env):/m);
    expect(ci.lhci).not.toMatch(/--cpus|--memory|--ipc|--no-sandbox|npm_config_cache|\/__w/);
    // Hosted minutes go only to runs where everything else is green.
    const others = Object.keys(ci).filter((id) => id !== 'lhci' && id !== 'lhci-gate');
    expect(key(ci.lhci!, 'needs')).toBe(`[${others.join(', ')}]`);
    expect(key(ci.lhci!, 'if')).toBe(
      "${{ !cancelled() && needs.build.result == 'success' && !contains(needs.*.result, 'failure') && !contains(needs.*.result, 'cancelled') && needs.build.outputs.lhci-passed != 'true' && !contains(github.event.pull_request.labels.*.name, 'update-baselines') }}",
    );
    // A skipped job reports success, so lhci skips only while `update-baselines` is on (that run is
    // not merge evidence) or when this exact commit already passed it (below), never on the event.
    expect(key(ci.lhci!, 'if')!.replace("!contains(github.event.pull_request.labels.*.name, 'update-baselines')", '')).not.toMatch(
      /label|github\.event\.action/,
    );
    // The comment says the skipped run is not a pass and which run gates the merge.
    const comment = ci.lhci!.split('\n    needs:')[0]!.replace(/\n {4}# /g, ' ');
    expect(comment).toContain('a skipped lhci is never read as a pass');
    expect(comment).toContain('A push to main never uses the marker and always measures');
    expect(comment).toContain('the run after the label is removed is the one that gates the merge');
    // The build job's output.
    expect(ci.lhci).toContain('          name: next-build\n          path: .next\n');
    // The plain run, as before the self-hosted runners: no CPU multiplier, no benchmark guard.
    expect(ci.lhci).toMatch(/^ {6}- run: npm run lhci$/m);
    expect(ci.lhci).not.toMatch(/lhci-calibrated|cpuSlowdownMultiplier|lhci collect/);
    expect(ci.lhci).toContain("          if-no-files-found: error\n          retention-days: ${{ github.event_name == 'pull_request' && 3 || 7 }}\n");
    // The local calibration script keeps its multiplier and its browser (lhci-calibrated.test.ts).
    expect(LHCI_SCRIPT).toMatch(new RegExp(`^MULTIPLIER=${LHCI_CPU_MULTIPLIER.replace('.', '\\.')}$`, 'm'));
    expect(LHCI_SCRIPT).toContain("export CHROME_PATH=\"$(node -e \"console.log(require('playwright-core').chromium.executablePath())\")\"");
    // Same budgets and runs as everywhere else: lighthouserc.json is untouched (lighthouserc.test.ts).
    expect(`${ci.lhci}${LHCI_SCRIPT}`).not.toMatch(/numberOfRuns|--assert\.|minScore|maxNumericValue/);
  });

  it('keeps the deploy, which holds the production secrets, on GitHub-hosted runners', () => {
    const deploy = jobs(DEPLOY);
    expect(Object.keys(deploy)).toEqual(['deploy']);
    expect(key(deploy.deploy!, 'runs-on')).toBe('ubuntu-24.04');
    expect(DEPLOY).not.toMatch(/self-hosted|portfolio-mac/);
    // Successful deploys took 2:06 to 2:11; 10 minutes caps a hung one.
    expect(key(deploy.deploy!, 'timeout-minutes')).toBe('10');
    // The deploy holds the production secrets, so it never runs a node_modules tree from a cache
    // (any job of a push run on main can write that scope): only npm's download cache, whose
    // tarballs npm ci checks against the lockfile, and an unconditional clean install.
    expect(DEPLOY).not.toMatch(/actions\/cache|node_modules|lhci-hosted/);
    expect(DEPLOY).toMatch(
      /\n {6}- uses: actions\/setup-node@[0-9a-f]{40} # v[\d.]+\n {8}with:\n {10}node-version-file: \.nvmrc\n {10}cache: npm\n {6}- run: npm ci\n/,
    );
    expect(DEPLOY.match(/npm ci/g)).toHaveLength(1);
  });

  it('restores node_modules only in lhci, only on pull requests, by its own exact key, checked against the lockfile', () => {
    const steps = ci.lhci!.split('\n      - ').slice(1);
    const at = (re: RegExp) => steps.findIndex((step) => re.test(step));
    const keyStep = at(/^name: node_modules cache key\n {8}id: node\n/);
    const restore = at(/^name: Restore node_modules\n {8}id: node-modules\n {8}uses: actions\/cache\/restore@[0-9a-f]{40} # v[\d.]+\n/);
    const check = at(/^name: Check the restored node_modules against the lockfile\n {8}id: node-modules-check\n/);
    const install = at(/^if: \$\{\{ steps\.node-modules-check\.outputs\.ok != 'true' \}\}\n {8}run: npm ci$/);
    const save = at(/^name: Save node_modules\n {8}if: \$\{\{ steps\.node-modules\.outputs\.cache-hit != 'true' \}\}\n {8}uses: actions\/cache\/save@[0-9a-f]{40} # v[\d.]+\n/);
    expect([keyStep, restore, check, install, save]).toEqual([keyStep, keyStep + 1, keyStep + 2, keyStep + 3, keyStep + 4]);
    expect(keyStep).toBeGreaterThan(0);
    // A prefix no other job uses; OS, architecture, the exact Node version, the lockfile and .npmrc.
    expect(steps[keyStep]).toContain('          KEY_PREFIX: lhci-hosted-node-modules-${{ runner.os }}-${{ runner.arch }}\n');
    expect(steps[keyStep]).toContain("          LOCK_HASH: ${{ hashFiles('package-lock.json', '.npmrc') }}\n");
    expect(steps[keyStep]).toContain('        run: echo "key=${KEY_PREFIX}-node-$(node --version)-${LOCK_HASH}" >> "$GITHUB_OUTPUT"');
    // A push to main only looks the key up (it installs fresh); a pull request restores, exact key only.
    expect(steps[restore]!.endsWith(
      "\n          path: node_modules\n          key: ${{ steps.node.outputs.key }}\n          lookup-only: ${{ github.event_name != 'pull_request' }}",
    )).toBe(true);
    // A restored tree is used only after it matched the lockfile; otherwise npm ci.
    expect(steps[check]).toContain("        if: ${{ github.event_name == 'pull_request' && steps.node-modules.outputs.cache-hit == 'true' }}\n");
    expect(steps[check]).toContain('          if node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/check-node-modules.ts; then\n            echo "ok=true" >> "$GITHUB_OUTPUT"\n');
    expect(steps[save]).toMatch(/\n {10}path: node_modules\n {10}key: \$\{\{ steps\.node\.outputs\.key \}\}(?:\n|$)/);
    // Saved before Lighthouse runs, so nothing else has written to it.
    expect(save).toBeLessThan(at(/^run: npm run lhci$/));
    const code = ci.lhci!.replace(/^\s*#.*\n/gm, '');
    expect(code).not.toMatch(/restore-keys|^\s+cache:|fail-on-cache-miss/m);
    expect(code.match(/run: npm ci$/gm)).toHaveLength(1);
    for (const step of steps.slice(keyStep, save + 1)) expect(step).not.toMatch(/secrets\./);
    // Only lhci names the key or saves any cache entry.
    for (const [id, job] of Object.entries(ci)) {
      if (id === 'lhci') continue;
      expect(job, id).not.toMatch(/lhci-hosted-node-modules|node_modules\n|actions\/cache\/save/);
    }
    expect(CI.match(/lhci-hosted-node-modules/g)).toHaveLength(1);
  });

  it('keeps artifacts only as long as something reads them', () => {
    // deploy.yml reads these from the push run on main; on a pull request they are kept 3 days.
    expect(ci.static).toContain("          name: report-vitest\n          path: reports/vitest.json\n          if-no-files-found: error\n          retention-days: ${{ github.event_name == 'pull_request' && 3 || 14 }}\n");
    expect(ci.e2e).toContain("          name: report-e2e\n          path: reports/e2e.json\n          if-no-files-found: error\n          retention-days: ${{ github.event_name == 'pull_request' && 3 || 14 }}\n");
    for (const name of ['report-vitest', 'report-e2e', 'report-lhci']) expect(DEPLOY).toContain(`          name: ${name}\n`);
    // Visual baselines only while the label is on (otherwise the folder holds the committed ones).
    expect(ci.e2e).toMatch(/- name: Upload visual baselines\n {8}if: \$\{\{ !cancelled\(\) && env\.UPDATE_BASELINES == '1' \}\}\n/);
    expect(ci.e2e).toContain("UPDATE_BASELINES: ${{ contains(github.event.pull_request.labels.*.name, 'update-baselines') && '1' || '0' }}");
    // The build output lives one day; every upload names its retention.
    expect(ci.build).toContain('          retention-days: 1\n');
    const uploads = CI.split('uses: actions/upload-artifact@').slice(1);
    expect(uploads).toHaveLength(5);
    for (const upload of uploads) expect(upload.split('\n      - ')[0]).toMatch(/\n {10}retention-days: /);
  });

  it('skips Lighthouse only for a pull request commit that already passed it, looked up on a self-hosted runner', () => {
    const marker = '          path: .lhci-passed\n          key: lhci-passed-${{ github.sha }}\n';
    // The lookup is free: the build job (self-hosted) asks the cache whether the marker exists,
    // without downloading it, and only on pull requests (a push to main always measures).
    expect(ci.build).toContain('    outputs:\n      lhci-passed: ${{ steps.lhci-passed.outputs.cache-hit }}\n');
    expect(ci.build).toMatch(
      /- name: Look up a Lighthouse pass for this commit\n {8}id: lhci-passed\n {8}if: \$\{\{ github\.event_name == 'pull_request' && !contains\(github\.event\.pull_request\.labels\.\*\.name, 'lhci-remeasure'\) \}\}\n {8}uses: actions\/cache\/restore@[0-9a-f]{40} # v[\d.]+\n {8}with:\n/,
    );
    // How to force a measurement of a commit that already passed, and the accepted forgery risk.
    const lookupComment = ci.build!.split('- name: Look up a Lighthouse pass')[0]!.replace(/\n {6}# /g, ' ');
    expect(lookupComment).toContain('The `lhci-remeasure` label skips the lookup');
    expect(lookupComment).toContain('gh cache delete lhci-passed-<sha>');
    expect(lookupComment).toContain('Never on a push to main, which always measures');
    expect(ci.build).toContain(`${marker}          lookup-only: true\n`);
    // The marker is saved by the hosted job only after its assertions and the report upload passed.
    const steps = ci.lhci!.split('\n      - ');
    const run = steps.findIndex((step) => step.startsWith('run: npm run lhci'));
    const save = steps.findIndex((step) => /\n {8}uses: actions\/cache\/save@[0-9a-f]{40} /.test(step) && step.includes('.lhci-passed'));
    expect(run).toBeGreaterThan(-1);
    expect(save).toBeGreaterThan(run);
    for (const step of steps.slice(save - 1, save + 1)) {
      expect(step).toContain("if: ${{ success() && github.event_name == 'pull_request' }}");
    }
    expect(steps[save]).toContain(marker);
    // In lhci only the node_modules restore is lookup-only (on a push); nothing uses restore-keys.
    expect(ci.lhci!.replace(/^\s*#.*\n/gm, '').match(/lookup-only/g)).toHaveLength(1);
    expect(CI.replace(/^\s*#.*\n/gm, '')).not.toMatch(/restore-keys/);
  });

  it('turns the Lighthouse outcome into one gate result on a self-hosted runner', () => {
    const gate = ci['lhci-gate']!;
    expect(key(gate, 'needs')).toBe('[build, lhci]');
    expect(key(gate, 'if')).toBe('${{ always() }}');
    expect(gate).toMatch(
      /- name: Restore the Lighthouse pass marker\n {8}id: marker\n {8}if: \$\{\{ github\.event_name == 'pull_request' && needs\.lhci\.result == 'skipped' && needs\.build\.outputs\.lhci-passed == 'true' \}\}\n {8}uses: actions\/cache\/restore@[0-9a-f]{40} # v[\d.]+\n {8}with:\n {10}path: \.lhci-passed\n {10}key: lhci-passed-\$\{\{ github\.sha \}\}\n/,
    );
    const step = gate.split('\n      - ').find((s) => s.startsWith('name: Lighthouse result for this commit'))!;
    for (const line of [
      'LHCI: ${{ needs.lhci.result }}',
      'EVENT: ${{ github.event_name }}',
      "BASELINES: ${{ contains(github.event.pull_request.labels.*.name, 'update-baselines') }}",
      'MARKER: ${{ steps.marker.outputs.cache-hit }}',
    ]) expect(step).toContain(`          ${line}\n`);
    expect(step).not.toMatch(/secrets\.|continue-on-error/);
    // Run the step's own script, as GitHub runs it (bash -e), in each case.
    const lines = step.split('\n');
    const start = lines.indexOf('        run: |');
    const script = lines.slice(start + 1).map((l) => l.slice(10)).join('\n');
    const SHA = '0123456789abcdef0123456789abcdef01234567';
    const run = (env: Record<string, string>, marker?: string) => {
      const dir = mkdtempSync(join(tmpdir(), 'lhci-gate-'));
      if (marker !== undefined) writeFileSync(join(dir, '.lhci-passed'), `${marker}\n`);
      const r = spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', '-c', script], {
        cwd: dir,
        encoding: 'utf8',
        env: { PATH: process.env.PATH, GITHUB_SHA: SHA, LHCI: '', EVENT: 'pull_request', BASELINES: 'false', MARKER: '', ...env } as Record<string, string | undefined> as NodeJS.ProcessEnv,
      });
      rmSync(dir, { recursive: true });
      return { status: r.status, out: `${r.stdout}${r.stderr}` };
    };
    expect(run({ LHCI: 'success' }).status).toBe(0);
    expect(run({ LHCI: 'success', EVENT: 'push' }).status).toBe(0);
    expect(run({ LHCI: 'skipped', MARKER: 'true' }, SHA)).toMatchObject({ status: 0 });
    // A label skip is "not measured", even with a marker.
    const label = run({ LHCI: 'skipped', BASELINES: 'true', MARKER: 'true' }, SHA);
    expect(label.status).toBe(1);
    expect(label.out).toContain('Not measured');
    // A marker for another commit, a missing marker, a marker on a push, a failure, a skip after
    // another job failed: never a pass.
    expect(run({ LHCI: 'skipped', MARKER: 'true' }, 'fedcba9876543210fedcba9876543210fedcba98').status).toBe(1);
    expect(run({ LHCI: 'skipped', MARKER: 'true' }).status).toBe(1);
    expect(run({ LHCI: 'skipped', MARKER: '' }, SHA).status).toBe(1);
    expect(run({ LHCI: 'skipped', MARKER: 'true', EVENT: 'push' }, SHA).status).toBe(1);
    expect(run({ LHCI: 'failure' }, SHA).status).toBe(1);
    expect(run({ LHCI: 'cancelled' }).status).toBe(1);
  });

  it('says why the jobs are self-hosted, why lhci is not, and that they go back before the repository is public', () => {
    const header = CI.slice(0, CI.indexOf('\njobs:\n')).replace(/\n# /g, ' ');
    expect(header).toContain('the labels self-hosted, linux, arm64 and portfolio-mac');
    expect(header).toContain('BEFORE this repository is made public, switch these jobs back to `runs-on: ubuntu-24.04`');
    expect(header).toContain("lhci already runs on GitHub's hosted runner (`runs-on: ubuntu-24.04`, plain `npm run lhci`)");
    expect(header).toContain('a Lighthouse measurement needs a quiet machine');
    expect(header).toContain('budgets were calibrated on the hosted runner');
    expect(header).toMatch(/scripts\/lhci-calibrated\.sh .*Lighthouse quiet lock are no longer used by CI; they stay for local calibration runs/);
    expect(header).toContain('not while the `update-baselines` label is on or on a pull request commit that already passed it');
    expect(header).toContain('the visual baselines are uploaded only while the `update-baselines` label is on.');
    expect(header).toContain('The self-hosted "Lighthouse gate" job turns each outcome into one result');
    expect(header).toContain('a skipped lhci is never read as a pass');
  });

  it('pins every action to a full commit SHA', () => {
    const uses = [...CI.matchAll(/^\s+(?:- )?uses: (\S+)/gm)].map((m) => m[1]!);
    expect(uses.length).toBeGreaterThan(10);
    for (const ref of uses) expect(ref, ref).toMatch(/@[0-9a-f]{40}$/);
  });
});

describe('the self-hosted adjustments', () => {
  it('runs static only on instance 1 and publishes its Redis port on loopback only', () => {
    // The runners share the Docker VM's network, so a fixed port can be published once at a time.
    expect(key(ci.static!, 'runs-on')).toBe(INSTANCE_1);
    expect(ci.static).toContain("ports: ['127.0.0.1:16389:6379']");
    expect(CI.match(/16389:6379/g)).toHaveLength(1);
    expect(ci.static).toContain('REDIS_CONFORMANCE_URL=redis://127.0.0.1:16389 npm test');
  });

  it('keeps the Redis snippet in the docs identical to the workflow', () => {
    for (const line of [
      "        ports: ['127.0.0.1:16389:6379']",
      '          redis-cli -p 16389 -2 --json ping',
      `          redis-cli -p 16389 info server | grep -E '^redis_version:7\\.2\\.'`,
    ]) {
      expect(CI, line).toContain(line);
      expect(REDIS_DOC, line).toContain(line);
    }
  });

  it('caps the e2e job container, which the runner container caps do not reach', () => {
    expect(ci.e2e).toContain(`    container:\n      image: ${PLAYWRIGHT_IMAGE}\n`);
    expect(ci.e2e).toContain(`      options: ${E2E_CAPS}\n`);
    // Only e2e runs in a job container (composite actions break in one: see links).
    expect(Object.entries(ci).filter(([, job]) => /^ {4}container:/m.test(job)).map(([id]) => id)).toEqual(['e2e']);
  });

  it('gives each self-hosted job a limit measured on a loaded Mac, and lhci one measured on the hosted runner', () => {
    const limits = Object.fromEntries(Object.entries(ci).map(([id, job]) => [id, key(job, 'timeout-minutes')]));
    expect(limits).toEqual({
      static: '25',
      'stats-ref': '25',
      'sources-remote': '25',
      build: '25',
      e2e: '90',
      lhci: LHCI_TIMEOUT,
      links: '25',
      'cv-pdf': '5',
      'build-isolation': '25',
      'lhci-gate': '5',
    });
  });

  it('caches npm on the runner\'s disk instead of through GitHub (the hosted lhci caches node_modules)', () => {
    for (const [id, job] of Object.entries(ci)) expect(job, id).not.toMatch(/^\s+cache:/m);
    expect(ci.e2e).toContain('      npm_config_cache: /__w/_cache/npm\n');
  });

  it('gives static room for the slower Docker VM: 25 minutes, and Vitest a 60 s test timeout', () => {
    expect(key(ci.static!, 'timeout-minutes')).toBe('25');
    // The timeout lives in vitest.config.mts, for every run, not in a CI-only flag.
    expect(ci.static).toContain('      - run: npm run test:cov\n');
    expect(CI).not.toContain('--testTimeout');
    expect(VITEST_CONFIG).toMatch(/^ {4}testTimeout: 60_000,$/m);
  });

  it('runs the end-to-end suite with two workers and a 90-minute limit', () => {
    expect(ci.e2e).toContain('- run: npm run test:e2e -- --workers=2');
    expect(key(ci.e2e!, 'timeout-minutes')).toBe('90');
  });

  it('starts the link-check site on the runner, on port 3123', () => {
    expect(ci.links).toContain('nohup npx next start -p 3123');
    expect(ci.links).toContain('http://localhost:3123/');
  });
});

/** Whether a job runs on the self-hosted runners. */
function selfHosted(job: string): boolean {
  return /self-hosted/.test(key(job, 'runs-on') ?? '');
}

describe('the trust boundary of the self-hosted jobs', () => {
  it('has no trigger that runs with secrets on code from outside the repository', () => {
    const triggers = CI.slice(0, CI.indexOf('\njobs:\n'));
    for (const t of ['pull_request_target', 'workflow_run', 'issue_comment', 'workflow_dispatch', 'repository_dispatch']) {
      expect(triggers, t).not.toContain(t);
    }
    expect(Object.keys(ciTriggers())).toEqual(['pull_request', 'push']);
  });

  it('grants the token read access to the contents only, once, at the top', () => {
    expect(CI.match(/^\s*permissions:/gm)).toHaveLength(1);
    expect(CI).toMatch(/^permissions:\n {2}contents: read\n\n/m);
  });

  it('hands the self-hosted jobs no secret but TRUTH_DENYLIST', () => {
    for (const [id, job] of Object.entries(ci).filter(([, j]) => selfHosted(j))) {
      const used = [...job.matchAll(/secrets\.([A-Za-z_][A-Za-z0-9_]*)/g)].map((m) => m[1]);
      expect(used.filter((s) => s !== 'TRUTH_DENYLIST'), id).toEqual([]);
    }
    expect(new Set([...CI.matchAll(/secrets\.(\w+)/g)].map((m) => m[1]))).toEqual(new Set(['TRUTH_DENYLIST']));
    expect(ci.build).toContain('TRUTH_DENYLIST: ${{ secrets.TRUTH_DENYLIST }}');
    // The hosted lhci measures a local `next start` and gets no secret at all.
    expect(ci.lhci).not.toMatch(/secrets\.|LHCI_EXTRA_HEADERS:/);
  });

  it('never leaves the token in a checkout', () => {
    const checkouts = CI.split('- uses: actions/checkout@').slice(1);
    // Every job checks out the repository except the gate, which reads only the pass marker.
    expect(ci['lhci-gate']).not.toContain('actions/checkout');
    expect(checkouts.length).toBe(Object.keys(ci).length - 1);
    // Inside the step's own `with:` block, whatever other inputs it has.
    for (const c of checkouts) expect(c).toMatch(/^\S+ # v[\d.]+\n {8}with:\n(?: {10}\S.*\n)*? {10}persist-credentials: false\n/);
  });
});
