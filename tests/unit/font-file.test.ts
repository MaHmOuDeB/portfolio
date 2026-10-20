import fs from 'node:fs';
import path from 'node:path';
import { brotliDecompressSync } from 'node:zlib';

// The Inter file is preloaded, so Lighthouse's simulated mobile load (LHCI asserts LCP <= 2000 ms)
// counts all of its bytes before the largest paint. At 82 KB it alone held the home page near
// 2000 ms. This guards the byte budget and the design needs (opsz, wght, cv05, tnum, glyphs).

const repo = path.resolve(import.meta.dirname, '../..');
const fontPath = path.join(repo, 'src/app/fonts/InterVariable-latin.woff2');
const fontsTs = fs.readFileSync(path.join(repo, 'src/app/fonts.ts'), 'utf8');
const BUDGET_BYTES = 50_000;

// WOFF2 known-table tags, indexed by the 6-bit flag (W3C WOFF2, section 5.1).
const KNOWN_TAGS = [
  'cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf', 'loca',
  'prep', 'CFF ', 'VORG', 'EBDT', 'EBLC', 'gasp', 'hdmx', 'kern', 'LTSH', 'PCLT', 'VDMX', 'vhea',
  'vmtx', 'BASE', 'GDEF', 'GPOS', 'GSUB', 'EBSC', 'JSTF', 'MATH', 'CBDT', 'CBLC', 'COLR', 'CPAL',
  'SVG ', 'sbix', 'acnt', 'avar', 'bdat', 'bloc', 'bsln', 'cvar', 'fdsc', 'feat', 'fmtx', 'fvar',
  'gvar', 'hsty', 'just', 'lcar', 'mort', 'morx', 'opbd', 'prop', 'trak', 'Zapf', 'Silf', 'Glat',
  'Gloc', 'Feat', 'Sill',
];

/** Untransformed sfnt tables of a WOFF2 file, by tag (glyf and loca stay in their transformed form). */
function woff2Tables(file: Buffer): Map<string, Buffer> {
  expect(file.toString('latin1', 0, 4)).toBe('wOF2');
  const numTables = file.readUInt16BE(12);
  const compressedSize = file.readUInt32BE(20);
  let p = 48;
  const base128 = () => {
    let value = 0;
    for (let i = 0; i < 5; i++) {
      const byte = file.readUInt8(p++);
      value = value * 128 + (byte & 0x7f);
      if (!(byte & 0x80)) return value;
    }
    throw new Error('bad UIntBase128');
  };
  const entries: Array<{ tag: string; length: number }> = [];
  for (let i = 0; i < numTables; i++) {
    const flags = file.readUInt8(p++);
    let tag = KNOWN_TAGS[flags & 0x3f] ?? '';
    if ((flags & 0x3f) === 63) {
      tag = file.toString('latin1', p, p + 4);
      p += 4;
    }
    const version = flags >> 6;
    const origLength = base128();
    const transformed = tag === 'glyf' || tag === 'loca' ? version === 0 : version !== 0;
    entries.push({ tag, length: transformed ? base128() : origLength });
  }
  const data = brotliDecompressSync(file.subarray(p, p + compressedSize));
  const tables = new Map<string, Buffer>();
  let offset = 0;
  for (const { tag, length } of entries) {
    tables.set(tag, data.subarray(offset, offset + length));
    offset += length;
  }
  return tables;
}

function axes(fvar: Buffer): Record<string, { min: number; max: number }> {
  const out: Record<string, { min: number; max: number }> = {};
  const start = fvar.readUInt16BE(4);
  const count = fvar.readUInt16BE(8);
  const size = fvar.readUInt16BE(10);
  for (let i = 0; i < count; i++) {
    const a = start + i * size;
    out[fvar.toString('latin1', a, a + 4)] = { min: fvar.readInt32BE(a + 4) / 65536, max: fvar.readInt32BE(a + 12) / 65536 };
  }
  return out;
}

function gsubFeatures(gsub: Buffer): Set<string> {
  const list = gsub.readUInt16BE(6);
  const count = gsub.readUInt16BE(list);
  const tags = new Set<string>();
  for (let i = 0; i < count; i++) tags.add(gsub.toString('latin1', list + 2 + i * 6, list + 6 + i * 6));
  return tags;
}

