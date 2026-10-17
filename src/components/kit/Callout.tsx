// A short note with a rule at the left, for limits and caveats. Server-safe, no hooks.
import type { ReactNode } from 'react';

export function Callout({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="max-w-text border-l border-line pl-4">
      {title ? <p className="text-base font-semibold">{title}</p> : null}
      <div className={title ? 'mt-1 text-base' : 'text-base'}>{children}</div>
    </div>
  );
}
