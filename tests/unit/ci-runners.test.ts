import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Where and how each CI job runs. Every job runs on GitHub's hosted runner, the layout for a public
// repository (free minutes; a fork's pull request runs on a disposable GitHub machine). The
// end-to-end suite runs in four shards, which the "End-to-end tests" job merges. The required
// checks are matched by job name, so the names must not change.
const ROOT = join(import.meta.dirname, '../..');
const CI = readFileSync(join(ROOT, '.github/workflows/ci.yml'), 'utf8');
const DEPLOY = readFileSync(join(ROOT, '.github/workflows/deploy.yml'), 'utf8');
const REDIS_DOC = readFileSync(join(ROOT, 'docs/experiment/redis-conformance.md'), 'utf8');
const VITEST_CONFIG = readFileSync(join(ROOT, 'vitest.config.mts'), 'utf8');
const PLAYWRIGHT_CONFIG = readFileSync(join(ROOT, 'playwright.config.ts'), 'utf8');
const LHCI_SCRIPT = readFileSync(join(ROOT, 'scripts/lhci-calibrated.sh'), 'utf8');

const HOSTED = 'ubuntu-24.04';
const PLAYWRIGHT_IMAGE = 'mcr.microsoft.com/playwright:v1.63.0-noble@sha256:eff16c30e6f3f4af0a03fa4b706120d5e9b0891c344a27d64559aff5900a4a27';
const SHARDS = 4;
// Lighthouse measures on GitHub's hosted runner, where its budgets were calibrated. Hosted runs took
// 71 to 167 seconds; the limit leaves room for a node_modules cache miss and caps what a hung run can cost.
const LHCI_TIMEOUT = '10';
// The local calibration script (not used by CI), found empirically: on a quiet Mac (benchmark index 2810.5)
// x1.5 under-throttled and the benchmark-ratio value x4.9 over-throttled against GitHub's hosted runs
// of the same commits; 2.8 is where TBT met the hosted values on the two references.
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

/** The steps of one job, in order, each with its own text (without the leading `- `). */
function steps(job: string): string[] {
  return job.slice(job.indexOf('\n    steps:\n')).split('\n      - ').slice(1);
}

/** The text of a step's `run: |` block, unindented, as the runner gets it. */
function script(step: string): string {
  const lines = step.split('\n');
  const start = lines.indexOf('        run: |');
  expect(start).toBeGreaterThan(-1);
  return lines.slice(start + 1).map((l) => l.slice(10)).join('\n');
}