/** Code points with a glyph, from the Windows Unicode BMP (format 4) subtable. */
function mapped(cmap: Buffer): Set<number> {
  const n = cmap.readUInt16BE(2);
  for (let i = 0; i < n; i++) {
    const r = 4 + i * 8;
    if (cmap.readUInt16BE(r) !== 3 || cmap.readUInt16BE(r + 2) !== 1) continue;
    const t = cmap.readUInt32BE(r + 4);
    if (cmap.readUInt16BE(t) !== 4) continue;
    const segs = cmap.readUInt16BE(t + 6) / 2;
    const ends = t + 14;
    const starts = ends + segs * 2 + 2;
    const deltas = starts + segs * 2;
    const rangeOffsets = deltas + segs * 2;
    const out = new Set<number>();
    for (let s = 0; s < segs; s++) {
      const end = cmap.readUInt16BE(ends + s * 2);
      const delta = cmap.readInt16BE(deltas + s * 2);
      const ro = cmap.readUInt16BE(rangeOffsets + s * 2);
      for (let c = cmap.readUInt16BE(starts + s * 2); c <= end && c !== 0xffff; c++) {
        let glyph: number;
        if (ro === 0) glyph = (c + delta) & 0xffff;
        else {
          const g = cmap.readUInt16BE(rangeOffsets + s * 2 + ro + (c - cmap.readUInt16BE(starts + s * 2)) * 2);
          glyph = g === 0 ? 0 : (g + delta) & 0xffff;
        }
        if (glyph !== 0) out.add(c);
      }
    }
    return out;
  }
  throw new Error('no (3,1) format 4 cmap');
}

describe('self-hosted Inter file', () => {
  const file = fs.readFileSync(fontPath);
  const tables = woff2Tables(file);
  const table = (tag: string) => {
    const t = tables.get(tag);
    if (!t) throw new Error(`no ${tag} table`);
    return t;
  };

  it(`stays under the ${BUDGET_BYTES} byte budget for a preloaded font`, () => {
    expect(file.length).toBeLessThanOrEqual(BUDGET_BYTES);
  });

  it('keeps the opsz axis and a wght axis that matches the @font-face weight in fonts.ts', () => {
    const { opsz, wght, ...rest } = axes(table('fvar'));
    expect(rest).toEqual({});
    expect(opsz).toEqual({ min: 14, max: 32 });
    // The tokens use 400, 500 and 600; `bolder` on regular text resolves to 700.
    expect(wght?.min).toBeLessThanOrEqual(400);
    expect(wght?.max).toBeGreaterThanOrEqual(700);
    expect(fontsTs).toContain(`weight: '${wght?.min} ${wght?.max}'`);
  });

  it('keeps cv05 and tnum, the features --font-sans turns on', () => {
    const features = gsubFeatures(table('GSUB'));
    expect(features).toContain('cv05');
    expect(features).toContain('tnum');
  });

  it('has a glyph for every symbol the content uses', () => {
    const cps = mapped(table('cmap'));
    for (let c = 0x20; c <= 0x7e; c++) expect(cps.has(c), `U+${c.toString(16)}`).toBe(true);
    // non-breaking space, ×, α, β, en dash, ’, …, subscript 0, 1, 2 and minus, minus, √, ≈, ≤, ≥, €
    for (const c of [0xa0, 0xd7, 0x3b1, 0x3b2, 0x2013, 0x2019, 0x2026, 0x2080, 0x2081, 0x2082, 0x208b, 0x2212, 0x221a, 0x2248, 0x2264, 0x2265, 0x20ac]) {
      expect(cps.has(c), `U+${c.toString(16)}`).toBe(true);
    }
  });

  it('is preloaded, so the first paint is not a fallback flash on a fast connection', () => {
    expect(fontsTs).toMatch(/preload: true/);
    expect(fontsTs).toMatch(/adjustFontFallback: 'Arial'/);
    expect(fontsTs).toMatch(/display: 'swap'/);
  });
});
