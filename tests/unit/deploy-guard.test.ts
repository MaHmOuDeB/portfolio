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

/** Runs the guard as GitHub's default bash shell does (`bash --noprofile --norc -eo pipefail`). */
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

  it('reads the launch setting the way the other steps do, LAUNCH_SHA and the tested commit, and no secret', () => {
    const step = guardStep();
    expect(step).toContain("LAUNCHED: ${{ vars.LAUNCHED == 'true' }}");
    expect(step).toContain('LAUNCH_SHA: ${{ vars.LAUNCH_SHA }}');
    expect(step).toContain('HEAD_SHA: ${{ github.event.workflow_run.head_sha }}');
    expect(step).not.toContain('secrets.');
    // The Pull, Build, Deploy and Job summary steps still choose production from the same expression.
    expect(DEPLOY.match(/LAUNCHED: \$\{\{ vars\.LAUNCHED == 'true' \}\}/g)).toHaveLength(5);
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
    for (const bad of [HEAD.slice(0, 7), HEAD.toUpperCase(), ` ${HEAD}`, `${HEAD}\n`, `${HEAD}0`]) {
      const r = guard({ LAUNCHED: 'true', LAUNCH_SHA: bad, HEAD_SHA: HEAD });
      expect(r.status, JSON.stringify(bad)).toBe(1);
      expect(r.out).toContain('Decision: refused, LAUNCH_SHA is not a full commit SHA\n');
    }
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
