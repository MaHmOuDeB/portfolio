'use client';

// The Slider on a step that does not end: a fictional "rise to detect" shown as a percent of a 29%
// baseline, so one step is one whole point, 100 / 29 percent. The number input shows one decimal
// (numberText) while the value keeps every digit; tests/e2e/kit.spec.ts steps it with the arrow keys
// and types grid values as a browser prints them. Every number here is marked 'simulated'.
import { useState, useSyncExternalStore } from 'react';
import { derivedAttr } from '@/components/kit/Derived';
import { Slider } from '@/components/kit/Slider';
import { formatNumber } from '@/lib/figure/format';
import { Specimen } from './Specimen';

const POINT = 100 / 29;
const RISE = { min: POINT, max: 25 * POINT, step: POINT } as const;
const PRESET = 5 * POINT;
const REFS = ['simulated'] as const;
const SIMULATED = derivedAttr(REFS);
const noSubscription = () => () => {};
const riseText = (v: number) => `${formatNumber(v, 1)}% of the baseline`;

function PercentRise() {
  const [rise, setRise] = useState(PRESET);
  const [released, setReleased] = useState<number | null>(null);
  // True once hydrated, so a test steps the number input only when its handlers are attached.
  const ready = useSyncExternalStore(noSubscription, () => true, () => false);
  return (
    <div {...(ready ? { 'data-ready': '' } : {})}>
      <div className="w-full xs:w-80">
        <Slider
          id="sink-rise"
          label="Rise to detect"
          {...RISE}
          value={rise}
          onChange={setRise}
          onCommit={setReleased}
          valueText={riseText}
          readout={riseText}
          numberText={(v) => formatNumber(v, 1)}
          numberLabel="Rise to detect, percent of the baseline"
          refs={REFS}
        />
      </div>
      <p data-released aria-live="polite" {...SIMULATED} className="mt-4 text-sm text-muted">
        {released === null ? 'Not released yet.' : `Released at ${riseText(released)}`}
      </p>
    </div>
  );
}

export function SliderStepsSection() {
  return (
    <Specimen
      id="slider-steps--percent"
      title="Slider on a step that does not end"
      note="A rise shown as a percent of a fictional baseline: one step is one whole point. The number input shows one decimal; the arrow keys move one step at once."
    >
      <PercentRise />
    </Specimen>
  );
}
