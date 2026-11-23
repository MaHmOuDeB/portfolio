// The Pulse dashboard Figure as a page places it. The server reads the taxonomy from the export and
// draws the preset (the static HTML, also what a visitor without JavaScript keeps, with the open
// table and an empty event list); the island gets only the taxonomy rows, for its bus. It loads on
// intent, or at once for a URL with `pulse.` keys.
//
// `faultAfterChange` is a test seam, absent in production: it is forwarded unchanged to the island,
// whose charts then throw after a committed change. Only a test host sets it.
import type { Locale } from '@/lib/i18n/locale';
import { PULSE_PRESETS } from '@/lib/pulse/dashboard';
import { pulseTaxonomy } from '@/lib/pulse/taxonomy';
import { InertPulseControls, PulseFigureClient } from './PulseFigureClient';
import { pulseCopy } from './copy';
import { PulseFigureView } from './PulseView';

export function PulseFigure({ faultAfterChange, locale = 'en' }: { faultAfterChange?: true; locale?: Locale } = {}) {
  const view = PULSE_PRESETS.default;
  // The words go to the client only in a language other than English, so the English payload is unchanged.
  const text = locale === 'en' ? undefined : pulseCopy(locale).figure;
  const preview = <PulseFigureView view={view} text={text} controls={<InertPulseControls view={view} text={text} />} />;
  return text ? (
    <PulseFigureClient taxonomy={pulseTaxonomy()} preview={preview} faultAfterChange={faultAfterChange} text={text} />
  ) : (
    <PulseFigureClient taxonomy={pulseTaxonomy()} preview={preview} faultAfterChange={faultAfterChange} />
  );
}
