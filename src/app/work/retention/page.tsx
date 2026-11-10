// The Retention case study. A plain static page: the composition reads only the vendored exports at
// build time, and each Figure's island reads its own URL state in the browser.
import type { Metadata } from 'next';
import { RETENTION_TITLE, RetentionPage } from '@/components/retention/RetentionPage';

export const metadata: Metadata = {
  title: RETENTION_TITLE,
  description:
    'Cleaning the returns, cohorts, customer segments, a model of who orders again and a win-back sample size, on a public dataset rebuilt in 2026.',
};

export default function RetentionRoute() {
  return <RetentionPage />;
}
