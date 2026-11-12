import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isBuildMeta } from '../../src/lib/live-page/build-meta-shape.ts';
import { WRITE_CREDENTIALS, checkCanary, keysOf, main, withoutWriteCredentials } from '../../scripts/build-env-isolation.ts';

// The deploy builds with `vercel build`, which loads the environment `vercel pull` wrote to
// .vercel/.env.<target>.local into every process of the build. The build must never hold any of
// the store's write credentials: KV_REST_API_TOKEN (the REST write token) and KV_URL and REDIS_URL
// (connection strings that carry the database password); only the read-only token. The wrapper
// removes all three from the build's copy of the pulled file and from the build's environment,
// runs the build with a canary preloaded into every Node process, restores the pulled file
// afterwards, and fails unless the canary saw the Next build without any of them and with the
// read-only token exactly as pulled.
const ROOT = join(import.meta.dirname, '../..');
const CANARY = join(ROOT, 'scripts/build-env-canary.cjs');
const FIXTURE = join(ROOT, 'scripts/build-isolation-fixture.sh');
const CI = readFileSync(join(ROOT, '.github/workflows/ci.yml'), 'utf8');
const DEPLOY = readFileSync(join(ROOT, '.github/workflows/deploy.yml'), 'utf8');

// Synthetic values, never real secrets; the tests check that none of them is ever printed.
const WRITE = 'synthetic-write-value';
const READ = 'synthetic-read-value';
const PASSWORD = 'synthetic-redis-password';
const PULLED = [
  '# Created by Vercel CLI',
  'VERCEL_ENV="production"',
  `KV_REST_API_URL="https://store.invalid"`,
  `KV_REST_API_TOKEN="${WRITE}"`,
  `KV_REST_API_READ_ONLY_TOKEN="${READ}"`,
  `KV_URL="rediss://default:${PASSWORD}@store.invalid:6379"`,
  `REDIS_URL="rediss://default:${PASSWORD}@store.invalid:6379"`,
  'OTHER="kept"',
  '',
].join('\n');
const SECRETS = new RegExp(`${WRITE}|${READ}|${PASSWORD}`);

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
      ['KV_REST_API_READ_ONLY_TOKEN', 'KV_REST_API_TOKEN', 'KV_REST_API_URL', 'KV_URL', 'OTHER', 'REDIS_URL', 'VERCEL_ENV'],
    );
  });

  it('names exactly the store write credentials: the REST write token and both connection strings', () => {
    expect(WRITE_CREDENTIALS).toEqual(['KV_REST_API_TOKEN', 'KV_URL', 'REDIS_URL']);
  });

  it.each(['KV_REST_API_TOKEN', 'KV_URL', 'REDIS_URL'])('removes every line that sets %s, and nothing else', (key) => {
    const text = [
      'A="1"',
      `${key}="x"`,
      `  ${key} = "y"`,
      `export ${key}="z"`,
      `${key}_OTHER="kept"`,
      'KV_REST_API_URL="https://store.invalid"',
      'KV_REST_API_READ_ONLY_TOKEN="r"',
      '',
    ].join('\n');
    const out = withoutWriteCredentials(text);
    expect(out).toBe(['A="1"', `${key}_OTHER="kept"`, 'KV_REST_API_URL="https://store.invalid"', 'KV_REST_API_READ_ONLY_TOKEN="r"', ''].join('\n'));
    expect(keysOf(out).has(key)).toBe(false);
    expect(keysOf(out).has('KV_REST_API_READ_ONLY_TOKEN')).toBe(true);
  });

  it('removes all three from a production-shaped pull and keeps the rest', () => {
    const keys = keysOf(withoutWriteCredentials(PULLED));
    for (const key of WRITE_CREDENTIALS) expect(keys.has(key), key).toBe(false);
    expect([...keys].sort()).toEqual(['KV_REST_API_READ_ONLY_TOKEN', 'KV_REST_API_URL', 'OTHER', 'VERCEL_ENV']);
  });

  it('keeps CRLF files intact apart from the removed lines', () => {
    expect(withoutWriteCredentials('A="1"\r\nKV_REST_API_TOKEN="x"\r\nKV_URL="y"\r\nB="2"\r\n')).toBe('A="1"\r\nB="2"\r\n');
  });
});

