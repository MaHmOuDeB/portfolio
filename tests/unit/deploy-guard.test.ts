import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// After launch, a CI run that was queued or in flight when LAUNCHED became "true", or a re-run of
// an older run, must not deploy production. The deploy job's first step compares the commit the CI
// run tested (workflow_run.head_sha) with the repository variable LAUNCH_SHA and fails the job,
// before anything else runs, unless they are equal. The step's own shell is extracted from the
// workflow and run here under each case, so the test runs exactly what GitHub runs.
const ROOT = join(import.meta.dirname, '../..');
const DEPLOY = readFileSync(join(ROOT, '.github/workflows/deploy.yml'), 'utf8');

/** The steps of the deploy job, in order, each with its own text. */
function steps(): string[] {
  const at = DEPLOY.indexOf('\n    steps:\n');
  expect(at).toBeGreaterThan(-1);
  return DEPLOY.slice(at).split(/^(?= {6}- )/m).slice(1);
}

function guardStep(): string {
  const step = steps().find((s) => /^ {6}- name: Guard production SHA$/m.test(s));
  expect(step).toBeDefined();
  return step!;
}

/** The step's `run: |` block, dedented, as GitHub hands it to bash. */
function guardScript(): string {
  const lines = guardStep().split('\n');
  const start = lines.findIndex((l) => l === '        run: |');
  expect(start).toBeGreaterThan(-1);
  const body: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (line.trim() !== '' && !line.startsWith('          ')) break;
    body.push(line.slice(10));
  }
  return `${body.join('\n').trimEnd()}\n`;
}

const HEAD = '0123456789abcdef0123456789abcdef01234567';
const OTHER = 'fedcba9876543210fedcba9876543210fedcba98';

/** Runs the guard as GitHub runs a step with `shell: bash` (`bash --noprofile --norc -eo pipefail {0}`). */
function guard(env: { LAUNCHED: string; LAUNCH_SHA: string; HEAD_SHA: string }) {
  const r = spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', '-c', guardScript()], {
    encoding: 'utf8',
    env: { PATH: process.env.PATH, VERCEL_TOKEN: 'not-in-this-step', ...env } as Record<string, string | undefined> as NodeJS.ProcessEnv,
  });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

describe('the Guard production SHA step', () => {
  it('is the first step of the deploy job, before the checkout and every Vercel step', () => {
    const list = steps();
    expect(list[0]).toMatch(/^ {6}- name: Guard production SHA$/m);
    expect(list.slice(1).some((s) => s.includes('name: Guard production SHA'))).toBe(false);
    expect(list[0]).not.toMatch(/vercel|uses:/);
    const pull = list.findIndex((s) => s.includes('name: Pull Vercel environment'));
    expect(pull).toBeGreaterThan(0);
  });

  it('has exactly name, env, shell: bash and run, so nothing can skip it or let a refusal continue', () => {
    const keys = guardStep()
      .split('\n')
      .map((line) => /^(?: {6}- | {8})([A-Za-z-]+):/.exec(line)?.[1])
      .filter((key): key is string => key !== undefined);
    expect(keys).toEqual(['name', 'env', 'shell', 'run']);
    expect(guardStep()).toMatch(/^ {8}shell: bash$/m);
    expect(guardStep()).not.toMatch(/continue-on-error|^\s*if:|working-directory|timeout-minutes/m);
  });

  it('reads the launch setting the way the other steps do, LAUNCH_SHA and the tested commit, and no secret', () => {
    const step = guardStep();
    expect(step).toContain("LAUNCHED: ${{ vars.LAUNCHED == 'true' }}");
    expect(step).toContain('LAUNCH_SHA: ${{ vars.LAUNCH_SHA }}');
    expect(step).toContain('HEAD_SHA: ${{ github.event.workflow_run.head_sha }}');
    expect(step).not.toContain('secrets.');
    // The Pull, pulled-environment check, Build, canonical origin check, Deploy and Job summary steps
    // still choose production from the same expression.
    expect(DEPLOY.match(/LAUNCHED: \$\{\{ vars\.LAUNCHED == 'true' \}\}/g)).toHaveLength(7);
  });

  it('allows production when LAUNCHED is true and the tested commit is LAUNCH_SHA', () => {
    const r = guard({ LAUNCHED: 'true', LAUNCH_SHA: HEAD, HEAD_SHA: HEAD });
    expect(r.status).toBe(0);
    expect(r.out).toBe(`Tested commit (head_sha): ${HEAD}\nLAUNCH_SHA: ${HEAD}\nDecision: production deploy allowed\n`);
  });

  it('fails when LAUNCHED is true and the tested commit is any other commit', () => {
    const r = guard({ LAUNCHED: 'true', LAUNCH_SHA: HEAD, HEAD_SHA: OTHER });
    expect(r.status).toBe(1);
    expect(r.out).toBe(
      `Tested commit (head_sha): ${OTHER}\nLAUNCH_SHA: ${HEAD}\nDecision: refused, the tested commit is not LAUNCH_SHA\n` +
        '::error::LAUNCHED is true and this run tested a commit other than LAUNCH_SHA; nothing is deployed.\n',
    );
  });

  it('fails when LAUNCHED is true and LAUNCH_SHA is empty', () => {
    const r = guard({ LAUNCHED: 'true', LAUNCH_SHA: '', HEAD_SHA: HEAD });
    expect(r.status).toBe(1);
    expect(r.out).toContain('LAUNCH_SHA: (empty)\n');
    expect(r.out).toContain('Decision: refused, LAUNCH_SHA is not a full commit SHA\n');
  });

  it('fails when LAUNCHED is true and LAUNCH_SHA is not a full lowercase commit SHA', () => {
    for (const bad of [HEAD.slice(0, 7), HEAD.toUpperCase(), ` ${HEAD}`, `${HEAD}\n`, `${HEAD}0`, '(not a full commit SHA)', '(empty)']) {
      const r = guard({ LAUNCHED: 'true', LAUNCH_SHA: bad, HEAD_SHA: HEAD });
      expect(r.status, JSON.stringify(bad)).toBe(1);
      expect(r.out).toContain('Decision: refused, LAUNCH_SHA is not a full commit SHA\n');
    }
  });

  it('decides validity from the value, never from its display text', () => {
    const r = guard({ LAUNCHED: 'true', LAUNCH_SHA: '(not a full commit SHA)', HEAD_SHA: '(not a full commit SHA)' });
    expect(r.status).toBe(1);
    expect(r.out).toContain('Decision: refused, LAUNCH_SHA is not a full commit SHA\n');
    expect(r.out).not.toContain('the tested commit is not LAUNCH_SHA');
  });

  it('leaves previews as they are when LAUNCHED is not true, whatever LAUNCH_SHA holds', () => {
    for (const launchSha of ['', HEAD, OTHER, 'junk']) {
      const r = guard({ LAUNCHED: 'false', LAUNCH_SHA: launchSha, HEAD_SHA: HEAD });
      expect(r.status, launchSha).toBe(0);
      expect(r.out).toContain('Decision: preview deploy, LAUNCHED is not true\n');
    }
  });

  it('prints only the two SHAs and the decision', () => {
    for (const env of [
      { LAUNCHED: 'true', LAUNCH_SHA: HEAD, HEAD_SHA: HEAD },
      { LAUNCHED: 'true', LAUNCH_SHA: HEAD, HEAD_SHA: OTHER },
      { LAUNCHED: 'false', LAUNCH_SHA: '', HEAD_SHA: HEAD },
    ]) {
      const lines = guard(env).out.trimEnd().split('\n');
      expect(lines[0]).toMatch(/^Tested commit \(head_sha\): [0-9a-f]{40}$/);
      expect(lines[1]).toMatch(/^LAUNCH_SHA: (?:[0-9a-f]{40}|\(empty\))$/);
      expect(lines[2]).toMatch(/^Decision: /);
      expect(lines.slice(3).every((l) => l.startsWith('::error::'))).toBe(true);
      expect(lines.join('\n')).not.toContain('not-in-this-step');
    }
  });
});

