'use client';

// The client side of the peeking Figure that the page loads at once, kept small:
// - PeekingFigureClient places the island: EagerOrIntent shows the server's preset Figure and loads
//   the island on intent, or right after hydration when the URL holds this Figure's keys.
// - PeekingIsland is the lazy island; its code (the URL hook, the model and its precomputed table)
//   is fetched only when the loader renders it. This file imports the client-safe values only, never
//   the model (tests/unit/lab/peeking-bundle.test.ts).
// - PeekingControls is the control row, in a group named by the Figure's title, shared by the island
//   and the preview: Looks, Schedule, Fix and Reset. Looking once disables Fix and says why; the
//   line holding the reason keeps its room while it is hidden, so the row never moves.
//   InertPeekingControls is the preview's copy, with handlers that do nothing.
//
// `faultAfterChange` is a test seam: the island's chart throws on the first render after a committed
// change, so the error fallback can be tested in the browser. It is only ever forwarded here, never
// set; only a test host can set it.
import { lazy, type ReactNode } from 'react';
import { EagerOrIntent } from '@/components/figures/EagerOrIntent';
import { ResetButton } from '@/components/kit/ResetButton';
import { Segmented } from '@/components/kit/Segmented';
import { Slider } from '@/components/kit/Slider';
import { cx } from '@/lib/cx';
import type { PeekView } from '@/lib/lab/peeking';
import {
  FIX_OPTIONS,
  MODE_OPTIONS,
  ONCE_FIX_REASON,
  PEEK_SCHEMA,
  PEEK_UI_REFS,
  looksReadout,
  looksValueText,
  type PeekParams,
} from '@/lib/lab/peeking-values';
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
  onMode: (mode: PeekParams['mode']) => void;
  onFix: (fix: PeekParams['fix']) => void;
  onReset: () => void;
};

export function PeekingControls({ id, values, onLooks, onLooksCommit, onMode, onFix, onReset }: PeekingControlsProps) {
  const once = values.mode === 'once';
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
          label="Looks"
          min={PEEK_SCHEMA.looks.min}
          max={PEEK_SCHEMA.looks.max}
          step={PEEK_SCHEMA.looks.step}
          value={values.looks}
          onChange={onLooks}
          onCommit={onLooksCommit}
          valueText={(v) => looksValueText(v, values.mode)}
          readout={looksReadout}
          refs={PEEK_UI_REFS}
        />
      </div>
      <Segmented name={`${id}-mode`} legend="Schedule" options={MODE_OPTIONS} value={values.mode} onChange={onMode} />
      <Segmented name={`${id}-fix`} legend="Fix" options={FIX_OPTIONS} value={values.fix} onChange={onFix} disabled={once} />
      <ResetButton onReset={onReset} />
      <p data-peek-fix-reason="" className={cx('w-full text-sm text-muted', once ? undefined : 'invisible')} aria-hidden={once ? undefined : true}>
        {ONCE_FIX_REASON}
      </p>
    </div>
  );
}

const noop = () => {};

export function InertPeekingControls({ id, values }: { id: string; values: PeekParams }) {
  return (
    <PeekingControls id={id} values={values} onLooks={noop} onLooksCommit={noop} onMode={noop} onFix={noop} onReset={noop} />
  );
}

export function PeekingFigureClient({
  id,
  preview,
  initial,
  faultAfterChange,
}: {
  id: string;
  /** The server's preset Figure: the static HTML, and what comes back if the island cannot load. */
  preview: ReactNode;
  /** The preset's view, so the island's first render needs no lookup. */
  initial: PeekView;
  faultAfterChange?: true;
}) {
  return (
    <EagerOrIntent ids={[id]} preview={preview}>
      <PeekingIsland id={id} initial={initial} faultAfterChange={faultAfterChange} />
    </EagerOrIntent>
  );
}
