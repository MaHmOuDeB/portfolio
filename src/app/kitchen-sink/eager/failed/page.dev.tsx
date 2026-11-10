// Dev-only: an eager island whose code is refused at once, and a working eager Figure beside it.
// Every error on this page is expected, so a test names the one it allows.
import type { Metadata } from 'next';
import { DemoFigure } from '../../_demo/DemoFigure';
import { Specimen } from '../../_parts/Specimen';

export const metadata: Metadata = {
  title: 'Eager loading, code unreachable',
  robots: { index: false, follow: false },
};

export default function KitchenSinkEagerFailed() {
  return (
    <div className="py-section">
      <h1 className="text-2xl font-semibold md:text-3xl">Eager loading, code unreachable</h1>
      <p className="mt-3 max-w-text text-base text-muted">
        The island&apos;s code fails to load the moment it is asked for. The preview returns in its no-JS form, as when
        intent loads it. This page exists only in the test build. All data on it is fictional.
      </p>
      <Specimen
        id="eager--unreachable"
        title="Loaded after hydration, code unreachable"
        note="Nothing holds focus, so none is taken."
      >
        <DemoFigure id="eager-failed" titleLevel={4} eager unreachable />
      </Specimen>
      <Specimen id="eager--neighbour" title="A working Figure beside it" note="Untouched by the failure.">
        <DemoFigure id="eager" titleLevel={4} eager />
      </Specimen>
    </div>
  );
}