/** Workflow text without its comment lines. */
function code(text: string): string {
  return text.replace(/^\s*#.*\n/gm, '');
}

const ci = jobs(CI);

/** The top-level events under `on:`, by name. */
function ciTriggers(): Record<string, string> {
  const on = code(CI.slice(CI.indexOf('\non:\n') + 5, CI.indexOf('\nconcurrency:')));
  const out: Record<string, string> = {};
  for (const part of on.split(/^(?= {2}[a-z_]+:)/m)) {
    const name = /^ {2}([a-z_]+):/.exec(part)?.[1];
    if (name) out[name] = part;
  }
  return out;
}

describe('the CI jobs and their check names', () => {
  it('keeps every job and its name; the merge job keeps the "End-to-end tests" check name', () => {
    expect(Object.fromEntries(Object.entries(ci).map(([id, job]) => [id, key(job, 'name')]))).toEqual({
      static: 'Static checks and unit tests',
      'stats-ref': 'Statistics reference data',
      'sources-remote': 'Pinned sources exist on GitHub',
      build: 'Production build',
      'e2e-shard': `End-to-end tests (shard \${{ matrix.shard }} of ${SHARDS})`,
      e2e: 'End-to-end tests',
      lhci: 'Lighthouse CI',
      links: 'Link check',
      'cv-pdf': 'CV PDF check',
      'build-isolation': 'Build token isolation',
      'lhci-gate': 'Lighthouse gate',
    });
  });

  it('runs every job on the hosted runner, with no trace of a machine of its own', () => {
    for (const [id, job] of Object.entries(ci)) expect(key(job, 'runs-on'), id).toBe(HOSTED);
    // Comments included: launch:check flags any workflow that names one (launch-check.test.ts).
    for (const text of [CI, DEPLOY]) expect(text).not.toMatch(/self-hosted|portfolio-mac|arm64/);
    // No runner-local cache folders (the runner's own disk) and no container caps.
    expect(CI).not.toMatch(/npm_config_cache|UV_CACHE_DIR|UV_PYTHON_INSTALL_DIR|\/__w|--cpus|--memory/);
  });

  it('runs Lighthouse plain, with no container, only after every other job passed', () => {
    expect(key(ci.lhci!, 'timeout-minutes')).toBe(LHCI_TIMEOUT);
    // No job container, so no `options`, no shared-memory flag and no runner-disk npm cache.
    expect(ci.lhci).not.toMatch(/^ {4}(?:container|services|env|strategy):/m);
    expect(ci.lhci).not.toMatch(/--cpus|--memory|--ipc|--no-sandbox|npm_config_cache|\/__w/);
    // It waits for every other job, the shards and their merge included.
    const others = Object.keys(ci).filter((id) => id !== 'lhci' && id !== 'lhci-gate');
    expect(others).toEqual(expect.arrayContaining(['e2e-shard', 'e2e']));
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
    // The plain run: no CPU multiplier, no benchmark guard.
    expect(ci.lhci).toMatch(/^ {6}- run: npm run lhci$/m);
    expect(ci.lhci).not.toMatch(/lhci-calibrated|cpuSlowdownMultiplier|lhci collect/);
    expect(ci.lhci).toContain("          if-no-files-found: error\n          retention-days: ${{ github.event_name == 'pull_request' && 3 || 7 }}\n");
    // The local calibration script keeps its multiplier and its browser (lhci-calibrated.test.ts),
    // and no workflow calls it.
    expect(LHCI_SCRIPT).toMatch(new RegExp(`^MULTIPLIER=${LHCI_CPU_MULTIPLIER.replace('.', '\\.')}$`, 'm'));
    expect(LHCI_SCRIPT).toContain("export CHROME_PATH=\"$(node -e \"console.log(require('playwright-core').chromium.executablePath())\")\"");
    expect(code(`${CI}${DEPLOY}`)).not.toMatch(/lhci-calibrated\.sh|lhci-benchmark-guard/);
    // Same budgets and runs as everywhere else: lighthouserc.json is untouched (lighthouserc.test.ts).
    expect(`${ci.lhci}${LHCI_SCRIPT}`).not.toMatch(/numberOfRuns|--assert\.|minScore|maxNumericValue/);
  });

  it('keeps the deploy, which holds the production secrets, on the hosted runner with a clean install', () => {
    const deploy = jobs(DEPLOY);
    expect(Object.keys(deploy)).toEqual(['deploy']);
    expect(key(deploy.deploy!, 'runs-on')).toBe(HOSTED);
    // Successful deploys took 2:06 to 2:11; 10 minutes caps a hung one.
    expect(key(deploy.deploy!, 'timeout-minutes')).toBe('10');
    // The deploy holds the production secrets, so it uses no cache at all (it runs in main's cache
    // scope, which every pull request can restore; deploy-guard.test.ts pins why) and installs clean.
    expect(DEPLOY).not.toMatch(/actions\/cache|node_modules|lhci-hosted/);
    expect(DEPLOY).toMatch(
      /\n {6}- uses: actions\/setup-node@[0-9a-f]{40} # v[\d.]+\n {8}with:\n {10}node-version-file: \.nvmrc\n {10}package-manager-cache: false\n {6}- run: npm ci\n/,
    );
    expect(DEPLOY.match(/npm ci/g)).toHaveLength(1);
  });

  it('caches npm downloads through setup-node in every job that installs, except lhci', () => {
    for (const [id, job] of Object.entries(ci)) {
      const setups = job.split('uses: actions/setup-node@').slice(1).map((s) => s.split('\n      - ')[0]!);
      if (id === 'lhci') {
        expect(setups).toHaveLength(1);
        expect(setups[0]).not.toMatch(/^\s+cache:/m);
        continue;
      }
      for (const setup of setups) expect(setup, id).toMatch(/\n {10}node-version-file: \.nvmrc\n {10}cache: npm(?:\n|$)/);
      // Every job that runs npm ci sets up Node with the npm cache.
      if (/run: npm ci$/m.test(job)) expect(setups, id).toHaveLength(1);
    }
    // npm ci runs in these jobs (the shards and their merge included).
    const installs = Object.entries(ci).filter(([, job]) => /run: npm ci$/m.test(job)).map(([id]) => id);
    expect(installs).toEqual(['static', 'sources-remote', 'build', 'e2e-shard', 'e2e', 'lhci', 'links', 'build-isolation']);
  });

  it('restores node_modules only in lhci, only on pull requests, by its own exact key, checked against the lockfile', () => {
    const list = ci.lhci!.split('\n      - ').slice(1);
    const at = (re: RegExp) => list.findIndex((step) => re.test(step));
    const keyStep = at(/^name: node_modules cache key\n {8}id: node\n/);
    const restore = at(/^name: Restore node_modules\n {8}id: node-modules\n {8}uses: actions\/cache\/restore@[0-9a-f]{40} # v[\d.]+\n/);
    const check = at(/^name: Check the restored node_modules against the lockfile\n {8}id: node-modules-check\n/);
    const install = at(/^if: \$\{\{ steps\.node-modules-check\.outputs\.ok != 'true' \}\}\n {8}run: npm ci$/);
    const save = at(/^name: Save node_modules\n {8}if: \$\{\{ steps\.node-modules\.outputs\.cache-hit != 'true' \}\}\n {8}uses: actions\/cache\/save@[0-9a-f]{40} # v[\d.]+\n/);
    expect([keyStep, restore, check, install, save]).toEqual([keyStep, keyStep + 1, keyStep + 2, keyStep + 3, keyStep + 4]);
    expect(keyStep).toBeGreaterThan(0);
    // A prefix no other job uses; OS, architecture, the exact Node version, the lockfile and .npmrc.
    expect(list[keyStep]).toContain('          KEY_PREFIX: lhci-hosted-node-modules-${{ runner.os }}-${{ runner.arch }}\n');
    expect(list[keyStep]).toContain("          LOCK_HASH: ${{ hashFiles('package-lock.json', '.npmrc') }}\n");
    expect(list[keyStep]).toContain('        run: echo "key=${KEY_PREFIX}-node-$(node --version)-${LOCK_HASH}" >> "$GITHUB_OUTPUT"');
    // A push to main only looks the key up (it installs fresh); a pull request restores, exact key only.
    expect(list[restore]!.endsWith(
      "\n          path: node_modules\n          key: ${{ steps.node.outputs.key }}\n          lookup-only: ${{ github.event_name != 'pull_request' }}",
    )).toBe(true);
    // A restored tree is used only after it matched the lockfile; otherwise npm ci.
    expect(list[check]).toContain("        if: ${{ github.event_name == 'pull_request' && steps.node-modules.outputs.cache-hit == 'true' }}\n");
    expect(list[check]).toContain('          if node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/check-node-modules.ts; then\n            echo "ok=true" >> "$GITHUB_OUTPUT"\n');
    expect(list[save]).toMatch(/\n {10}path: node_modules\n {10}key: \$\{\{ steps\.node\.outputs\.key \}\}(?:\n|$)/);
    // Saved before Lighthouse runs, so nothing else has written to it.
    expect(save).toBeLessThan(at(/^run: npm run lhci$/));
    const lhciCode = code(ci.lhci!);
    expect(lhciCode).not.toMatch(/restore-keys|^\s+cache:|fail-on-cache-miss/m);
    expect(lhciCode.match(/run: npm ci$/gm)).toHaveLength(1);
    for (const step of list.slice(keyStep, save + 1)) expect(step).not.toMatch(/secrets\./);
    // Only lhci names the key or saves any cache entry with actions/cache.
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
    // deploy.yml puts report-e2e under reports/, where build-meta reads reports/e2e.json.
    expect(DEPLOY).toMatch(/\n {10}name: report-e2e\n {10}path: reports\n/);
    // The shards' blob reports and baselines are read only by the merge job in the same run.
    expect(ci['e2e-shard']).toContain('          name: blob-report-${{ matrix.shard }}\n          path: blob-report\n          if-no-files-found: error\n          retention-days: 1\n');
    expect(ci['e2e-shard']).toContain('          name: visual-baselines-shard-${{ matrix.shard }}\n          path: baselines-changed\n          if-no-files-found: ignore\n          retention-days: 1\n');
    // Visual baselines only while the label is on (otherwise the folder holds the committed ones).
    for (const id of ['e2e-shard', 'e2e']) {
      expect(ci[id]).toContain("UPDATE_BASELINES: ${{ contains(github.event.pull_request.labels.*.name, 'update-baselines') && '1' || '0' }}");
    }
    expect(ci.e2e).toMatch(/- name: Upload visual baselines\n {8}if: \$\{\{ !cancelled\(\) && env\.UPDATE_BASELINES == '1' \}\}\n/);
    expect(ci.e2e).toContain('          name: visual-baselines\n          path: tests/e2e/__screenshots__\n          if-no-files-found: warn\n          retention-days: 7\n');
    // The build output lives one day; every upload names its retention.
    expect(ci.build).toContain('          retention-days: 1\n');
    const uploads = CI.split('uses: actions/upload-artifact@').slice(1);
    expect(uploads).toHaveLength(7);
    for (const upload of uploads) expect(upload.split('\n      - ')[0]).toMatch(/\n {10}retention-days: /);
  });

  it('skips Lighthouse only for a pull request commit that already passed it, looked up without a download', () => {
    const marker = '          path: .lhci-passed\n          key: lhci-passed-${{ github.sha }}\n';
    // The build job asks the cache whether the marker exists, without downloading it, and only on
    // pull requests (a push to main always measures).
    expect(ci.build).toContain('    outputs:\n      lhci-passed: ${{ steps.lhci-passed.outputs.cache-hit }}\n');
    expect(ci.build).toMatch(
      /- name: Look up a Lighthouse pass for this commit\n {8}id: lhci-passed\n {8}if: \$\{\{ github\.event_name == 'pull_request' && !contains\(github\.event\.pull_request\.labels\.\*\.name, 'lhci-remeasure'\) \}\}\n {8}uses: actions\/cache\/restore@[0-9a-f]{40} # v[\d.]+\n {8}with:\n/,
    );
    // How to force a measurement of a commit that already passed, and the accepted forgery risk.
    const lookupComment = ci.build!.split('- name: Look up a Lighthouse pass')[0]!.replace(/\n {6}# /g, ' ');
    expect(lookupComment).toContain('The `lhci-remeasure` label skips the lookup');
    expect(lookupComment).toContain('gh cache delete lhci-passed-<sha>');
    expect(lookupComment).toContain('Never on a push to main, which always measures');
    expect(lookupComment).toContain('a forged marker cannot reach a deploy');
    expect(ci.build).toContain(`${marker}          lookup-only: true\n`);
    // The marker is saved by lhci only after its assertions and the report upload passed.
    const list = ci.lhci!.split('\n      - ');
    const run = list.findIndex((step) => step.startsWith('run: npm run lhci'));
    const save = list.findIndex((step) => /\n {8}uses: actions\/cache\/save@[0-9a-f]{40} /.test(step) && step.includes('.lhci-passed'));
    expect(run).toBeGreaterThan(-1);
    expect(save).toBeGreaterThan(run);
    for (const step of list.slice(save - 1, save + 1)) {
      expect(step).toContain("if: ${{ success() && github.event_name == 'pull_request' }}");
    }
    expect(list[save]).toContain(marker);
    // In lhci only the node_modules restore is lookup-only (on a push); nothing uses restore-keys.
    expect(code(ci.lhci!).match(/lookup-only/g)).toHaveLength(1);
    expect(code(CI)).not.toMatch(/restore-keys/);
  });

  it('turns the Lighthouse outcome into one gate result', () => {
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
    const body = script(step);
    const SHA = '0123456789abcdef0123456789abcdef01234567';
    const run = (env: Record<string, string>, marker?: string) => {
      const dir = mkdtempSync(join(tmpdir(), 'lhci-gate-'));
      if (marker !== undefined) writeFileSync(join(dir, '.lhci-passed'), `${marker}\n`);
      const r = spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', '-c', body], {
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

  it('says where the jobs run, how e2e is sharded, and why a skipped lhci is no pass', () => {
    const header = CI.slice(0, CI.indexOf('\njobs:\n')).replace(/\n# /g, ' ');
    expect(header).toContain("Every job runs on GitHub's hosted runner (`runs-on: ubuntu-24.04`), the layout for a public repository");
    expect(header).toContain('In a private repository the same layout spends the account\'s hosted minutes.');
    expect(header).toContain('The end-to-end suite runs in 4 parallel shards');
    expect(header).toContain('The "End-to-end tests" job, the required check, merges their blob reports into the one JSON report deploy.yml reads');
    expect(header).toContain('budgets were calibrated');
    expect(header).toMatch(/scripts\/lhci-calibrated\.sh and scripts\/lhci-benchmark-guard\.ts are not used by CI; they stay for local calibration runs/);
    expect(header).toContain('not while the `update-baselines` label is on or on a pull request commit that already passed it');
    expect(header).toContain('the visual baselines are uploaded only while the `update-baselines` label is on.');
    expect(header).toContain('The "Lighthouse gate" job turns each outcome into one result');
    expect(header).toContain('a skipped lhci is never read as a pass');
    expect(header).toContain('The truth audit\'s deny-list secret is never printed, and its absence fails closed in this repository');
  });
});

describe('the sharded end-to-end suite', () => {
  const shard = ci['e2e-shard']!;
  const merge = ci.e2e!;

  it('runs four shards in parallel, none cancelling another', () => {
    expect(shard).toContain(`    strategy:\n      fail-fast: false\n      matrix:\n        shard: [${Array.from({ length: SHARDS }, (_, i) => i + 1).join(', ')}]\n`);
    expect(key(shard, 'timeout-minutes')).toBe('30');
    expect(key(shard, 'needs')).toBeUndefined();
  });

  it('runs each shard in the pinned Playwright container, with shared memory and no caps', () => {
    expect(shard).toContain(`      image: ${PLAYWRIGHT_IMAGE}\n`);
    expect(shard).toMatch(/\n {4}container:\n(?: {6}#.*\n)* {6}image: /);
    // Every image in the workflow (the container and the Redis service) is pinned by digest, and the
    // local Docker run uses the same Playwright tag.
    const images = [...CI.matchAll(/^ +image: (\S+)$/gm)].map((m) => m[1]!);
    expect(images).toHaveLength(2);
    for (const image of images) expect(image, image).toMatch(/^[\w./-]+:[\w.-]+@sha256:[0-9a-f]{64}$/);
    expect(readFileSync(join(ROOT, 'scripts/e2e-docker.sh'), 'utf8')).toContain(`IMAGE="${PLAYWRIGHT_IMAGE.split('@')[0]}"`);
    expect(shard).toMatch(/^ {6}options: --ipc=host$/m);
    expect(shard).not.toMatch(/--cpus|--memory/);
    // The image matches the installed Playwright (package-lock pins it), so the browsers fit.
    expect(PLAYWRIGHT_IMAGE).toContain(`v${JSON.parse(readFileSync(join(ROOT, 'node_modules/@playwright/test/package.json'), 'utf8')).version}-`);
    // Only the shards run in a job container.
    expect(Object.entries(ci).filter(([, job]) => /^ {4}container:/m.test(job)).map(([id]) => id)).toEqual(['e2e-shard']);
  });

  it('runs its share of the suite with two workers, a blob report and no traces', () => {
    expect(shard).toContain(
      `      - run: npm run test:e2e -- --shard=\${{ matrix.shard }}/${SHARDS} --workers=2 --reporter=list,blob --trace=off\n        env:\n          HOME: /root\n`,
    );
    // The config itself is unchanged: locally the JSON report still goes to reports/e2e.json.
    expect(PLAYWRIGHT_CONFIG).toContain("reporter: [['list'], ['json', { outputFile: 'reports/e2e.json' }]],");
    const list = steps(shard);
    const mark = list.findIndex((s) => s.startsWith('name: Mark the start of the tests'));
    const tests = list.findIndex((s) => s.startsWith('run: npm run test:e2e'));
    expect(mark).toBeGreaterThan(list.findIndex((s) => s.startsWith('run: npm ci')));
    expect(tests).toBe(mark + 1);
    expect(list[mark]).toContain('run: touch "$RUNNER_TEMP/e2e-start"');
  });

  it('hands each shard\'s regenerated baselines, and only those, to the merge job', () => {
    const collect = steps(shard).find((s) => s.startsWith('name: Collect the regenerated baselines'))!;
    expect(collect).toContain("if: ${{ !cancelled() && env.UPDATE_BASELINES == '1' }}");
    const body = script(collect);
    // Run the step's script: only files written after the marker are copied, at their paths.
    const dir = mkdtempSync(join(tmpdir(), 'e2e-baselines-'));
    try {
      const shots = join(dir, 'tests/e2e/__screenshots__');
      for (const d of [join(shots, 'desktop-chromium'), join(shots, 'mobile-chromium'), join(dir, 'tmp')]) mkdirSync(d, { recursive: true });
      // A committed baseline (checked out before the marker) and one the shard wrote after it.
      writeFileSync(join(shots, 'desktop-chromium/old.png'), 'committed');
      utimesSync(join(shots, 'desktop-chromium/old.png'), new Date('2026-01-01T00:00:00Z'), new Date('2026-01-01T00:00:00Z'));
      writeFileSync(join(dir, 'tmp/e2e-start'), '');
      utimesSync(join(dir, 'tmp/e2e-start'), new Date('2026-01-01T00:01:00Z'), new Date('2026-01-01T00:01:00Z'));
      writeFileSync(join(shots, 'mobile-chromium/new.png'), 'regenerated');
      // GNU cp's --parents and -t, as in the Playwright image; BSD cp lacks them, so stand in for it.
      const bin = join(dir, 'bin');
      mkdirSync(bin);
      writeFileSync(join(bin, 'cp'), '#!/usr/bin/env bash\n# cp --parents -t <dir> <files...>\nshift; shift; dest=$1; shift\nfor f in "$@"; do mkdir -p "$dest/$(dirname "$f")"; /bin/cp "$f" "$dest/$f"; done\n');
      chmodSync(join(bin, 'cp'), 0o755);
      const r = spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', '-c', body], {
        cwd: dir,
        encoding: 'utf8',
        env: { PATH: `${bin}:${process.env.PATH}`, RUNNER_TEMP: join(dir, 'tmp') } as Record<string, string | undefined> as NodeJS.ProcessEnv,
      });
      expect(r.status, r.stderr).toBe(0);
      expect(r.stdout).toContain('Regenerated baselines in this shard: 1');
      expect(readFileSync(join(dir, 'baselines-changed/mobile-chromium/new.png'), 'utf8')).toBe('regenerated');
      expect(existsSync(join(dir, 'baselines-changed/desktop-chromium/old.png'))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    // The real step uses GNU cp's --parents, relative to the screenshots folder.
    expect(body).toContain('find . -type f -newer "$RUNNER_TEMP/e2e-start" -exec cp --parents -t ../../../baselines-changed {} +');
  });

  it('merges the shards in the "End-to-end tests" job, which fails unless every shard passed', () => {
    expect(key(merge, 'needs')).toBe('e2e-shard');
    // It always runs (a skipped required check would read as a pass) and has no container.
    expect(key(merge, 'if')).toBe('${{ always() }}');
    expect(key(merge, 'timeout-minutes')).toBe('10');
    expect(merge).not.toMatch(/^ {4}(?:container|strategy):/m);
    const list = steps(merge);
    const at = (re: RegExp) => list.findIndex((s) => re.test(s));
    const download = at(/^name: Download the shards' blob reports\n/);
    const mergeStep = at(/^name: Merge the reports\n/);
    const upload = at(/^name: Upload e2e report\n/);
    const overlay = at(/^name: Lay the shards' baselines over the committed ones\n/);
    const baselines = at(/^name: Upload visual baselines\n/);
    const verdict = at(/^name: Every shard passed\n/);
    expect([download, mergeStep, upload, overlay, baselines, verdict]).toEqual([download, download + 1, download + 2, download + 3, download + 4, download + 5]);
    expect(verdict).toBe(list.length - 1);
    expect(list[download]).toContain('          pattern: blob-report-*\n          path: all-blob-reports\n          merge-multiple: true');
    // The merged JSON goes where the config's JSON reporter writes and build-meta reads.
    expect(list[mergeStep]).toContain('          PLAYWRIGHT_JSON_OUTPUT_FILE: reports/e2e.json\n');
    expect(list[mergeStep]).toContain('        run: npx --no-install playwright merge-reports --reporter=json all-blob-reports');
    // Merging and uploading run after a test failure too (merge-reports exits 1 then), never in a
    // cancelled run.
    for (const i of [download, mergeStep, upload]) expect(list[i]).toContain('if: ${{ !cancelled() }}');
    // The baselines: the committed folder with the shards' regenerated files laid over it.
    expect(list[overlay]).toContain("if: ${{ !cancelled() && env.UPDATE_BASELINES == '1' }}");
    expect(list[overlay]).toContain('          pattern: visual-baselines-shard-*\n          path: tests/e2e/__screenshots__\n          merge-multiple: true');
    expect(list[overlay]).toMatch(/uses: actions\/download-artifact@[0-9a-f]{40} # v[\d.]+/);
    // The verdict, with its script run in each case.
    expect(list[verdict]).toContain('if: ${{ always() }}');
    expect(list[verdict]).toContain('          SHARDS: ${{ needs.e2e-shard.result }}\n');
    const body = script(list[verdict]!);
    const run = (result: string) => spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', '-c', body], {
      encoding: 'utf8',
      env: { PATH: process.env.PATH, SHARDS: result } as Record<string, string | undefined> as NodeJS.ProcessEnv,
    }).status;
    expect(run('success')).toBe(0);
    for (const result of ['failure', 'cancelled', 'skipped', '']) expect(run(result), result).toBe(1);
  });

  it('keeps blob reports and traces out of the uploaded e2e report', () => {
    // The shards record no trace (traces hold request headers); only reports/e2e.json is the report.
    expect(code(CI)).not.toMatch(/test-results|playwright-report/);
    expect(code(CI).match(/--trace=off/g)).toHaveLength(1);
  });
});

describe('the hosted-runner settings', () => {
  it('publishes the Redis service port on loopback only', () => {
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

  it('gives each job a limit for the hosted runner', () => {
    const limits = Object.fromEntries(Object.entries(ci).map(([id, job]) => [id, key(job, 'timeout-minutes')]));
    expect(limits).toEqual({
      static: '15',
      'stats-ref': '15',
      'sources-remote': '10',
      build: '15',
      'e2e-shard': '30',
      e2e: '10',
      lhci: LHCI_TIMEOUT,
      links: '10',
      'cv-pdf': '5',
      'build-isolation': '15',
      'lhci-gate': '5',
    });
  });

  it('gives Vitest a 60 s test timeout in its config, not a CI-only flag', () => {
    expect(ci.static).toContain('      - run: npm run test:cov\n');
    expect(CI).not.toContain('--testTimeout');
    expect(VITEST_CONFIG).toMatch(/^ {4}testTimeout: 60_000,$/m);
  });

  it('starts the link-check site on the runner, on port 3123', () => {
    expect(ci.links).toContain('nohup npx next start -p 3123');
    expect(ci.links).toContain('http://localhost:3123/');
  });
});

describe('the trust boundary of a public repository', () => {
  it('has no trigger that runs with secrets on code from outside the repository', () => {
    const triggers = code(CI.slice(0, CI.indexOf('\njobs:\n')));
    for (const t of ['pull_request_target', 'workflow_run', 'issue_comment', 'workflow_dispatch', 'repository_dispatch']) {
      expect(triggers, t).not.toContain(t);
    }
    expect(Object.keys(ciTriggers())).toEqual(['pull_request', 'push']);
    // No workflow anywhere uses pull_request_target.
    for (const text of [CI, DEPLOY]) expect(code(text)).not.toContain('pull_request_target');
  });

  it('grants the token read access to the contents only, once, at the top', () => {
    expect(CI.match(/^\s*permissions:/gm)).toHaveLength(1);
    expect(CI).toMatch(/^permissions:\n {2}contents: read\n\n/m);
    // The deploy adds only what downloading another run's artifacts needs.
    expect(DEPLOY.match(/^\s*permissions:/gm)).toHaveLength(1);
    expect(code(DEPLOY)).toMatch(/^permissions:\n {2}contents: read\n {2}actions: read\n\n/m);
  });

  it('cancels only a superseded run of the same event and ref, and never a deploy', () => {
    // The event is in the key, so a pull request run and a push run on main never share a group.
    expect(CI).toContain('concurrency:\n  group: ci-${{ github.workflow }}-${{ github.event_name }}-${{ github.ref }}\n  cancel-in-progress: true\n');
    expect(DEPLOY).toContain('concurrency:\n  group: deploy\n  cancel-in-progress: false\n');
  });

  it('deploys only a green push run on main from this repository', () => {
    expect(DEPLOY).toContain('on:\n  workflow_run:\n    workflows: [CI]\n    types: [completed]\n    branches: [main]\n');
    expect(DEPLOY).toContain(
      "    if: >-\n      ${{ github.event.workflow_run.conclusion == 'success'\n      && github.event.workflow_run.event == 'push'\n      && github.event.workflow_run.head_repository.full_name == github.repository }}\n",
    );
  });

  it('hands the jobs no secret but TRUTH_DENYLIST', () => {
    expect(new Set([...CI.matchAll(/secrets\.(\w+)/g)].map((m) => m[1]))).toEqual(new Set(['TRUTH_DENYLIST']));
    expect(ci.build).toContain('TRUTH_DENYLIST: ${{ secrets.TRUTH_DENYLIST }}');
    // lhci measures a local `next start` and gets no secret at all; neither do the e2e jobs.
    for (const id of ['lhci', 'e2e-shard', 'e2e']) expect(ci[id], id).not.toMatch(/secrets\.|LHCI_EXTRA_HEADERS:/);
  });

  it('never leaves the token in a checkout', () => {
    const checkouts = CI.split('- uses: actions/checkout@').slice(1);
    // Every job checks out the repository except the gate, which reads only the pass marker.
    expect(ci['lhci-gate']).not.toContain('actions/checkout');
    expect(checkouts.length).toBe(Object.keys(ci).length - 1);
    // Inside the step's own `with:` block, whatever other inputs it has.
    for (const c of checkouts) expect(c).toMatch(/^\S+ # v[\d.]+\n {8}with:\n(?: {10}\S.*\n)*? {10}persist-credentials: false\n/);
  });

  it('pins every action in both workflows to a full commit SHA with its version', () => {
    for (const text of [CI, DEPLOY]) {
      const uses = [...text.matchAll(/^\s+(?:- )?uses: (.+)$/gm)].map((m) => m[1]!);
      expect(uses.length).toBeGreaterThan(3);
      for (const ref of uses) expect(ref, ref).toMatch(/^[\w.-]+\/[\w.-]+(?:\/[\w.-]+)?@[0-9a-f]{40} # v\d+(?:\.\d+){0,2}$/);
    }
    // One version per action across both workflows.
    const versions = new Map<string, Set<string>>();
    for (const m of `${CI}\n${DEPLOY}`.matchAll(/uses: ([\w./-]+)@([0-9a-f]{40})/g)) {
      versions.set(m[1]!, (versions.get(m[1]!) ?? new Set()).add(m[2]!));
    }
    for (const [action, shas] of versions) expect(shas.size, action).toBe(1);
  });
});

describe('the truth audit\'s deny-list', () => {
  const step = steps(ci.build!).find((s) => s.startsWith('name: Truth audit\n'))!;
  const DENY = 'deny-list-canary-term';

  /** Runs the step's script with a fake npm that reports what it was given (never the list itself). */
  function audit(env: Record<string, string>, npmStatus = 0) {
    const dir = mkdtempSync(join(tmpdir(), 'truth-audit-'));
    try {
      writeFileSync(
        join(dir, 'npm'),
        `#!/usr/bin/env bash\necho "npm $* list=$([ -n "$TRUTH_DENYLIST" ] && echo set || echo empty) ci=$CI"\nexit ${npmStatus}\n`,
      );
      chmodSync(join(dir, 'npm'), 0o755);
      const r = spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', '-c', script(step)], {
        encoding: 'utf8',
        env: { PATH: `${dir}:${process.env.PATH}`, CI: 'true', TRUTH_DENYLIST: '', FORK_PR: 'false', ...env } as Record<string, string | undefined> as NodeJS.ProcessEnv,
      });
      return { status: r.status, out: `${r.stdout}${r.stderr}` };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  it('gives the step the secret and whether the pull request comes from a fork', () => {
    expect(step).toContain('          TRUTH_DENYLIST: ${{ secrets.TRUTH_DENYLIST }}\n');
    expect(step).toContain(
      "          FORK_PR: ${{ github.event_name == 'pull_request' && github.event.pull_request.head.repo.full_name != github.repository }}\n",
    );
    expect(step).not.toMatch(/continue-on-error|^ {8}if:/m);
    // Nothing in the step prints the variable or traces the shell.
    expect(script(step)).not.toMatch(/echo[^\n]*\$\{?TRUTH_DENYLIST|set -x|printenv/);
  });

  it('runs the full audit with the deny-list in this repository', () => {
    const r = audit({ TRUTH_DENYLIST: `${DENY}\nsecond` });
    expect(r.status).toBe(0);
    expect(r.out).toContain('npm run truth:audit list=set ci=true');
    expect(r.out).not.toContain(DENY);
    // The audit's own failure fails the step.
    expect(audit({ TRUTH_DENYLIST: DENY }, 1).status).toBe(1);
  });

  it('fails closed in this repository when the secret is missing or blank, before the audit runs', () => {
    for (const value of ['', '  \n\t\n']) {
      const r = audit({ TRUTH_DENYLIST: value });
      expect(r.status).toBe(1);
      expect(r.out).toContain('::error title=Truth audit::TRUTH_DENYLIST is missing or empty in this repository; failing closed.');
      expect(r.out).not.toContain('npm run');
    }
  });

  it('skips only the deny-list, with a notice, on a pull request from a fork', () => {
    const r = audit({ FORK_PR: 'true' });
    expect(r.status).toBe(0);
    expect(r.out).toMatch(/^::notice title=Truth audit::Pull request from a fork: the TRUTH_DENYLIST secret is not available to it, so the deny-list check is skipped\./m);
    // The rest of the audit still runs, without the list and outside CI mode (so it skips, not fails).
    expect(r.out).toContain('npm run truth:audit list=empty ci=false');
    // Even if a value were present, a fork's run never hands it on.
    const leaked = audit({ FORK_PR: 'true', TRUTH_DENYLIST: DENY });
    expect(leaked.out).toContain('list=empty');
    expect(leaked.out).not.toContain(DENY);
    // The rest of the audit can still fail a fork's pull request.
    expect(audit({ FORK_PR: 'true' }, 1).status).toBe(1);
  });

  it('lets the audit itself skip the deny-list only outside CI mode', () => {
    const src = readFileSync(join(ROOT, 'scripts/truth-audit.ts'), 'utf8');
    expect(src).toContain("if (process.env.CI === 'true') {\n      console.error('TRUTH_DENYLIST missing in CI');\n      return 1;");
  });
});
