// The Lab's peeking example on its own page, for a direct link such as `?peeking.preset=interview`.
// A plain static page: the server draws the preset, and the Figure's island reads the URL state in
// the browser.
import type { Metadata } from 'next';
import { LabPeekingPage } from '@/components/lab/LabPage';

export const metadata: Metadata = {
  title: 'Peeking at results, in the Lab',
  description: 'What checking a running test every day does to its false positives, on a seeded simulation.',
};

export default function LabPeekingRoute() {
  return <LabPeekingPage />;
}
