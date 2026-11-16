import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Below lg the Home band rests in a static column of three sheets (where scroll timelines exist and
// motion is allowed, a fan settles into it as the stack enters: phone-motion-css.test.ts). Each sheet's face is its ::before
// (position: absolute, inset: -1px), so the sheet itself must be the face's containing block. Once the
// sheet was `position: static` there: every face then resolved against the rig, and the ink face of
// the third sheet covered the whole column. This pins the cause.
const css = readFileSync(join(import.meta.dirname, '../../../src/app/globals.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** The body of the first block that starts with `head` (balanced braces). */
function block(head: string, source = css): string {
  const start = source.indexOf(head);
  expect(start, head).toBeGreaterThan(-1);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}' && --depth === 0) return source.slice(open + 1, i);
  }
  throw new Error(`unclosed block ${head}`);
}

/** The column block: the `width < 64rem` query that holds the sheet rules. */
const column = (() => {
  let from = 0;
  for (;;) {
    const at = css.indexOf('@media (width < 64rem)', from);
    expect(at, 'the column block').toBeGreaterThan(-1);
    const body = block('@media (width < 64rem)', css.slice(at));
    if (body.includes('[data-depth-sheet]')) return body;
    from = at + 1;
  }
})();

describe('the Home band below lg', () => {
  it('draws each face in the sheet\'s own box: the face is absolute, so the sheet is positioned', () => {
    expect(css).toMatch(/\[data-depth-sheet\]::before,\s*\[data-depth-sheet\]::after\s*\{[^}]*position:\s*absolute;[^}]*inset:\s*-1px/);
    const sheet = /\n\s*\[data-depth-sheet\]\s*\{([^}]*)\}/.exec(column)?.[1] ?? '';
    expect(sheet).toMatch(/position:\s*relative/);
    expect(sheet).not.toMatch(/position:\s*static/);
    expect(sheet).toMatch(/transform:\s*none/);
  });

  it('never un-positions a sheet anywhere else either', () => {
    for (const m of css.matchAll(/\[data-depth-sheet(?:="\d")?\]\s*\{([^}]*)\}/g)) {
      expect(m[1]).not.toMatch(/position:\s*static/);
    }
  });

  it('rests as a column of the three sheets with no pose, no links and no slab', () => {
    expect(column).toMatch(/\[data-depth-rig\]\s*\{[^}]*flex-direction:\s*column[^}]*transform:\s*none/);
    expect(column).toMatch(/\[data-depth-link\]\s*\{[^}]*display:\s*none/);
    expect(column).toMatch(/\[data-depth-sheet\]::after\s*\{[^}]*content:\s*none/);
  });
});
