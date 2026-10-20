import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CSS_RULES, SOURCE_RULES } from '../../scripts/design-lint.ts';
import { entryExportNames, kitExportNames } from './kit-exports';

const ROOT = join(import.meta.dirname, '../..');
const claudeMd = readFileSync(join(ROOT, 'CLAUDE.md'), 'utf8');
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { scripts: Record<string, string> };

describe('CLAUDE.md', () => {
  it('keeps its header, both imports and the repository notes', () => {
    expect(claudeMd).toContain('# CLAUDE.md');
    expect(claudeMd).toContain('@~/code/portfolio/private/CLAUDE.private.md');
    expect(claudeMd).toContain('@AGENTS.md');
    expect(claudeMd).toContain('## Repository notes');
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
    expect(claudeMd).not.toMatch(/audible/i);
    expect(claudeMd).not.toContain('Known');
    expect(claudeMd).not.toMatch(/known gaps/i);
    expect(claudeMd).not.toMatch(/fact sheet/i);
    const withoutImport = claudeMd.replace('@~/code/portfolio/private/CLAUDE.private.md', '');
    expect(withoutImport).not.toMatch(/private\//);
    expect(withoutImport).not.toMatch(/CLAUDE\.private/);
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
    expect(ci).toContain('run: npm run truth:audit');
    expect(ci).toContain('TRUTH_DENYLIST: ${{ secrets.TRUTH_DENYLIST }}');
  });
});
