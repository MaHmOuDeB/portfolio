// The Docproof build note. A plain static page: prose, one diagram and one recorded run, all from
// content/docproof.tsx; nothing on it is live.
import type { Metadata } from 'next';
import { DOCPROOF_TITLE, DocproofPage } from '@/components/docproof/DocproofPage';

export const metadata: Metadata = {
  title: DOCPROOF_TITLE,
  description:
    'Document verification with multi-agent orchestration and automated checks: the architecture, how it is verified and its limits.',
};

export default function DocproofRoute() {
  return <DocproofPage />;
}
