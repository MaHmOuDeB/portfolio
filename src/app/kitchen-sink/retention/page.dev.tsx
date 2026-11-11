// Dev-only, like the kitchen sink above it: the Retention page as the route /work/retention mounts
// it, with its win-back planner, for the browser specs. There is no query switch in the components
// themselves. A query such as `?returns.mode=raw` is the Figure's own URL state, read as on the real
// page. The failing variants are on /kitchen-sink/retention/faults.
import type { Metadata } from 'next';
import { RetentionCaseStudy } from '@/components/retention/RetentionPage';

export const metadata: Metadata = {
  title: 'Retention host',
  robots: { index: false, follow: false },
};

export default function KitchenSinkRetention() {
  return <RetentionCaseStudy />;
}
