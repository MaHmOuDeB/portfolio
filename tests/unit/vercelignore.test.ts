import { readFileSync } from 'node:fs';

// `vercel build` writes prebuilt functions that symlink to committed files such as .env.example;
// when .vercelignore excludes one of them the deploy fails with ENOENT. A blanket `.env*` caused
// exactly that, so only local env files may be ignored.
const patterns = readFileSync('.vercelignore', 'utf8')
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line !== '' && !line.startsWith('#'));

// Simple glob semantics: `*` matches any run of characters, everything else is literal; a pattern
// matches a whole file name, or a directory prefix when it ends with a slash.
function matches(pattern: string, file: string): boolean {
  if (pattern.endsWith('/')) return file.startsWith(pattern);
  const source = pattern
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${source}$`).test(file);
}

function ignored(file: string): boolean {
  return patterns.some((pattern) => matches(pattern, file));
}

describe('.vercelignore', () => {
  it('keeps the committed .env.example in the upload', () => {
    expect(patterns.filter((pattern) => matches(pattern, '.env.example'))).toEqual([]);
    expect(ignored('.env.example')).toBe(false);
  });

  it('still excludes local env files', () => {
    expect(ignored('.env')).toBe(true);
    expect(ignored('.env.production')).toBe(true);
    expect(ignored('.env.local')).toBe(true);
    expect(ignored('.env.production.local')).toBe(true);
    expect(ignored('.env.development.local')).toBe(true);
  });

  it('still excludes the private and tooling folders', () => {
    for (const dir of ['private/', '.references/', '.claude/', '.superpowers/']) {
      expect(patterns).toContain(dir);
    }
    expect(ignored('private/notes.md')).toBe(true);
  });

  it('excludes the local Claude Code instructions', () => {
    expect(ignored('CLAUDE.local.md')).toBe(true);
    expect(ignored('CLAUDE.md')).toBe(false);
  });
});
