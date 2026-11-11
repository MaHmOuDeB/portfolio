'use client';

// The client side of the exaggeration Figure that the page loads at once, kept small (it reaches no
// statistics code; the island that does is fetched only when the loader renders it):
// - CurseFigureClient places the island: EagerOrIntent shows the server's preset Figure and loads
//   the island on intent, or right after hydration when the URL holds this Figure's keys.
// - CurseIsland is the lazy island.
// - CurseControls is the control row (the true effect, the standard error, Reset), shared by the
//   island and the preview. InertCurseControls is the preview's copy, with handlers that do nothing.
//
// `faultAfterChange` is a test seam: the island's chart throws on the first render after a change, so
// the error fallback can be tested in the browser. It is only ever forwarded here, never set; only a
// test host can set it.
import { lazy, type ReactNode } from 'react';
import { EagerOrIntent } from '@/components/figures/EagerOrIntent';
import { ResetButton } from '@/components/kit/ResetButton';
import { Slider } from '@/components/kit/Slider';
import { CURSE_ID, CURSE_SCHEMA, DIAGNOSTICS_REFS, unitsText, type CurseValues } from '@/lib/lab/diagnostics-values';
import type { CurseInteractiveProps } from './CurseInteractive';

const LazyCurse = lazy(() => import('./CurseInteractive'));

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
  const slider = (key: keyof CurseValues, label: string) => (
    <div className="w-full xs:w-64">
      <Slider
        id={`${CURSE_ID}-${key}`}
        label={label}
        {...CURSE_SCHEMA[key]}
        value={values[key]}
        onChange={(v) => onChange(key, v)}
        onCommit={(v) => onCommit(key, v)}
        valueText={(v) => `${unitsText(v)} units`}
        refs={DIAGNOSTICS_REFS}
      />
    </div>
  );
  return (
    <div
      role="group"
      aria-labelledby={`${CURSE_ID}-title`}
      data-curse-controls=""
      className="flex flex-col gap-4 max-xs:w-full xs:flex-row xs:flex-wrap xs:items-end xs:gap-x-6"
    >
      {slider('trueEffect', 'True effect')}
      {slider('se', 'Standard error')}
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
