// Dev-only: the Pulse dashboard Figure with its test seam set, so a browser spec can make the charts
// throw after a change and check the error fallback. Nothing in the production build imports this
// page (the fault-seam guard checks that), and it is built only with KITCHEN_SINK=1.
import type { Metadata } from 'next';
import { PulseFigure } from '@/components/pulse/PulseFigure';

export const metadata: Metadata = {
  title: 'Pulse dashboard host, failing charts',
  robots: { index: false, follow: false },
};

export default function KitchenSinkPulseFaults() {
  return (
    <div className="py-section">
      <h1 className="text-2xl font-semibold md:text-3xl">Pulse dashboard host, failing charts</h1>
      <p className="mt-3 max-w-text text-base text-muted">
        The charts here throw on the first render after the channel or the range changes. This page exists only in the test
        build.
      </p>
      <div className="mt-8">
        <PulseFigure faultAfterChange />
      </div>
    </div>
  );
}
