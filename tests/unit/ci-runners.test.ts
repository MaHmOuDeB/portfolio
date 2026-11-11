import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Where each CI job runs. Every job except lhci runs on the owner's self-hosted runners (two runner
// containers on one Mac that share the Docker VM's network); lhci and the deploy stay on GitHub's
// runners. The required checks are matched by job name, so the names must not change. The
// self-hosted layout must be switched back before the repository is made public (see the comment
// at the top of the jobs in ci.yml).
const ROOT = join(import.meta.dirname, '../..');
const CI = readFileSync(join(ROOT, '.github/workflows/ci.yml'), 'utf8');
const DEPLOY = readFileSync(join(ROOT, '.github/workflows/deploy.yml'), 'utf8');
const REDIS_DOC = readFileSync(join(ROOT, 'docs/experiment/redis-conformance.md'), 'utf8');
const VITEST_CONFIG = readFileSync(join(ROOT, 'vitest.config.mts'), 'utf8');

const SELF_HOSTED = '[self-hosted, linux, arm64, portfolio-mac]';
const INSTANCE_1 = '[self-hosted, linux, arm64, portfolio-mac, portfolio-mac-1]';
const INSTANCE_2 = '[self-hosted, linux, arm64, portfolio-mac, portfolio-mac-2]';
const PLAYWRIGHT_IMAGE = 'mcr.microsoft.com/playwright:v1.63.0-noble';
// Shared memory from the Docker VM (Playwright's Docker advice) and 5 GB: at 3.5 GB with Docker's
// 64 MB /dev/shm the heaviest pages crashed the browser; at 4.5 GB they passed at the cap.
const E2E_CAPS = '--cpus 3 --memory 5120m --memory-swap 5120m --ipc=host';
// Lighthouse: 2 CPUs like GitHub's hosted runner for private repositories, shared memory for Chromium.
const LHCI_CAPS = '--cpus 2 --memory 3072m --memory-swap 3072m --ipc=host';
// 4 x benchmarkIndex of the capped lhci container (837.5, measured) / GitHub's hosted runner (2309,
// the median of 35 hosted Lighthouse runs) = 1.45, rounded to 1.5.
const LHCI_CPU_MULTIPLIER = '1.5';

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
    });
  });

  it('runs every job on the self-hosted labels', () => {
    for (const id of ['stats-ref', 'sources-remote', 'build', 'cv-pdf']) {
      expect(key(ci[id]!, 'runs-on'), id).toBe(SELF_HOSTED);
    }
    // Static (fixed Redis port) and links (fixed site port) only on instance 1; e2e (the longest
    // job) and lhci (one Lighthouse run at a time) only on instance 2.
    expect(key(ci.static!, 'runs-on')).toBe(INSTANCE_1);
    expect(key(ci.links!, 'runs-on')).toBe(INSTANCE_1);
    expect(key(ci.e2e!, 'runs-on')).toBe(INSTANCE_2);
    expect(key(ci.lhci!, 'runs-on')).toBe(INSTANCE_2);
  });

  it('runs Lighthouse last, capped like the hosted runner, with the calibrated CPU multiplier', () => {
    const others = Object.keys(ci).filter((id) => id !== 'lhci');
    expect(key(ci.lhci!, 'needs')).toBe(`[${others.join(', ')}]`);
    expect(key(ci.lhci!, 'if')).toBe("${{ !cancelled() && needs.build.result == 'success' }}");
    expect(ci.lhci).toContain(`    container:\n      image: ${PLAYWRIGHT_IMAGE}\n      options: ${LHCI_CAPS}\n`);
    expect(ci.lhci).toContain(
      `npm run lhci -- --collect.settings.chromeFlags="--no-sandbox" --collect.settings.throttling.cpuSlowdownMultiplier=${LHCI_CPU_MULTIPLIER}\n`,
    );
    expect(ci.lhci).toContain("export CHROME_PATH=\"$(node -e \"console.log(require('playwright-core').chromium.executablePath())\")\"");
    // Same budgets and runs as everywhere else: lighthouserc.json is untouched (lighthouserc.test.ts).
    expect(ci.lhci).not.toMatch(/--collect\.numberOfRuns|--assert\./);
  });

  it('keeps the deploy, which holds the production secrets, on GitHub-hosted runners', () => {
    const deploy = jobs(DEPLOY);
    expect(Object.keys(deploy)).toEqual(['deploy']);
    expect(key(deploy.deploy!, 'runs-on')).toBe('ubuntu-24.04');
    expect(DEPLOY).not.toMatch(/self-hosted|portfolio-mac/);
  });

  it('says why the jobs are self-hosted and that they go back before the repository is public', () => {
    const header = CI.slice(0, CI.indexOf('\njobs:\n')).replace(/\n# /g, ' ');
    expect(header).toContain('the labels self-hosted, linux, arm64 and portfolio-mac');
    expect(header).toContain('BEFORE this repository is made public, switch these jobs back to `runs-on: ubuntu-24.04`');
    expect(header).toContain('give lhci back its plain `npm run lhci` (no CPU multiplier');
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
    // Only e2e and lhci run in a job container (composite actions break in one: see links).
    expect(Object.entries(ci).filter(([, job]) => /^ {4}container:/m.test(job)).map(([id]) => id)).toEqual(['e2e', 'lhci']);
  });

  it('gives each job a limit measured on a loaded Mac (lhci also waits for a quiet Mac)', () => {
    const limits = Object.fromEntries(Object.entries(ci).map(([id, job]) => [id, key(job, 'timeout-minutes')]));
    expect(limits).toEqual({
      static: '25',
      'stats-ref': '25',
      'sources-remote': '25',
      build: '25',
      e2e: '90',
      lhci: '60',
      links: '25',
      'cv-pdf': '5',
    });
  });

  it('caches npm on the runner\'s disk instead of through GitHub', () => {
    for (const [id, job] of Object.entries(ci)) expect(job, id).not.toMatch(/^\s+cache:/m);
    for (const id of ['e2e', 'lhci']) expect(ci[id], id).toContain('      npm_config_cache: /__w/_cache/npm\n');
  });

  it('gives static room for the slower Docker VM: 25 minutes, and Vitest a 20 s test timeout', () => {
    expect(key(ci.static!, 'timeout-minutes')).toBe('25');
    // The timeout lives in vitest.config.mts, for every run, not in a CI-only flag.
    expect(ci.static).toContain('      - run: npm run test:cov\n');
    expect(CI).not.toContain('--testTimeout');
    expect(VITEST_CONFIG).toMatch(/^ {4}testTimeout: 20_000,$/m);
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
  });

  it('never leaves the token in a checkout', () => {
    const checkouts = CI.split('- uses: actions/checkout@').slice(1);
    expect(checkouts.length).toBe(Object.keys(ci).length);
    // Inside the step's own `with:` block, whatever other inputs it has.
    for (const c of checkouts) expect(c).toMatch(/^\S+ # v[\d.]+\n {8}with:\n(?: {10}\S.*\n)*? {10}persist-credentials: false\n/);
  });
});