// The deploy job holds the Vercel token and runs in main's cache scope, which every pull request (a
// fork's included) can restore. npm's debug logs record each command's arguments, so a cached ~/.npm
// with a --token argument in a log would hand the token to anyone who restores it.
describe('the Vercel token stays out of caches, logs and arguments', () => {
  const WRAPPER = readFileSync(join(ROOT, 'scripts/vercel-build-isolated.sh'), 'utf8');
  const job = DEPLOY.slice(DEPLOY.indexOf('\n  deploy:\n'));
  const code = (text: string) => text.replace(/^\s*#.*\n/gm, '');

  it('saves no cache of any kind: setup-node has no cache and its automatic cache is off', () => {
    const setup = steps().filter((s) => s.includes('uses: actions/setup-node@'));
    expect(setup).toHaveLength(1);
    expect(setup[0]).toMatch(/\n {8}with:\n {10}node-version-file: \.nvmrc\n {10}package-manager-cache: false\n/);
    expect(code(DEPLOY)).not.toMatch(/^\s+cache:|cache-dependency-path|actions\/cache/m);
  });

  it('writes no npm debug log', () => {
    const header = job.slice(0, job.indexOf('\n    steps:\n'));
    expect(code(header)).toMatch(/\n {4}env:\n {6}npm_config_logs_max: '0'(?:\n|$)/);
  });

  it('never passes the token as an argument: the CLI reads VERCEL_TOKEN from the environment', () => {
    for (const text of [DEPLOY, WRAPPER]) expect(code(text)).not.toMatch(/--token|-t\s+"?\$VERCEL_TOKEN/);
    // The three Vercel steps still get it, through their own env only.
    expect(DEPLOY.match(/^ {10}VERCEL_TOKEN: \$\{\{ secrets\.VERCEL_TOKEN \}\}$/gm)).toHaveLength(3);
    expect(code(job.slice(0, job.indexOf('\n    steps:\n')))).not.toContain('secrets.');
    // The pinned CLI takes the token from the environment when no --token flag is given.
    const cli = readFileSync(join(ROOT, 'node_modules/vercel/dist/index.js'), 'utf8');
    expect(cli).toContain('process.env.VERCEL_TOKEN&&(explicitToken=process.env.VERCEL_TOKEN,tokenSource="env")');
  });
});
