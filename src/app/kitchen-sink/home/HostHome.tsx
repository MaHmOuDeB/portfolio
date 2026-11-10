// The Home host's one composition, shared by /kitchen-sink/home (group A) and the forced-group
// pages /kitchen-sink/home/a and /kitchen-sink/home/b: the Home page's finished parts in page order,
// with fixed inputs. The group decides only which card headline is shown, as on the real page.
import { FeaturedCases } from '@/components/home/FeaturedCases';
import { Hero } from '@/components/home/Hero';
import { LiveNote } from '@/components/home/LiveNote';
import { Tools } from '@/components/home/Tools';
import type { Arm } from '@/experiment.values';
import { hostNoteModel } from './fixtures';

export function HostHome({ arm }: { arm: Arm }) {
  return (
    <div data-host-home={arm} className="pb-section">
      <Hero />
      <div className="mt-6">
        <LiveNote model={hostNoteModel()} />
      </div>
      <div className="mt-12 md:mt-section">
        <FeaturedCases headlineArm={arm} />
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
