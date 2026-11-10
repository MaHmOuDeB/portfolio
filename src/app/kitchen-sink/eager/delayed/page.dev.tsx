// Dev-only: an eager island whose code request stays pending until the page is told to fail it
// (`window.__delayedIsland.fail()`), so a test can move focus while the request is in flight.
import type { Metadata } from 'next';
import { DemoFigure } from '../../_demo/DemoFigure';
import { Specimen } from '../../_parts/Specimen';

export const metadata: Metadata = {
  title: 'Eager loading, request pending',
  robots: { index: false, follow: false },
};

export default function KitchenSinkEagerDelayed() {
  return (
    <div className="py-section">
      <h1 className="text-2xl font-semibold md:text-3xl">Eager loading, request pending</h1>
      <p className="mt-3 max-w-text text-base text-muted">
        The island&apos;s code is requested after hydration and does not arrive until the test lets it fail. This page
        exists only in the test build. All data on it is fictional.
      </p>
      <p className="mt-6">
        <button type="button" data-focus-elsewhere="" className="min-h-(--size-target) px-4">
          A control outside the Figure
        </button>
      </p>
      <Specimen
        id="eager--delayed"
        title="Loaded after hydration, request pending, then refused"
        note="Focus can sit in the preview while the request is pending."
      >
        <DemoFigure id="eager-delayed" titleLevel={4} eager unreachable="delayed" />
      </Specimen>
    </div>
  );
}
