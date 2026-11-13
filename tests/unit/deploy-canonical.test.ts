import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// A production build takes its canonical origin from the pulled Vercel environment
// (src/lib/seo/metadata.ts): a pull without VERCEL_ENV="production" builds with the test origin, and
// a wrong VERCEL_PROJECT_PRODUCTION_URL puts every canonical and og:url on the wrong host. So on the
// production path only, the deploy checks the pulled file right after the pull, and checks the built
// pages against the repository variable CANONICAL_HOST before the deploy. Previews are unchanged:
// both steps exit 0 without running anything when LAUNCHED is not "true". Each step's own shell is
// extracted from the workflow and run here, so the test runs exactly what GitHub runs.
const ROOT = join(import.meta.dirname, '../..');
const DEPLOY = readFileSync(join(ROOT, '.github/workflows/deploy.yml'), 'utf8');

const PULL = 'Pull Vercel environment';
const PULLED_CHECK = 'Check the pulled production environment';
const BUILD = 'Build';
const KITCHEN_SINK = 'Check the build has no kitchen sink';
const ORIGIN_CHECK = 'Check the canonical origin';
const DEPLOY_STEP = 'Deploy';

/** The steps of the deploy job, in order, each with its own text. */
function steps(): string[] {
  const at = DEPLOY.indexOf('\n    steps:\n');
  expect(at).toBeGreaterThan(-1);
  return DEPLOY.slice(at).split(/^(?= {6}- )/m).slice(1);
}

const nameOf = (step: string) => /^ {6}- name: (.+)$/m.exec(step)?.[1];

function step(name: string): string {
  const found = steps().filter((s) => nameOf(s) === name);
  expect(found, name).toHaveLength(1);
  return found[0]!;
}

/** The step's `run: |` block, dedented, as GitHub hands it to bash. */
function script(name: string): string {
  const lines = step(name).split('\n');
  const start = lines.findIndex((l) => l === '        run: |');
  expect(start, name).toBeGreaterThan(-1);
  const body: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (line.trim() !== '' && !line.startsWith('          ')) break;
    body.push(line.slice(10));
  }
  return `${body.join('\n').trimEnd()}\n`;
}

/** A step's keys at its own level (name, env, run, ...). */
function keys(name: string): string[] {
  return step(name)
    .split('\n')
    .map((line) => /^(?: {6}- | {8})([A-Za-z-]+):/.exec(line)?.[1])
    .filter((key): key is string => key !== undefined);
}

let dir: string;
let calls: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'deploy-canonical-'));
  calls = join(dir, 'calls.log');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

/** A stub on PATH that records its arguments and exits with STUB_STATUS (0 by default). */
function stub(bin: string, name: string) {
  mkdirSync(bin, { recursive: true });
  const file = join(bin, name);
  writeFileSync(file, `#!/bin/bash\nprintf '%s' "${name}" >> "$CALLS"\nprintf ' %s' "$@" >> "$CALLS"\nprintf '\\n' >> "$CALLS"\nexit "\${STUB_STATUS:-0}"\n`);
  chmodSync(file, 0o755);
}

/**
 * Runs a step's script as GitHub runs a `run:` step with no `shell:` on Linux (`bash -e {0}`), in a
 * scratch folder, with stub npm and node (unless realNode) and only the given environment.
 */
function runStep(name: string, env: Record<string, string>, opts: { realNode?: boolean; cwd?: string } = {}) {
  const bin = join(dir, 'bin');
  stub(bin, 'npm');
  if (!opts.realNode) stub(bin, 'node');
  const path = opts.realNode ? `${bin}:${process.env.PATH}` : `${bin}:/usr/bin:/bin`;
  const r = spawnSync('bash', ['--noprofile', '--norc', '-e', '-c', script(name)], {
    cwd: opts.cwd ?? dir,
    encoding: 'utf8',
    env: { PATH: path, CALLS: calls, ...env } as Record<string, string | undefined> as NodeJS.ProcessEnv,
  });
  return { status: r.status, out: `${r.stdout}${r.stderr}`, calls: existsSync(calls) ? readFileSync(calls, 'utf8') : '' };
}

