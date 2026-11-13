'use client';

// The client side of the split-check Figure that the page loads at once, kept small (it reaches no
// statistics code; the island that does is fetched only when the loader renders it):
// - SrmFigureClient places the island: EagerOrIntent shows the server's preset Figure and loads the
//   island on intent, or right after hydration when the URL holds this Figure's keys.
// - SrmIsland is the lazy island.
// - SrmControls is the control row (two counts, the expected share, Reset), shared by the island
//   and the preview. InertSrmControls is the preview's copy, with handlers that do nothing.
//
// `faultAfterChange` is a test seam: the island's chart throws on the first render after a change, so
// the error fallback can be tested in the browser. It is only ever forwarded here, never set; only a
// test host can set it.
import { lazy, type ReactNode } from 'react';
import { EagerOrIntent } from '@/components/figures/EagerOrIntent';
import { ResetButton } from '@/components/kit/ResetButton';
import { Slider } from '@/components/kit/Slider';
import { CONTROL_ROW, CONTROL_ROW_RESET } from '../figures/control-row';
import { DIAGNOSTICS_REFS, SRM_ID, SRM_SCHEMA, sharePercentText, visitorsText, type SrmValues } from '@/lib/lab/diagnostics-values';
import type { SrmInteractiveProps } from './SrmInteractive';

const LazySrm = lazy(() => import('./SrmInteractive'));

export function SrmIsland(props: SrmInteractiveProps) {
  return <LazySrm {...props} />;
}

export type SrmControlsProps = {
  /** Normalized values. */
  values: SrmValues;
  onChange: (key: keyof SrmValues, value: number) => void;
  onCommit: (key: keyof SrmValues, value: number) => void;
  onReset: () => void;
};

export function SrmControls({ values, onChange, onCommit, onReset }: SrmControlsProps) {
  const slider = (key: keyof SrmValues, label: string, valueText: (v: number) => string, readout?: (v: number) => string) => (
    <div className="w-full xs:w-64">
      <Slider
        id={`${SRM_ID}-${key}`}
        label={label}
        {...SRM_SCHEMA[key]}
        value={values[key]}
        onChange={(v) => onChange(key, v)}
        onCommit={(v) => onCommit(key, v)}
        valueText={valueText}
        readout={readout}
        refs={DIAGNOSTICS_REFS}
      />
    </div>
  );
  return (
    <div
      role="group"
      aria-labelledby={`${SRM_ID}-title`}
      data-srm-controls=""
      className={CONTROL_ROW}
    >
      {slider('nA', 'Group A visitors', visitorsText)}
      {slider('nB', 'Group B visitors', visitorsText)}
      {slider('shareA', 'Expected share in group A', (v) => `${sharePercentText(v)} of visitors expected in group A`, sharePercentText)}
      <div className={CONTROL_ROW_RESET}>
        <ResetButton onReset={onReset} />
      </div>
    </div>
  );
}

const noop = () => {};

export function InertSrmControls({ values }: { values: SrmValues }) {
  return <SrmControls values={values} onChange={noop} onCommit={noop} onReset={noop} />;
}

export function SrmFigureClient({
  preview,
  faultAfterChange,
}: {
  /** The server's preset Figure: the static HTML, and what comes back if the island cannot load. */
  preview: ReactNode;
  faultAfterChange?: true;
}) {
  return (
    <EagerOrIntent ids={[SRM_ID]} preview={preview}>
      <SrmIsland faultAfterChange={faultAfterChange} />
    </EagerOrIntent>
  );
}
