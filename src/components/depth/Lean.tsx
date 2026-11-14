'use client';
// Mounts once in the layout and renders nothing. It adds the two delegated pointer listeners that
// lean the cards, let the band's stack and the pointer scenes follow a fine pointer and pull the
// magnets (see src/lib/depth/lean.ts). It attaches again on each page, so it finds that page's scenes
// once instead of searching the document on every frame.
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { attachLean, type LeanDoc, type LeanWin } from '@/lib/depth/lean';

export function Lean() {
  const pathname = usePathname();
  useEffect(() => {
    // The pathname only marks a new page; the controller reads the page's scenes itself.
    void pathname;
    return attachLean(document as unknown as LeanDoc, window as unknown as LeanWin);
  }, [pathname]);
  return null;
}
