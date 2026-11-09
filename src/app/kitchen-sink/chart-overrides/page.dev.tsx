// Dev-only, like the kitchen sink above it: the two optional extensions the kit gives a page that
// places a chart first, on fictional data. `eager` loads an interactive Figure right after
// hydration (the id `eager` is its own set of URL keys), and a live chart takes its own plot height
// and accessible name. The specimens are static apart from the eager Figure.
import type { Metadata } from 'next';
import { ConfidenceChart } from '@/components/kit/ConfidenceChart';
import { liveFigureState } from '@/lib/figure/cs-band';
import { resolveFigureBody } from '@/lib/figure/states';
import { DemoFigure } from '../_demo/DemoFigure';
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
        An interactive Figure that loads after hydration, and a live chart with its own height and label. This page
        exists only in the test build. All data on it is fictional.
      </p>
      <section aria-labelledby="overrides-eager" className="mt-12">
        <h2 id="overrides-eager" className="text-xl font-semibold">
          Eager loading
        </h2>
        <Specimen
          id="eager--figure"
          title="Interactive Figure, loaded after hydration"
          note="The same Figure as the demo, loaded without waiting for the pointer, focus or idle time."
        >
          <DemoFigure id="eager" titleLevel={4} eager />
        </Specimen>
        <Specimen
          id="eager--unreachable"
          title="Loaded after hydration, code unreachable"
          note="The island's code fails to load: the preview returns in its no-JS form, as when intent loads it."
        >
          <DemoFigure id="eager-failed" titleLevel={4} eager unreachable />
        </Specimen>
      </section>
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
