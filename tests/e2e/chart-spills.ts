// The chart labels that may run past their chart's box, pinned per route. Every chart label sits
// inside its svg's padding (CLAUDE.md, "Chart labels never sit on marks"), and the quality matrix
// fails any label past the box, except the ones listed here. The list is empty: the chart frame sizes
// its gutter and margin from real label widths, so no label spills. A new spill fails until it is
// fixed; an entry here needs a reason and a review.
export const KIT_CHART_SPILLS: Record<string, readonly string[]> = {};
