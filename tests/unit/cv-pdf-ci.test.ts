import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// The CI side of the web CV's PDF checks: the runner gets python3 and pdftotext before the unit
// tests, proves it can extract text from a small synthetic PDF, and keeps a reserved step for the
// check of the real PDF. That step runs in checker-only mode until the CV checker and its PDF
// arrive together with the activation: with no PDF in the tree it passes, a PDF without the
// activation fails, and every run records what it looked at in the job summary.
const ROOT = join(import.meta.dirname, '../..');
const CI = readFileSync(join(ROOT, '.github/workflows/ci.yml'), 'utf8');
const PROOF = join(ROOT, 'scripts/pdf-extraction-proof.py');
const GATE = join(ROOT, 'scripts/cv-pdf-gate.sh');
const FIXTURE = join(ROOT, 'tests/fixtures/pdf/synthetic.pdf');
const FIXTURE_TEXT = 'Synthetic PDF extraction proof';

/** The jobs of a workflow, by id, each with its own text. */
function jobs(yaml: string): Map<string, string> {
  const at = yaml.indexOf('\njobs:\n');
  expect(at).toBeGreaterThan(-1);
  const parts = yaml.slice(at + '\njobs:\n'.length).split(/^(?= {2}[a-z][a-z0-9-]*:\s*$)/m);
  return new Map(parts.map((part) => [/^ {2}([a-z][a-z0-9-]*):/.exec(part)![1]!, part]));
}

/** The steps of one job, in order, each with its own text. */
function steps(job: string): string[] {
  const at = job.indexOf('\n    steps:\n');
  expect(at).toBeGreaterThan(-1);
  return job.slice(at).split(/^(?= {6}- )/m).slice(1);
}

function indexOf(list: string[], pattern: RegExp): number {
  return list.findIndex((step) => pattern.test(step));
}

function tool(name: string): boolean {
  return spawnSync(name, ['--version'], { stdio: 'ignore' }).error === undefined;
}

// CI installs both tools before the unit tests, so there a missing tool is a failure, not a skip.
const HAVE_TOOLS = process.env.CI === 'true' || (tool('python3') && tool('pdftotext'));

describe('the CI workflow', () => {
  const all = jobs(CI);

  it('keeps every existing job and its name (they are required checks) and adds the CV PDF check', () => {
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
    expect(named).toContainEqual(['cv-pdf', 'CV PDF check']);
  });

  it('installs python3 and poppler-utils with apt-get and prints their versions before the unit tests', () => {
    const list = steps(all.get('static')!);
    const install = indexOf(list, /apt-get[^\n]* install -y[^\n]*\bpython3\b[^\n]*\bpoppler-utils\b/);
    const tests = indexOf(list, /^ {6}- run: npm run test:cov$/m);
    expect(install).toBeGreaterThan(-1);
    expect(tests).toBeGreaterThan(install);
    expect(list[install]).toMatch(/^ {10}sudo apt-get -o Acquire::Retries=3 update$/m);
    expect(list[install]).toMatch(/sudo apt-get -o Acquire::Retries=3 install -y/);
    // One apt-get update in the job: the Redis client comes from the same install.
    expect(list.join('').match(/^ +(?:sudo )?apt-get[^\n]*\bupdate\b/gm)).toHaveLength(1);
    expect(list[install]).toMatch(/install -y[^\n]*\bredis-tools\b/);
    expect(indexOf(list, /name: Redis conformance/)).toBeGreaterThan(install);
    expect(list[install]).toMatch(/^ {10}python3 --version$/m);
    expect(list[install]).toMatch(/^ {10}pdftotext -v$/m);
  });

  it('extracts and checks the synthetic PDF on the runner before the unit tests', () => {
    const list = steps(all.get('static')!);
    const proof = indexOf(list, /python3 -I scripts\/pdf-extraction-proof\.py tests\/fixtures\/pdf\/synthetic\.pdf "Synthetic PDF extraction proof"/);
    const install = indexOf(list, /apt-get[^\n]* install -y[^\n]*\bpoppler-utils\b/);
    expect(proof).toBeGreaterThan(install);
    expect(indexOf(list, /^ {6}- run: npm run test:cov$/m)).toBeGreaterThan(proof);
  });

  it('calls python3, never a bare python', () => {
    expect(CI).not.toMatch(/\bpython(?!3)\b(?![-.\w])/);
  });

  it('checks out the pull request head in the CV PDF job, so HEAD in its summary is the commit under review', () => {
    const job = all.get('cv-pdf')!;
    expect(job).toContain('ref: ${{ github.event.pull_request.head.sha || github.sha }}');
    expect(job).toContain('persist-credentials: false');
  });

  it('runs the reserved step with TRUTH_DENYLIST given to that step alone', () => {
    const list = steps(all.get('cv-pdf')!);
    const reserved = indexOf(list, /run: bash scripts\/cv-pdf-gate\.sh/);
    expect(reserved).toBeGreaterThan(-1);
    expect(list[reserved]).toContain('TRUTH_DENYLIST: ${{ secrets.TRUTH_DENYLIST }}');
    expect(list[reserved]).toContain('PR_HEAD_SHA: ${{ github.event.pull_request.head.sha }}');
    expect(list[reserved]).toContain('PR_BASE_SHA: ${{ github.event.pull_request.base.sha }}');
    // The secret reaches exactly two steps in the whole workflow: the truth audit and this one.
    expect(CI.match(/secrets\.TRUTH_DENYLIST/g)).toHaveLength(2);
    expect(steps(all.get('build')!).filter((step) => step.includes('secrets.TRUTH_DENYLIST'))).toHaveLength(1);
    // Never at the workflow or job level, where every step would see it.
    for (const job of all.values()) expect(job.slice(0, job.indexOf('\n    steps:\n'))).not.toContain('TRUTH_DENYLIST');
    expect(CI.slice(0, CI.indexOf('\njobs:\n'))).not.toContain('TRUTH_DENYLIST');
  });

  it('runs no script that is not in the tree (the real checker is not called yet)', () => {
    const paths = [...CI.matchAll(/\b((?:scripts|tests)\/[\w./-]+\.(?:py|sh|ts|pdf))\b/g)].map((m) => m[1]!);
    expect(paths).toContain('scripts/cv-pdf-gate.sh');
    for (const path of paths) expect(existsSync(join(ROOT, path)), path).toBe(true);
    expect(CI).not.toContain('check-web-cv');
  });

  it('pins every action by a full commit SHA', () => {
    const uses = [...CI.matchAll(/^\s*(?:- )?uses: (\S+)/gm)].map((m) => m[1]!);
    expect(uses.length).toBeGreaterThan(10);
    for (const use of uses) expect(use, use).toMatch(/^[\w.-]+\/[\w.-]+(?:\/[\w.-]+)?@[0-9a-f]{40}$/);
  });
});

