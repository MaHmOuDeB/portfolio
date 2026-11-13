// How wide a chart label can be, for room computed on the server, where text is not measured: the
// chart frame's gutters and the column widths below which it hides an annotation or anchors an outer
// tick label. Too short an estimate pushes a label past its box; so each character counts as an upper
// bound of its advance in Inter, the site font, over the chart text styles (13 px regular with and
// without tabular figures, 15 px semibold), rounded up to 0.02 em. tests/unit/figure/label-width.test.ts
// checks the table against the font file's measured advances and a list of the label strings the charts use.

/** Characters by the upper bound of their advance, in em. */
const ADVANCE_EM: ReadonlyArray<readonly [string, number]> = [
  ['W', 1.02],
  ['%@', 1],
  ['…', 0.96],
  ['M', 0.92],
  ['m', 0.9],
  ['w', 0.84],
  ['OQ', 0.78],
  ['GHNU', 0.76],
  ['ACDV', 0.74],
  ['KXY', 0.72],
  ['α', 0.7],
  ['4&+<=>~×−≈≤≥€', 0.68],
  ['012356789#$*-BPRSTZ√', 0.66],
  ['bdgpq£', 0.64],
  ['Ehnouβ', 0.62],
  ['Fcevy', 0.6],
  ['JLakxz', 0.58],
  ['?s', 0.56],
  ['"', 0.52],
  ['–₀', 0.5],
  ['^_', 0.48],
  ['{}₂₋', 0.46],
  ['()[]fr', 0.4],
  ['/\\', 0.38],
  ['`t|', 0.36],
  ["';₁", 0.34],
  ['!,.:', 0.32],
  [' l ’', 0.3],
  ['I', 0.28],
  ['ij', 0.26],
];

/**
 * Any character the table does not list counts as the widest one. That bounds only glyphs in the
 * font's own latin set: a character drawn in a system fallback font (CJK, an arrow) could be wider,
 * so a new label with such a character must be measured and added to the table above. The unit test
 * fails for a label string that uses a character the table does not hold.
 */
const WIDEST_EM = 1.02;

const ADVANCE = new Map<string, number>(ADVANCE_EM.flatMap(([chars, em]) => [...chars].map((c) => [c, em] as const)));

/** The advance bound of one character, in em. */
export function advanceEm(char: string): number {
  return ADVANCE.get(char) ?? WIDEST_EM;
}

/** An upper bound of the width of `text`, in px, at a font size of `fontPx`. */
export function labelWidth(text: string, fontPx: number): number {
  let em = 0;
  for (const c of text) em += advanceEm(c);
  return em * fontPx;
}
