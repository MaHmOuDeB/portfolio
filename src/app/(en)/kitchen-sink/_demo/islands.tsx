'use client';

// The client side of the demo Figure that the page loads at once, kept small:
// - DemoIsland is the lazy island. Its code (DemoInteractive, the statistics, the URL hook) is
//   fetched only when LoadOnIntent renders it, on intent.
// - InertDemoControls is the preview's control row: the same markup as the island's, with handlers
//   that do nothing, so nothing moves when the island replaces the preview.
import { lazy } from 'react';
import { DemoControls, type DemoValues } from './DemoControls';
import type { DemoInteractiveProps } from './DemoInteractive';

// `__demoIslandRequests` counts the browser's requests for the island's code (never the server's:
// the factory runs only when the island renders, and a preview renders no island), so a test can
// tell a load that happened from one that did not.
declare global {
  interface Window {
    __demoIslandRequests?: number;
  }
}
const LazyDemo = lazy(() => {
  if (typeof window !== 'undefined') window.__demoIslandRequests = (window.__demoIslandRequests ?? 0) + 1;
  return import('./DemoInteractive');
});

export function DemoIsland(props: DemoInteractiveProps) {
  return <LazyDemo {...props} />;
}

// An island whose code never arrives, as a blocked or failed network would leave it: the import
// rejects the moment it is asked for, so the failure needs no request routing in a test.
const LazyUnreachable = lazy<typeof DemoIsland>(() => Promise.reject(new Error('A fictional chunk failure in the kitchen sink')));

export function UnreachableDemoIsland(props: DemoInteractiveProps) {
  return <LazyUnreachable {...props} />;
}

// An island whose code request is pending until a test releases it: the browser has asked for the
// code (`requests`), nothing has arrived, and `fail()` then rejects it, as a connection that drops
// part-way would. A test uses it to put focus in the preview while an eager request is in flight.
type DelayedHook = { requests: number; fail: () => void };
declare global {
  interface Window {
    __delayedIsland?: DelayedHook;
  }
}
const LazyDelayed = lazy<typeof DemoIsland>(
  () =>
    new Promise((_, reject) => {
      window.__delayedIsland = {
        requests: (window.__delayedIsland?.requests ?? 0) + 1,
        fail: () => reject(new Error('A fictional delayed chunk failure in the kitchen sink')),
      };
    }),
);

export function DelayedUnreachableDemoIsland(props: DemoInteractiveProps) {
  return <LazyDelayed {...props} />;
}

const noop = () => {};

export function InertDemoControls({ id, values }: { id: string; values: DemoValues }) {
  return (
    <DemoControls id={id} values={values} onBaseline={noop} onBaselineCommit={noop} onPower={noop} onReset={noop} />
  );
}
