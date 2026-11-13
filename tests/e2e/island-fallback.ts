// What a failed island (LoadOnIntent, data-island="failed") shows, as the failed-islands check in
// remaining-truth.spec.ts reads it. The function runs in the page (Playwright serializes it), so it
// must stay self-contained: no imports, no helpers from this module. tests/unit/island-fallback.test.ts
// runs it against hand-made elements.
export type IslandFallback = { figure: string; kind: 'holds its Figure' | 'inside its Figure'; ok: boolean };

export function islandFallback(island: Element): IslandFallback {
  const shown = (e: Element | null) => e !== null && e.getClientRects().length > 0;
  const own = island.querySelector('figure[data-figure]');
  if (own !== null) {
    const table = island.querySelector('[data-nojs-only] table');
    return { figure: own.id, kind: 'holds its Figure', ok: shown(table) && shown(table?.querySelector('tbody tr') ?? null) };
  }
  // An island inside a Figure (the Home scroll moment's charts) holds only the chart: the Figure's own
  // table, outside the island, keeps its rows and its visible disclosure. The island itself must still
  // hold the chart's preview, so an island that fell back to nothing does not pass.
  const outer = island.closest('figure[data-figure]');
  const rows = outer?.querySelector('[data-figure-tables] table tbody tr') ?? null;
  const toggle = outer?.querySelector('[data-figure-tables] summary') ?? null;
  const holdsPreview = island.childElementCount > 0 && ((island.textContent ?? '').trim() !== '' || island.querySelector('svg, table, img') !== null);
  return { figure: outer?.id ?? '(none)', kind: 'inside its Figure', ok: outer !== null && rows !== null && shown(toggle) && holdsPreview };
}
