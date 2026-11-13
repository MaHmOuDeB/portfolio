import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { advanceEm, labelWidth } from '@/lib/figure/label-width';

// The real advances come from the font file itself, shaped with HarfBuzz (kerning, tabular figures,
// the variable axes at the chart sizes) by measure-inter-advances.py next to this file. If the font
// file changes, its hash no longer matches: run the script again (its header has the command).
type Measured = {
  font: string;
  sha256: string;
  glyphs: Record<string, number>;
  strings: Record<'word' | 'tick' | 'note', Record<string, number>>;
};

const repo = path.resolve(import.meta.dirname, '../../..');
const measured = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'inter-advances.json'), 'utf8')) as Measured;

describe('labelWidth', () => {
  it('was measured from the font file the site serves', () => {
    const file = fs.readFileSync(path.join(repo, measured.font));
    expect(createHash('sha256').update(file).digest('hex')).toBe(measured.sha256);
  });

  it('bounds the advance of every character the font holds, in every chart text style', () => {
    const chars = Object.keys(measured.glyphs);
    // Printable ASCII and the symbols content uses, among them "%" and the minus sign.
    expect(chars.length).toBeGreaterThanOrEqual(95);
    expect(chars).toEqual(expect.arrayContaining(['%', '−', '+', '.', ',', 'm', 'w', 'W', 'M']));
    for (const [c, em] of Object.entries(measured.glyphs)) {
      expect(advanceEm(c), `U+${c.codePointAt(0)!.toString(16)} "${c}"`).toBeGreaterThanOrEqual(em);
      // A bound, not a guess far above: within the 0.02 em rounding.
      expect(advanceEm(c) - em, `U+${c.codePointAt(0)!.toString(16)} "${c}"`).toBeLessThan(0.02);
    }
  });

  it('bounds a sample of the chart label strings, kerned, at its own size', () => {
    const size = { word: 13, tick: 13, note: 15 } as const;
    let count = 0;
    for (const [style, strings] of Object.entries(measured.strings) as Array<[keyof typeof size, Record<string, number>]>) {
      for (const [text, em] of Object.entries(strings)) {
        expect(labelWidth(text, size[style]), `${style} "${text}"`).toBeGreaterThanOrEqual(em * size[style]);
        count++;
      }
    }
    expect(count).toBeGreaterThan(50);
  });

  it('holds every character of the chart label strings in its measured table', () => {
    // A label with a character the table has not measured would count as the widest one; it fails
    // here instead, so the character gets measured (measure-inter-advances.py) and added.
    const known = new Set(Object.keys(measured.glyphs));
    for (const [style, strings] of Object.entries(measured.strings)) {
      for (const text of Object.keys(strings)) {
        for (const c of text) {
          expect(known.has(c), `${style} "${text}": U+${c.codePointAt(0)!.toString(16)} "${c}" is not measured`).toBe(true);
          expect(advanceEm(c), `"${c}" is not in the table`).toBeLessThan(1.02 + 1e-9);
        }
      }
    }
  });

  it('counts a "%" as wide as it is, not as a digit, and a minus as wide as a plus', () => {
    // The old estimate counted every character of a tick label as 8.4 px: "100%" as 33.6 px, about
    // 4.5 px short of its real 38.1 px.
    expect(labelWidth('100%', 13)).toBeGreaterThanOrEqual(measured.strings.tick['100%']! * 13);
    expect(labelWidth('100%', 13)).toBeGreaterThan(4 * 8.4);
    expect(advanceEm('−')).toBe(advanceEm('+'));
    // "no change" was counted as 9 letters of 6.6 px, 59.4 px, against its real 64.8 px.
    expect(labelWidth('no change', 13)).toBeGreaterThanOrEqual(measured.strings.word['no change']! * 13);
  });

  it('counts a character it does not know as the widest', () => {
    const widest = Math.max(...Object.values(measured.glyphs));
    expect(advanceEm('一')).toBeGreaterThanOrEqual(widest);
    expect(labelWidth('', 13)).toBe(0);
  });
});
