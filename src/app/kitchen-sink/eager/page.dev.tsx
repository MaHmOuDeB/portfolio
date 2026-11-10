// Dev-only, like the kitchen sink above it: the `eager` extension of LoadOnIntent when everything
// works. The page holds no failing island, so a test can hold it to no errors at all. The failing
// cases are on the routes beside it: /failed, /delayed and /toggle.
import type { Metadata } from 'next';
import { DemoFigure } from '../_demo/DemoFigure';
import { Specimen } from '../_parts/Specimen';

export const metadata: Metadata = {
  title: 'Eager loading',
  robots: { index: false, follow: false },
};

export default function KitchenSinkEager() {
  return (
    <div className="py-section">
      <h1 className="text-2xl font-semibold md:text-3xl">Eager loading</h1>
      <p className="mt-3 max-w-text text-base text-muted">
        An interactive Figure that loads after hydration, with no pointer, focus or idle time. This page exists only in
        the test build. All data on it is fictional.
      </p>
      <Specimen
        id="eager--figure"
        title="Interactive Figure, loaded after hydration"
        note="The same Figure as the demo, loaded without waiting for the pointer, focus or idle time."
      >
        <DemoFigure id="eager" titleLevel={4} eager />
      </Specimen>
    </div>
  );
}
