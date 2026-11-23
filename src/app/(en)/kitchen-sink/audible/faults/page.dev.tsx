// Dev-only: the ship-rule Figure with its test seam set, so a browser spec can make the chart throw
// after a change and check the error fallback. Nothing in the production build imports this page
// (the fault-seam guard checks that), and it is built only with KITCHEN_SINK=1.
import type { Metadata } from 'next';
import { FrameworkFigure } from '@/components/audible/FrameworkFigure';

export const metadata: Metadata = {
  title: 'Ship-rule host, failing chart',
  robots: { index: false, follow: false },
};

export default function KitchenSinkAudibleFaults() {
  return (
    <div className="py-section">
      <h1 className="text-2xl font-semibold md:text-3xl">Ship-rule host, failing chart</h1>
      <p className="mt-3 max-w-text text-base text-muted">
        The chart here throws on the first render after a bound changes. This page exists only in the test build.
      </p>
      <div className="mt-8">
        <FrameworkFigure faultAfterChange />
      </div>
    </div>
  );
}
