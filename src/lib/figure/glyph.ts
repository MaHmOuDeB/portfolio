// Geometry of the interval glyph, in px. The large size is the inline size times 1.6.
export type GlyphSize = 'inline' | 'large';

export type GlyphGeometry = {
  height: number;
  bar: number;
  capWidth: number;
  capHeight: number;
  dot: number;
  halo: number;
};

const INLINE: GlyphGeometry = { height: 10, bar: 2, capWidth: 1.5, capHeight: 8, dot: 8, halo: 2 };
const LARGE_SCALE = 1.6;

export function glyphGeometry(size: GlyphSize): GlyphGeometry {
  if (size === 'inline') return { ...INLINE };
  return {
    height: INLINE.height * LARGE_SCALE,
    bar: INLINE.bar * LARGE_SCALE,
    capWidth: INLINE.capWidth * LARGE_SCALE,
    capHeight: INLINE.capHeight * LARGE_SCALE,
    dot: INLINE.dot * LARGE_SCALE,
    halo: INLINE.halo * LARGE_SCALE,
  };
}

export const GLYPH_LENGTH: Record<GlyphSize, number> = { inline: 48, large: 96 };
