import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..', '..');
const toml = readFileSync(join(root, '.lychee.toml'), 'utf8');

// Every route the shell links to that no plan has built yet, as a path under the site root.
// The CV PDF is not among them: a page offers it only when the build has it.
const SHELL_LINKS = ['work', 'lab', 'experiment', 'about', 'privacy', 'cv'];

function built(path: string): boolean {
  return existsSync(join(root, 'src', 'app', path, 'page.tsx'));
}

// The exclusion is one regex of the form localhost:3123/(a|b|c\\.pdf) inside the TOML string.
function excludedPaths(): string[] {
  const match = /localhost:3123\/\(([^)]*)\)/.exec(toml);
  if (!match?.[1]) return [];
  return match[1].split('|').map((part) => part.replace(/\\\\?\./g, '.'));
}

describe('.lychee.toml exclusions for pages that do not exist yet', () => {
  it('excludes every shell link whose page is not built', () => {
    const excluded = excludedPaths();
    for (const path of SHELL_LINKS.filter((p) => !built(p))) {
      expect(excluded, `${path} is linked from the shell but not excluded`).toContain(path);
    }
  });

  it('drops an exclusion once its page exists (the plan that builds the page removes it)', () => {
    for (const path of excludedPaths()) {
      expect(built(path), `${path} now exists: remove it from the .lychee.toml exclusion`).toBe(false);
    }
  });
});
