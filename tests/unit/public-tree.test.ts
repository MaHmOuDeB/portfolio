import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// The repository is public; the planning documents are not. Code, docs and tests must not name the
// private process documents, the review rounds or the plan and task numbers, because a reader
// outside the project cannot follow them. Say what the rule is instead of where it was decided.
//
// The names are kept here only as SHA-256 hashes, so this file does not publish them. Each line is
// cut into words (letters, digits and hyphens), and every word, every hyphen-separated part of a
// word and every pair of neighbouring words is hashed, with each run of digits written as "#". A
// candidate matches the case-insensitive list in lower case and the case-sensitive list as written.
const ROOT = join(import.meta.dirname, '../..');
const SELF = 'tests/unit/public-tree.test.ts';

export type Terms = { insensitive: ReadonlySet<string>; sensitive: ReadonlySet<string> };
export const TERMS: Terms = {
  insensitive: new Set([
    'd3d8405e50ded19e03b9682234a8d5bef6d56aedbd8e81b0e9f954b3f80141fe',
    '87783e57e5ad9a6ba7f7e66b15ef3f9ccf1c89f454ded6b1f47d0c786671ab0f',
    'ea8d5297658b4302f5937a875e66637ff26dfd6258937f39164f0f9e9240d5cb',
    '2e4a1e12b6bc2c9dcf3a97bbbd6bf9d78339b458deac392dd9df3d6352161812',
    '7b22826fb98e68ed28d51080097999400db05c4f197cd9f13f35d0445cfcb309',
    'b0014faa6de63775122c8d129645d608af751f31f1f8319c6486749b8157ad30',
    '6ddc40c9033590d3aa7719b7f637f675397911123d31a69c705ecb420c70fcf4',
    'f8c3930ad58f19bc0e82533819c0da94ab6c399876b87f7e99c1a136cb6a8933',
    '92afcd623c8a6132181ab5a8d1071e5d0cf60494d1b40cf20a0398918cc61e90',
    'e7d0b3672508380bb3df75c10a1b0eb5bdbdba0f45281c54404e3c0ffa6fa0bc',
    'd58a2d7838190eaa702a81d6b6d4872f1e1642e7da1723ed26ed1187f2a9ac19',
    'bba9f7b531cb5f5e2fc6a10545d4a4d6aaf6b17a7131ac622400734c8e55a368',
    'b3933620a15c8436a6dbe63b22d73ae20626cc6b43d9d8111380e66f2f7284fc',
    '7bb1e9971661d04ea50338559c4a9226f08482a573871a850478c4f1ba5664c2',
  ]),
  sensitive: new Set([
    'e0d711df54869dae44d9c306874f6bbb8d61bd95cac36149af47d4d42d503af2',
    '78b0f3d88dfe467c8e62918d608f8ba0575c584902b0aece2fdc276b5af88bdd',
    '79dfd370bb43b580583faab3785ab434b1683578cb8b5649d5a3495ca987e1ac',
    '4c2b5fe834450a6d35276bea58a44f799a102f9b7d67f410263f91de75a0836d',
    '51f31fe07a77cc857466f20281e951ae77cc0787369c26d603dab6454f148787',
  ]),
};
const PRIVATE_TERM = 'a private process name';
const PRIVATE_PATH = 'a private path';

// Files that may name a term, with the reason.
const EXEMPT: Readonly<Record<string, { terms: readonly string[]; reason: string }>> = {
  'tests/unit/vercelignore.test.ts': { terms: [PRIVATE_PATH], reason: 'tests that the private folder is excluded from deploys' },
};

const BINARY = /\.(?:png|jpe?g|webp|ico|woff2?|pdf)$/i;
const SCANNED = /^(?:src\/|docs\/|scripts\/|tests\/|CLAUDE\.md$|package\.json$)/;

export type Hit = { file: string; line: number; what: string; text: string };

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

/** The words, hyphen parts and word pairs of one line, with digit runs as "#". */
export function candidates(line: string): string[] {
  const words = line.split(/[^A-Za-z0-9-]+/).filter(Boolean);
  const parts = words.flatMap((w) => w.split('-').filter(Boolean));
  const pairs = words.slice(1).map((w, i) => `${words[i]} ${w}`);
  return [...new Set([...words, ...parts, ...pairs].map((c) => c.replace(/\d+/g, '#')))];
}

