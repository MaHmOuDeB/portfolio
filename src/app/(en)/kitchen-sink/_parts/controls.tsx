'use client';

// The "Controls" section of the kitchen sink: Slider, Segmented and Reset in a fictional peeking
// demo, then each control at its minimum, maximum, every segment and disabled. Hover and keyboard
// focus are exercised by tests/e2e/kit.spec.ts; the segments stack below the xs breakpoint.
// Every number here is marked 'simulated'.
import { useState, useSyncExternalStore } from 'react';
import { derivedAttr } from '@/components/kit/Derived';
import { ResetButton } from '@/components/kit/ResetButton';
import { Segmented } from '@/components/kit/Segmented';
import { Slider } from '@/components/kit/Slider';
import { Specimen } from './Specimen';

const FIX_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'obf', label: "O'Brien-Fleming" },
  { value: 'cs', label: 'Confidence sequence' },
] as const;
type Fix = (typeof FIX_OPTIONS)[number]['value'];

const LOOKS = { min: 1, max: 50, step: 1 } as const;
const PRESET_LOOKS = 20;
const PRESET_FIX: Fix = 'none';
const looksText = (n: number) => `${n} looks`;
const REFS = ['simulated'] as const;
// The release line prints a number outside the Slider, so it carries its own marker.
const SIMULATED = derivedAttr(REFS);
const DISABLED_REASON_ID = 'sink-fix-disabled-reason';
const row = 'flex flex-wrap items-end gap-x-6 gap-y-4';
const noSubscription = () => () => {};
const sliderBox = 'w-full xs:w-80';

function Demo() {
  const [looks, setLooks] = useState<number>(PRESET_LOOKS);
  const [fix, setFix] = useState<Fix>(PRESET_FIX);
  const [released, setReleased] = useState<number | null>(null);
  // True once hydrated, so a test types, presses keys or drags only when the handlers are attached:
  // the controls show from the first paint (data-js-only), and an entry typed and blurred before
  // hydration is never clamped, since its blur ran before React was listening.
  const ready = useSyncExternalStore(noSubscription, () => true, () => false);
  return (
    <div data-figure="sink-controls" {...(ready ? { 'data-ready': '' } : {})}>
      <div className={row}>
        <div className={sliderBox}>
          <Slider
            id="sink-looks"
            label="Looks"
            {...LOOKS}
            value={looks}
            onChange={setLooks}
            onCommit={setReleased}
            valueText={looksText}
            refs={REFS}
          />
        </div>
        <Segmented name="sink-fix" legend="Fix" options={FIX_OPTIONS} value={fix} onChange={setFix} />
        <ResetButton
          onReset={() => {
            setLooks(PRESET_LOOKS);
            setFix(PRESET_FIX);
          }}
        />
      </div>
      <p data-released aria-live="polite" {...SIMULATED} className="mt-4 text-sm text-muted">
        {released === null ? 'Not released yet.' : `Released at ${looksText(released)}`}
      </p>
    </div>
  );
}

function LooksAt({ id, initial, disabled }: { id: string; initial: number; disabled?: boolean }) {
  const [looks, setLooks] = useState(initial);
  return (
    <div className={sliderBox}>
      <Slider
        id={id}
        label="Looks"
        {...LOOKS}
        value={looks}
        onChange={setLooks}
        valueText={looksText}
        refs={REFS}
        disabled={disabled}
      />
    </div>
  );
}

function FixAt({ name, initial, disabled, reasonId }: { name: string; initial: Fix; disabled?: boolean; reasonId?: string }) {
  const [fix, setFix] = useState<Fix>(initial);
  return (
    <Segmented name={name} legend="Fix" options={FIX_OPTIONS} value={fix} onChange={setFix} disabled={disabled} disabledReasonId={reasonId} />
  );
}

export function ControlsSection() {
  return (
    <>
      <Specimen
        id="controls--demo"
        title="Control row"
        note="A slider joined to a number input, a segmented choice and Reset, on a fictional peeking demo. Reset restores the preset."
      >
        <Demo />
      </Specimen>
      <Specimen id="controls--slider-min" title="Slider at its minimum" note="The active track is empty.">
        <LooksAt id="sink-looks-min" initial={LOOKS.min} />
      </Specimen>
      <Specimen id="controls--slider-max" title="Slider at its maximum" note="The active track is full.">
        <LooksAt id="sink-looks-max" initial={LOOKS.max} />
      </Specimen>
      <Specimen id="controls--slider-disabled" title="Slider, disabled" note="Both inputs are disabled.">
        <LooksAt id="sink-looks-disabled" initial={PRESET_LOOKS} disabled />
      </Specimen>
      <Specimen
        id="controls--segmented-each"
        title="Each segment selected"
        note="On a phone the segments stack as a list of choices. Words never break."
      >
        <div className={row}>
          {FIX_OPTIONS.map(({ value }) => (
            <FixAt key={value} name={`sink-fix-${value}`} initial={value} />
          ))}
        </div>
      </Specimen>
      <Specimen
        id="controls--segmented-disabled"
        title="Segmented, disabled"
        note="The whole group is disabled. The line under it says why, and describes the group for assistive technology."
      >
        <FixAt name="sink-fix-disabled" initial={PRESET_FIX} disabled reasonId={DISABLED_REASON_ID} />
        <p id={DISABLED_REASON_ID} className="mt-2 text-sm text-muted">
          One look at the end needs no fix.
        </p>
      </Specimen>
    </>
  );
}
