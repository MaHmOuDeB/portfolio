import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CSS_RULES, SOURCE_RULES } from '../../scripts/design-lint.ts';
import { entryExportNames, kitExportNames } from './kit-exports';

const ROOT = join(import.meta.dirname, '../..');

/** The folders of the employer case study, whose paths and exports CLAUDE.md may name as code. */
const CASE_STUDY_FOLDERS = ['src/components/audible', 'src/lib/audible'];

/** Every name a file in those folders exports. */
function caseStudyExports(): Set<string> {
  const names = new Set<string>();
  for (const folder of CASE_STUDY_FOLDERS) {
    for (const file of readdirSync(join(ROOT, folder))) {
      const source = readFileSync(join(ROOT, folder, file), 'utf8');
      for (const m of source.matchAll(/export (?:async )?(?:function|const|let|class|type) (\w+)/g)) names.add(m[1]!);
    }
  }
  return names;
}
const CASE_STUDY_EXPORTS = caseStudyExports();

/**
 * The text with exactly these backticked tokens removed: a path in a case-study folder, the case-study
 * route (with an optional fragment), and an identifier one of its files exports. Anything else stays.
 */
function withoutCaseStudyCode(md: string): string {
  return md
    .replace(/`(?:src\/(?:components|lib)\/audible(?:\/[\w./-]*)?|\/work\/audible(?:#[\w-]+)?)`/g, '``')
    .replace(/`([A-Za-z_]\w*)`/g, (token, name: string) => (CASE_STUDY_EXPORTS.has(name) ? '``' : token));
}
const claudeMd = readFileSync(join(ROOT, 'CLAUDE.md'), 'utf8');
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { scripts: Record<string, string> };

describe('CLAUDE.md', () => {
  it('keeps its header, the AGENTS.md import and the repository notes', () => {
    expect(claudeMd).toContain('# CLAUDE.md');
    expect(claudeMd).toContain('@AGENTS.md');
    expect(claudeMd).toContain('## Repository notes');
  });

  it('imports only files inside the repository', () => {
    const imports = [...claudeMd.matchAll(/^@(\S+)$/gm)].map((m) => m[1]!);
    expect(imports).toEqual(['AGENTS.md']);
  });

  it('names every design-lint rule id', () => {
    for (const rule of [...CSS_RULES, ...SOURCE_RULES]) expect(claudeMd, rule).toContain(`\`${rule}\``);
  });

  it('lists every export of the kit index in the catalogue', () => {
    const names = kitExportNames();
    expect(names.length).toBeGreaterThan(30);
    for (const name of names) expect(claudeMd, name).toContain(`\`${name}\``);
  });

  it('documents both kit entry points', () => {
    expect(claudeMd).toContain('`@/components/kit`');
    expect(claudeMd).toContain('`@/components/kit/client`');
    expect(entryExportNames('client').length).toBeGreaterThan(5);
    for (const name of entryExportNames('client')) expect(claudeMd, name).toContain(`\`${name}\``);
  });

  it('states the rules a contributor must not miss', () => {
    expect(claudeMd).toContain('No `cacheComponents`');
    expect(claudeMd).toContain('`?<figureId>.<param>`');
    expect(claudeMd).toContain('Edit these');
    expect(claudeMd).toContain('Leave these alone');
  });

  it('keeps private material out of the public file', () => {
    expect(claudeMd).not.toContain('title stating the finding');
    // The employer's name may appear only as code: the case-study folders and route, and the names
    // their files export, each in backticks. Any other mention fails.
    expect(withoutCaseStudyCode(claudeMd)).not.toMatch(/audible/i);
    expect(claudeMd).not.toMatch(/\bknown\b/i);
    // Private paths and process documents are checked repo-wide by public-tree.test.ts.
  });

  it('lets the name through only as those code tokens', () => {
    // Removed: the folder and route paths, and an identifier its files export.
    expect(withoutCaseStudyCode('`src/components/audible/AudiblePage.tsx`, `src/lib/audible/framework.ts`, `src/components/audible`')).not.toMatch(/audible/i);
    expect(withoutCaseStudyCode('`/work/audible` and `/work/audible#why-so-many`')).not.toMatch(/audible/i);
    expect(withoutCaseStudyCode('`AudiblePage`, `AUDIBLE_SECTIONS`')).not.toMatch(/audible/i);
    // Kept, so the guard fails: prose, an unbackticked path, another backticked word or path, an
    // identifier no case-study file exports.
    for (const kept of [
      'Experimentation at Audible (Amazon).',
      'src/components/audible/AudiblePage.tsx',
      '`audible`',
      '`docs/audible.md`',
      '`AudibleRules`',
      '`src/components/audible-notes/x.ts`',
    ]) {
      expect(withoutCaseStudyCode(kept), kept).toMatch(/audible/i);
    }
  });

  it('follows its own copy rules: no arrows or middle dots', () => {
    expect(claudeMd).not.toMatch(/→|·/);
  });

  it('names only npm scripts that exist', () => {
    const named = [...claudeMd.matchAll(/npm run ([\w:-]+)/g)].map((m) => m[1]!);
    expect(named.length).toBeGreaterThan(8);
    for (const script of named) expect(pkg.scripts, script).toHaveProperty(script);
  });

  it('documents every command the brief lists', () => {
    for (const script of ['dev', 'build', 'check', 'test', 'test:e2e', 'lint:design', 'lint:design:src', 'gen:obf']) {
      expect(claudeMd, script).toContain(`npm run ${script}`);
      expect(pkg.scripts).toHaveProperty(script);
    }
    expect(claudeMd).toContain('KITCHEN_SINK=1 npm run dev');
  });

  it('points only at repo paths that exist', () => {
    // Folders and files that a later plan creates are the only ones allowed to be missing.
    const planned = new Set(['content/', 'data/sources/']);
    const paths = [...claudeMd.matchAll(/`((?:src|scripts|tests|docs|stats-ref|\.github)\/[^`\s*<>]*)`/g)].map((m) => m[1]!);
    expect(paths.length).toBeGreaterThan(10);
    for (const path of paths) {
      if (planned.has(path)) continue;
      expect(existsSync(join(ROOT, path)), path).toBe(true);
    }
  });

  it('says where the truth audit runs, and CI really runs it', () => {
    expect(claudeMd).toContain('npm run truth:audit');
    expect(claudeMd).toContain('`TRUTH_DENYLIST`');
    expect(claudeMd).not.toMatch(/once the .* secret exists/i);
    const ci = readFileSync(join(ROOT, '.github/workflows/ci.yml'), 'utf8');
    expect(ci).toMatch(/^ {12}npm run truth:audit$/m);
    expect(ci).toContain('TRUTH_DENYLIST: ${{ secrets.TRUTH_DENYLIST }}');
  });
});
