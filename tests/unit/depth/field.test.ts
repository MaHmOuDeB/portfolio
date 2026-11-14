import { describe, expect, it } from 'vitest';
import { fieldRows } from '@/lib/depth/field';

describe('fieldRows', () => {
  const rows = fieldRows();

  it('makes 26 rows by default and as many as asked', () => {
    expect(rows).toHaveLength(26);
    expect(fieldRows(5)).toHaveLength(5);
    expect(fieldRows(0)).toEqual([]);
  });

  it('has exact values for rows 0, 1 and 25', () => {
    expect(rows[0]).toMatchObject({ i: 0, top: 0 });
    expect(rows[0]!.width).toBeCloseTo(527.0463, 3);
    expect(rows[0]!.shift).toBeCloseTo(13.4511, 3);
    expect(rows[1]).toMatchObject({ i: 1, top: 20 });
    expect(rows[1]!.width).toBeCloseTo(372.678, 3);
    expect(rows[1]!.shift).toBeCloseTo(6.8235, 3);
    expect(rows[25]).toMatchObject({ i: 25, top: 500 });
    expect(rows[25]!.width).toBeCloseTo(103.3623, 3);
    expect(rows[25]!.shift).toBeCloseTo(33.5526, 3);
  });

  it('narrows monotonically from far to near', () => {
    for (let k = 1; k < rows.length; k++) expect(rows[k]!.width).toBeLessThan(rows[k - 1]!.width);
  });

  it('never yields NaN or infinity, and is deterministic', () => {
    for (const r of rows) for (const v of Object.values(r)) expect(Number.isFinite(v)).toBe(true);
    expect(fieldRows()).toEqual(rows);
  });
});
