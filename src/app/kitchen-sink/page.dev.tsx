// Dev-only: next.config.ts builds `*.dev.tsx` pages only with KITCHEN_SINK=1, so this route is
// never in the production build (scripts/assert-no-kitchen-sink.ts checks it).
import type { Metadata } from 'next';
import { SECTIONS } from './_parts/sections';

export const metadata: Metadata = {
  title: 'Kitchen sink',
  robots: { index: false, follow: false },
};

export default function KitchenSink() {
  return (
    <div className="py-section">
      <h1 className="text-2xl font-semibold md:text-3xl">Kitchen sink</h1>
      <p className="mt-3 max-w-text text-base text-muted">
        Every kit component in every state, for the visual baselines and the accessibility checks.
        This page exists only in the test build. All data on it is fictional.
      </p>
      {SECTIONS.map(({ id, title, render }) => (
        <section key={id} data-section={id} aria-labelledby={`section-${id}`} className="mt-12">
          {/* A long word ("components") is wider than a 320 px screen at doubled root text in WebKit's
              font metrics: it breaks inside the word rather than push the page sideways. */}
          <h2 id={`section-${id}`} className="text-xl font-semibold wrap-anywhere">
            {title}
          </h2>
          <div className="mt-4">{render()}</div>
        </section>
      ))}
    </div>
  );
}
