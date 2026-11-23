import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The German phone rule in globals.css: inside main a word may break anywhere, but a number, a time,
// code and a table keep the body's break-word. That exemption must not reach a number inside a part
// that sets "anywhere" on its own (a pull figure, a proof figure, a headline): there the number has
// always broken anywhere, on English pages too, and holding it whole squeezes the label beside it.
const css = readFileSync(join(__dirname, '..', '..', '..', 'src/app/globals.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** Every selector whose own rule sets overflow-wrap: anywhere, except main itself. */
function anywhereSelectors(): string[] {
  const out: string[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  for (let m = re.exec(css); m; m = re.exec(css)) {
    const [, head = '', decls = ''] = m;
    if (!/overflow-wrap:\s*anywhere/.test(decls)) continue;
    const sel = head.trim().replace(/\s+/g, ' ');
    if (sel === 'main:lang(de)') continue;
    out.push(sel);
  }
  return out;
}

const flat = css.replace(/\s+/g, ' ');
const exemption = /main:lang\(de\) :is\(\[data-num\], data, time, code, pre, table\)(:not\(.*?\)) \{ overflow-wrap: break-word;/.exec(flat);

describe('the German wrap rule', () => {
  it('lets main break anywhere and keeps numbers, times, code and tables at break-word', () => {
    expect(flat).toMatch(/main:lang\(de\) \{ overflow-wrap: anywhere; \}/);
    expect(exemption).not.toBeNull();
  });

  it('leaves a number inside every part that breaks anywhere on its own as it is in English', () => {
    const not = exemption![1];
    const parts = anywhereSelectors();
    expect(parts.length).toBeGreaterThanOrEqual(8);
    for (const sel of parts) {
      for (const one of sel.split(/,(?![^(]*\))/).map((s) => s.trim())) {
        // The attribute or class that names the part, for example [data-glance-figure].
        const key = one.match(/\[[^\]]+\]/g)?.[0] ?? one;
        expect(not, `${one} sets anywhere but is not excluded`).toContain(key);
      }
    }
  });
});
