'use client';

// The sideways-scrolling frame of a screenshot whose text would be too small at the column's width
// (NoteShot). While it scrolls it is a labelled region that takes focus, so a keyboard can scroll it;
// when it takes focus partly off screen it is scrolled into view, so its whole focus ring shows
// (revealRing). A frame that fits its picture is no tab stop and no region: a ResizeObserver measures
// it. The served HTML, and so a visitor without JavaScript, keeps the tab stop at every width.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { revealRing } from '@/lib/focus/reveal-ring';

export function ShotFrame({ labelledBy, children }: { labelledBy: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  // As served: a tab stop, since the server cannot measure.
  const [scrolls, setScrolls] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setScrolls(el.scrollWidth > el.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    return () => observer.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      data-shot-frame=""
      className="overflow-x-auto"
      tabIndex={scrolls ? 0 : undefined}
      role={scrolls ? 'region' : undefined}
      aria-labelledby={scrolls ? labelledBy : undefined}
      onFocus={(e) => {
        if (scrolls && e.target === e.currentTarget) revealRing(e.currentTarget);
      }}
    >
      {children}
    </div>
  );
}
