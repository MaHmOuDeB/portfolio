// Dev-only, like the kitchen sink above it: the peeking Figure as the Lab's deep link mounts it, for
// the browser specs. There is no query switch in the components themselves. A query such as
// `?peeking.looks=50&peeking.mode=once` or `?peeking.preset=interview` is the Figure's own URL state,
// read as on the real page. The failing variant is on /kitchen-sink/lab/peeking/faults.
import type { Metadata } from 'next';
import { PeekingFigure } from '@/components/figures/PeekingFigure';

export const metadata: Metadata = {
  title: 'Lab host, peeking',
  robots: { index: false, follow: false },
};

export default function KitchenSinkLabPeeking() {
  return (
    <div className="py-section">
      <h1 className="text-2xl font-semibold md:text-3xl">Lab host, peeking</h1>
      <p className="mt-3 max-w-text text-base text-muted">
        The peeking Figure as the Lab&apos;s deep link shows it. This page exists only in the test build. All data on it
        is simulated.
      </p>
      <section data-host-section="peeking" aria-labelledby="host-peeking" className="mt-8">
        <h2 id="host-peeking" className="text-xl font-semibold">
          Peeking
        </h2>
        <div className="mt-6">
          <PeekingFigure />
        </div>
      </section>
    </div>
  );
}
