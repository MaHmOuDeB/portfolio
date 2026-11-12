// The CV as a printable page. A plain static page; the PDF is linked when the build has a checked one.
import type { Metadata } from 'next';
import { CvPage } from '@/components/about/CvPage';

export const metadata: Metadata = {
  title: 'CV',
  description: 'The CV of Mahmoud El Bergui, experimentation and growth analyst in Berlin, as a page you can read or print.',
};

export default function CvRoute() {
  return <CvPage />;
}
