import { describe, expect, it } from 'vitest';
import { islandFallback } from '../e2e/island-fallback';

type Fake = Record<string, unknown>;
const visible = { getClientRects: () => [{}] };
const hidden = { getClientRects: () => [] };

/** A failed island inside a Figure, as the Home scroll moment has it: the Figure's table is outside the island. */
function insideFigure(island: { childElementCount: number; textContent: string; hasChart: boolean }): Element {
  const outer = {
    id: 'home-chart',
    querySelector: (q: string) => (q.includes('tbody tr') ? visible : q.includes('summary') ? visible : null),
  };
  return {
    childElementCount: island.childElementCount,
    textContent: island.textContent,
    querySelector: (q: string) => (q === 'figure[data-figure]' ? null : q.includes('svg') && island.hasChart ? visible : null),
    closest: () => outer,
  } as unknown as Element;
}

describe('the failed-island check', () => {
  it('passes an island inside its Figure that still holds its chart', () => {
    expect(islandFallback(insideFigure({ childElementCount: 1, textContent: '', hasChart: true })).ok).toBe(true);
  });

  it('fails an island inside its Figure whose fallback is empty', () => {
    const empty = islandFallback(insideFigure({ childElementCount: 0, textContent: '', hasChart: false }));
    expect(empty).toMatchObject({ kind: 'inside its Figure', ok: false });
  });

  it('fails an island with wrapper elements but no chart and no text', () => {
    expect(islandFallback(insideFigure({ childElementCount: 2, textContent: '  \n ', hasChart: false })).ok).toBe(false);
  });

  it('still fails when the Figure has no rows', () => {
    const island = insideFigure({ childElementCount: 1, textContent: '', hasChart: true }) as unknown as Fake;
    island.closest = () => ({ id: 'x', querySelector: () => null });
    expect(islandFallback(island as unknown as Element).ok).toBe(false);
  });

  it('checks an island that holds its Figure by its open table', () => {
    const table = { ...visible, querySelector: () => visible };
    const holds = (t: unknown) =>
      ({ querySelector: (q: string) => (q === 'figure[data-figure]' ? { id: 'f' } : t) }) as unknown as Element;
    expect(islandFallback(holds(table))).toMatchObject({ kind: 'holds its Figure', ok: true });
    expect(islandFallback(holds({ ...hidden, querySelector: () => hidden })).ok).toBe(false);
  });
});
