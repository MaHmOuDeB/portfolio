'use client';

// A host that turns `eager` on after it has mounted and then re-renders on demand, so a test can
// watch the real prop transition in a hydrated page. The island's code is a lazy import that counts
// its requests and its mounts on `window`: a second load, or a remount, would show as a count of 2.
import { lazy, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { LoadOnIntent } from '@/components/kit/LoadOnIntent';
import type { DemoInteractiveProps } from './DemoInteractive';

type Counts = { loads: number; mounts: number };
declare global {
  interface Window {
    __eagerToggle?: Counts;
  }
}
const bump = (key: keyof Counts) => {
  const counts = (window.__eagerToggle ??= { loads: 0, mounts: 0 });
  counts[key] += 1;
};

const LazyCounted = lazy(() => {
  bump('loads');
  return import('./DemoInteractive');
});

const noSubscription = () => () => {};

function CountedIsland(props: DemoInteractiveProps) {
  useEffect(() => bump('mounts'), []);
  return <LazyCounted {...props} />;
}

export function EagerToggleHost({ preview, island, id }: { preview: ReactNode; island: ReactNode; id: string }) {
  const [eager, setEager] = useState(false);
  const [renders, setRenders] = useState(0);
  // True once hydrated, so a test clicks the buttons only when their handlers are attached.
  const ready = useSyncExternalStore(noSubscription, () => true, () => false);
  return (
    <div {...(ready ? { 'data-ready': '' } : {})}>
      <div className="flex flex-wrap gap-4">
        <button type="button" data-eager-toggle="on" className="min-h-(--size-target) px-4" onClick={() => setEager(true)}>
          Turn eager on
        </button>
        <button type="button" data-eager-toggle="rerender" className="min-h-(--size-target) px-4" onClick={() => setRenders((n) => n + 1)}>
          Render again
        </button>
        <output data-eager-toggle="state" className="self-center text-sm text-muted">
          eager {eager ? 'on' : 'off'}, rendered {renders} times
        </output>
      </div>
      <div className="mt-6">
        <LoadOnIntent eager={eager} preview={preview}>
          <CountedIsland id={id} preview={island} />
        </LoadOnIntent>
      </div>
    </div>
  );
}
