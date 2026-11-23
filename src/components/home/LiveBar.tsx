// The live bar: an ink strip at the top of Home's content that carries the live test's note (the
// existing LiveNote, its sentence and its own link), centred and small. Nothing at all when there is
// no note (before the test starts). The bar's own markup is the same in both groups; only the note's
// words can name the reader's group. Server-safe: it takes the rendered note, never the model.
import type { ReactNode } from 'react';
import type { Locale } from '@/lib/i18n/locale';
import { homeCopy } from './copy';

export function LiveBar({ note, locale = 'en' }: { note: ReactNode; locale?: Locale }) {
  if (note === null || note === undefined || note === false) return null;
  return (
    <div data-live-bar="" role="region" aria-label={homeCopy(locale).liveBar}>
      <div data-live-bar-in="">{note}</div>
    </div>
  );
}
