// Dev-only: the full planner with its test seam set, so a browser spec can make a Figure throw after
// an input change and check the error fallback: the Lab's one planner Figure, and the Retention
// page's pair (sizing and duration), which the Lab no longer shows. Nothing in the production build imports this page
// (the fault-seam guard checks that), and it is built only with KITCHEN_SINK=1.
import type { Metadata } from 'next';
import { FullPlanner } from '@/components/lab/FullPlanner';

export const metadata: Metadata = {
  title: 'Lab host, failing Figures',
  robots: { index: false, follow: false },
};

export default function KitchenSinkLabFaults() {
  return (
    <div className="py-section">
      <h1 className="text-2xl font-semibold md:text-3xl">Lab host, failing Figures</h1>
      <p className="mt-3 max-w-text text-base text-muted">
        Each Figure here throws on the first render after its own control changes. This page exists only in the test
        build.
      </p>
      <section data-host-section="planner" aria-labelledby="host-planner" className="mt-8">
        <h2 id="host-planner" className="text-xl font-semibold">
          Sample size and power
        </h2>
        <div className="mt-6">
          <FullPlanner faultAfterChange />
        </div>
      </section>
      <section data-host-section="winback" aria-labelledby="host-winback" className="mt-section">
        <h2 id="host-winback" className="text-xl font-semibold">
          Win-back sizing and duration
        </h2>
        <div className="mt-6">
          <FullPlanner id="winback" durationId="winback-duration" context="retention" faultAfterChange />
        </div>
      </section>
    </div>
  );
}
