// The Pulse dashboard Figure as a page places it. The server reads the taxonomy from the export and
// draws the preset (the static HTML, also what a visitor without JavaScript keeps, with the open
// table and an empty event list); the island gets only the taxonomy rows, for its bus. It loads on
// intent, or at once for a URL with `pulse.` keys.
//
// `faultAfterChange` is a test seam, absent in production: it is forwarded unchanged to the island,
// whose charts then throw after a committed change. Only a test host sets it.
import { PULSE_PRESETS } from '@/lib/pulse/dashboard';
import { pulseTaxonomy } from '@/lib/pulse/taxonomy';
import { InertPulseControls, PulseFigureClient } from './PulseFigureClient';
import { PulseFigureView } from './PulseView';

export function PulseFigure({ faultAfterChange }: { faultAfterChange?: true } = {}) {
  const view = PULSE_PRESETS.default;
  return (
    <PulseFigureClient
      taxonomy={pulseTaxonomy()}
      preview={<PulseFigureView view={view} controls={<InertPulseControls view={view} />} />}
      faultAfterChange={faultAfterChange}
    />
  );
}
