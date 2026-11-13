'use client';

// The sideways-scrolling frame of a screenshot whose text would be too small at the column's width
// (NoteShot). It is a labelled region that takes focus, so a keyboard can scroll it; when it takes
// focus partly off screen it is scrolled into view, so its whole focus ring shows (revealRing).
import type { ReactNode } from 'react';
import { revealRing } from '@/lib/focus/reveal-ring';

export function ShotFrame({ labelledBy, children }: { labelledBy: string; children: ReactNode }) {
  return (
    <div
      data-shot-frame=""
      className="overflow-x-auto"
      tabIndex={0}
      role="region"
      aria-labelledby={labelledBy}
      onFocus={(e) => {
        if (e.target === e.currentTarget) revealRing(e.currentTarget);
      }}
    >
      {children}
    </div>
  );
}
