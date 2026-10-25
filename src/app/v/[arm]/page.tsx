// The home page, one static page per group. The proxy rewrites every request for / to /v/a or /v/b
// (drawn per request) and answers a direct /v/* with the 404 page (except a request carrying the
// revalidation header, which can never count); dynamicParams off makes any other group a 404 too. Both pages regenerate every 5 minutes from the store, like data.json.
import { notFound } from 'next/navigation';
import { ExperimentBeacon } from '@/components/experiment/ExperimentBeacon';
import { PhaseLabel } from '@/components/kit/PhaseLabel';
import type { Arm } from '@/experiment.values';
import { getLiveView } from '@/lib/experiment/live';

export const revalidate = 300;
export const dynamicParams = false;

export function generateStaticParams(): { arm: Arm }[] {
  return [{ arm: 'a' }, { arm: 'b' }];
}

function isArm(value: string): value is Arm {
  return value === 'a' || value === 'b';
}

export default async function Home({ params }: PageProps<'/v/[arm]'>) {
  const { arm } = await params;
  if (!isArm(arm)) notFound();
  const view = await getLiveView(arm);
  return (
    <>
      <ExperimentBeacon arm={arm} ns={view.namespace} />
      <div className="py-section">
        <h1>Mahmoud El Bergui</h1>
        {/* No note before the start: there is no running test to describe. */}
        {view.testNote !== null && (
          <div className="mt-4">
            <PhaseLabel note={view.testNote} href="/experiment" refs={view.refs} />
          </div>
        )}
        {/* The featured case studies go here: same-origin links marked data-experiment-click="card". */}
        <section data-experiment="cards" aria-label="Featured case studies" />
      </div>
    </>
  );
}
