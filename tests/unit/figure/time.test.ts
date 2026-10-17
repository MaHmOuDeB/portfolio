import { afterEach, describe, expect, it } from 'vitest';
import { berlinDate, berlinTime, updatedLabel } from '@/lib/figure/time';

const originalTz = process.env.TZ;
afterEach(() => {
  if (originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = originalTz;
});

const CASES = () => ({
  dayBoundaryTime: berlinTime('2026-10-24T22:30:00Z'),
  dayBoundaryDate: berlinDate('2026-10-24T22:30:00Z'),
  dstTime: berlinTime('2026-03-29T01:30:00Z'),
  dstDate: berlinDate('2026-03-29T01:30:00Z'),
  winterTime: berlinTime('2026-01-15T08:05:00Z'),
  sameDay: updatedLabel('2026-07-01T12:05:00Z', '2026-07-01T20:00:00Z'),
  otherBerlinDay: updatedLabel('2026-10-24T21:30:00Z', '2026-10-24T22:30:00Z'),
});

describe('Berlin time', () => {
  it('rolls past midnight: 22:30Z on 24 Oct is 00:30 on 25.10 (CEST)', () => {
    expect(berlinTime('2026-10-24T22:30:00Z')).toBe('00:30');
    expect(berlinDate('2026-10-24T22:30:00Z')).toBe('25.10');
  });

  it('crosses the spring DST change: 01:30Z on 29 Mar is 03:30 CEST', () => {
    expect(berlinTime('2026-03-29T01:30:00Z')).toBe('03:30');
    expect(berlinDate('2026-03-29T01:30:00Z')).toBe('29.03');
  });

  it('uses CET in winter and pads to 24-hour hh:mm', () => {
    expect(berlinTime('2026-01-15T08:05:00Z')).toBe('09:05');
  });

  it('labels an update with the time only when the Berlin day is the same', () => {
    expect(updatedLabel('2026-07-01T12:05:00Z', '2026-07-01T20:00:00Z')).toBe('Updated 14:05');
  });

  it('adds the date when the Berlin day differs, even on the same UTC day', () => {
    expect(updatedLabel('2026-10-24T21:30:00Z', '2026-10-24T22:30:00Z')).toBe('Updated 24.10, 23:30');
  });

  it('is identical under TZ=UTC and TZ=America/New_York', () => {
    process.env.TZ = 'UTC';
    const inUtc = CASES();
    process.env.TZ = 'America/New_York';
    const inNewYork = CASES();
    expect(inNewYork).toEqual(inUtc);
  });

  it('rejects a string that is not a timestamp', () => {
    expect(() => berlinTime('not a date')).toThrow(TypeError);
  });
});
