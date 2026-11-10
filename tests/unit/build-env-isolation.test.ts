import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkCanary, keysOf, main, withoutWriteToken } from '../../scripts/build-env-isolation.ts';

// The deploy builds with `vercel build`, which loads the environment `vercel pull` wrote to
// .vercel/.env.<target>.local into every process of the build. The build must never hold the
// store's write token: only the read-only token. The wrapper removes the write token from the
// build's copy of the pulled file and from the build's environment, runs the build with a canary
// preloaded into every Node process, restores the pulled file afterwards, and fails unless the
// canary saw the Next build without the write token and with the read-only token exactly as pulled.
const ROOT = join(import.meta.dirname, '../..');
const WRAPPER = join(ROOT, 'scripts/vercel-build-isolated.sh');
const CANARY = join(ROOT, 'scripts/build-env-canary.cjs');
const ISOLATION = join(ROOT, 'scripts/build-env-isolation.ts');
const CI = readFileSync(join(ROOT, '.github/workflows/ci.yml'), 'utf8');
const DEPLOY = readFileSync(join(ROOT, '.github/workflows/deploy.yml'), 'utf8');

// Synthetic values, never real secrets; the tests check that none of them is ever printed.
const WRITE = 'synthetic-write-value';
const READ = 'synthetic-read-value';
const PULLED = [
  '# Created by Vercel CLI',
  'VERCEL_ENV="production"',
  `KV_REST_API_URL="https://store.invalid"`,
  `KV_REST_API_TOKEN="${WRITE}"`,
  `KV_REST_API_READ_ONLY_TOKEN="${READ}"`,
  'OTHER="kept"',
  '',
].join('\n');

/** The jobs of a workflow, by id, each with its own text. */
function jobs(yaml: string): Map<string, string> {
  const at = yaml.indexOf('\njobs:\n');
  const parts = yaml.slice(at + '\njobs:\n'.length).split(/^(?= {2}[a-z][a-z0-9-]*:\s*$)/m);
  return new Map(parts.map((part) => [/^ {2}([a-z][a-z0-9-]*):/.exec(part)![1]!, part]));
}

/** The steps of one job, in order, each with its own text. */
function steps(job: string): string[] {
  const at = job.indexOf('\n    steps:\n');
  return job.slice(at).split(/^(?= {6}- )/m).slice(1);
}

describe('reading the pulled env file the way the Vercel CLI does', () => {
  it('finds each key of a line-based dotenv file', () => {
    expect([...keysOf(PULLED)].sort()).toEqual(
      ['KV_REST_API_READ_ONLY_TOKEN', 'KV_REST_API_TOKEN', 'KV_REST_API_URL', 'OTHER', 'VERCEL_ENV'],
    );
  });

  it('removes every line that sets the write token, and nothing else', () => {
    const text = [
      'A="1"',
      'KV_REST_API_TOKEN="x"',
      '  KV_REST_API_TOKEN = "y"',
      'export KV_REST_API_TOKEN="z"',
      'KV_REST_API_TOKEN_OTHER="kept"',
      'KV_REST_API_READ_ONLY_TOKEN="r"',
      '',
    ].join('\n');
    const out = withoutWriteToken(text);
    expect(out).toBe(['A="1"', 'KV_REST_API_TOKEN_OTHER="kept"', 'KV_REST_API_READ_ONLY_TOKEN="r"', ''].join('\n'));
    expect(keysOf(out).has('KV_REST_API_TOKEN')).toBe(false);
    expect(keysOf(out).has('KV_REST_API_READ_ONLY_TOKEN')).toBe(true);
  });

  it('keeps CRLF files intact apart from the removed line', () => {
    expect(withoutWriteToken('A="1"\r\nKV_REST_API_TOKEN="x"\r\nB="2"\r\n')).toBe('A="1"\r\nB="2"\r\n');
  });
});

