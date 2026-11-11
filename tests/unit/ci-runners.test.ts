import { readFileSync } from 'node:fs';
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
    });
  });

  it('runs every job but lhci on the self-hosted labels', () => {
    for (const id of ['stats-ref', 'sources-remote', 'build', 'cv-pdf', 'build-isolation']) {
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
    const others = Object.keys(ci).filter((id) => id !== 'lhci');
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
    expect(comment).toContain('a skip is never a Lighthouse pass');
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
  });

  it('restores node_modules on the hosted jobs by exact key only, and installs and saves on a miss', () => {
    const NODE_MODULES_KEY =
      "key: node-modules-${{ runner.os }}-${{ runner.arch }}-node-${{ steps.node.outputs.version }}-${{ hashFiles('package-lock.json') }}";
    const deploy = jobs(DEPLOY).deploy!;
    for (const [name, job] of [['lhci', ci.lhci!], ['deploy', deploy]] as const) {
      const steps = job.split('\n      - ').slice(1);
      const at = (re: RegExp) => steps.findIndex((step) => re.test(step));
      const version = at(/^name: Node version\n {8}id: node\n {8}run: echo "version=\$\(node --version\)" >> "\$GITHUB_OUTPUT"$/);
      const restore = at(/^name: Restore node_modules\n {8}id: node-modules\n {8}uses: actions\/cache\/restore@[0-9a-f]{40} # v[\d.]+\n/);
      const install = at(/^if: \$\{\{ steps\.node-modules\.outputs\.cache-hit != 'true' \}\}\n {8}run: npm ci$/);
      const save = at(/^name: Save node_modules\n {8}if: \$\{\{ steps\.node-modules\.outputs\.cache-hit != 'true' \}\}\n {8}uses: actions\/cache\/save@[0-9a-f]{40} # v[\d.]+\n/);
      expect([version, restore, install, save], name).toEqual([version, version + 1, version + 2, version + 3]);
      expect(version, name).toBeGreaterThan(0);
      // After setup-node, which reads .nvmrc and no longer caches ~/.npm.
      const setup = at(/^uses: actions\/setup-node@[0-9a-f]{40} # v[\d.]+\n {8}with:\n {10}node-version-file: \.nvmrc\n(?! {10})/);
      expect(setup, name).toBeGreaterThan(-1);
      expect(setup, name).toBeLessThan(version);
      expect(steps[restore]!.endsWith(`\n          path: node_modules\n          ${NODE_MODULES_KEY}`), name).toBe(true);
      expect(steps[save], name).toMatch(/\n {10}path: node_modules\n {10}key: \$\{\{ steps\.node-modules\.outputs\.cache-primary-key \}\}(?:\n|$)/);
      // The exact key only: no prefix match can bring back another lockfile's tree, no second npm cache.
      const code = job.replace(/^\s*#.*\n/gm, '');
      expect(code, name).not.toMatch(/restore-keys|^\s+cache:|fail-on-cache-miss/m);
      expect(job.match(/run: npm ci$/gm), name).toHaveLength(1);
      // Nothing between them holds a secret.
      for (const step of steps.slice(version, save + 1)) expect(step, name).not.toMatch(/secrets\./);
    }
    // In the deploy, the cache steps come after the SHA guard and before every Vercel step.
    const steps = deploy.split('\n      - ').slice(1);
    const save = steps.findIndex((step) => step.startsWith('name: Save node_modules'));
    expect(steps.findIndex((step) => step.startsWith('name: Guard production SHA'))).toBe(0);
    expect(steps.findIndex((step) => step.startsWith('name: Pull Vercel environment'))).toBeGreaterThan(save);
    // In lhci, the tree is saved before Lighthouse runs.
    const lhciSteps = ci.lhci!.split('\n      - ').slice(1);
    expect(lhciSteps.findIndex((step) => step.startsWith('name: Save node_modules'))).toBeLessThan(
      lhciSteps.findIndex((step) => step.startsWith('run: npm run lhci')),
    );
  });

  it('keeps artifacts only as long as something reads them', () => {
    // deploy.yml reads these from the push run on main; on a pull request they are kept 3 days.
    expect(ci.static).toContain("          name: report-vitest\n          path: reports/vitest.json\n          if-no-files-found: error\n          retention-days: ${{ github.event_name == 'pull_request' && 3 || 14 }}\n");
    expect(ci.e2e).toContain("          name: report-e2e\n          path: reports/e2e.json\n          if-no-files-found: error\n          retention-days: ${{ github.event_name == 'pull_request' && 3 || 14 }}\n");
    for (const name of ['report-vitest', 'report-e2e', 'report-lhci']) expect(DEPLOY).toContain(`          name: ${name}\n`);
    // Visual baselines only while the label is on or when e2e failed.
    expect(ci.e2e).toMatch(
      /- name: Upload visual baselines\n {8}if: \$\{\{ !cancelled\(\) && \(failure\(\) \|\| env\.UPDATE_BASELINES == '1'\) \}\}\n/,
    );
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
      /- name: Look up a Lighthouse pass for this commit\n {8}id: lhci-passed\n {8}if: \$\{\{ github\.event_name == 'pull_request' \}\}\n {8}uses: actions\/cache\/restore@[0-9a-f]{40} # v[\d.]+\n {8}with:\n/,
    );
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
    expect(ci.lhci!.replace(/^\s*#.*\n/gm, '')).not.toMatch(/lookup-only|restore-keys/);
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
    expect(header).toContain('the visual baselines are uploaded only while the `update-baselines` label is on or when e2e failed');
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
    expect(checkouts.length).toBe(Object.keys(ci).length);
    // Inside the step's own `with:` block, whatever other inputs it has.
    for (const c of checkouts) expect(c).toMatch(/^\S+ # v[\d.]+\n {8}with:\n(?: {10}\S.*\n)*? {10}persist-credentials: false\n/);
  });
});
