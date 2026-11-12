'use client';

// The client side of the ship-rule Figure that the page loads at once, kept small:
// - FrameworkFigureClient places the island: EagerOrIntent shows the server's preset Figure and loads
//   the island on intent, or right after hydration when the URL holds this Figure's keys.
// - FrameworkIsland is the lazy island; its code (the URL hook and the view) is fetched only when the
//   loader renders it.
// - FrameworkControls is the control row, in a group named by the Figure's title, shared by the
//   island and the preview: three bounds and Reset. InertFrameworkControls is the preview's copy,
//   with handlers that do nothing.
//
// `faultAfterChange` is a test seam: the island's chart throws on the first render after a committed
// change, so the error fallback can be tested in the browser. It is only ever forwarded here, never
// set; only a test host can set it.
import { lazy, type ReactNode } from 'react';
import { EagerOrIntent } from '@/components/figures/EagerOrIntent';
import { ResetButton } from '@/components/kit/ResetButton';
import { Slider } from '@/components/kit/Slider';
import type { FrameworkValues } from '@/lib/audible/framework';
import { FRAMEWORK_ID, FRAMEWORK_SCHEMA } from '@/lib/audible/framework-url';
import { formatSignedPoints } from '@/lib/figure/format';
import type { FrameworkInteractiveProps } from './FrameworkInteractive';

const LazyFramework = lazy(() => import('./FrameworkInteractive'));

export function FrameworkIsland(props: FrameworkInteractiveProps) {
  return <LazyFramework {...props} />;
}

type Bound = 'primaryLower' | 'primaryUpper' | 'guardrailUpper';

/** Each slider: its URL key (the element id's suffix), the value it moves and its label. */
const SLIDERS: readonly { key: keyof typeof FRAMEWORK_SCHEMA; bound: Bound; label: string }[] = [
  { key: 'lower', bound: 'primaryLower', label: 'Session completion, lower end' },
  { key: 'upper', bound: 'primaryUpper', label: 'Session completion, upper end' },
  { key: 'guardrail', bound: 'guardrailUpper', label: 'Help requests, upper end' },
];

const points = (v: number) => formatSignedPoints(v, 1);

export type FrameworkControlsProps = {
  /** Normalized values. */
  values: FrameworkValues;
  onBound: (bound: Bound, value: number) => void;
  onCommit: (bound: Bound, value: number) => void;
  onReset: () => void;
};

export function FrameworkControls({ values, onBound, onCommit, onReset }: FrameworkControlsProps) {
  return (
    <div
      role="group"
      aria-labelledby={`${FRAMEWORK_ID}-title`}
      data-framework-controls=""
      className="flex flex-col gap-4 max-xs:w-full xs:flex-row xs:flex-wrap xs:items-end xs:gap-x-6"
    >
      {SLIDERS.map(({ key, bound, label }) => {
        const spec = FRAMEWORK_SCHEMA[key];
        return (
          <div key={key} className="w-full xs:w-72">
            <Slider
              id={`${FRAMEWORK_ID}-${key}`}
              label={label}
              min={spec.min}
              max={spec.max}
              step={spec.step}
              value={values[bound]}
              onChange={(v) => onBound(bound, v)}
              onCommit={(v) => onCommit(bound, v)}
              valueText={(v) => `${points(v)} percentage points`}
              readout={(v) => `${points(v)} points`}
              numberText={(v) => v.toFixed(1)}
              refs={['simulated']}
            />
          </div>
        );
      })}
      <ResetButton onReset={onReset} />
    </div>
  );
}

const noop = () => {};

export function InertFrameworkControls({ values }: { values: FrameworkValues }) {
  return <FrameworkControls values={values} onBound={noop} onCommit={noop} onReset={noop} />;
}

export function FrameworkFigureClient({
  initial,
  preview,
  faultAfterChange,
}: {
  /** The preset's values, so the island's first render needs no lookup. */
  initial: FrameworkValues;
  /** The server's preset Figure: the static HTML, and what comes back if the island cannot load. */
  preview: ReactNode;
  faultAfterChange?: true;
}) {
  return (
    <EagerOrIntent ids={[FRAMEWORK_ID]} preview={preview}>
      <FrameworkIsland initial={initial} faultAfterChange={faultAfterChange} />
    </EagerOrIntent>
  );
}