describe('checking the canary records', () => {
  const rec = (r: Partial<{ at: string; nextBuild: boolean; write: boolean; read: boolean }>) =>
    JSON.stringify({ at: 'start', nextBuild: false, write: false, read: false, ...r });
  const good = (read: boolean) =>
    [rec({}), rec({ nextBuild: true, read }), rec({ nextBuild: true, read, at: 'exit' }), rec({ read })].join('\n');

  it('passes when no process held the write token and Next had the read-only token as pulled', () => {
    expect(checkCanary(good(true), true)).toEqual({ ok: true, processes: 4, failures: [] });
    expect(checkCanary(good(false), false).ok).toBe(true);
  });

  it('fails when any process held the write token', () => {
    const r = checkCanary(`${good(true)}\n${rec({ write: true })}`, true);
    expect(r.ok).toBe(false);
    expect(r.failures).toContain('KV_REST_API_TOKEN reached 1 of 5 build process records');
  });

  it('fails when the write token appeared in Next after it started (an env file it loaded)', () => {
    const r = checkCanary([rec({ nextBuild: true, read: true }), rec({ nextBuild: true, read: true, write: true, at: 'exit' })].join('\n'), true);
    expect(r.ok).toBe(false);
  });

  it('fails when the read-only token was lost or appeared', () => {
    expect(checkCanary(good(false), true).failures).toContain('KV_REST_API_READ_ONLY_TOKEN was pulled but missing in the Next build');
    expect(checkCanary(good(true), false).failures).toContain('KV_REST_API_READ_ONLY_TOKEN was not pulled but present in the Next build');
  });

  it('fails when the canary never saw the Next build start and exit', () => {
    expect(checkCanary('', false).failures).toContain('the canary saw no Next build');
    expect(checkCanary(rec({ nextBuild: true }), false).failures).toContain('the canary saw no Next build exit');
  });

  it('fails on a malformed record', () => {
    expect(checkCanary(`${good(true)}\nnot json`, true).failures).toContain('malformed canary record on line 5');
    expect(checkCanary(`${good(true)}\n{"at":"start","nextBuild":false,"write":"no","read":false}`, true).ok).toBe(false);
  });
});

describe('the build-env CLI', () => {
  let dir: string;
  let out: string[];
  const run = (...argv: string[]) => main(argv, { out: (l) => out.push(l) });

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'build-env-'));
    out = [];
    mkdirSync(join(dir, '.vercel'));
    writeFileSync(join(dir, '.vercel/.env.production.local'), PULLED);
    mkdirSync(join(dir, 'work'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const envFile = () => join(dir, '.vercel/.env.production.local');
  const work = () => join(dir, 'work');

  it('sanitizes the pulled file, keeps the original privately, and restores it byte for byte', () => {
    expect(run('sanitize', envFile(), work())).toBe(0);
    const sanitized = readFileSync(envFile(), 'utf8');
    expect(keysOf(sanitized).has('KV_REST_API_TOKEN')).toBe(false);
    expect(sanitized).toContain(`KV_REST_API_READ_ONLY_TOKEN="${READ}"`);
    expect(statSync(envFile()).mode & 0o777).toBe(0o600);
    expect(out).toEqual([
      'build-env: KV_REST_API_TOKEN removed from the build copy of .env.production.local',
      'build-env: KV_REST_API_READ_ONLY_TOKEN kept (present in the pulled file)',
    ]);
    expect(run('restore', envFile(), work())).toBe(0);
    expect(readFileSync(envFile(), 'utf8')).toBe(PULLED);
    expect(out.at(-1)).toBe('build-env: .env.production.local restored byte for byte');
    for (const line of out) expect(line).not.toMatch(new RegExp(`${WRITE}|${READ}`));
  });

  it('fails closed when the pulled file is missing', () => {
    rmSync(envFile());
    expect(run('sanitize', envFile(), work())).toBe(1);
    expect(out.at(-1)).toMatch(/^build-env: FAIL .*\.env\.production\.local is missing/);
  });

  it('refuses to restore when the build rewrote the pulled file', () => {
    expect(run('sanitize', envFile(), work())).toBe(0);
    writeFileSync(envFile(), PULLED);
    expect(run('restore', envFile(), work())).toBe(1);
    expect(out.at(-1)).toBe('build-env: FAIL .env.production.local changed during the build (was it pulled again?)');
  });

  it('verifies the canary and the restored file', () => {
    expect(run('sanitize', envFile(), work())).toBe(0);
    writeFileSync(
      join(work(), 'canary.jsonl'),
      [
        { at: 'start', nextBuild: false, write: false, read: true },
        { at: 'start', nextBuild: true, write: false, read: true },
        { at: 'exit', nextBuild: true, write: false, read: true },
      ].map((r) => JSON.stringify(r)).join('\n') + '\n',
    );
    expect(run('restore', envFile(), work())).toBe(0);
    out = [];
    expect(run('verify', envFile(), work())).toBe(0);
    expect(out).toEqual([
      'build-env: KV_REST_API_TOKEN absent in all 3 build process records, the Next build included',
      'build-env: KV_REST_API_READ_ONLY_TOKEN present in the Next build, as pulled',
      'build-env: KV_REST_API_TOKEN present in the restored file for the deployment, as pulled',
    ]);
  });

  it('fails verify before the pulled file is restored', () => {
    expect(run('sanitize', envFile(), work())).toBe(0);
    writeFileSync(join(work(), 'canary.jsonl'), '');
    expect(run('verify', envFile(), work())).toBe(1);
  });

  it('fails on wrong usage', () => {
    expect(run('bogus', envFile(), work())).toBe(2);
    expect(run('sanitize')).toBe(2);
  });
});

