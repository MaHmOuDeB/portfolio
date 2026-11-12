// Dev-only, like the kitchen sink above it: the Lab page as the route /lab mounts it (the full
// sample-size planner, the peeking Figure, the split check and exaggeration), for the browser specs.
// There is no query switch in the components themselves. A query such as `?planner.mode=relative`,
// `?duration.traffic=500` or `?srm.nA=120` is the Figures' own URL state, read as on the real page.
// The Retention context of the planner is on /kitchen-sink/retention. The failing variants are on
// /kitchen-sink/lab/faults, /kitchen-sink/lab/peeking/faults and /kitchen-sink/lab/diagnostics/faults.
import type { Metadata } from 'next';
import { LabPage } from '@/components/lab/LabPage';

export const metadata: Metadata = {
  title: 'Lab host',
  robots: { index: false, follow: false },
};

export default function KitchenSinkLab() {
  return <LabPage />;
}
