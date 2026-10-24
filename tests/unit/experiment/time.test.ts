import fc from 'fast-check';
import { EXPERIMENT, type ExperimentConfig } from '@/experiment.values';
import { addMonthsBerlin, berlinDay, berlinDaysBetween, berlinStartOfDay, plannedEnd } from '@/lib/experiment/time';

const withAbStart = (startedOn: string): ExperimentConfig => ({ ...EXPERIMENT, ab: { ...EXPERIMENT.ab, startedOn } });

describe('berlinDay', () => {
  it('gives the Berlin calendar day across the October 2026 clocks-back night', () => {
    expect(berlinDay('2026-10-24T21:59:00Z')).toBe('2026-10-24');
    expect(berlinDay('2026-10-24T22:30:00Z')).toBe('2026-10-25');
    expect(berlinDay('2026-10-25T00:59:00Z')).toBe('2026-10-25');
    expect(berlinDay('2026-10-25T01:00:00Z')).toBe('2026-10-25');
    expect(berlinDay('2026-10-25T22:59:00Z')).toBe('2026-10-25');
    expect(berlinDay('2026-10-25T23:30:00Z')).toBe('2026-10-26');
  });

  it('gives the Berlin calendar day across the March 2026 and March 2027 clocks-forward nights', () => {
    expect(berlinDay('2026-03-28T22:59:00Z')).toBe('2026-03-28');
    expect(berlinDay('2026-03-28T23:00:00Z')).toBe('2026-03-29');
    expect(berlinDay('2026-03-29T21:59:00Z')).toBe('2026-03-29');
    expect(berlinDay('2026-03-29T22:00:00Z')).toBe('2026-03-30');
    expect(berlinDay('2027-03-27T23:30:00Z')).toBe('2027-03-28');
  });

  it('reads any offset, not only Z', () => {
    expect(berlinDay('2026-10-25T00:30:00+02:00')).toBe('2026-10-25');
    expect(berlinDay('2026-10-24T18:30:00-05:00')).toBe('2026-10-25');
  });
});

describe('berlinStartOfDay', () => {
  it('writes Berlin midnight with that day’s offset on the 2026 transition days', () => {
    expect(berlinStartOfDay('2026-03-28')).toBe('2026-03-28T00:00:00+01:00');
    expect(berlinStartOfDay('2026-03-29')).toBe('2026-03-29T00:00:00+01:00');
    expect(berlinStartOfDay('2026-03-30')).toBe('2026-03-30T00:00:00+02:00');
    expect(berlinStartOfDay('2026-10-25')).toBe('2026-10-25T00:00:00+02:00');
    expect(berlinStartOfDay('2026-10-26')).toBe('2026-10-26T00:00:00+01:00');
  });

  it.each(['2026-13-01', '2026-02-29', '2026-10-32', '2026-1-01', '26-10-01', '2026-10-25T00:00:00Z', ''])('throws a TypeError for %j', (day) => {
    expect(() => berlinStartOfDay(day)).toThrow(TypeError);
  });

  it('is the first instant of its own Berlin day (property)', () => {
    const instants = fc.date({ min: new Date('2020-01-01T00:00:00Z'), max: new Date('2035-12-31T00:00:00Z'), noInvalidDate: true });
    fc.assert(
      fc.property(instants, (d) => {
        const iso = d.toISOString();
        const day = berlinDay(iso);
        const start = berlinStartOfDay(day);
        expect(berlinDay(start)).toBe(day);
        expect(Date.parse(start)).toBeLessThanOrEqual(d.getTime());
        expect(berlinDay(new Date(Date.parse(start) - 1).toISOString())).not.toBe(day);
        expect(berlinDaysBetween(start, iso)).toBe(0);
      }),
    );
  });
});

