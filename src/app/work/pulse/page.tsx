// The Pulse case study. A plain static page: the composition reads the Pulse export at build time,
// and the dashboard's island reads its own URL state in the browser.
import type { Metadata } from 'next';
import { PULSE_METADATA_TITLE, PulsePage } from '@/components/pulse/PulsePage';

export const metadata: Metadata = {
  title: PULSE_METADATA_TITLE,
  description:
    'A demo dashboard I designed and built, with an event taxonomy in which each event is designed to answer a product question. No real users.',
};

export default function PulseRoute() {
  return <PulsePage />;
}
