import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseEnv } from 'node:util';
import { NAME, decide, main } from '../../scripts/pulled-env-canonical.ts';
import { checkPulledEnv } from '../../scripts/pulled-env-check.ts';

// The file `vercel pull --environment=production` writes (CLI 62.2.0) has no
// VERCEL_PROJECT_PRODUCTION_URL, at least before the first production deployment, and a production
// build refuses to run without it. On the production path the deploy fills it from the owner's
// repository variable CANONICAL_HOST, refuses a pulled value that names another host, and never prints
// either value.
const HOST = 'synthetic-canonical.example';
const OTHER_HOST = 'synthetic-other-alias.example';
const SECRET = 'synthetic-secret-value';

const PULLED = [
  '# Created by Vercel CLI',
  `KV_REST_API_READ_ONLY_TOKEN="${SECRET}"`,
  'VERCEL_ENV="production"',
  'VERCEL_TARGET_ENV="production"',
  'VERCEL_URL=""',
  'VERCEL_GIT_COMMIT_SHA="0000000000000000000000000000000000000000"',
  '',
].join('\n');

let dir: string;
let file: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pulled-env-canonical-'));
  file = join(dir, '.env.production.local');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function run(text: string | null, canonical: string | undefined, argv: string[] = [file]) {
  if (text !== null) writeFileSync(file, text);
  const lines: string[] = [];
  const env = (canonical === undefined ? {} : { CANONICAL_HOST: canonical }) as Record<string, string | undefined> as NodeJS.ProcessEnv;
  const status = main(argv, env, { log: (l) => lines.push(l), error: (l) => lines.push(l) });
  return { status, out: lines.join('\n'), after: text === null ? null : readFileSync(file, 'utf8') };
}

describe('decide', () => {
  it('fills an absent variable by appending one line, after a newline only when the file lacks one', () => {
    expect(decide(PULLED, HOST)).toEqual({ kind: 'fill', append: `${NAME}="${HOST}"\n` });
    expect(decide(PULLED.trimEnd(), HOST)).toEqual({ kind: 'fill', append: `\n${NAME}="${HOST}"\n` });
    expect(decide('', HOST)).toEqual({ kind: 'fill', append: `${NAME}="${HOST}"\n` });
  });

  it('fills an empty or blank variable, and a commented-out one counts as absent', () => {
    for (const line of [`${NAME}=""`, `${NAME}=`, `${NAME}="   "`, `# ${NAME}="${HOST}"`]) {
      expect(decide(`${PULLED}${line}\n`, HOST).kind, line).toBe('fill');
    }
  });

  it('leaves a value equal to the host, ignoring letter case', () => {
    expect(decide(`${PULLED}${NAME}="${HOST}"\n`, HOST)).toEqual({ kind: 'equal' });
    expect(decide(`${PULLED}${NAME}="Synthetic-Canonical.EXAMPLE"\n`, HOST)).toEqual({ kind: 'equal' });
    expect(decide(`${PULLED}${NAME}=${HOST}\r\n`, HOST)).toEqual({ kind: 'equal' });
  });

  it('refuses a value that names another host, or is not the bare host', () => {
    for (const value of [OTHER_HOST, `https://${HOST}`, `${HOST}:443`, `${HOST}/`, `www.${HOST}`, `${HOST}.`]) {
      expect(decide(`${PULLED}${NAME}="${value}"\n`, HOST), value).toEqual({ kind: 'mismatch' });
    }
  });

  it('reads the last of two lines, as dotenv does', () => {
    expect(decide(`${PULLED}${NAME}="${OTHER_HOST}"\n${NAME}=""\n`, HOST).kind).toBe('fill');
    expect(decide(`${PULLED}${NAME}=""\n${NAME}="${OTHER_HOST}"\n`, HOST).kind).toBe('mismatch');
  });
});

