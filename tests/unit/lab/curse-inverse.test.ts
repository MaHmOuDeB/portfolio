// The winner's-curse Figure is set by power alone: the ratio of true effect to standard error that
// gives that power is found by bisection on retrodesign's own power, which rises strictly with the
// ratio. These tests hold the inverse to retrodesign at the reference points the statistician
// checked and on the whole slider grid.
import { describe, expect, it } from 'vitest';
import { CURSE_ALPHA, CURSE_PRESETS, CURSE_SCHEMA, curseModel, ratioForPower } from '@/lib/lab/diagnostics';
import { retrodesign } from '@/lib/stats';

const at = (power: number) => retrodesign({ trueEffect: ratioForPower(power), se: 1, alpha: CURSE_ALPHA });

describe('ratioForPower, the inverse of retrodesign power', () => {
  it('gives about ratio 1 at power 0.17: exaggeration 2.5 and a wrong sign 0.9% of the time', () => {
    expect(ratioForPower(0.17)).toBeCloseTo(0.9997, 3);
    expect(at(0.17).power).toBeCloseTo(0.17, 9);
    expect(at(0.17).exaggeration).toBeCloseTo(2.49, 2);
    expect(at(0.17).typeS).toBeCloseTo(0.0091, 4);
  });

  it('gives an exaggeration of about 3.71 at power 0.10, about 1.125 at 0.80 and about 1.006 at 0.99', () => {
    expect(at(0.1).exaggeration).toBeCloseTo(3.71, 2);
    expect(at(0.8).exaggeration).toBeCloseTo(1.125, 3);
    expect(at(0.99).exaggeration).toBeCloseTo(1.006, 3);
  });

  it('round-trips every power on the slider grid, and the ratio rises with power', () => {
    const { min, max, step } = CURSE_SCHEMA.power;
    let previous = 0;
    for (let i = 0; i <= Math.round((max - min) / step); i++) {
      const power = Number((min + i * step).toFixed(2));
      const ratio = ratioForPower(power);
      expect(ratio).toBeGreaterThan(previous);
      expect(retrodesign({ trueEffect: ratio, se: 1, alpha: CURSE_ALPHA }).power).toBeCloseTo(power, 9);
      previous = ratio;
    }
  });

  it('starts at a power under one half, so a win needs a reading well above the truth', () => {
    // The takeaway says a win needs "a lucky reading well above the truth": true only while the bar
    // (about 1.96 standard errors) is above the true effect, which holds while power is under 0.5.
    expect(CURSE_PRESETS.default.power).toBe(0.17);
    expect(CURSE_PRESETS.default.power).toBeLessThan(0.5);
    const model = curseModel(CURSE_PRESETS.default);
    if (model.kind !== 'result') throw new Error('expected a result');
    expect(model.ratio).toBeLessThan(1.96);
  });

  it('never throws on a value outside the range: it clamps to the slider ends', () => {
    expect(ratioForPower(0)).toBe(ratioForPower(CURSE_SCHEMA.power.min));
    expect(ratioForPower(1)).toBe(ratioForPower(CURSE_SCHEMA.power.max));
    expect(ratioForPower(Number.NaN)).toBe(ratioForPower(CURSE_PRESETS.default.power));
  });
});