describe('the production canonical-origin checks in the deploy job', () => {
  it('run in order: pull, pulled-environment check, build, kitchen sink, origin check, deploy', () => {
    const names = steps().map(nameOf);
    const at = (n: string) => names.indexOf(n);
    for (const n of [PULL, PULLED_CHECK, BUILD, KITCHEN_SINK, ORIGIN_CHECK, DEPLOY_STEP]) expect(at(n), n).toBeGreaterThan(-1);
    expect(at(PULLED_CHECK)).toBe(at(PULL) + 1);
    expect(at(BUILD)).toBe(at(PULLED_CHECK) + 1);
    expect(at(ORIGIN_CHECK)).toBeGreaterThan(at(BUILD));
    expect(at(DEPLOY_STEP)).toBe(at(ORIGIN_CHECK) + 1);
  });

  it('have exactly name, env and run: nothing can skip them or let a failure continue', () => {
    for (const n of [PULLED_CHECK, ORIGIN_CHECK]) {
      expect(keys(n), n).toEqual(['name', 'env', 'run']);
      expect(step(n)).not.toMatch(/continue-on-error|^\s*if:|working-directory|shell:/m);
    }
  });

  it('read the launch setting the way the other steps do and no secret', () => {
    for (const n of [PULLED_CHECK, ORIGIN_CHECK]) {
      expect(step(n)).toContain("          LAUNCHED: ${{ vars.LAUNCHED == 'true' }}\n");
      expect(step(n)).not.toContain('secrets.');
    }
    expect(step(ORIGIN_CHECK)).toContain('          CANONICAL_HOST: ${{ vars.CANONICAL_HOST }}\n');
    expect(step(PULLED_CHECK)).not.toContain('CANONICAL_HOST: ');
  });

  it('pass every value through env: no expression is interpolated into either script', () => {
    for (const n of [PULLED_CHECK, ORIGIN_CHECK]) expect(script(n)).not.toContain('${{');
  });

  it('only the origin check reads CANONICAL_HOST; the pull, build and deploy do not', () => {
    expect(DEPLOY.match(/vars\.CANONICAL_HOST/g)).toHaveLength(1);
    for (const n of [PULL, BUILD, DEPLOY_STEP]) {
      expect(step(n), n).not.toMatch(/CANONICAL_HOST|pulled-env-check|seo:origin-check/);
    }
  });
});

describe('the preview path is unchanged', () => {
  it('both checks exit 0 and run nothing when LAUNCHED is not "true"', () => {
    for (const n of [PULLED_CHECK, ORIGIN_CHECK]) {
      for (const launched of ['false', '', 'True']) {
        const r = runStep(n, { LAUNCHED: launched, CANONICAL_HOST: '' });
        expect(r.status, `${n} ${launched}`).toBe(0);
        expect(r.calls, `${n} ${launched}`).toBe('');
        expect(r.out).toMatch(/^Preview deploy: .+ not checked\n$/);
      }
    }
  });

  it('the pull, build and deploy still choose the target from LAUNCHED as before', () => {
    expect(script(PULL)).toBe(
      'if [ "$LAUNCHED" = "true" ]; then environment=production; else environment=preview; fi\n' +
        'npx --no-install vercel pull --yes --environment="$environment"\n',
    );
    expect(script(BUILD)).toBe(
      'if [ "$LAUNCHED" = "true" ]; then target=production; else target=preview; fi\n' + 'bash scripts/vercel-build-isolated.sh "$target"\n',
    );
    expect(script(DEPLOY_STEP)).toContain('if [ "$LAUNCHED" != "true" ]; then\n  existing=');
  });
});