describe('pulled-env-canonical main', () => {
  it('absent: appends the lower-cased host, keeps every other byte, and pulled-env-check then passes', () => {
    expect(checkPulledEnv(PULLED).VERCEL_PROJECT_PRODUCTION_URL).toBe(false);
    const r = run(PULLED, 'Synthetic-Canonical.Example');
    expect(r.status).toBe(0);
    expect(r.out).toBe(`${NAME}: missing or empty in the pulled file, set from CANONICAL_HOST`);
    expect(r.after).toBe(`${PULLED}${NAME}="${HOST}"\n`);
    expect(r.after!.startsWith(PULLED)).toBe(true);
    expect(parseEnv(r.after!)[NAME]).toBe(HOST);
    expect(checkPulledEnv(r.after!)).toEqual({ VERCEL_ENV: true, VERCEL_PROJECT_PRODUCTION_URL: true });
  });

  it('keeps a file without a final newline, and CRLF lines, byte for byte before the appended line', () => {
    const noNewline = PULLED.trimEnd();
    const a = run(noNewline, HOST);
    expect(a.status).toBe(0);
    expect(a.after).toBe(`${noNewline}\n${NAME}="${HOST}"\n`);
    const crlf = PULLED.replaceAll('\n', '\r\n');
    const b = run(crlf, HOST);
    expect(b.status).toBe(0);
    expect(b.after).toBe(`${crlf}${NAME}="${HOST}"\n`);
    expect(parseEnv(b.after!)[NAME]).toBe(HOST);
    expect(parseEnv(b.after!).VERCEL_ENV).toBe('production');
  });

  it('empty: appends a line that overrides the empty one', () => {
    const text = `${PULLED}${NAME}=""\n`;
    const r = run(text, HOST);
    expect(r.status).toBe(0);
    expect(r.after).toBe(`${text}${NAME}="${HOST}"\n`);
    expect(parseEnv(r.after!)[NAME]).toBe(HOST);
  });

  it('equal (letter case aside): exits 0 and leaves the file unchanged; a second run after a fill is a no-op', () => {
    for (const [value, canonical] of [
      [HOST, HOST],
      ['Synthetic-Canonical.Example', HOST],
      [HOST, 'SYNTHETIC-CANONICAL.EXAMPLE'],
    ]) {
      const text = `${PULLED}${NAME}="${value}"\n`;
      const r = run(text, canonical);
      expect(r.status, `${value} ${canonical}`).toBe(0);
      expect(r.out).toBe(`${NAME}: already equal to CANONICAL_HOST, file unchanged`);
      expect(r.after).toBe(text);
    }
    const first = run(PULLED, HOST);
    const second = run(null, HOST);
    expect(second.status).toBe(0);
    expect(readFileSync(file, 'utf8')).toBe(first.after);
  });

  it('different: exits 1 naming both variables, prints neither value, and changes nothing', () => {
    const text = `${PULLED}${NAME}="${OTHER_HOST}"\n`;
    const r = run(text, HOST);
    expect(r.status).toBe(1);
    expect(r.out).toBe(
      `::error::The pulled ${NAME} differs from the repository variable CANONICAL_HOST; Vercel's production domain is not the declared canonical domain, so nothing is built or deployed.`,
    );
    expect(r.after).toBe(text);
  });

  it('refuses an empty or malformed CANONICAL_HOST before reading the file, and changes nothing', () => {
    const empty = run(PULLED, '');
    expect(empty.status).toBe(1);
    expect(empty.out).toBe('::error::LAUNCHED is true but the repository variable CANONICAL_HOST is empty; nothing is deployed.');
    expect(empty.after).toBe(PULLED);
    expect(run(PULLED, undefined).status).toBe(1);
    for (const bad of [
      `https://${HOST}`,
      `${HOST}/`,
      `${HOST}:443`,
      ` ${HOST}`,
      `${HOST}\n`,
      `${HOST}.`,
      'portfolio',
      '-portfolio.example',
      `user@${HOST}`,
      '192.0.2.1',
      'a.example; touch pwned',
    ]) {
      const r = run(PULLED, bad);
      expect(r.status, JSON.stringify(bad)).toBe(1);
      expect(r.out).toBe(
        '::error::The repository variable CANONICAL_HOST is not a bare hostname: it must be two or more dot-separated labels of letters, digits and inner hyphens, with no scheme, slash, port, user or whitespace; nothing is deployed.',
      );
      expect(r.after).toBe(PULLED);
    }
    const invalid = run(PULLED, 'canonical.invalid');
    expect(invalid.status).toBe(1);
    expect(invalid.out).toBe('::error::The repository variable CANONICAL_HOST is a .invalid test host; nothing is deployed.');
    expect(invalid.after).toBe(PULLED);
  });

  it('never prints a value: not the host, not the pulled one, not any other line of the file', () => {
    const outputs = [
      run(PULLED, HOST).out,
      run(`${PULLED}${NAME}="${HOST}"\n`, HOST).out,
      run(`${PULLED}${NAME}="${OTHER_HOST}"\n`, HOST).out,
      run(PULLED, `https://${HOST}`).out,
    ];
    for (const out of outputs) {
      expect(out).not.toMatch(/synthetic-/i);
      expect(out).not.toContain(SECRET);
    }
  });

  it('fails closed when the pulled file is missing', () => {
    const r = run(null, HOST);
    expect(r.status).toBe(1);
    expect(r.out).toBe('::error::The pulled environment file .env.production.local is missing; nothing is built or deployed.');
  });

  it('exits 2 without exactly one file argument', () => {
    expect(run(PULLED, HOST, []).status).toBe(2);
    expect(run(PULLED, HOST, [file, file]).status).toBe(2);
    expect(readFileSync(file, 'utf8')).toBe(PULLED);
  });
});
