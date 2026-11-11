// Dev-only: the index of the scroll-moment review pages, one per state, for reviewing every step's
// exact output before the scroll moment's shell and motion exist.
import type { Metadata } from 'next';
import { TextLink } from '@/components/kit/TextLink';
import { STEP_STATES } from './states';

export const metadata: Metadata = {
  title: 'Scroll moment states',
  robots: { index: false, follow: false },
};

export default function StepStates() {
  return (
    <div className="py-section">
      <h1 className="text-2xl font-semibold">Scroll moment states</h1>
      <p className="mt-3 max-w-text text-base text-muted">
        The five steps of the Home scroll moment in each state, from fictional snapshots. These pages exist only in the test
        build.
      </p>
      <ul className="mt-6 grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
        {STEP_STATES.map((s) => (
          <li key={s.id}>
            <TextLink href={`/kitchen-sink/home/steps/${s.id}`} standalone>
              {s.id}
            </TextLink>
          </li>
        ))}
      </ul>
    </div>
  );
}