/** The forbidden references in one file's text. */
export function findReferences(file: string, text: string, terms: Terms = TERMS): Hit[] {
  const exempt = EXEMPT[file]?.terms ?? [];
  const hits: Hit[] = [];
  text.split('\n').forEach((raw, i) => {
    const add = (what: string) => hits.push({ file, line: i + 1, what, text: raw.trim().slice(0, 100) });
    if (!exempt.includes(PRIVATE_PATH) && /private\//.test(raw)) add(PRIVATE_PATH);
    if (!exempt.includes(PRIVATE_TERM) && candidates(raw).some((c) => terms.sensitive.has(sha256(c)) || terms.insensitive.has(sha256(c.toLowerCase())))) {
      add(PRIVATE_TERM);
    }
  });
  return hits;
}

describe('findReferences', () => {
  // A synthetic list stands in for the real one, so the matching is tested without naming a term.
  const SYNTHETIC: Terms = {
    insensitive: new Set(['1a989ea86150171c687b0727f218eedbb94c4665a7da9b0add1bf5de607f2bf1', '589c3de4d8a16e9c1df385066e1f8ae73f62b990ace0a18ade34af123adc1b8f']),
    sensitive: new Set(['d079e7e1ed0e0922106cc50fb80a27c68dcf83d7262a8ede9cd5ee976e1afced', 'd2d6814e29ae602b2ce782e1571b40de6dd1554e78575405294c1b734e88bd1a']),
  };

  it('matches a word pair, a hyphen part, a digit run and a case-sensitive word, with its line', () => {
    for (const sample of ['see Alpha.beta', 'ALPHA BETA', 'x gamma3-y', 'gamma 12 no; gamma12', 'the DELTA-1 note', 'Omega 12']) {
      expect(findReferences('src/x.ts', `ok\n${sample}`, SYNTHETIC), sample).toEqual([expect.objectContaining({ line: 2, what: PRIVATE_TERM })]);
    }
  });

  it('keeps case where the list is case-sensitive, and does not match a longer word', () => {
    for (const sample of ['the delta', 'omega 12', 'alphabet', 'alpha-betas', 'gamma', 'beta alpha']) {
      expect(findReferences('src/x.ts', sample, SYNTHETIC), sample).toEqual([]);
    }
  });

  it('keeps the whole hashed list', () => {
    expect([TERMS.insensitive.size, TERMS.sensitive.size]).toEqual([14, 5]);
    for (const h of [...TERMS.insensitive, ...TERMS.sensitive]) expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it('flags a private path', () => {
    expect(findReferences('src/x.ts', `ok\nsee private/specs`)).toEqual([expect.objectContaining({ line: 2, what: 'a private path' })]);
  });

  it('gives CLAUDE.md no exemption: an import from the private folder is flagged there too', () => {
    expect(findReferences('CLAUDE.md', '@~/elsewhere/private/rules.md\n')).toHaveLength(1);
    expect(findReferences('CLAUDE.md', 'see private/notes')).toHaveLength(1);
  });

  it('lets only the listed file name a private path', () => {
    expect(findReferences('tests/unit/vercelignore.test.ts', "ignored('private/notes.md')")).toEqual([]);
    expect(findReferences('tests/unit/other.test.ts', "ignored('private/notes.md')")).toHaveLength(1);
  });

  it('does not flag ordinary words', () => {
    expect(findReferences('src/x.ts', 'a plan to task the planner; the gate opens; components.tsx; caching-without-cache-components.md')).toEqual([]);
  });
});

describe('the public tree', () => {
  it('names no private document, review round, plan number or task number', () => {
    const files = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' })
      .split('\n')
      .filter((f) => f && f !== SELF && SCANNED.test(f) && !BINARY.test(f) && !f.includes('__screenshots__'));
    expect(files.length).toBeGreaterThan(100);
    const hits = files.flatMap((f) => findReferences(f, readFileSync(join(ROOT, f), 'utf8')));
    expect(hits.map((h) => `${h.file}:${h.line}: ${h.what}: ${h.text}`)).toEqual([]);
  });
});
