'use client';

// The client side of the Pulse dashboard Figure that the page loads at once, kept small:
// - PulseFigureClient places the island: EagerOrIntent shows the server's preset Figure and loads the
//   island on intent, or right after hydration when the URL holds this Figure's keys.
// - PulseIsland is the lazy island; its code (the URL hook, the bus, the session and the view) is
//   fetched only when the loader renders it.
// - PulseControls is the Figure's one control row, shared by the island and the preview: Channel,
//   Date range and Reset. The range options are the source's own labels, so they carry its ref.
//   InertPulseControls is the preview's copy, with handlers that do nothing.
//
// `faultAfterChange` is a test seam: the island's charts throw on the first render after a committed
// change, so the error fallback can be tested in the browser. It is only ever forwarded here, never
// set; only a test host can set it.
import { lazy, type ReactNode } from 'react';
import { EagerOrIntent } from '@/components/figures/EagerOrIntent';
import { derivedAttr } from '@/components/kit/Derived';
import { ResetButton } from '@/components/kit/ResetButton';
import { Segmented } from '@/components/kit/Segmented';
import { CHANNELS, PULSE_ID, RANGES, type ChannelValue, type DashboardView, type RangeValue } from '@/lib/pulse/dashboard';
import { PULSE_TAXONOMY_REFS } from '@/lib/pulse/names';
import type { PulseTaxonomyRow } from '@/lib/pulse/taxonomy';
import type { PulseInteractiveProps } from './PulseInteractive';

const LazyPulse = lazy(() => import('./PulseInteractive'));

export function PulseIsland(props: PulseInteractiveProps) {
  return <LazyPulse {...props} />;
}

const RANGE_OPTIONS = RANGES.map((range) => ({ value: range, label: range }));

export type PulseControlsProps = {
  view: DashboardView;
  onChannel: (channel: ChannelValue) => void;
  onRange: (range: RangeValue) => void;
  onReset: () => void;
};

export function PulseControls({ view, onChannel, onRange, onReset }: PulseControlsProps) {
  return (
    <>
      <Segmented name={`${PULSE_ID}-channel`} legend="Channel" options={CHANNELS} value={view.channel} onChange={onChannel} />
      <div {...derivedAttr(PULSE_TAXONOMY_REFS)} className="max-xs:w-full">
        <Segmented name={`${PULSE_ID}-range`} legend="Date range" options={RANGE_OPTIONS} value={view.range} onChange={onRange} />
      </div>
      <ResetButton id={`${PULSE_ID}-reset`} onReset={onReset} />
    </>
  );
}

const noop = () => {};

export function InertPulseControls({ view }: { view: DashboardView }) {
  return <PulseControls view={view} onChannel={noop} onRange={noop} onReset={noop} />;
}

export function PulseFigureClient({
  taxonomy,
  preview,
  faultAfterChange,
}: {
  /** The export's event rows, read on the server: the island's bus accepts exactly these events. */
  taxonomy: readonly PulseTaxonomyRow[];
  /** The server's preset Figure: the static HTML, and what comes back if the island cannot load. */
  preview: ReactNode;
  faultAfterChange?: true;
}) {
  return (
    <EagerOrIntent ids={[PULSE_ID]} preview={preview}>
      <PulseIsland taxonomy={taxonomy} faultAfterChange={faultAfterChange} />
    </EagerOrIntent>
  );
}