describe('the pulled-environment check (production)', () => {
  it('checks the exact file `vercel pull --environment=production` writes', () => {
    const r = runStep(PULLED_CHECK, { LAUNCHED: 'true' });
    expect(r.status).toBe(0);
    expect(r.calls).toBe('node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/pulled-env-check.ts .vercel/.env.production.local\n');
    // CLI 62.2.0's pull writes .vercel/.env.<environment>.local, and its build reads .vercel/.env.<target>.local.
    const cli = readFileSync(join(ROOT, 'node_modules/vercel/dist/commands/build/index.js'), 'utf8');
    expect(cli).toContain('VERCEL_DIR,`.env.${target}.local`)');
  });

  it('fails the step when the check fails', () => {
    const r = runStep(PULLED_CHECK, { LAUNCHED: 'true', STUB_STATUS: '1' });
    expect(r.status).toBe(1);
  });

  it('end to end with the real script: a pull without VERCEL_ENV fails, a good one passes, no value printed', () => {
    const work = join(dir, 'work');
    mkdirSync(join(work, '.vercel'), { recursive: true });
    symlinkSync(join(ROOT, 'scripts'), join(work, 'scripts'));
    symlinkSync(join(ROOT, 'node_modules'), join(work, 'node_modules'));
    const file = join(work, '.vercel/.env.production.local');
    writeFileSync(file, '# Created by Vercel CLI\nVERCEL_PROJECT_PRODUCTION_URL="synthetic.example"\n');
    const bad = runStep(PULLED_CHECK, { LAUNCHED: 'true' }, { realNode: true, cwd: work });
    expect(bad.status).toBe(1);
    expect(bad.out).toContain('VERCEL_ENV: fail');
    expect(bad.out).not.toContain('synthetic.example');
    writeFileSync(file, '# Created by Vercel CLI\nVERCEL_ENV="production"\nVERCEL_PROJECT_PRODUCTION_URL="synthetic.example"\n');
    const good = runStep(PULLED_CHECK, { LAUNCHED: 'true' }, { realNode: true, cwd: work });
    expect(good.status, good.out).toBe(0);
    expect(good.out).not.toContain('synthetic.example');
  });
});

describe('the canonical origin check (production)', () => {
  it('fails with an ::error:: naming CANONICAL_HOST when the variable is empty, before running anything', () => {
    const r = runStep(ORIGIN_CHECK, { LAUNCHED: 'true', CANONICAL_HOST: '' });
    expect(r.status).toBe(1);
    expect(r.calls).toBe('');
    expect(r.out).toMatch(/^::error::LAUNCHED is true but the repository variable CANONICAL_HOST is empty; nothing is deployed\.$/m);
  });

  it('runs the origin check against CANONICAL_HOST, passed as one argument', () => {
    const r = runStep(ORIGIN_CHECK, { LAUNCHED: 'true', CANONICAL_HOST: 'portfolio.example' });
    expect(r.status).toBe(0);
    expect(r.calls).toBe('npm run seo:origin-check -- --canonical portfolio.example\n');
    // A hostile value stays one argument and is never run as shell.
    const hostile = runStep(ORIGIN_CHECK, { LAUNCHED: 'true', CANONICAL_HOST: 'a.example; touch pwned' });
    expect(hostile.calls).toContain('npm run seo:origin-check -- --canonical a.example; touch pwned\n');
    expect(existsSync(join(dir, 'pwned'))).toBe(false);
  });

  it('fails the step when the origin check fails', () => {
    const r = runStep(ORIGIN_CHECK, { LAUNCHED: 'true', CANONICAL_HOST: 'portfolio.example', STUB_STATUS: '1' });
    expect(r.status).toBe(1);
  });

  it('the npm script it runs exists', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
    expect(pkg.scripts['seo:origin-check']).toMatch(/scripts\/seo-origin-check\.ts$/);
  });
});
