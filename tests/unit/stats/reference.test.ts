import { ref } from './reference';

describe('stats reference data', () => {
  it('has the repo preset (baseline 0.29, MDE 0.05, alpha 0.05, power 0.8) at 1353 per arm', () => {
    const preset = ref.sampleSize.find(
      (c) => c.baseline === 0.29 && c.mde === 0.05 && c.alpha === 0.05 && c.power === 0.8,
    );
    expect(preset?.n).toBe(1353);
  });
});
