'use client';

// "Print this page" on the CV page: calls window.print(). Without JavaScript it cannot work, so the
// server renders it hidden and it shows once the page has hydrated. At least 44 px high, like every
// button; the row that holds it is hidden in print.
import { useSyncExternalStore } from 'react';
import { buttonClass } from '@/components/kit/ButtonLink';

const subscribe = () => () => {};

export function PrintButton({ variant, label = 'Print this page' }: { variant: 'primary' | 'secondary'; label?: string }) {
  // false on the server and during hydration, true once the client renders: no effect, no extra render.
  const ready = useSyncExternalStore(subscribe, () => true, () => false);
  return (
    <button type="button" hidden={!ready} className={buttonClass(variant)} onClick={() => window.print()}>
      {label}
    </button>
  );
}
