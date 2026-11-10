'use client';

// Loads an interactive Figure's island at once when the page was opened with that Figure's URL
// state, and on intent otherwise. A shared link such as `?hero-planner.baseline=0.4` asks for a view
// the server could not draw (the static HTML holds the preset), so the island loads right after
// hydration instead of waiting for a pointer, focus or idle time. Any key in one of `ids`'
// namespaces counts; another Figure's keys do not.
//
// The loader is the kit's LoadOnIntent: its `eager` prop goes through the same load, so the preview
// handover, the focus handoff and the failure fallback are the same in both cases. The query is read
// with useSearchParams, which on a static page renders this part on the client only, so it sits in
// its own Suspense boundary; the fallback is the same loader without `eager`, so the static HTML is
// the preview either way.
import { useSearchParams } from 'next/navigation';
import { Suspense, type ReactNode } from 'react';
import { LoadOnIntent } from '@/components/kit/LoadOnIntent';

type Props = {
  /** The Figure ids whose URL keys load the island at once (both, for a paired Figure). */
  ids: readonly string[];
  preview: ReactNode;
  /** The lazy island. */
  children: ReactNode;
};

/** Whether any key of `search` is in one of the `${id}.` namespaces. */
export function hasFigureKeys(search: { keys(): Iterable<string> }, ids: readonly string[]): boolean {
  const prefixes = ids.map((id) => `${id}.`);
  for (const key of search.keys()) {
    if (prefixes.some((prefix) => key.startsWith(prefix))) return true;
  }
  return false;
}

function FromUrl({ ids, preview, children }: Props) {
  const search = useSearchParams();
  return (
    <LoadOnIntent eager={hasFigureKeys(search, ids)} preview={preview}>
      {children}
    </LoadOnIntent>
  );
}

export function EagerOrIntent({ ids, preview, children }: Props) {
  return (
    <Suspense
      fallback={
        <LoadOnIntent preview={preview}>
          {children}
        </LoadOnIntent>
      }
    >
      <FromUrl ids={ids} preview={preview}>
        {children}
      </FromUrl>
    </Suspense>
  );
}
