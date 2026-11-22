// No German page tells a visitor which group they are in: no file under src/app/de passes an
// `arm` prop to the phase or test note components.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : /\.(tsx?|jsx?)$/.test(name) ? [p] : [];
  });
}

describe('German pages never pass an arm', () => {
  const list = files(join(process.cwd(), 'src/app/de'));
  it('scans some files', () => expect(list.length).toBeGreaterThan(0));
  it.each(['PhaseLabel', 'TestNote', 'LiveNote'])('%s gets no arm prop', (name) => {
    const re = new RegExp(`<${name}\\b[^>]*\\barm\\s*=`, 's');
    for (const f of list) expect(readFileSync(f, 'utf8'), f).not.toMatch(re);
  });
});
