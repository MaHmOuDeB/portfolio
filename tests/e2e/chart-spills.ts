// The chart labels that may run past their chart's box, pinned per route. Every chart
// label sits inside its svg's padding (CLAUDE.md, "Chart labels never sit on marks"), and the quality
// matrix fails any label past the box, except these. Each one is a case of the frozen kit's ChartFrame
// sizing its left gutter and right margin from per-character estimates (8.4 px a digit, 6.6 px a
// letter) that a wide glyph such as "%" outruns; the svg is drawn overflow-visible, so the label still
// shows whole. The chart kit's label sizing is being fixed separately, and with it this list empties.
// A new spill fails until it is fixed or, if it is the same kit case, listed here and reviewed.

/** The peeking chart's share ticks, on every page that draws it. */
const PEEKING_TICKS = ['10%', '20%', '30%', '40%'];

export const KIT_CHART_SPILLS: Record<string, readonly string[]> = {
  '/lab': PEEKING_TICKS,
  '/lab/peeking': PEEKING_TICKS,
  // The wide framework chart's zero-line word, in the right margin.
  '/work/audible': ['no change'],
};