describe('addMonthsBerlin', () => {
  it('clamps to the end of a shorter month and lands on the start of the Berlin day', () => {
    expect(addMonthsBerlin('2026-08-31T10:00:00+02:00', 6)).toBe('2027-02-28T00:00:00+01:00');
    expect(addMonthsBerlin('2027-01-31T12:00:00+01:00', 1)).toBe('2027-02-28T00:00:00+01:00');
    expect(addMonthsBerlin('2027-08-31T12:00:00+02:00', 6)).toBe('2028-02-29T00:00:00+01:00');
    expect(addMonthsBerlin('2026-10-31T12:00:00+01:00', 1)).toBe('2026-11-30T00:00:00+01:00');
  });

  it('starts from the Berlin day, not the UTC day', () => {
    expect(addMonthsBerlin('2026-10-24T23:30:00Z', 6)).toBe('2027-04-25T00:00:00+02:00');
  });

  it('crosses a year end and lands on a transition day with that day’s offset', () => {
    expect(addMonthsBerlin('2026-09-29T09:00:00+02:00', 6)).toBe('2027-03-29T00:00:00+02:00');
    expect(addMonthsBerlin('2026-04-25T09:00:00+02:00', 6)).toBe('2026-10-25T00:00:00+02:00');
    expect(addMonthsBerlin('2026-11-15T09:00:00+01:00', 0)).toBe('2026-11-15T00:00:00+01:00');
  });

  it('rejects a month count that is not an integer', () => {
    expect(() => addMonthsBerlin('2026-10-24T10:00:00Z', 1.5)).toThrow(RangeError);
    expect(() => addMonthsBerlin('2026-10-24T10:00:00Z', Number.NaN)).toThrow(RangeError);
  });
});

describe('berlinDaysBetween', () => {
  it('counts whole Berlin calendar days, across the clocks-back night', () => {
    expect(berlinDaysBetween('2026-10-24T22:30:00Z', '2026-11-07T23:30:00Z')).toBe(14);
    // 23 and 25 hour days still count as one day each.
    expect(berlinDaysBetween('2026-10-25T00:00:00+02:00', '2026-10-26T00:00:00+01:00')).toBe(1);
    expect(berlinDaysBetween('2026-03-29T00:00:00+01:00', '2026-03-30T00:00:00+02:00')).toBe(1);
    expect(berlinDaysBetween('2026-03-15T12:00:00+01:00', '2026-11-15T12:00:00+01:00')).toBe(245);
  });

  it('is 0 within a day and negative backwards', () => {
    expect(berlinDaysBetween('2026-10-25T00:00:00+02:00', '2026-10-25T23:59:00+01:00')).toBe(0);
    expect(berlinDaysBetween('2026-11-07T12:00:00Z', '2026-10-24T12:00:00Z')).toBe(-14);
  });
});

describe('plannedEnd (Decision 13)', () => {
  it('is the earliest end while there is no A/B start: calibration start + 14 days + 6 months', () => {
    expect(EXPERIMENT.ab.startedOn).toBeNull();
    expect(plannedEnd(EXPERIMENT, '2026-11-02T00:00:00+01:00')).toEqual({ at: '2027-05-16T00:00:00+02:00', kind: 'earliest' });
  });

  it('is the fixed end once the A/B has started: A/B start + 6 months, clamped', () => {
    expect(plannedEnd(withAbStart('2026-08-31T10:00:00+02:00'), '2026-08-01T00:00:00+02:00')).toEqual({
      at: '2027-02-28T00:00:00+01:00',
      kind: 'fixed',
    });
  });
});

describe('a timestamp without an offset', () => {
  it('throws a TypeError everywhere, because it would be read in the machine’s timezone', () => {
    const local = '2026-10-25T00:30:00';
    expect(() => berlinDay(local)).toThrow(TypeError);
    expect(() => berlinDay('2026-10-25')).toThrow(TypeError);
    expect(() => berlinDay('not a date')).toThrow(TypeError);
    expect(() => addMonthsBerlin(local, 6)).toThrow(TypeError);
    expect(() => berlinDaysBetween(local, '2026-10-25T00:30:00Z')).toThrow(TypeError);
    expect(() => berlinDaysBetween('2026-10-25T00:30:00Z', local)).toThrow(TypeError);
    expect(() => plannedEnd(EXPERIMENT, local)).toThrow(TypeError);
    expect(() => plannedEnd(withAbStart(local), '2026-11-02T00:00:00+01:00')).toThrow(TypeError);
  });
});
