import { ref } from './reference';

describe('stats reference data', () => {
  it('has the repo preset (baseline 0.29, MDE 0.05, alpha 0.05, power 0.8) at 1353 per arm', () => {
    const preset = ref.sampleSize.find(
      (c) => c.baseline === 0.29 && c.mde === 0.05 && c.alpha === 0.05 && c.power === 0.8,
    );
    expect(preset?.n).toBe(1353);
  });
});

describe('stats reference data structure', () => {
  const topLevel = [
    'detectableEffect',
    'detectableEffectCs',
    'detectableEffectCsUndetectable',
    'meta',
    'mixtureCs',
    'mixtureRatio',
    'newcombe',
    'normalCdf',
    'normalQuantile',
    'obf',
    'peeking',
    'retrodesign',
    'sampleSize',
    'sfc32',
    'srm',
    'wilson',
    'ztest',
  ];

  it('has every top-level key, each non-empty', () => {
    expect(Object.keys(ref).sort()).toEqual(topLevel);
    for (const key of topLevel) {
      const value = (ref as unknown as Record<string, unknown>)[key];
      const size = Array.isArray(value) ? value.length : Object.keys(value as object).length;
      expect(size, key).toBeGreaterThan(0);
    }
  });

  it('has one OBF constant per look count, 1 to 60', () => {
    expect(Object.keys(ref.obf)).toHaveLength(60);
    for (let k = 1; k <= 60; k += 1) expect(ref.obf[String(k)], `K=${k}`).toBeDefined();
  });

  it('has normalCdf values inside [0, 1]', () => {
    for (const [x, value] of ref.normalCdf) {
      expect(Number.isFinite(x)).toBe(true);
      expect(value, `Phi(${x})`).toBeGreaterThanOrEqual(0);
      expect(value, `Phi(${x})`).toBeLessThanOrEqual(1);
    }
  });
});
