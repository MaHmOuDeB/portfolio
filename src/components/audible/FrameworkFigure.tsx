// The ship-rule Figure as a page places it. The server draws the preset (the static HTML, also what a
// visitor without JavaScript keeps, with the open table) and hands the island only the preset's
// values: there is no data behind this Figure. The island loads on intent, or at once for a URL with
// `framework.` keys.
//
// `faultAfterChange` is a test seam, absent in production: it is forwarded unchanged to the island,
// whose chart then throws after a committed change. Only a test host sets it.
import { FRAMEWORK_PRESETS, paramsToValues } from '@/lib/audible/framework-url';
import type { Locale } from '@/lib/i18n/locale';
import { audibleCopy } from './copy';
import { FrameworkFigureClient, InertFrameworkControls } from './FrameworkFigureClient';
import { FrameworkFigureView } from './FrameworkView';

export function FrameworkFigure({ faultAfterChange, locale = 'en' }: { faultAfterChange?: true; locale?: Locale } = {}) {
  const initial = paramsToValues(FRAMEWORK_PRESETS.default);
  // The words go to the client only in a language other than English, so the English payload is unchanged.
  const text = locale === 'en' ? undefined : audibleCopy(locale).framework;
  const view = (
    <FrameworkFigureView
      values={initial}
      text={text}
      controls={<InertFrameworkControls values={initial} text={text} />}
    />
  );
  return text ? (
    <FrameworkFigureClient initial={initial} preview={view} faultAfterChange={faultAfterChange} text={text} />
  ) : (
    <FrameworkFigureClient initial={initial} preview={view} faultAfterChange={faultAfterChange} />
  );
}
