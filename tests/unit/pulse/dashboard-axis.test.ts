// The value axis of each Pulse chart: zero to a round top that fits the view's own rows, so a
// filtered view (one channel over 7d) fills its chart instead of lying flat near the bottom.
import { describe, expect, it } from 'vitest';
import { niceTicks } from '@/lib/figure/scales';
import { CHANNELS, CHARTS, RANGES, chartTop, dashboardRows } from '@/lib/pulse/dashboard';

describe('chartTop', () => {
  for (const { value: channel } of CHANNELS) {
    for (const range of RANGES) {
      for (const { key } of CHARTS) {
        it(`${key} for ${channel} over ${range}: from zero to the first wide tick at or above the busiest day`, () => {
          const view = { channel, range };
          const max = Math.max(...dashboardRows(view).map((r) => r[key]));
          const top = chartTop(key, view);
          expect(top).toBeGreaterThanOrEqual(max);
          // A round top: it is the last wide tick of its own axis, and no tick step is left empty above the data.
          const ticks = niceTicks([0, top], 4);
          expect(ticks.at(-1)).toBe(top);
          expect(top - max).toBeLessThan(ticks[1]! - ticks[0]!);
        });
      }
    }
  }

  it('fits a single channel over 7d tighter than all channels over 90d', () => {
    expect(chartTop('sign_ups', { channel: 'email', range: '7d' })).toBeLessThan(chartTop('sign_ups', { channel: 'all', range: '90d' }));
  });
});
