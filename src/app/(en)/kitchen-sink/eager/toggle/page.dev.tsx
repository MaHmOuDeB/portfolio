// Dev-only: `eager` starts false and a button turns it on after mount, to watch the prop change in
// a hydrated page. The island's code requests and mounts are counted on `window`.
import type { Metadata } from 'next';
import { DemoChart, DemoFigureView, demoModel } from '../../_demo/demo-view';
import { PRESETS } from '../../_demo/DemoControls';
import { EagerToggleHost } from '../../_demo/EagerToggle';
import { InertDemoControls } from '../../_demo/islands';
import { Specimen } from '../../_parts/Specimen';

export const metadata: Metadata = {
  title: 'Eager loading, switched on later',
  robots: { index: false, follow: false },
};

const ID = 'eager-toggle';

export default function KitchenSinkEagerToggle() {
  const values = PRESETS.default;
  return (
    <div className="py-section">
      <h1 className="text-2xl font-semibold md:text-3xl">Eager loading, switched on later</h1>
      <p className="mt-3 max-w-text text-base text-muted">
        The Figure starts deferred, with nothing to load it. A button then turns eager on. This page exists only in the
        test build. All data on it is fictional.
      </p>
      <Specimen id="eager--toggle" title="Eager switched on after mount" note="One load, however often the host renders again.">
        <EagerToggleHost
          id={ID}
          preview={
            <DemoFigureView id={ID} titleLevel={4} values={values} controls={<InertDemoControls id={ID} values={values} />} />
          }
          island={<DemoChart id={`${ID}-preview`} model={demoModel(values)} presetPreview />}
        />
      </Specimen>
    </div>
  );
}