describe('the canary preloaded into every Node process', () => {
  it('records booleans only: never a value, never the command line', () => {
    const dir = mkdtempSync(join(tmpdir(), 'build-env-canary-'));
    try {
      const out = join(dir, 'canary.jsonl');
      const r = spawnSync(process.execPath, ['--require', CANARY, '-e', 'process.exitCode = 0', '--', `--token=${WRITE}`], {
        encoding: 'utf8',
        env: { PATH: process.env.PATH, BUILD_ENV_CANARY_OUT: out, KV_REST_API_TOKEN: WRITE, KV_REST_API_READ_ONLY_TOKEN: READ } as Record<string, string | undefined> as NodeJS.ProcessEnv,
      });
      expect(r.status).toBe(0);
      const text = readFileSync(out, 'utf8');
      expect(text.trim().split('\n').map((l) => JSON.parse(l))).toEqual([
        { at: 'start', nextBuild: false, write: true, read: true },
        { at: 'exit', nextBuild: false, write: true, read: true },
      ]);
      expect(text).not.toContain(WRITE);
      expect(text).not.toContain(READ);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('recognises the Next build process by its entry point', () => {
    const dir = mkdtempSync(join(tmpdir(), 'build-env-canary-'));
    try {
      mkdirSync(join(dir, 'node_modules/.bin'), { recursive: true });
      writeFileSync(join(dir, 'next.js'), '');
      symlinkSync(join(dir, 'next.js'), join(dir, 'node_modules/.bin/next'));
      const out = join(dir, 'canary.jsonl');
      const env = { PATH: process.env.PATH, BUILD_ENV_CANARY_OUT: out } as Record<string, string | undefined> as NodeJS.ProcessEnv;
      spawnSync(process.execPath, ['--require', CANARY, join(dir, 'node_modules/.bin/next'), 'build'], { env });
      spawnSync(process.execPath, ['--require', CANARY, join(dir, 'node_modules/.bin/next'), 'dev'], { env });
      const records = readFileSync(out, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
      expect(records.map((r) => r.nextBuild)).toEqual([true, true, false, false]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does nothing without BUILD_ENV_CANARY_OUT', () => {
    const r = spawnSync(process.execPath, ['--require', CANARY, '-e', 'console.log("ok")'], { encoding: 'utf8' });
    expect(r.stdout).toBe('ok\n');
    expect(r.stderr).toBe('');
  });
});

describe('the build wrapper, with a stand-in for the Vercel CLI', () => {
  // A fake `npx` that behaves like `npx --no-install vercel build`: it loads the pulled env file
  // without overriding variables already set (as the CLI's dotenv does) and runs a fake `next build`
  // as a child, with any extra variables of FAKE_BUILD_ENV, then optionally rewrites the env file.
  function setup(fake: { extraEnv?: string; rewrite?: boolean } = {}) {
    const dir = mkdtempSync(join(tmpdir(), 'build-env-wrapper-'));
    mkdirSync(join(dir, 'bin'));
    mkdirSync(join(dir, 'node_modules/.bin'), { recursive: true });
    mkdirSync(join(dir, '.vercel'));
    mkdirSync(join(dir, 'scripts'));
    for (const f of ['build-env-canary.cjs', 'build-env-isolation.ts', 'vercel-build-isolated.sh']) {
      writeFileSync(join(dir, 'scripts', f), readFileSync(join(ROOT, 'scripts', f)));
    }
    writeFileSync(join(dir, '.vercel/.env.production.local'), PULLED);
    writeFileSync(join(dir, 'node_modules/.bin/next'), 'process.exitCode = 0;\n');
    writeFileSync(
      join(dir, 'fake-vercel.cjs'),
      `const fs = require('node:fs'); const { spawnSync } = require('node:child_process');
       const args = process.argv.slice(2);
       fs.writeFileSync('args.json', JSON.stringify(args));
       const target = args.includes('--prod') ? 'production' : 'preview';
       const file = '.vercel/.env.' + target + '.local';
       for (const line of fs.readFileSync(file, 'utf8').split(/\\r?\\n/)) {
         const m = /^\\s*([\\w.-]+)\\s*=\\s*"?(.*?)"?\\s*$/.exec(line);
         if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
       }
       const env = { ...process.env, ...JSON.parse(process.env.FAKE_BUILD_ENV || '{}') };
       const r = spawnSync(process.execPath, ['node_modules/.bin/next', 'build'], { env, stdio: 'inherit' });
       if (process.env.FAKE_REWRITE === '1') fs.writeFileSync(file, ${JSON.stringify(PULLED)});
       process.exit(r.status ?? 1);`,
    );
    writeFileSync(join(dir, 'bin/npx'), `#!/usr/bin/env bash\n[ "$1 $2 $3" = "--no-install vercel build" ] || exit 64\nshift 3\nexec node ${JSON.stringify(join(dir, 'fake-vercel.cjs'))} "$@"\n`);
    chmodSync(join(dir, 'bin/npx'), 0o755);
    const env = {
      PATH: `${join(dir, 'bin')}:${process.env.PATH}`,
      RUNNER_TEMP: dir,
      FAKE_BUILD_ENV: fake.extraEnv ?? '{}',
      FAKE_REWRITE: fake.rewrite ? '1' : '0',
    };
    return { dir, env };
  }

  function build(target: string, s: ReturnType<typeof setup>, extra: Record<string, string> = {}) {
    return spawnSync('bash', [join(s.dir, 'scripts/vercel-build-isolated.sh'), target], {
      cwd: s.dir,
      encoding: 'utf8',
      env: { ...s.env, ...extra } as Record<string, string | undefined> as NodeJS.ProcessEnv,
    });
  }

  it('builds without the write token, keeps the read-only token, and restores the pulled file', () => {
    const s = setup();
    try {
      // The parent shell has the write token too: the build must still not see it.
      const r = build('production', s, { KV_REST_API_TOKEN: WRITE, VERCEL_TOKEN: 'synthetic-cli-token' });
      expect(r.stderr).toBe('');
      expect(r.status).toBe(0);
      expect(r.stdout).toContain('build-env: KV_REST_API_TOKEN absent in all');
      expect(r.stdout).toContain('build-env: KV_REST_API_READ_ONLY_TOKEN present in the Next build, as pulled');
      expect(r.stdout).toContain('build-env: KV_REST_API_TOKEN present in the restored file for the deployment, as pulled');
      expect(readFileSync(join(s.dir, '.vercel/.env.production.local'), 'utf8')).toBe(PULLED);
      expect(JSON.parse(readFileSync(join(s.dir, 'args.json'), 'utf8'))).toEqual(['--prod', '--token=synthetic-cli-token']);
      for (const text of [r.stdout, r.stderr]) expect(text).not.toMatch(new RegExp(`${WRITE}|${READ}|synthetic-cli-token`));
    } finally {
      rmSync(s.dir, { recursive: true, force: true });
    }
  });

  it('builds a preview with the preview file and no token flag when none is given', () => {
    const s = setup();
    try {
      writeFileSync(join(s.dir, '.vercel/.env.preview.local'), 'VERCEL_ENV="preview"\n');
      const r = build('preview', s);
      expect(r.status).toBe(0);
      expect(r.stdout).toContain('build-env: KV_REST_API_READ_ONLY_TOKEN absent in the Next build, as pulled');
      expect(JSON.parse(readFileSync(join(s.dir, 'args.json'), 'utf8'))).toEqual(['--target=preview']);
    } finally {
      rmSync(s.dir, { recursive: true, force: true });
    }
  });

  it('fails, and still restores the pulled file, when the write token reaches the Next build', () => {
    const s = setup({ extraEnv: JSON.stringify({ KV_REST_API_TOKEN: WRITE }) });
    try {
      const r = build('production', s);
      expect(r.status).toBe(1);
      expect(r.stdout + r.stderr).toContain('build-env: FAIL KV_REST_API_TOKEN reached');
      expect(readFileSync(join(s.dir, '.vercel/.env.production.local'), 'utf8')).toBe(PULLED);
      expect(r.stdout + r.stderr).not.toContain(WRITE);
    } finally {
      rmSync(s.dir, { recursive: true, force: true });
    }
  });

  it('fails when the build pulls the environment again', () => {
    const s = setup({ rewrite: true });
    try {
      const r = build('production', s);
      expect(r.status).not.toBe(0);
      expect(r.stdout + r.stderr).toContain('changed during the build');
    } finally {
      rmSync(s.dir, { recursive: true, force: true });
    }
  });

  it('rejects an unknown target before building', () => {
    const s = setup();
    try {
      const r = build('staging', s);
      expect(r.status).toBe(2);
      expect(existsSync(join(s.dir, 'args.json'))).toBe(false);
    } finally {
      rmSync(s.dir, { recursive: true, force: true });
    }
  });
});

describe('the workflows', () => {
  it('builds every deployment through the wrapper, with the target the launch setting picks', () => {
    const list = steps(jobs(DEPLOY).get('deploy')!);
    const buildStep = list.find((s) => /^ {6}- name: Build$/m.test(s))!;
    expect(buildStep).toContain('bash scripts/vercel-build-isolated.sh "$target"');
    expect(buildStep).toMatch(/if \[ "\$LAUNCHED" = "true" \]; then target=production; else target=preview; fi/);
    // Nothing in the deploy calls the Vercel CLI's build directly.
    expect(DEPLOY).not.toMatch(/npx[^\n]*\svercel(?:@\S+)?\s+build\b/);
    // The pull still writes the full environment; only the build's copy loses the write token.
    expect(DEPLOY).toContain('npx --no-install vercel pull --yes --environment="$environment" --token="$VERCEL_TOKEN"');
  });

  it('runs the wrapper in CI on a synthetic pulled environment, with the real Vercel CLI and Next build', () => {
    const job = jobs(CI).get('build-isolation')!;
    expect(job).toMatch(/^ {4}name: Build token isolation$/m);
    const list = steps(job);
    const synthetic = list.findIndex((s) => s.includes('.vercel/.env.production.local'));
    const wrapper = list.findIndex((s) => s.includes('run: bash scripts/vercel-build-isolated.sh production'));
    expect(synthetic).toBeGreaterThan(-1);
    expect(wrapper).toBeGreaterThan(synthetic);
    expect(list[synthetic]).toContain('KV_REST_API_TOKEN="synthetic-write-token"');
    expect(list[synthetic]).toContain('KV_REST_API_READ_ONLY_TOKEN="synthetic-read-token"');
    // No secret of any kind reaches this job.
    expect(job).not.toContain('secrets.');
  });

  it('keeps every existing CI job and its name (they are required checks) and adds the isolation job', () => {
    const all = jobs(CI);
    const named = [...all].map(([id, job]) => [id, /^ {4}name: (.+)$/m.exec(job)?.[1]]);
    expect(named.slice(0, 7)).toEqual([
      ['static', 'Static checks and unit tests'],
      ['stats-ref', 'Statistics reference data'],
      ['sources-remote', 'Pinned sources exist on GitHub'],
      ['build', 'Production build'],
      ['e2e', 'End-to-end tests'],
      ['lhci', 'Lighthouse CI'],
      ['links', 'Link check'],
    ]);
    expect(named).toContainEqual(['build-isolation', 'Build token isolation']);
  });

  it('pins every action by a full commit SHA', () => {
    for (const yaml of [CI, DEPLOY]) {
      for (const m of yaml.matchAll(/^\s*(?:- )?uses: (\S+)/gm)) expect(m[1], m[1]).toMatch(/^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/);
    }
  });

  it('names a script that exists for every one the workflows run', () => {
    for (const path of ['scripts/vercel-build-isolated.sh', 'scripts/build-env-canary.cjs', 'scripts/build-env-isolation.ts']) {
      expect(existsSync(join(ROOT, path)), path).toBe(true);
    }
    expect(existsSync(ISOLATION)).toBe(true);
    expect(existsSync(WRAPPER)).toBe(true);
  });
});
