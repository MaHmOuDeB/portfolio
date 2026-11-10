// Dev-only, like the kitchen sink above it: the Home page's finished parts, in page order, for the
// browser specs. It mounts only completed components with fixed inputs; there is no query switch in
// the components themselves. A query such as `?hero-planner.baseline=0.4` is the planner's own URL
// state, read as on the real page.
import type { Metadata } from 'next';
import { LiveNote } from '@/components/home/LiveNote';
import { HeroSimulator } from '@/components/home/HeroSimulator';
import { hostNoteModel } from './fixtures';

export const metadata: Metadata = {
  title: 'Home host',
  robots: { index: false, follow: false },
};

export default function KitchenSinkHome() {
  return (
    <div className="py-section">
      <h1 className="text-2xl font-semibold md:text-3xl">Home host</h1>
      <p className="mt-3 max-w-text text-base text-muted">
        The Home page&apos;s finished parts, in page order. This page exists only in the test build. All data on it is
        fictional.
      </p>
      <section data-host-section="hero" aria-label="Hero" className="mt-8">
        <HeroSimulator />
        <div className="mt-6">
          <LiveNote model={hostNoteModel()} />
        </div>
      </section>
    </div>
  );
}
