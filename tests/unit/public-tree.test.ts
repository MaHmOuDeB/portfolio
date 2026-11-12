import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// The repository is public; the planning documents are not. Code, docs and tests must not name the
// private process documents, the review rounds or the plan and task numbers, because a reader
// outside the project cannot follow them. Say what the rule is instead of where it was decided.
const ROOT = join(import.meta.dirname, '../..');
const SELF = 'tests/unit/public-tree.test.ts';

const FORBIDDEN: readonly [name: string, pattern: RegExp][] = [
  ['a private design document', /(?<![\w-])(?:states|motion|components|figure-kit)\.md|design-lint-rules|WORKFLOW\.md/],
  ['the copy deck', /copy[ -]deck/i],
  ['a ruling or review document', /RULING-|DECISIONS|APPLIED|claim-ledger/],
  ['a design gate', /gate2|\bGate \d/i],
  ['the fact sheet', /fact sheet/i],
  ['a private path', /private\//],
  ['a plan number', /\bPlan \d/],
  ['a task number', /\bTask \d/],
];

// Files that may name a term, with the reason.
const EXEMPT: Readonly<Record<string, { terms: readonly string[]; reason: string }>> = {
  'tests/unit/vercelignore.test.ts': { terms: ['a private path'], reason: 'tests that the private folder is excluded from deploys' },
};

const BINARY = /\.(?:png|jpe?g|webp|ico|woff2?|pdf)$/i;
const SCANNED = /^(?:src\/|docs\/|scripts\/|tests\/|CLAUDE\.md$|package\.json$)/;

export type Hit = { file: string; line: number; what: string; text: string };

/** The forbidden references in one file's text. */
export function findReferences(file: string, text: string): Hit[] {
  const exempt = EXEMPT[file]?.terms ?? [];
  const hits: Hit[] = [];
  text.split('\n').forEach((raw, i) => {
    for (const [what, pattern] of FORBIDDEN) {
      if (!exempt.includes(what) && pattern.test(raw)) hits.push({ file, line: i + 1, what, text: raw.trim().slice(0, 100) });
    }
  });
  return hits;
}

describe('findReferences', () => {
  it('finds each kind of private reference with its line', () => {
    const samples = [
      '// see states.md', '// motion.md says', 'the Copy Deck', 'copy-deck', 'RULING-x', 'DECISIONS', 'APPLIED', 'claim-ledger',
      'gate2-review', 'checked at Gate 2', 'Fact sheet', 'private/specs', 'Plan 05', 'Task 12', 'design-lint-rules.md',
    'components.md',
    ];
    for (const sample of samples) {
      expect(findReferences('src/x.ts', `ok\n${sample}`), sample).toEqual([expect.objectContaining({ line: 2 })]);
    }
  });

  it('gives CLAUDE.md no exemption: an import from the private folder is flagged there too', () => {
    expect(findReferences('CLAUDE.md', '@~/code/x/private/rules.md\n')).toHaveLength(1);
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
