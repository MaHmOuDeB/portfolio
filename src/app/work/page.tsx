// The Work directory: every case study and build note on the site. A plain static page: the
// composition reads only the content data at build time.
import type { Metadata } from 'next';
import { WORK_TITLE, WorkPage } from '@/components/work/WorkPage';

export const metadata: Metadata = {
  title: WORK_TITLE,
  description:
    "Every case study and build note on this site: experiments and analyses first, then the tools I've built.",
};

export default function WorkRoute() {
  return <WorkPage />;
}
