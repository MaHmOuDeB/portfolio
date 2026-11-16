'use client';
// Mounts once in the layout and renders nothing. It adds the two delegated pointer listeners that
// lean the cards, let the band's stack and the pointer scenes follow a fine pointer and pull the
// magnets (see src/lib/depth/lean.ts). Below lg, in a browser without scroll timelines, it also runs
// the scroll fallback that drives the same scroll-linked keyframes from the scroll position (see
// src/lib/depth/scrub.ts); where scroll timelines exist that part returns at once. Both attach again
// on each page, so they find that page's elements once instead of searching the document on every
// frame. The fallback attaches in a layout effect: on a client navigation the new page's values land
// before it paints, so no block shows a wrong pose for a frame.
import { useEffect, useLayoutEffect } from 'react';
import { usePathname } from 'next/navigation';
import { attachLean, type LeanDoc, type LeanWin } from '@/lib/depth/lean';
import { attachScrub, type ScrubDoc, type ScrubWin } from '@/lib/depth/scrub';

export function Lean() {
  const pathname = usePathname();
  useEffect(() => {
    // The pathname only marks a new page; the controller reads the page's scenes itself.
    void pathname;
    return attachLean(document as unknown as LeanDoc, window as unknown as LeanWin);
  }, [pathname]);
  useLayoutEffect(() => {
    void pathname;
    return attachScrub(document as unknown as ScrubDoc, window as unknown as ScrubWin);
  }, [pathname]);
  return null;
}
