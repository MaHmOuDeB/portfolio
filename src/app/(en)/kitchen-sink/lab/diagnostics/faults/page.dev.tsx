// Dev-only: the Lab's two diagnostics with their test seam set, so a browser spec can make a chart
// throw after a change and check the error fallback. Nothing in the production build imports this
// page (the fault-seam guard checks that), and it is built only with KITCHEN_SINK=1.
import type { Metadata } from 'next';
import { CurseFigure } from '@/components/lab/CurseFigure';
import { SrmFigure } from '@/components/lab/SrmFigure';

export const metadata: Metadata = {
  title: 'Lab diagnostics host, failing charts',
  robots: { index: false, follow: false },
};

export default function KitchenSinkLabDiagnosticsFaults() {
  return (
    <div className="py-section">
      <h1 className="text-2xl font-semibold md:text-3xl">Lab diagnostics host, failing charts</h1>
      <p className="mt-3 max-w-text text-base text-muted">
        Each chart here throws on the first render after its own control changes. This page exists only in the test
        build.
      </p>
      <section data-host-section="split" aria-labelledby="host-split" className="mt-8">
        <h2 id="host-split" className="text-xl font-semibold">
          Split check
        </h2>
        <div className="mt-6">
          <SrmFigure faultAfterChange />
        </div>
      </section>
      <section data-host-section="exaggeration" aria-labelledby="host-exaggeration" className="mt-section">
        <h2 id="host-exaggeration" className="text-xl font-semibold">
          Exaggeration
        </h2>
        <div className="mt-6">
          <CurseFigure faultAfterChange />
        </div>
      </section>
    </div>
  );
}
