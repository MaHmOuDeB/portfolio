// Dev-only, like the kitchen sink above it: the optional extension the kit gives a page that places
// a chart first, on fictional data. A live chart takes its own plot height and accessible name. The
// eager loading specimens are on /kitchen-sink/eager, kept apart because some of them fail on purpose.
import type { Metadata } from 'next';
import { ConfidenceChart } from '@/components/kit/ConfidenceChart';
import { liveFigureState } from '@/lib/figure/cs-band';
import { resolveFigureBody } from '@/lib/figure/states';
import { SINK_REFS, liveFixture } from '../_parts/live-fixtures';
import { Specimen } from '../_parts/Specimen';

export const metadata: Metadata = {
  title: 'Kit overrides',
  robots: { index: false, follow: false },
};

const snapshot = liveFixture('ab', 'enough-data', 'fresh');
const body = resolveFigureBody(liveFigureState(snapshot));

export default function KitchenSinkChartOverrides() {
  return (
    <div className="py-section">
      <h1 className="text-2xl font-semibold md:text-3xl">Kit overrides</h1>
      <p className="mt-3 max-w-text text-base text-muted">
        A live chart with its own height and label. This page exists only in the test build. All data on it is fictional.
      </p>
      <section aria-labelledby="overrides-chart" className="mt-12">
        <h2 id="overrides-chart" className="text-xl font-semibold">
          Live chart overrides
        </h2>
        <Specimen id="chart--default" title="Default height and label" note="The plot heights the kit has always drawn, and the label it generates.">
          <ConfidenceChart id="chart-default" snapshot={snapshot} body={body} refs={SINK_REFS} />
        </Specimen>
        <Specimen
          id="chart--override"
          title="Own height and label"
          note="A shorter plot on a phone, a taller one on a wide screen, and a label that replaces the generated one."
        >
          <ConfidenceChart
            id="chart-override"
            snapshot={snapshot}
            body={body}
            refs={SINK_REFS}
            height={{ narrow: 160, wide: 340 }}
            ariaLabel="The two groups compared as views accumulate, with the current interval around the line for no difference"
          />
        </Specimen>
      </section>
    </div>
  );
}