describe('checking the canary records', () => {
  const rec = (r: Partial<{ at: string; nextBuild: boolean; write: boolean; read: boolean }>) =>
    JSON.stringify({ at: 'start', nextBuild: false, write: false, read: false, ...r });
  const good = (read: boolean) =>
    [rec({}), rec({ nextBuild: true, read }), rec({ nextBuild: true, read, at: 'exit' }), rec({ read })].join('\n');

  it('passes when no process held a write credential and Next had the read-only token as pulled', () => {
    expect(checkCanary(good(true), true)).toEqual({ ok: true, processes: 4, failures: [] });
    expect(checkCanary(good(false), false).ok).toBe(true);
  });

  it('fails when any process held a write credential', () => {
    const r = checkCanary(`${good(true)}\n${rec({ write: true })}`, true);
    expect(r.ok).toBe(false);
    expect(r.failures).toContain('a store write credential (KV_REST_API_TOKEN, KV_URL or REDIS_URL) reached 1 of 5 build process records');
  });

  it('fails when a write credential appeared in Next after it started (an env file it loaded)', () => {
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
    for (const key of WRITE_CREDENTIALS) expect(keysOf(sanitized).has(key), key).toBe(false);
    expect(sanitized).not.toContain(PASSWORD);
    expect(sanitized).toContain(`KV_REST_API_READ_ONLY_TOKEN="${READ}"`);
    expect(statSync(envFile()).mode & 0o777).toBe(0o600);
    expect(out).toEqual([
      'build-env: KV_REST_API_TOKEN removed from the build copy of .env.production.local',
      'build-env: KV_URL removed from the build copy of .env.production.local',
      'build-env: REDIS_URL removed from the build copy of .env.production.local',
      'build-env: KV_REST_API_READ_ONLY_TOKEN kept (present in the pulled file)',
    ]);
    expect(run('restore', envFile(), work())).toBe(0);
    expect(readFileSync(envFile(), 'utf8')).toBe(PULLED);
    expect(out.at(-1)).toBe('build-env: .env.production.local restored byte for byte');
    for (const line of out) expect(line).not.toMatch(SECRETS);
  });

  it('says which write credentials were not pulled', () => {
    writeFileSync(envFile(), `KV_REST_API_TOKEN="${WRITE}"\n`);
    expect(run('sanitize', envFile(), work())).toBe(0);
    expect(out).toEqual([
      'build-env: KV_REST_API_TOKEN removed from the build copy of .env.production.local',
      'build-env: KV_URL was not in .env.production.local',
      'build-env: REDIS_URL was not in .env.production.local',
      'build-env: KV_REST_API_READ_ONLY_TOKEN kept (absent in the pulled file)',
    ]);
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
      'build-env: no store write credential (KV_REST_API_TOKEN, KV_URL, REDIS_URL) in any of 3 build process records, the Next build included',
      'build-env: KV_REST_API_READ_ONLY_TOKEN present in the Next build, as pulled',
      'build-env: KV_REST_API_TOKEN present in the restored file for the deployment, as pulled',
      'build-env: KV_URL present in the restored file for the deployment, as pulled',
      'build-env: REDIS_URL present in the restored file for the deployment, as pulled',
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

  it.each(['KV_URL', 'REDIS_URL'])('counts %s alone as a write credential, without recording it', (key) => {
    const dir = mkdtempSync(join(tmpdir(), 'build-env-canary-'));
    try {
      const out = join(dir, 'canary.jsonl');
      const r = spawnSync(process.execPath, ['--require', CANARY, '-e', 'process.exitCode = 0'], {
        encoding: 'utf8',
        env: { PATH: process.env.PATH, BUILD_ENV_CANARY_OUT: out, [key]: `rediss://default:${PASSWORD}@store.invalid:6379` } as Record<string, string | undefined> as NodeJS.ProcessEnv,
      });
      expect(r.status).toBe(0);
      const text = readFileSync(out, 'utf8');
      expect(text.trim().split('\n').map((l) => JSON.parse(l))).toEqual([
        { at: 'start', nextBuild: false, write: true, read: false },
        { at: 'exit', nextBuild: false, write: true, read: false },
      ]);
      expect(text).not.toContain(PASSWORD);
      expect(text).not.toContain(key);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('checks the same three write credentials as the isolation script', () => {
    const list = /const WRITE_CREDENTIALS = \[([^\]]*)\]/.exec(readFileSync(CANARY, 'utf8'))?.[1];
    expect(list?.split(',').map((x) => x.trim().replace(/'/g, ''))).toEqual([...WRITE_CREDENTIALS]);
  });

  it('does nothing without BUILD_ENV_CANARY_OUT', () => {
    const r = spawnSync(process.execPath, ['--require', CANARY, '-e', 'console.log("ok")'], { encoding: 'utf8' });
    expect(r.stdout).toBe('ok\n');
    expect(r.stderr).toBe('');
  });
});

// Each case runs the wrapper, three Node processes and a shell; on a loaded machine that takes
// longer than Vitest's 5 s default, so this block allows 30 s per case.
describe('the build wrapper, with a stand-in for the Vercel CLI', { timeout: 30_000 }, () => {
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

  it('builds without any write credential, keeps the read-only token, and restores the pulled file', () => {
    const s = setup();
    try {
      // The parent shell has all three too: the build must still see none of them.
      const url = `rediss://default:${PASSWORD}@store.invalid:6379`;
      const r = build('production', s, { KV_REST_API_TOKEN: WRITE, KV_URL: url, REDIS_URL: url, VERCEL_TOKEN: 'synthetic-cli-token' });
      expect(r.stderr).toBe('');
      expect(r.status).toBe(0);
      expect(r.stdout).toContain('build-env: no store write credential (KV_REST_API_TOKEN, KV_URL, REDIS_URL) in any of');
      expect(r.stdout).toContain('build-env: KV_REST_API_READ_ONLY_TOKEN present in the Next build, as pulled');
      for (const key of WRITE_CREDENTIALS) {
        expect(r.stdout).toContain(`build-env: ${key} removed from the build copy of .env.production.local`);
        expect(r.stdout).toContain(`build-env: ${key} present in the restored file for the deployment, as pulled`);
      }
      expect(readFileSync(join(s.dir, '.vercel/.env.production.local'), 'utf8')).toBe(PULLED);
      expect(JSON.parse(readFileSync(join(s.dir, 'args.json'), 'utf8'))).toEqual(['--prod', '--token=synthetic-cli-token']);
      for (const text of [r.stdout, r.stderr]) {
        expect(text).not.toMatch(SECRETS);
        expect(text).not.toContain('synthetic-cli-token');
      }
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

  it.each([
    ['KV_REST_API_TOKEN', WRITE],
    ['KV_URL', `rediss://default:${PASSWORD}@store.invalid:6379`],
    ['REDIS_URL', `rediss://default:${PASSWORD}@store.invalid:6379`],
  ])('fails, and still restores the pulled file, when %s reaches the Next build', (key, value) => {
    const s = setup({ extraEnv: JSON.stringify({ [key]: value }) });
    try {
      const r = build('production', s);
      expect(r.status).toBe(1);
      expect(r.stdout + r.stderr).toContain('build-env: FAIL a store write credential (KV_REST_API_TOKEN, KV_URL or REDIS_URL) reached');
      expect(readFileSync(join(s.dir, '.vercel/.env.production.local'), 'utf8')).toBe(PULLED);
      expect(r.stdout + r.stderr).not.toMatch(SECRETS);
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
    // The pull still writes the full environment; only the build's copy loses the write credentials.
    expect(DEPLOY).toContain('npx --no-install vercel pull --yes --environment="$environment" --token="$VERCEL_TOKEN"');
  });

  it('runs the wrapper in CI on the synthetic pulled environment from the fixture script', () => {
    const job = jobs(CI).get('build-isolation')!;
    expect(job).toMatch(/^ {4}name: Build token isolation$/m);
    const list = steps(job);
    const fixture = list.findIndex((s) => /^ {8}run: bash scripts\/build-isolation-fixture\.sh$/m.test(s));
    const wrapper = list.findIndex((s) => /^ {8}run: bash scripts\/vercel-build-isolated\.sh production$/m.test(s));
    expect(fixture).toBeGreaterThan(-1);
    expect(wrapper).toBeGreaterThan(fixture);
    // The fixture lives in the script, not inline, so a later change can extend it without a workflow edit.
    expect(job).not.toContain('.env.production.local');
    // The comment says the fixture is not a production rehearsal: no VERCEL_ENV on purpose.
    expect(job).toMatch(/VERCEL_ENV/);
    // No secret of any kind reaches this job.
    expect(job).not.toContain('secrets.');
  });

  it('the fixture script writes project settings, all three write credentials plus the read-only token and build metadata, synthetic and without VERCEL_ENV', () => {
    const dir = mkdtempSync(join(tmpdir(), 'build-isolation-fixture-'));
    try {
      const r = spawnSync('bash', [FIXTURE], { cwd: dir, encoding: 'utf8' });
      expect(r.status, r.stderr).toBe(0);
      const project = JSON.parse(readFileSync(join(dir, '.vercel/project.json'), 'utf8'));
      expect(project.settings).toEqual({ framework: 'nextjs' });
      const env = readFileSync(join(dir, '.vercel/.env.production.local'), 'utf8');
      expect([...keysOf(env)].sort()).toEqual(['KV_REST_API_READ_ONLY_TOKEN', 'KV_REST_API_TOKEN', 'KV_URL', 'REDIS_URL']);
      expect(env).not.toMatch(/VERCEL_ENV|KV_REST_API_URL/);
      expect(env).toMatch(/@store\.invalid:/);
      // `vercel build` sets VERCEL, so the build embeds public/build-meta.json and fails without it:
      // the fixture writes synthetic, valid build metadata.
      const meta: unknown = JSON.parse(readFileSync(join(dir, 'public/build-meta.json'), 'utf8'));
      expect(isBuildMeta(meta)).toBe(true);
      expect((meta as { commit: string }).commit).toBe('0'.repeat(40));
      // It never overwrites a real pull.
      const again = spawnSync('bash', [FIXTURE], { cwd: dir, encoding: 'utf8' });
      expect(again.status).toBe(1);
      expect(again.stderr).toContain('already exists');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
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
      for (const m of yaml.matchAll(/^\s*(?:- )?uses: (\S+)/gm)) expect(m[1], m[1]).toMatch(/^[\w.-]+\/[\w.-]+(?:\/[\w.-]+)?@[0-9a-f]{40}$/);
    }
  });

  it('runs only scripts that are in the tree, and the wrapper only the helpers that are', () => {
    const fromWorkflows = [...`${CI}\n${DEPLOY}`.matchAll(/\bbash (scripts\/[\w./-]+\.sh)\b/g)].map((m) => m[1]!);
    expect(fromWorkflows).toEqual(expect.arrayContaining(['scripts/build-isolation-fixture.sh', 'scripts/vercel-build-isolated.sh']));
    const wrapper = readFileSync(join(ROOT, 'scripts/vercel-build-isolated.sh'), 'utf8');
    const fromWrapper = [...wrapper.matchAll(/\b(scripts\/[\w./-]+\.(?:ts|cjs))\b/g)].map((m) => m[1]!);
    expect(fromWrapper).toEqual(expect.arrayContaining(['scripts/build-env-isolation.ts', 'scripts/build-env-canary.cjs']));
    for (const path of [...fromWorkflows, ...fromWrapper]) expect(existsSync(join(ROOT, path)), path).toBe(true);
  });
});
