// Dev-only: the five steps of the Home scroll moment for one fictional state, in order, with the
// live chart the Evidence step may draw, as the page will compose them (the scroll moment's shell,
// sticky layout and motion come later). Groups A and B side by side are /a and /b of the Home host.
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ConfidenceChart } from '@/components/kit/ConfidenceChart';
import { Figure } from '@/components/kit/Figure';
import { TextLink } from '@/components/kit/TextLink';
import { liveFigureState } from '@/lib/figure/cs-band';
import { resolveFigureBody } from '@/lib/figure/states';
import { chartAriaLabel, chartSnapshot, homeChartTable, homeSteps } from '@/lib/home/scroll';
import { STEP_STATES } from '../states';

export const dynamicParams = false;

export const metadata: Metadata = {
  title: 'Scroll moment state',
  robots: { index: false, follow: false },
};

export function generateStaticParams(): { state: string }[] {
  return STEP_STATES.map((s) => ({ state: s.id }));
}

export default async function StepState({ params }: { params: Promise<{ state: string }> }) {
  const { state } = await params;
  const found = STEP_STATES.find((s) => s.id === state);
  if (!found) notFound();
  const model = found.model();
  const snap = chartSnapshot(model, 3);
  const live = snap ? liveFigureState(snap) : null;
  return (
    <div data-step-state={state} className="py-section">
      <TextLink href="/kitchen-sink/home/steps" standalone>
        All states
      </TextLink>
      <h1 className="mt-4 text-2xl font-semibold">Scroll moment: {state}</h1>
      <p className="mt-3 max-w-text text-base text-muted">Seen from group B. All data on this page is fictional.</p>
      <ol className="mt-12 grid gap-16">
        {homeSteps(model).map((s) => (
          <li key={s.step} data-step={s.step}>
            <h2 className="text-xl font-semibold">{s.heading}</h2>
            <div className="mt-4">{s.body}</div>
            {s.step === 3 && snap && live ? (
              <div className="mt-6">
                <Figure
                  id="home-chart"
                  titleLevel={4}
                  title="The difference between the groups as views per group grow"
                  caption="B minus A in percentage points: the band is the confidence sequence, the dot the current estimate."
                  provenance="simulated"
                  state={live}
                  table={homeChartTable(snap, model.refs)}
                >
                  <ConfidenceChart
                    id="home-chart"
                    snapshot={snap}
                    body={resolveFigureBody(live)}
                    refs={model.refs}
                    ariaLabel={chartAriaLabel(model, 3)}
                  />
                </Figure>
              </div>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}
