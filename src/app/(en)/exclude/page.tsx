// The owner's private page. Static, unlisted and not indexed; next.config.ts sends it with no
// referrer and no cache. Nothing links to it.
import type { Metadata } from 'next';
import { ExcludeThisBrowser } from '@/components/experiment/ExcludeThisBrowser';

export const metadata: Metadata = {
  title: 'Leave this browser out',
  robots: { index: false, follow: false },
};

export default function ExcludePage() {
  return (
    <div className="py-section">
      <h1 className="text-2xl font-semibold md:text-3xl">Leave this browser out of the experiment</h1>
      <p className="mt-4 max-w-text">
        This sets one cookie on this browser, so my own visits are not counted in the live test. Visitors never get it.
      </p>
      <ExcludeThisBrowser />
    </div>
  );
}
