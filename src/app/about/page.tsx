// The About page. A plain static page: the story, the timeline, the tools, the languages and the CV.
import type { Metadata } from 'next';
import { ABOUT_TITLE, AboutPage } from '@/components/about/AboutPage';

export const metadata: Metadata = {
  title: ABOUT_TITLE,
  description: 'Experimentation and growth analyst in Berlin: my story, my timeline, the tools I have shipped with and my CV.',
};

export default function AboutRoute() {
  return <AboutPage />;
}
