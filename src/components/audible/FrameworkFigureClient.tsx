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
import { CONTROL_ROW, CONTROL_ROW_RESET } from '../figures/control-row';
import { Slider } from '@/components/kit/Slider';
import type { FrameworkValues } from '@/lib/audible/framework';
import { FRAMEWORK_ID, FRAMEWORK_SCHEMA } from '@/lib/audible/framework-url';
import { EN_FRAMEWORK, type FrameworkText } from '@/lib/audible/text';
import { formatSignedPoints } from '@/lib/figure/format';
import { fill } from '@/lib/i18n/template';
import type { FrameworkInteractiveProps } from './FrameworkInteractive';

const LazyFramework = lazy(() => import('./FrameworkInteractive'));

export function FrameworkIsland(props: FrameworkInteractiveProps) {
  return <LazyFramework {...props} />;
}

type Bound = 'primaryLower' | 'primaryUpper' | 'guardrailUpper';

/**
 * Each slider: its URL key (the element id's suffix) and the value it moves; its label and the hint
 * under it, which says in plain words what that end of a range stands for, come from the words.
 */
const SLIDERS: readonly { key: keyof typeof FRAMEWORK_SCHEMA; bound: Bound }[] = [
  { key: 'lower', bound: 'primaryLower' },
  { key: 'upper', bound: 'primaryUpper' },
  { key: 'guardrail', bound: 'guardrailUpper' },
];

export type FrameworkControlsProps = {
  /** Normalized values. */
  values: FrameworkValues;
  onBound: (bound: Bound, value: number) => void;
  onCommit: (bound: Bound, value: number) => void;
  onReset: () => void;
  /** The control row's words; English when absent. */
  text?: FrameworkText;
};

export function FrameworkControls({ values, onBound, onCommit, onReset, text = EN_FRAMEWORK }: FrameworkControlsProps) {
  const points = (v: number) => formatSignedPoints(v, 1, { locale: text.kit.locale });
  return (
    <div
      role="group"
      aria-labelledby={`${FRAMEWORK_ID}-title`}
      data-framework-controls=""
      className={CONTROL_ROW}
    >
      {SLIDERS.map(({ key, bound }) => {
        const spec = FRAMEWORK_SCHEMA[key];
        const { label, hint } = text.sliders[key];
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
              valueText={(v) => fill(text.valueText, { value: points(v) })}
              readout={(v) => fill(text.readout, { value: points(v), hint })}
              numberText={(v) => v.toFixed(1)}
              refs={['simulated']}
              text={text.kit.slider}
            />
          </div>
        );
      })}
      <div className={CONTROL_ROW_RESET}>
        <ResetButton onReset={onReset} label={text.kit.reset} />
      </div>
    </div>
  );
}

const noop = () => {};

export function InertFrameworkControls({ values, text }: { values: FrameworkValues; text?: FrameworkText }) {
  return <FrameworkControls values={values} onBound={noop} onCommit={noop} onReset={noop} text={text} />;
}

export function FrameworkFigureClient({
  initial,
  preview,
  faultAfterChange,
  text,
}: {
  /** The preset's values, so the island's first render needs no lookup. */
  initial: FrameworkValues;
  /** The server's preset Figure: the static HTML, and what comes back if the island cannot load. */
  preview: ReactNode;
  faultAfterChange?: true;
  /** The Figure's words, handed over only for a language other than English. */
  text?: FrameworkText;
}) {
  return (
    <EagerOrIntent ids={[FRAMEWORK_ID]} preview={preview}>
      {text ? (
        <FrameworkIsland initial={initial} faultAfterChange={faultAfterChange} text={text} />
      ) : (
        <FrameworkIsland initial={initial} faultAfterChange={faultAfterChange} />
      )}
    </EagerOrIntent>
  );
}
