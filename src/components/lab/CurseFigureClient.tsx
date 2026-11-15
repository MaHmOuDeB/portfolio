'use client';

// The client side of the exaggeration Figure that the page loads at once, kept small (it reaches no
// statistics code; the island that does is fetched only when the loader renders it):
// - CurseFigureClient places the island: EagerOrIntent shows the server's preset Figure and loads
//   the island on intent, or right after hydration when the URL holds this Figure's keys.
// - CurseIsland is the lazy island.
// - CurseControls is the control row (how often the test clears the bar, Reset), shared by the
//   island and the preview. InertCurseControls is the preview's copy, with handlers that do nothing.
//
// `faultAfterChange` is a test seam: the island's chart throws on the first render after a change, so
// the error fallback can be tested in the browser. It is only ever forwarded here, never set; only a
// test host can set it.
import { lazy, type ReactNode } from 'react';
import { EagerOrIntent } from '@/components/figures/EagerOrIntent';
import { ResetButton } from '@/components/kit/ResetButton';
import { Slider } from '@/components/kit/Slider';
import { CURSE_ID, CURSE_LABELS, CURSE_SCHEMA, DIAGNOSTICS_REFS, powerTimeText, type CurseValues } from '@/lib/lab/diagnostics-values';
import type { CurseInteractiveProps } from './CurseInteractive';

const LazyCurse = lazy(() => import('./CurseInteractive'));

// The power is a proportion in the URL and the view, but its number box takes whole percents, as its
// readout says: typing "50" means 50%. The Slider works in percent and the caller divides by 100.
const toPercent = (share: number) => Math.round(share * 100);
const POWER_PERCENT = {
  min: toPercent(CURSE_SCHEMA.power.min),
  max: toPercent(CURSE_SCHEMA.power.max),
  step: toPercent(CURSE_SCHEMA.power.step),
};
const powerPercentText = (percent: number) => powerTimeText(percent / 100);

export function CurseIsland(props: CurseInteractiveProps) {
  return <LazyCurse {...props} />;
}

export type CurseControlsProps = {
  /** Normalized values. */
  values: CurseValues;
  onChange: (key: keyof CurseValues, value: number) => void;
  onCommit: (key: keyof CurseValues, value: number) => void;
  onReset: () => void;
};

export function CurseControls({ values, onChange, onCommit, onReset }: CurseControlsProps) {
  return (
    <div
      role="group"
      aria-labelledby={`${CURSE_ID}-title`}
      data-curse-controls=""
      className="flex flex-col gap-4 max-xs:w-full xs:flex-row xs:flex-wrap xs:items-end xs:gap-x-6"
    >
      <div className="w-full xs:w-96">
        <Slider
          id={`${CURSE_ID}-power`}
          label={CURSE_LABELS.power}
          {...POWER_PERCENT}
          value={toPercent(values.power)}
          onChange={(v) => onChange('power', v / 100)}
          onCommit={(v) => onCommit('power', v / 100)}
          valueText={powerPercentText}
          readout={powerPercentText}
          numberLabel={`${CURSE_LABELS.power}, percent`}
          refs={DIAGNOSTICS_REFS}
        />
      </div>
      <ResetButton onReset={onReset} />
    </div>
  );
}

const noop = () => {};

export function InertCurseControls({ values }: { values: CurseValues }) {
  return <CurseControls values={values} onChange={noop} onCommit={noop} onReset={noop} />;
}

export function CurseFigureClient({
  preview,
  faultAfterChange,
}: {
  /** The server's preset Figure: the static HTML, and what comes back if the island cannot load. */
  preview: ReactNode;
  faultAfterChange?: true;
}) {
  return (
    <EagerOrIntent ids={[CURSE_ID]} preview={preview}>
      <CurseIsland faultAfterChange={faultAfterChange} />
    </EagerOrIntent>
  );
}
