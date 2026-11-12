// Dev-only, like the kitchen sink above it: the peeking example as the route /lab/peeking mounts it,
// for the browser specs. There is no query switch in the components themselves. A query such as
// `?peeking.looks=50&peeking.mode=once` or `?peeking.preset=interview` is the Figure's own URL state,
// read as on the real page. The failing variant is on /kitchen-sink/lab/peeking/faults.
import type { Metadata } from 'next';
import { LabPeekingPage } from '@/components/lab/LabPage';

export const metadata: Metadata = {
  title: 'Lab host, peeking',
  robots: { index: false, follow: false },
};

export default function KitchenSinkLabPeeking() {
  return <LabPeekingPage />;
}
