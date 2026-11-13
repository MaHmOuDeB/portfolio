// The split-check Figure as a page places it. The server draws the default preset (a simulated
// 5,170 to 4,830 split against an expected even split, flagged) with the open table: the static
// HTML, also what a visitor without JavaScript keeps. Under it the page places SrmEvenLink: with
// JavaScript, one link opens the even preset, as a full page load so the island reads `srm.preset`
// from the address. The island receives no data: it computes the reader's setting itself, with the
// same pure model, so no number is serialized into the page for it. It loads on intent, or at once
// for a URL with `srm.` keys.
//
// `faultAfterChange` is a test seam, absent in production: it is forwarded unchanged to the island,
// whose chart then throws after a change. Only a test host sets it.
import { SRM_EVEN_HREF, SRM_PRESETS } from '@/lib/lab/diagnostics';
import { InertSrmControls, SrmFigureClient } from './SrmFigureClient';
import { SrmFigureView } from './SrmView';

export function SrmFigure({ faultAfterChange }: { faultAfterChange?: true } = {}) {
  const values = SRM_PRESETS.default;
  return (
    <SrmFigureClient
      preview={<SrmFigureView values={values} controls={<InertSrmControls values={values} />} />}
      faultAfterChange={faultAfterChange}
    />
  );
}

/** The link under the Figure to the even preset: JavaScript only, since the static page draws the default. */
export function SrmEvenLink() {
  return (
    <p data-js-only="" className="mt-4">
      <a
        href={SRM_EVEN_HREF}
        data-touch-target=""
        data-full-load=""
        className="inline-flex min-h-(--size-target) max-w-full items-center wrap-anywhere text-sm text-muted underline decoration-muted hover:text-ink focus-visible:text-ink"
      >
        See the same check on an even split
      </a>
    </p>
  );
}
