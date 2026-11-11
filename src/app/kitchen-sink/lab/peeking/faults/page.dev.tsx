// Dev-only: the peeking Figure with its test seam set, so a browser spec can make the chart throw
// after a committed change and check the error fallback. Nothing in the production build imports
// this page (the fault-seam guard checks that), and it is built only with KITCHEN_SINK=1.
import type { Metadata } from 'next';
import { PeekingFigure } from '@/components/figures/PeekingFigure';

export const metadata: Metadata = {
  title: 'Lab host, failing peeking chart',
  robots: { index: false, follow: false },
};

export default function KitchenSinkLabPeekingFaults() {
  return (
    <div className="py-section">
      <h1 className="text-2xl font-semibold md:text-3xl">Lab host, failing peeking chart</h1>
      <p className="mt-3 max-w-text text-base text-muted">
        The chart here throws on the first render after a committed change. This page exists only in the test build.
      </p>
      <section data-host-section="peeking" aria-labelledby="host-peeking" className="mt-8">
        <h2 id="host-peeking" className="text-xl font-semibold">
          Peeking
        </h2>
        <div className="mt-6">
          <PeekingFigure faultAfterChange />
        </div>
      </section>
    </div>
  );
}
