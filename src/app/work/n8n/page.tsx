// The n8n build note. A plain static page with no island.
import type { Metadata } from 'next';
import { N8N_TITLE, N8nPage } from '@/components/n8n/N8nPage';

export const metadata: Metadata = {
  title: N8N_TITLE,
  description:
    'Document and process automation in n8n: an e-invoice intake for XRechnung and ZUGFeRD, error alerts, and how it is tested. A portfolio project with no production use.',
};

export default function N8nRoute() {
  return <N8nPage />;
}
