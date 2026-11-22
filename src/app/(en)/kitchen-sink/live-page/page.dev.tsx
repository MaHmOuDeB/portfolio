// Dev-only: the Live test page's state explanation in every state, from fictional snapshots, for
// reviewing the exact copy before the page's Figures exist.
import type { Metadata } from 'next';
import { StateExplanation } from '@/components/live-page/StateExplanation';
import { LIVE_PAGE_FIXTURES } from '@/lib/live-page/fixtures';

export const metadata: Metadata = {
  title: 'Live test page states',
  robots: { index: false, follow: false },
};

export default function LivePageStates() {
  return (
    <div className="py-section">
      <h1 className="text-2xl font-semibold">Live test page states</h1>
      <p className="mt-3 max-w-text text-base text-muted">
        What the Live test page says in each state, from fictional snapshots. This page exists only in the test build.
      </p>
      <ul className="mt-8 grid gap-8">
        {LIVE_PAGE_FIXTURES.map((s) => (
          <li key={s.id} data-live-page-state={s.id}>
            <h2 className="text-lg font-semibold">{s.id}</h2>
            <div className="mt-2">
              <StateExplanation model={s.display()} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
