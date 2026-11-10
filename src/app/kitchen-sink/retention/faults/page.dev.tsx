// Dev-only: the Retention Figures with their test seam set, so a browser spec can make a chart throw
// after a change and check the error fallback. Nothing in the production build imports this page
// (the fault-seam guard checks that), and it is built only with KITCHEN_SINK=1.
import type { Metadata } from 'next';
import { CohortFigure } from '@/components/retention/CohortFigure';
import { ReturnsFigure } from '@/components/retention/ReturnsFigure';
import { COHORTS } from '@/lib/retention/data';

export const metadata: Metadata = {
  title: 'Retention host, failing charts',
  robots: { index: false, follow: false },
};

export default function KitchenSinkRetentionFaults() {
  return (
    <div className="py-section">
      <h1 className="text-2xl font-semibold md:text-3xl">Retention host, failing charts</h1>
      <p className="mt-3 max-w-text text-base text-muted">
        Each chart here throws on the first render after its control changes. This page exists only in the test build.
      </p>
      <section data-host-section="cleaning" aria-labelledby="host-cleaning" className="mt-8">
        <h2 id="host-cleaning" className="text-xl font-semibold">
          Cleaning
        </h2>
        <div className="mt-6">
          <ReturnsFigure faultAfterChange />
        </div>
      </section>
      <section data-host-section="cohorts" aria-labelledby="host-cohorts" className="mt-section">
        <h2 id="host-cohorts" className="text-xl font-semibold">
          Cohorts
        </h2>
        <div className="mt-6">
          <CohortFigure rows={COHORTS} faultAfterChange />
        </div>
      </section>
    </div>
  );
}
