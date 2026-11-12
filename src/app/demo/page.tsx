// The interview links. A plain static page, outside the menu: search engines may follow its links but
// are asked not to index it. It reads nothing from the live test and sends it nothing.
import type { Metadata } from 'next';
import { DEMO_COPY } from '../../../content/demo';
import { DEMO_TITLE, DemoPage } from '@/components/demo/DemoPage';

export const metadata: Metadata = {
  title: DEMO_TITLE,
  description: DEMO_COPY.description,
  robots: { index: false, follow: true },
};

export default function DemoRoute() {
  return <DemoPage />;
}
