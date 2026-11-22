// The exaggeration Figure as a page places it. The server draws the preset (a test that clears the
// bar 17% of the time) with the open table: the static HTML, also what a visitor without JavaScript keeps. The island
// receives no data: it computes the reader's setting itself, with the same pure model, so no number
// is serialized into the page for it. It loads on intent, or at once for a URL with `curse.` keys.
//
// `faultAfterChange` is a test seam, absent in production: it is forwarded unchanged to the island,
// whose chart then throws after a change. Only a test host sets it.
import type { Locale } from '@/lib/i18n/locale';
import { labCopy } from '@/lib/lab/copy';
import { CURSE_PRESETS } from '@/lib/lab/diagnostics';
import { CurseFigureClient, InertCurseControls } from './CurseFigureClient';
import { CurseFigureView } from './CurseView';

export function CurseFigure({ faultAfterChange, locale = 'en' }: { faultAfterChange?: true; locale?: Locale } = {}) {
  const values = CURSE_PRESETS.default;
  // The words go to the client only in a language other than English, so the English payload is unchanged.
  const text = locale === 'en' ? undefined : labCopy(locale).curse;
  const view = (
    <CurseFigureView values={values} text={text} controls={text ? <InertCurseControls values={values} text={text} /> : <InertCurseControls values={values} />} />
  );
  return text ? (
    <CurseFigureClient preview={view} faultAfterChange={faultAfterChange} text={text} />
  ) : (
    <CurseFigureClient preview={view} faultAfterChange={faultAfterChange} />
  );
}
