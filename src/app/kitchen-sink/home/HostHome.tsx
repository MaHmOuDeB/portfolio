// The Home host's one composition, shared by /kitchen-sink/home (group A), the forced-group pages
// /kitchen-sink/home/a and /kitchen-sink/home/b and the scroll-moment states
// /kitchen-sink/home/scroll/<state>: the Home page's finished parts in page order, with fixed inputs.
// The group decides only which card headline is shown, as on the real page; the note and the scroll
// moment come from one fixed model, the same in both groups unless a state page names its own.
import { FeaturedCases } from '@/components/home/FeaturedCases';
import { Hero } from '@/components/home/Hero';
import { LiveNote } from '@/components/home/LiveNote';
import { ScrollMoment } from '@/components/home/ScrollMoment';
import { Tools } from '@/components/home/Tools';
import type { Arm } from '@/experiment.values';
import type { HomeModel } from '@/lib/home/model';
import { hostNoteModel, hostScrollModel, scrollMomentProps } from './fixtures';

export function HostHome({ arm, model }: { arm: Arm; model?: HomeModel }) {
  return (
    <div data-host-home={arm} className="pb-section">
      <Hero />
      <div className="mt-6">
        <LiveNote model={model ?? hostNoteModel()} />
      </div>
      <div className="mt-12 md:mt-section">
        <FeaturedCases headlineArm={arm} />
      </div>
      <div className="mt-12 md:mt-section">
        <ScrollMoment {...scrollMomentProps(model ?? hostScrollModel())} />
      </div>
      <div className="mt-12 md:mt-section">
        <Tools />
      </div>
      <p className="mt-12 max-w-text text-sm text-muted">
        The Home page&apos;s finished parts, in page order. This page exists only in the test build. All data on it is
        fictional.
      </p>
    </div>
  );
}
