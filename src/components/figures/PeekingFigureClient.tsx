'use client';

// The client side of the peeking Figure that the page loads at once, kept small:
// - PeekingFigureClient places the island: EagerOrIntent shows the server's preset Figure and loads
//   the island on intent, or right after hydration when the URL holds this Figure's keys.
// - PeekingIsland is the lazy island; its code (the URL hook, the model and its precomputed table)
//   is fetched only when the loader renders it. This file imports the client-safe values only, never
//   the model (tests/unit/lab/peeking-bundle.test.ts).
// - PeekingControls is the control row, in a group named by the Figure's title, shared by the island
//   and the preview: Days checked, Fix and Reset. The Figure checks daily; the check-once rate is in
//   the method row. InertPeekingControls is the preview's copy, with handlers that do nothing.
//
// `faultAfterChange` is a test seam: the island's chart throws on the first render after a committed
// change, so the error fallback can be tested in the browser. It is only ever forwarded here, never
// set; only a test host can set it.
import { lazy, type ReactNode } from 'react';
import { EagerOrIntent } from '@/components/figures/EagerOrIntent';
import { ResetButton } from '@/components/kit/ResetButton';
import { Segmented } from '@/components/kit/Segmented';
import { Slider } from '@/components/kit/Slider';
import type { PeekView } from '@/lib/lab/peeking';
import { PEEK_SCHEMA, PEEK_UI_REFS, fixOptions, looksReadout, looksValueText, type PeekParams } from '@/lib/lab/peeking-values';
import { EN_PEEK, type PeekText } from '@/lib/lab/text-peek';
import type { PeekingInteractiveProps } from './PeekingInteractive';

const LazyPeeking = lazy(() => import('./PeekingInteractive'));

export function PeekingIsland(props: PeekingInteractiveProps) {
  return <LazyPeeking {...props} />;
}

export type PeekingControlsProps = {
  id: string;
  /** Normalized values. */
  values: PeekParams;
  onLooks: (looks: number) => void;
  onLooksCommit: (looks: number) => void;
  onFix: (fix: PeekParams['fix']) => void;
  onReset: () => void;
  /** The controls' words; English when absent. */
  text?: PeekText;
};

export function PeekingControls({ id, values, onLooks, onLooksCommit, onFix, onReset, text = EN_PEEK }: PeekingControlsProps) {
  return (
    <div
      role="group"
      aria-labelledby={`${id}-title`}
      data-peek-controls=""
      className="flex flex-col gap-4 max-xs:w-full xs:flex-row xs:flex-wrap xs:items-end xs:gap-x-6"
    >
      <div className="w-full xs:w-96">
        <Slider
          id={`${id}-looks`}
          label={text.labels.looks}
          min={PEEK_SCHEMA.looks.min}
          max={PEEK_SCHEMA.looks.max}
          step={PEEK_SCHEMA.looks.step}
          value={values.looks}
          onChange={onLooks}
          onCommit={onLooksCommit}
          valueText={(looks) => looksValueText(looks, text)}
          readout={(looks) => looksReadout(looks, text)}
          refs={PEEK_UI_REFS}
          text={text.kit.slider}
        />
      </div>
      <Segmented name={`${id}-fix`} legend={text.labels.fix} options={fixOptions(text)} value={values.fix} onChange={onFix} />
      <ResetButton onReset={onReset} label={text.kit.reset} />
    </div>
  );
}

const noop = () => {};

export function InertPeekingControls({ id, values, text }: { id: string; values: PeekParams; text?: PeekText }) {
  return (
    <PeekingControls id={id} values={values} onLooks={noop} onLooksCommit={noop} onFix={noop} onReset={noop} text={text} />
  );
}

export function PeekingFigureClient({
  id,
  preview,
  initial,
  faultAfterChange,
  text,
}: {
  id: string;
  /** The server's preset Figure: the static HTML, and what comes back if the island cannot load. */
  preview: ReactNode;
  /** The preset's view, so the island's first render needs no lookup. */
  initial: PeekView;
  faultAfterChange?: true;
  /** The Figure's words, handed over for a language other than English only (English is the default). */
  text?: PeekText;
}) {
  return (
    <EagerOrIntent ids={[id]} preview={preview}>
      {text ? (
        <PeekingIsland id={id} initial={initial} faultAfterChange={faultAfterChange} text={text} />
      ) : (
        <PeekingIsland id={id} initial={initial} faultAfterChange={faultAfterChange} />
      )}
    </EagerOrIntent>
  );
}
