// The kitchen-sink demo Figure's parameters and its control row: a fictional sign-up page, with
// the baseline conversion as a slider and the power as a segmented choice. Shared and light (no
// statistics, no chart), so the inert copy in the preview (islands.tsx) loads without the island.
// Every number here is marked 'simulated'.
import { derivedAttr } from '@/components/kit/Derived';
import { ResetButton } from '@/components/kit/ResetButton';
import { Segmented } from '@/components/kit/Segmented';
import { Slider } from '@/components/kit/Slider';
import type { ParamValues, Presets } from '@/lib/figure/url-state';

export const SCHEMA = {
  baseline: { kind: 'number', min: 0.05, max: 0.5, step: 0.01 },
  power: { kind: 'enum', values: ['0.8', '0.9'] },
} as const;
export type DemoValues = ParamValues<typeof SCHEMA>;
export const PRESETS: Presets<typeof SCHEMA> = { default: { baseline: 0.1, power: '0.8' } };

export const REFS = ['simulated'] as const;
const SIMULATED = derivedAttr(REFS);

const POWER_OPTIONS = [
  { value: '0.8', label: '80%' },
  { value: '0.9', label: '90%' },
] as const;

const baselineText = (v: number) => `${Math.round(v * 100)}% of visitors sign up`;

export type DemoControlsProps = {
  id: string;
  values: DemoValues;
  onBaseline: (v: number) => void;
  /** Slider release: when the result is announced. */
  onBaselineCommit: (v: number) => void;
  onPower: (v: DemoValues['power']) => void;
  onReset: () => void;
};

export function DemoControls({ id, values, onBaseline, onBaselineCommit, onPower, onReset }: DemoControlsProps) {
  return (
    <>
      <div className="w-full xs:w-80">
        <Slider
          id={`${id}-baseline`}
          label="Baseline conversion"
          {...SCHEMA.baseline}
          value={values.baseline}
          onChange={onBaseline}
          onCommit={onBaselineCommit}
          valueText={baselineText}
          readout={(v) => `${Math.round(v * 100)}%`}
          refs={REFS}
        />
      </div>
      {/* The segment labels are percentages, so the group carries the marker. */}
      <div {...SIMULATED}>
        <Segmented name={`${id}-power`} legend="Power" options={POWER_OPTIONS} value={values.power} onChange={onPower} />
      </div>
      <ResetButton onReset={onReset} />
    </>
  );
}
