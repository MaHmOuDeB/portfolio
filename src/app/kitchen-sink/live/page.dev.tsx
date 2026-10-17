// Dev-only, like the page above it. The live Figure states are added to this page in a later task.
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Live Figure states',
  robots: { index: false, follow: false },
};

export default function KitchenSinkLive() {
  return (
    <div className="py-section">
      <h1 className="text-2xl font-semibold md:text-3xl">Live Figure states</h1>
      <p className="mt-3 max-w-text text-base text-muted">
        Every phase, amount of data and freshness of a live Figure, with fictional data. Added with the live
        Figure.
      </p>
    </div>
  );
}
