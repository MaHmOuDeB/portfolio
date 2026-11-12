// The Audible method page. A plain static page: the composition reads only the profile facts at
// build time, and the ship-rule Figure's island reads its own URL state in the browser.
import type { Metadata } from 'next';
import { AudiblePage } from '@/components/audible/AudiblePage';

export const metadata: Metadata = {
  title: 'Experimentation at Audible (Amazon)',
  description:
    'How I plan and analyse experiments, why so many of my recommendations were adopted, a ship rule on a made-up product and the tool I built for test-account setup.',
};

export default function AudibleRoute() {
  return <AudiblePage />;
}
