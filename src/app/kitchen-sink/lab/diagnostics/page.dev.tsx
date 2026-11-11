// Dev-only, like the kitchen sink above it: the Lab's two diagnostics for the browser specs, as a page
// will mount them. There is no query switch in the components themselves. A query such as
// `?srm.nA=120&srm.nB=60` or `?curse.trueEffect=0.1&curse.se=5` is the Figures' own URL state, read
// as on a real page. The failing variants are on /kitchen-sink/lab/diagnostics/faults.
import type { Metadata } from 'next';
import { CurseFigure } from '@/components/lab/CurseFigure';
import { SrmFigure } from '@/components/lab/SrmFigure';

export const metadata: Metadata = {
  title: 'Lab diagnostics host',
  robots: { index: false, follow: false },
};

export default function KitchenSinkLabDiagnostics() {
  return (
    <div className="py-section">
      <h1 className="text-2xl font-semibold md:text-3xl">Lab diagnostics host</h1>
      <p className="mt-3 max-w-text text-base text-muted">
        The Lab&apos;s split check and exaggeration Figures. This page exists only in the test build. All data on it is
        hypothetical.
      </p>
      <section data-host-section="split" aria-labelledby="host-split" className="mt-8">
        <h2 id="host-split" className="text-xl font-semibold">
          Split check
        </h2>
        <div className="mt-6">
          <SrmFigure />
        </div>
      </section>
      <section data-host-section="exaggeration" aria-labelledby="host-exaggeration" className="mt-section">
        <h2 id="host-exaggeration" className="text-xl font-semibold">
          Exaggeration
        </h2>
        <div className="mt-6">
          <CurseFigure />
        </div>
      </section>
    </div>
  );
}
