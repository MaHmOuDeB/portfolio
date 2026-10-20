import { describe, expect, it } from 'vitest';
import { FRESHNESS, FRESHNESS_KINDS, liveFixture } from '@/app/kitchen-sink/_parts/live-fixtures';
import { shownSeries } from '@/lib/figure/cs-band';
import { DATA_AMOUNTS, LIVE_PHASES } from '@/lib/figure/states';
import { srmTest } from '@/lib/stats';

// The sink's fictional snapshots must be possible ones: a reader who checks them finds no
// contradiction between a verdict and its counts, or between two dates.
const all = LIVE_PHASES.flatMap((phase) => DATA_AMOUNTS.map((data) => ({ phase, data, s: liveFixture(phase, data, 'fresh') })));
const months = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / (30.44 * 86_400_000);

describe('live fixtures', () => {
  it('fail the split check exactly when their state says so (p < 0.001)', () => {
    for (const { phase, data, s } of all) {
      if (phase === 'before-data') continue;
      const { p } = srmTest(s.nA, s.nB);
      const failed = phase === 'srm-suppressed' || phase === 'aa-failed';
      expect(p < 0.001, `${phase} ${data}: ${s.nA} against ${s.nB}, p = ${p}`).toBe(failed);
    }
  });

  it('have no views at all before data', () => {
    for (const data of DATA_AMOUNTS) {
      const s = liveFixture('before-data', data, 'fresh');
      expect([s.nA, s.nB, s.series.length]).toEqual([0, 0, 0]);
    }
  });

  it('run the A/B test to the six-month cap, and keep the pause and the restart in order', () => {
    const ab = liveFixture('ab', 'low-data', 'fresh');
    expect(months(ab.abStartedOn!, ab.plannedEnd)).toBeGreaterThan(5.9);
    expect(months(ab.abStartedOn!, ab.plannedEnd)).toBeLessThan(6.1);
    const failed = liveFixture('aa-failed', 'enough-data', 'fresh').aaFailed!;
    expect(Date.parse(failed.restartsOn)).toBeGreaterThan(Date.parse(failed.on));
    const paused = FRESHNESS.paused;
    if (paused.kind !== 'paused') throw new Error('expected a pause');
    // The pause began after the A/B start and after the A/A failure, and the A/A restart is later still.
    expect(Date.parse(paused.pausedOn)).toBeGreaterThan(Date.parse(ab.abStartedOn!));
    expect(Date.parse(paused.pausedOn)).toBeGreaterThan(Date.parse(failed.on));
    expect(Date.parse(failed.restartsOn)).toBeGreaterThan(Date.parse(paused.pausedOn));
    expect(FRESHNESS_KINDS).toContain('paused');
  });

  it('never put the "your view" tick after the last look, nor a look past the current counts', () => {
    for (const { phase, data, s } of all) {
      const shown = shownSeries(s);
      const last = shown[shown.length - 1];
      if (s.yourViewN !== undefined) expect(s.yourViewN, `${phase} ${data}`).toBeLessThanOrEqual(last!.n);
      for (const p of shown) {
        expect(p.n, `${phase} ${data}`).toBeLessThanOrEqual(Math.min(s.nA, s.nB));
        expect(p.nA!, `${phase} ${data}`).toBeLessThanOrEqual(s.nA);
        expect(p.nB!, `${phase} ${data}`).toBeLessThanOrEqual(s.nB);
        expect(Math.min(p.nA!, p.nB!)).toBe(p.n);
      }
    }
  });
});
