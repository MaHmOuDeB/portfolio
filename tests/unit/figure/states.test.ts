import { describe, expect, it } from 'vitest';
import {
  DATA_AMOUNTS,
  LIVE_PHASES,
  MIN_PER_GROUP,
  RUNTIMES,
  dataAmount,
  resolveFigureBody,
  type DataAmount,
  type FigureBody,
  type Freshness,
  type LiveAxes,
  type LivePhase,
} from '@/lib/figure/states';

// Every body, written out so the compiler fails when FigureBody gains or loses a member.
const BODIES = {
  default: true,
  error: true,
  paused: true,
  'srm-suppressed': true,
  'aa-failed': true,
  'ship-b': true,
  'stop-for-harm': true,
  inconclusive: true,
  'low-data': true,
  calibration: true,
  ab: true,
} as const satisfies Record<FigureBody, true>;

const FRESH: Freshness = { kind: 'fresh' };
const STALE: Freshness = { kind: 'stale', updatedAt: '2026-10-24T22:30:00Z', renderedAt: '2026-10-25T08:00:00Z' };
const PAUSED: Freshness = { kind: 'paused', pausedOn: '2026-10-20T09:00:00Z', reason: 'a fictional reason' };
const FRESHNESS = [FRESH, STALE, PAUSED] as const;

const live = (phase: LivePhase, data: DataAmount, freshness: Freshness = FRESH): LiveAxes => ({ phase, data, freshness });

// An independent oracle for the order of precedence in src/lib/figure/states.ts: the first rule that applies wins.
function expected(runtime: string, axes: LiveAxes): FigureBody {
  if (runtime === 'error') return 'error';
  if (axes.freshness.kind === 'paused') return 'paused';
  for (const phase of ['srm-suppressed', 'aa-failed', 'ship-b', 'stop-for-harm', 'inconclusive'] as const) {
    if (axes.phase === phase) return phase;
  }
  if (axes.data === 'low-data' || axes.phase === 'before-data') return 'low-data';
  return axes.phase as 'calibration' | 'ab';
}

describe('the axes', () => {
  it('lists every phase, amount of data and forced runtime once', () => {
    expect(LIVE_PHASES).toEqual([
      'before-data',
      'calibration',
      'aa-failed',
      'ab',
      'inconclusive',
      'ship-b',
      'stop-for-harm',
      'srm-suppressed',
    ]);
    expect(DATA_AMOUNTS).toEqual(['low-data', 'enough-data']);
    expect(RUNTIMES).toEqual(['default', 'no-js', 'error']);
    expect(MIN_PER_GROUP).toBe(50);
  });
});

describe('dataAmount', () => {
  it('needs 50 views in the smaller group', () => {
    expect(dataAmount(49, 500)).toBe('low-data');
    expect(dataAmount(500, 49)).toBe('low-data');
    expect(dataAmount(50, 50)).toBe('enough-data');
    expect(dataAmount(0, 0)).toBe('low-data');
  });

  it('reads a count it cannot trust as low data, never as enough', () => {
    expect(dataAmount(Number.NaN, 500)).toBe('low-data');
    expect(dataAmount(500, Number.NaN)).toBe('low-data');
    expect(dataAmount(-5, 500)).toBe('low-data');
    expect(dataAmount(Number.POSITIVE_INFINITY, 50)).toBe('enough-data');
  });
});

describe('resolveFigureBody', () => {
  it('is the default view with no live axes and no error', () => {
    expect(resolveFigureBody({})).toBe('default');
    expect(resolveFigureBody({ runtime: 'default' })).toBe('default');
    expect(resolveFigureBody({ runtime: 'no-js' })).toBe('default');
    expect(resolveFigureBody({ runtime: 'error' })).toBe('error');
  });

  it('puts an error above everything, a paused test even above an outcome', () => {
    expect(resolveFigureBody({ runtime: 'error', live: live('ship-b', 'enough-data', PAUSED) })).toBe('error');
    expect(resolveFigureBody({ live: live('srm-suppressed', 'enough-data', PAUSED) })).toBe('paused');
    expect(resolveFigureBody({ live: live('ship-b', 'enough-data', PAUSED) })).toBe('paused');
  });

  it('puts a failed split check above a failed calibration', () => {
    // A phase is one value, so srm-suppressed and aa-failed never apply at once; the order still
    // holds against everything below them.
    expect(resolveFigureBody({ live: live('srm-suppressed', 'low-data') })).toBe('srm-suppressed');
    expect(resolveFigureBody({ live: live('aa-failed', 'low-data', STALE) })).toBe('aa-failed');
  });

  it('shows an outcome even with low data, and low data over the normal view', () => {
    expect(resolveFigureBody({ live: live('ship-b', 'low-data') })).toBe('ship-b');
    expect(resolveFigureBody({ live: live('stop-for-harm', 'low-data') })).toBe('stop-for-harm');
    expect(resolveFigureBody({ live: live('inconclusive', 'low-data') })).toBe('inconclusive');
    expect(resolveFigureBody({ live: live('ab', 'low-data') })).toBe('low-data');
    expect(resolveFigureBody({ live: live('calibration', 'low-data') })).toBe('low-data');
  });

  it('resolves before-data with enough data, which cannot occur, to low data', () => {
    expect(resolveFigureBody({ live: live('before-data', 'enough-data') })).toBe('low-data');
  });

  it('treats no-js and stale as modifiers that never set the body', () => {
    expect(resolveFigureBody({ live: live('calibration', 'enough-data', STALE) })).toBe('calibration');
    expect(resolveFigureBody({ runtime: 'no-js', live: live('ab', 'enough-data', STALE) })).toBe('ab');
  });

  it('gives a body for all 144 combinations, matching the order of precedence', () => {
    let count = 0;
    for (const runtime of RUNTIMES) {
      for (const phase of LIVE_PHASES) {
        for (const data of DATA_AMOUNTS) {
          for (const freshness of FRESHNESS) {
            const axes = live(phase, data, freshness);
            const body = resolveFigureBody({ runtime, live: axes });
            expect(Object.hasOwn(BODIES, body), `${runtime} ${phase} ${data} ${freshness.kind}`).toBe(true);
            expect(body, `${runtime} ${phase} ${data} ${freshness.kind}`).toBe(expected(runtime, axes));
            count += 1;
          }
        }
      }
    }
    expect(count).toBe(144);
  });

  it('reaches every body', () => {
    const reached = new Set<FigureBody>([resolveFigureBody({})]);
    for (const runtime of RUNTIMES) {
      for (const phase of LIVE_PHASES) {
        for (const data of DATA_AMOUNTS) {
          for (const freshness of FRESHNESS) reached.add(resolveFigureBody({ runtime, live: live(phase, data, freshness) }));
        }
      }
    }
    expect([...reached].sort()).toEqual(Object.keys(BODIES).sort());
  });
});
