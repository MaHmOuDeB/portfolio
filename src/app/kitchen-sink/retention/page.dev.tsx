// Dev-only, like the kitchen sink above it: the Retention page's finished parts, in page order, for
// the browser specs. It mounts only completed components as the page will; there is no query switch
// in the components themselves. A query such as `?returns.mode=raw` is the Figure's own URL state,
// read as on the real page. The failing variants are on /kitchen-sink/retention/faults.
import type { Metadata } from 'next';
import { CohortFigure } from '@/components/retention/CohortFigure';
import { ModelFigure } from '@/components/retention/ModelFigure';
import { ReturnsFigure } from '@/components/retention/ReturnsFigure';
import { RfmFigure } from '@/components/retention/RfmFigure';
import { COHORTS, RETENTION } from '@/lib/retention/data';

export const metadata: Metadata = {
  title: 'Retention host',
  robots: { index: false, follow: false },
};

export default function KitchenSinkRetention() {
  return (
    <div className="py-section">
      <h1 className="text-2xl font-semibold md:text-3xl">Retention host</h1>
      <p className="mt-3 max-w-text text-base text-muted">
        The Retention page&apos;s finished parts, in page order. This page exists only in the test build.
      </p>
      <section data-host-section="cleaning" aria-labelledby="host-cleaning" className="mt-8">
        <h2 id="host-cleaning" className="text-xl font-semibold">
          Cleaning
        </h2>
        <div className="mt-6">
          <ReturnsFigure />
        </div>
      </section>
      <section data-host-section="cohorts" aria-labelledby="host-cohorts" className="mt-section">
        <h2 id="host-cohorts" className="text-xl font-semibold">
          Cohorts
        </h2>
        <div className="mt-6">
          <CohortFigure rows={COHORTS} />
        </div>
      </section>
      <section data-host-section="segments" aria-labelledby="host-segments" className="mt-section">
        <h2 id="host-segments" className="text-xl font-semibold">
          Segments
        </h2>
        <div className="mt-6">
          <RfmFigure rows={RETENTION.tables.rfm_segments} />
        </div>
      </section>
      <section data-host-section="model" aria-labelledby="host-model" className="mt-section">
        <h2 id="host-model" className="text-xl font-semibold">
          Model
        </h2>
        <div className="mt-6">
          <ModelFigure />
        </div>
      </section>
    </div>
  );
}
