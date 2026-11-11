// The split-check Figure as a page places it. The server draws the preset (100 visitors in each
// group against an even split) with the open table: the static HTML, also what a visitor without
// JavaScript keeps. The island receives no data: it computes the reader's setting itself, with the
// same pure model, so no number is serialized into the page for it. It loads on intent, or at once
// for a URL with `srm.` keys.
//
// `faultAfterChange` is a test seam, absent in production: it is forwarded unchanged to the island,
// whose chart then throws after a change. Only a test host sets it.
import { SRM_PRESETS } from '@/lib/lab/diagnostics';
import { InertSrmControls, SrmFigureClient } from './SrmFigureClient';
import { SrmFigureView } from './SrmView';

export function SrmFigure({ faultAfterChange }: { faultAfterChange?: true } = {}) {
  const values = SRM_PRESETS.default;
  return (
    <SrmFigureClient
      preview={<SrmFigureView values={values} controls={<InertSrmControls values={values} />} />}
      faultAfterChange={faultAfterChange}
    />
  );
}
