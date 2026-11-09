'use client';

// The client side of the demo Figure that the page loads at once, kept small:
// - DemoIsland is the lazy island. Its code (DemoInteractive, the statistics, the URL hook) is
//   fetched only when LoadOnIntent renders it, on intent.
// - InertDemoControls is the preview's control row: the same markup as the island's, with handlers
//   that do nothing, so nothing moves when the island replaces the preview.
import { lazy } from 'react';
import { DemoControls, type DemoValues } from './DemoControls';
import type { DemoInteractiveProps } from './DemoInteractive';

const LazyDemo = lazy(() => import('./DemoInteractive'));

export function DemoIsland(props: DemoInteractiveProps) {
  return <LazyDemo {...props} />;
}

// An island whose code never arrives, as a blocked or failed network would leave it: the import
// rejects the moment it is asked for, so the failure needs no request routing in a test.
const LazyUnreachable = lazy<typeof DemoIsland>(() => Promise.reject(new Error('A fictional chunk failure in the kitchen sink')));

export function UnreachableDemoIsland(props: DemoInteractiveProps) {
  return <LazyUnreachable {...props} />;
}

const noop = () => {};

export function InertDemoControls({ id, values }: { id: string; values: DemoValues }) {
  return (
    <DemoControls id={id} values={values} onBaseline={noop} onBaselineCommit={noop} onPower={noop} onReset={noop} />
  );
}
