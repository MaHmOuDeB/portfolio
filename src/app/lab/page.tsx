// The Lab. A plain static page: the composition draws each Figure's preset on the server, and each
// Figure's island reads its own URL state in the browser.
import type { Metadata } from 'next';
import { LAB_TITLE, LabPage } from '@/components/lab/LabPage';

export const metadata: Metadata = {
  title: LAB_TITLE,
  description:
    'What a test can and cannot tell: sample size and duration, peeking at results, a split check and exaggeration, on simulated and hypothetical numbers.',
};

export default function LabRoute() {
  return <LabPage />;
}
