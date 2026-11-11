// Dev-only, like the kitchen sink above it: the Home page's finished parts, in page order, for the
// browser specs (HostHome). It mounts only completed components with fixed inputs; there is no query
// switch in the components themselves. A query such as `?hero-planner.baseline=0.4` is the planner's
// own URL state, read as on the real page. This page shows group A's headlines; /kitchen-sink/home/a
// and /kitchen-sink/home/b force either group.
import type { Metadata } from 'next';
import { HostHome } from './HostHome';

export const metadata: Metadata = {
  title: 'Home host',
  robots: { index: false, follow: false },
};

export default function KitchenSinkHome() {
  return <HostHome arm="a" />;
}
