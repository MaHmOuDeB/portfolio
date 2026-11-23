'use client';

// The client side of the returns Figure that the page loads at once, kept small:
// - ReturnsFigureClient places the island: EagerOrIntent shows the server's preset Figure and loads
//   the island on intent, or right after hydration when the URL holds this Figure's keys.
// - ReturnsIsland is the lazy island; its code (the URL hook, the chart, the facts) is fetched only
//   when the loader renders it.
// - ReturnsControls is the control row, in a group named by the Figure's title, shared by the island
//   and the preview. InertReturnsControls is the preview's copy, with handlers that do nothing. Every
//   control has the same id in both (the radios `returns-mode-<mode>`, Reset `returns-reset`), so the
//   loader hands a keyboard visitor's focus from the preview's control to the island's.
//
// `faultAfterChange` is a test seam: the island's chart throws on the first render after a mode
// change, so the error fallback can be tested in the browser. It is only ever forwarded here, never
// set; only a test host can set it.
import { lazy, type ReactNode } from 'react';
import { EagerOrIntent } from '@/components/figures/EagerOrIntent';
import { ResetButton } from '@/components/kit/ResetButton';
import { Segmented } from '@/components/kit/Segmented';
import { RETURNS_ID, type RetailMonth, type ReturnMode, type ReturnsEvidence } from '@/lib/retention/returns';
import { EN_RETURNS, type ReturnsText } from '@/lib/retention/text';
import type { ReturnsInteractiveProps } from './ReturnsInteractive';

const LazyReturns = lazy(() => import('./ReturnsInteractive'));

export function ReturnsIsland(props: ReturnsInteractiveProps) {
  return <LazyReturns {...props} />;
}

export function ReturnsControls({
  mode,
  onMode,
  onReset,
  text = EN_RETURNS,
}: {
  mode: ReturnMode;
  onMode: (mode: ReturnMode) => void;
  onReset: () => void;
  text?: ReturnsText;
}) {
  const options: readonly { value: ReturnMode; label: string }[] = [
    { value: 'raw', label: text.mode.raw },
    { value: 'clean', label: text.mode.clean },
  ];
  return (
    <div
      role="group"
      aria-labelledby={`${RETURNS_ID}-title`}
      data-returns-controls=""
      className="flex flex-col gap-4 max-xs:w-full xs:flex-row xs:flex-wrap xs:items-end xs:gap-x-6"
    >
      <Segmented name={`${RETURNS_ID}-mode`} legend={text.mode.legend} options={options} value={mode} onChange={onMode} />
      <ResetButton id={`${RETURNS_ID}-reset`} onReset={onReset} label={text.kit.reset} />
    </div>
  );
}

const noop = () => {};

export function InertReturnsControls({ mode, text }: { mode: ReturnMode; text?: ReturnsText }) {
  return <ReturnsControls mode={mode} onMode={noop} onReset={noop} text={text} />;
}

export function ReturnsFigureClient({
  preview,
  data,
  evidence,
  faultAfterChange,
  text,
}: {
  /** The server's preset Figure: the static HTML, and what comes back if the island cannot load. */
  preview: ReactNode;
  /** The monthly rows the chart plots, the only data the island receives. */
  data: readonly RetailMonth[];
  evidence: ReturnsEvidence;
  faultAfterChange?: true;
  /** The Figure's words, handed over for a language other than English only (English is the default). */
  text?: ReturnsText;
}) {
  return (
    <EagerOrIntent ids={[RETURNS_ID]} preview={preview}>
      <ReturnsIsland data={data} evidence={evidence} faultAfterChange={faultAfterChange} text={text} />
    </EagerOrIntent>
  );
}
