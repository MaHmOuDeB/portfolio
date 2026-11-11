// The exaggeration Figure as a page places it. The server draws the preset (effect 1, standard error
// 1) with the open table: the static HTML, also what a visitor without JavaScript keeps. The island
// receives no data: it computes the reader's setting itself, with the same pure model, so no number
// is serialized into the page for it. It loads on intent, or at once for a URL with `curse.` keys.
//
// `faultAfterChange` is a test seam, absent in production: it is forwarded unchanged to the island,
// whose chart then throws after a change. Only a test host sets it.
import { CURSE_PRESETS } from '@/lib/lab/diagnostics';
import { CurseFigureClient, InertCurseControls } from './CurseFigureClient';
import { CurseFigureView } from './CurseView';

export function CurseFigure({ faultAfterChange }: { faultAfterChange?: true } = {}) {
  const values = CURSE_PRESETS.default;
  return (
    <CurseFigureClient
      preview={<CurseFigureView values={values} controls={<InertCurseControls values={values} />} />}
      faultAfterChange={faultAfterChange}
    />
  );
}
