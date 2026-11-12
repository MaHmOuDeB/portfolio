// The next-step sentence of the Live test page: nextStepFor is its only producer. A decision says
// counting has stopped only when the stop is confirmed (a stored marker, or the planned end passed);
// a derived decision whose marker is not written yet says the result is being confirmed. A dated
// next step uses only a date that is actually configured and still ahead. Every other state has none.
import { describe, expect, it } from 'vitest';
import { FIXTURE_START, type ExperimentConfig } from '@/experiment.config';
import { NO_FLAGS, type ExperimentFlags } from '@/lib/experiment/flags';
import { createMemoryRedis } from '@/lib/experiment/memory-redis';
import type { ExperimentSnapshot } from '@/lib/experiment/snapshot';
import { plannedEnd } from '@/lib/experiment/time';
import { FIXTURE_AB, FIXTURE_CALIBRATION, buildFixture, snapshotFixture } from '@/lib/home/fixtures';
import type { HomeMode } from '@/lib/home/model';
import { NARRATIVE_FIXTURES, narrativeFixture } from '@/lib/home/narrative-fixtures';
import { toLivePageModel } from '@/lib/live-page/model';
import { CLOSED_STEP, CONFIRMING_STEP, nextStepFor } from '@/lib/live-page/next-step';
import { AB_NOW, CAL_NOW, SHIP_B, mark, read, seed } from './reader';

const configOf = (s: ExperimentSnapshot): ExperimentConfig => (s.configPhase === 'ab' ? FIXTURE_AB : FIXTURE_CALIBRATION);
const step = (s: ExperimentSnapshot) => nextStepFor(toLivePageModel(s, { commit: null }, configOf(s)));
const END = plannedEnd(FIXTURE_AB, FIXTURE_START).at;

describe('nextStepFor: exact outputs', () => {
  it('pins the two decision sentences', () => {
    expect(CLOSED_STEP).toBe('Counting has stopped; later looks change nothing.');
    expect(CONFIRMING_STEP).toBe('The test has reached its decision; the result is being confirmed. The first decision is final, so later looks change nothing.');
  });

  it.each(['ship-b', 'stop-for-harm', 'inconclusive'] as const)('%s with a stored stop: counting has stopped', (mode) => {
    const s = snapshotFixture(mode, { closed: { kind: 'decision', day: '2026-12-01' } });
    const m = toLivePageModel(s, { commit: null }, FIXTURE_AB);
    expect(m.home.closedConfirmed).toBe(true);
    expect(nextStepFor(m)).toEqual({ text: CLOSED_STEP, refs: m.home.refs });
  });

  it('a matching stored decision (the real reader): counting has stopped', async () => {
    const redis = createMemoryRedis();
    await seed(redis, FIXTURE_AB.namespace, SHIP_B);
    await mark(redis, FIXTURE_AB.namespace, 'decision', '2026-12-01');
    const s = await read(redis, { config: FIXTURE_AB, now: AB_NOW });
    expect(s.status).toBe('ship-b');
    expect(step(s)?.text).toBe(CLOSED_STEP);
  });

  it('inconclusive past the planned end: confirmed by the end itself', () => {
    const s = snapshotFixture('inconclusive');
    expect(Date.parse(s.readAt)).toBeGreaterThan(Date.parse(END));
    expect(step(s)?.text).toBe(CLOSED_STEP);
  });

  it('a derived ship B with no stored marker yet (the real reader): being confirmed', async () => {
    const redis = createMemoryRedis();
    await seed(redis, FIXTURE_AB.namespace, SHIP_B);
    const s = await read(redis, { config: FIXTURE_AB, now: AB_NOW });
    const m = toLivePageModel(s, { commit: null }, FIXTURE_AB);
    expect(m.home).toMatchObject({ mode: 'ship-b', closed: null, closedConfirmed: false });
    expect(nextStepFor(m)).toEqual({ text: CONFIRMING_STEP, refs: m.home.refs });
  });

  it.each(['ship-b', 'stop-for-harm'] as const)('%s derived, not stored: being confirmed', (mode) => {
    expect(step(snapshotFixture(mode))?.text).toBe(CONFIRMING_STEP);
  });

  it('a failed calibration with a configured restart date still ahead', () => {
    const rows = [{ day: '2026-11-03', a: { entry: 30, inview: 20 }, b: { entry: 30, inview: 20 } }];
    const flags = (restartsOn?: string): ExperimentFlags => ({
      ...NO_FLAGS,
      aaFailed: { on: '2026-11-06T09:00:00+01:00', reason: 'a script error dropped some views', ...(restartsOn ? { restartsOn } : {}) },
    });
    const at = (f: ExperimentFlags) => step(buildFixture({ config: FIXTURE_CALIBRATION, now: CAL_NOW, flags: f, rows }));
    expect(at(flags('2026-12-01T00:00:00+01:00'))).toEqual({ text: 'The calibration restarts on {date}.', date: '2026-12-01T00:00:00+01:00', refs: ['build'] });
    // No date set, or a date already past: no restart is promised.
    expect(at(flags())).toBeNull();
    expect(at(flags('2026-11-15T00:00:00+01:00'))).toBeNull();
  });

  it('a ready calibration with a configured A/B start still ahead', () => {
    const ready = narrativeFixture('calibration-ready');
    const withStart = (abStartedOn: string | undefined) => ({ ...ready, live: { ...ready.live, ...(abStartedOn ? { abStartedOn } : {}) } });
    expect(step(withStart('2026-12-01T00:00:00+01:00'))).toEqual({ text: 'The A/B test starts on {date}.', date: '2026-12-01T00:00:00+01:00', refs: ['build'] });
    expect(step(withStart(undefined))).toBeNull();
    expect(step(withStart('2026-11-10T00:00:00+01:00'))).toBeNull();
    // Not ready: no start is announced, whatever is configured.
    const notReady = { ...withStart('2026-12-01T00:00:00+01:00'), calibration: { ...ready.calibration!, ready: false } };
    expect(step(notReady)).toBeNull();
  });
});

describe('nextStepFor: none while counting is open, or in any other state', () => {
  const NONE_MODES: HomeMode[] = ['not-started', 'closure-check', 'unavailable', 'settings-unreadable', 'held', 'srm-suppressed', 'aa-failed', 'paused', 'before-data', 'calibration', 'ab'];

  it.each(NONE_MODES)('%s: null', (mode) => {
    expect(step(snapshotFixture(mode))).toBeNull();
  });

  it.each(NARRATIVE_FIXTURES.filter((n) => !['ship-b-confirmed', 'ship-b-late-srm', 'calibration-ready', 'final-low'].includes(n)))('%s: null', (name) => {
    const s = narrativeFixture(name);
    const m = toLivePageModel(s, { commit: null }, configOf(s));
    expect(m.home.outcome).toBeNull();
    expect(nextStepFor(m)).toBeNull();
  });

  it('the stale, suppressed, blinded and running fixtures say nothing about a next step', () => {
    for (const s of [narrativeFixture('stale'), snapshotFixture('srm-suppressed'), narrativeFixture('ab-under-50'), snapshotFixture('ab'), snapshotFixture('calibration')]) {
      expect(step(s)).toBeNull();
    }
  });

  it('a final decision that a pause overrides gives no next step', () => {
    expect(step(narrativeFixture('paused-ship-b'))).toBeNull();
  });
});
