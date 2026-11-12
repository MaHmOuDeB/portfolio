// The ship-rule Figure as a page places it. The server draws the preset (the static HTML, also what a
// visitor without JavaScript keeps, with the open table) and hands the island only the preset's
// values: there is no data behind this Figure. The island loads on intent, or at once for a URL with
// `framework.` keys.
//
// `faultAfterChange` is a test seam, absent in production: it is forwarded unchanged to the island,
// whose chart then throws after a committed change. Only a test host sets it.
import { FRAMEWORK_PRESETS, paramsToValues } from '@/lib/audible/framework-url';
import { FrameworkFigureClient, InertFrameworkControls } from './FrameworkFigureClient';
import { FrameworkFigureView } from './FrameworkView';

export function FrameworkFigure({ faultAfterChange }: { faultAfterChange?: true } = {}) {
  const initial = paramsToValues(FRAMEWORK_PRESETS.default);
  return (
    <FrameworkFigureClient
      initial={initial}
      preview={<FrameworkFigureView values={initial} controls={<InertFrameworkControls values={initial} />} />}
      faultAfterChange={faultAfterChange}
    />
  );
}
