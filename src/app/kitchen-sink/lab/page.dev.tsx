// Dev-only, like the kitchen sink above it: the full sample-size planner for the browser specs, in
// both of its contexts, as a page will mount it. There is no query switch in the components
// themselves. A query such as `?planner.mode=relative` or `?duration.traffic=500` is the Figures' own
// URL state, read as on a real page. The failing variant is on /kitchen-sink/lab/faults.
import type { Metadata } from 'next';
import { FullPlanner } from '@/components/lab/FullPlanner';

export const metadata: Metadata = {
  title: 'Lab host',
  robots: { index: false, follow: false },
};

export default function KitchenSinkLab() {
  return (
    <div className="py-section">
      <h1 className="text-2xl font-semibold md:text-3xl">Lab host</h1>
      <p className="mt-3 max-w-text text-base text-muted">
        The Lab&apos;s finished parts. This page exists only in the test build. All data on it is simulated.
      </p>
      <section data-host-section="planner" aria-labelledby="host-planner" className="mt-8">
        <h2 id="host-planner" className="text-xl font-semibold">
          Sample size and duration
        </h2>
        <div className="mt-6">
          <FullPlanner />
        </div>
      </section>
      <section data-host-section="winback" aria-labelledby="host-winback" className="mt-section">
        <h2 id="host-winback" className="text-xl font-semibold">
          The same planner with the win-back baseline
        </h2>
        <div className="mt-6">
          <FullPlanner id="winback" durationId="winback-duration" context="retention" />
        </div>
      </section>
    </div>
  );
}
