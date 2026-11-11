// Dev-only, like the kitchen sink above it: the Slider on a step that does not end, kept on its own
// route so the kitchen sink's visual baselines do not change.
import type { Metadata } from 'next';
import { SliderStepsSection } from '../_parts/slider-steps';

export const metadata: Metadata = {
  title: 'Slider steps',
  robots: { index: false, follow: false },
};

export default function KitchenSinkSliderSteps() {
  return (
    <div className="py-section">
      <h1 className="text-2xl font-semibold md:text-3xl">Slider steps</h1>
      <p className="mt-3 max-w-text text-base text-muted">
        A slider whose step is a fraction that does not end. This page exists only in the test build. All data on it is
        fictional.
      </p>
      <section aria-labelledby="slider-steps" className="mt-12">
        <h2 id="slider-steps" className="text-xl font-semibold">
          Number input steps
        </h2>
        <SliderStepsSection />
      </section>
    </div>
  );
}
