'use client';
// Mounts once in the layout and renders nothing. It adds the two delegated pointer listeners that
// lean the cards and let the hero field follow a fine pointer (see src/lib/depth/lean.ts).
import { useEffect } from 'react';
import { attachLean, type LeanDoc, type LeanWin } from '@/lib/depth/lean';

export function Lean() {
  useEffect(() => attachLean(document as unknown as LeanDoc, window as unknown as LeanWin), []);
  return null;
}
