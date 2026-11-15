// The method, one click deeper: a native details row in the readable column. The browser opens and
// closes it, so it works without JavaScript. The summary is a 44 px target with its words and a
// chevron (decorative) that turns when the row is open, with no animation. A printed page shows the
// content whether the row is open or not (globals.css).
import type { ReactNode } from 'react';
import { Icon } from '@/components/kit/Icon';

export type MethodDetailsProps = {
  summary?: ReactNode;
  /** Starts open. */
  open?: boolean;
  children: ReactNode;
};

export function MethodDetails({ summary = 'The method, for the curious', open, children }: MethodDetailsProps) {
  return (
    <details data-method="" open={open ? true : undefined}>
      <summary
        data-touch-target=""
        className="flex min-h-(--size-target) cursor-pointer list-none items-center justify-between gap-4 py-2 text-sm font-medium marker:hidden [&::-webkit-details-marker]:hidden"
      >
        <span>{summary}</span>
        <span data-method-chevron="" aria-hidden="true">
          <Icon name="chevron" />
        </span>
      </summary>
      <div data-method-body="">{children}</div>
    </details>
  );
}