describe.runIf(HAVE_TOOLS)('the synthetic PDF extraction proof', () => {
  const run = (args: string[], env: Record<string, string | undefined> = process.env, python = 'python3') =>
    spawnSync(python, ['-I', PROOF, ...args], { encoding: 'utf8', env: env as NodeJS.ProcessEnv });

  it('extracts the fixture text', () => {
    const r = run([FIXTURE, FIXTURE_TEXT]);
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
    expect(r.stdout).toBe(`pdf-extraction-proof: extracted "${FIXTURE_TEXT}"\n`);
  });

  it('fails when the text differs', () => {
    const r = run([FIXTURE, 'Something else']);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('pdf-extraction-proof: unexpected text');
  });

  it('fails when the file is not a PDF', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pdf-proof-'));
    try {
      writeFileSync(join(dir, 'broken.pdf'), 'not a pdf');
      const r = run([join(dir, 'broken.pdf'), FIXTURE_TEXT]);
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('pdf-extraction-proof: pdftotext failed');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails when pdftotext is missing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pdf-proof-'));
    try {
      // A PATH with python3 and nothing else.
      const python = realpathSync(spawnSync('python3', ['-c', 'import sys; print(sys.executable)'], { encoding: 'utf8' }).stdout.trim());
      mkdirSync(join(dir, 'bin'));
      symlinkSync(python, join(dir, 'bin', 'python3'));
      const r = run([FIXTURE, FIXTURE_TEXT], { PATH: join(dir, 'bin') }, join(dir, 'bin', 'python3'));
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('pdf-extraction-proof: pdftotext not found');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails on wrong usage', () => {
    expect(run([FIXTURE]).status).toBe(2);
  });
});

describe('the reserved actual-PDF step (checker-only mode)', () => {
  const sha256 = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');

  function repo(files: Record<string, string>): string {
    const dir = mkdtempSync(join(tmpdir(), 'cv-pdf-gate-'));
    const git = (...args: string[]) => {
      const r = spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
      expect(r.status, r.stderr).toBe(0);
      return r.stdout.trim();
    };
    git('init', '-q');
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(join(dir, path, '..'), { recursive: true });
      writeFileSync(join(dir, path), text);
    }
    writeFileSync(join(dir, 'README'), 'synthetic\n');
    git('add', '-A');
    git('-c', 'user.name=t', '-c', 'user.email=t@example.invalid', 'commit', '-q', '-m', 'synthetic');
    return dir;
  }

  function gate(dir: string, env: Record<string, string> = {}) {
    const summary = join(dir, '..', `${dir.split('/').pop()}.summary.md`);
    writeFileSync(summary, '');
    const r = spawnSync('bash', [GATE], {
      cwd: dir,
      encoding: 'utf8',
      env: { PATH: process.env.PATH, GITHUB_STEP_SUMMARY: summary, TRUTH_DENYLIST: 'deny-list-canary-value', ...env } as Record<string, string | undefined> as NodeJS.ProcessEnv,
    });
    const text = readFileSync(summary, 'utf8');
    rmSync(summary, { force: true });
    return { ...r, summary: text };
  }

  function head(dir: string) {
    const rev = (ref: string) => spawnSync('git', ['rev-parse', ref], { cwd: dir, encoding: 'utf8' }).stdout.trim();
    return { commit: rev('HEAD'), tree: rev('HEAD^{tree}') };
  }

  it('passes with no PDF and records HEAD, its tree and that checker, manifest and PDF are absent', () => {
    const dir = repo({});
    try {
      const r = gate(dir);
      expect(r.stderr).toBe('');
      expect(r.status).toBe(0);
      const { commit, tree } = head(dir);
      expect(r.summary).toContain(`- HEAD (git rev-parse HEAD): ${commit}\n`);
      expect(r.summary).toContain(`- Tree (git rev-parse HEAD^{tree}): ${tree}\n`);
      expect(r.summary).toContain('- SHA-256 of scripts/check-web-cv.py: absent\n');
      expect(r.summary).toContain('- SHA-256 of scripts/cv/claim-layout.json: absent\n');
      expect(r.summary).toContain('- SHA-256 of public/cv.pdf: absent\n');
      expect(r.summary).toContain('- Mode: checker-only (no PDF in the tree); the actual-PDF check did not run\n');
      // The summary is printed to the log as well.
      expect(r.stdout).toBe(r.summary);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('records the SHA-256 of the checker and the manifest when they exist', () => {
    const checker = 'print("checker")\n';
    const manifest = '{"version":1}\n';
    const dir = repo({ 'scripts/check-web-cv.py': checker, 'scripts/cv/claim-layout.json': manifest });
    try {
      const r = gate(dir);
      expect(r.status).toBe(0);
      expect(r.summary).toContain(`- SHA-256 of scripts/check-web-cv.py: ${sha256(checker)}\n`);
      expect(r.summary).toContain(`- SHA-256 of scripts/cv/claim-layout.json: ${sha256(manifest)}\n`);
      expect(r.summary).toContain('- SHA-256 of public/cv.pdf: absent\n');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('records the pull request head and base when given', () => {
    const dir = repo({});
    try {
      const r = gate(dir, { PR_HEAD_SHA: 'a'.repeat(40), PR_BASE_SHA: 'b'.repeat(40) });
      expect(r.status).toBe(0);
      expect(r.summary).toContain(`- Pull request head: ${'a'.repeat(40)}\n`);
      expect(r.summary).toContain(`- Pull request base: ${'b'.repeat(40)}\n`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails closed when a PDF is in the tree before the check is activated, after recording its hash', () => {
    const pdf = readFileSync(FIXTURE);
    const dir = repo({});
    try {
      mkdirSync(join(dir, 'public'));
      writeFileSync(join(dir, 'public/cv.pdf'), pdf);
      const r = gate(dir);
      expect(r.status).toBe(1);
      expect(r.summary).toContain(`- SHA-256 of public/cv.pdf: ${sha256(pdf)}\n`);
      expect(r.stderr).toContain('::error::public/cv.pdf is in the tree but the actual-PDF check is not active');
      expect(r.summary).not.toContain('checker-only');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('never prints the deny-list', () => {
    const dir = repo({ 'public/cv.pdf': 'x' });
    try {
      const r = gate(dir);
      for (const out of [r.stdout, r.stderr, r.summary]) expect(out).not.toContain('deny-list-canary-value');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails outside a git checkout, before writing anything', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cv-pdf-gate-'));
    try {
      const r = gate(dir);
      expect(r.status).not.toBe(0);
      expect(r.stderr).toMatch(/not a git repository/i);
      expect(r.summary).not.toContain('HEAD');
      expect(r.stdout).toBe('');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
