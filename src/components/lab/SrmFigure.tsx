// The split-check Figure as a page places it. The server draws the default preset (a simulated
// 5,170 to 4,830 split against an even split, flagged) with the open table: the static
// HTML, also what a visitor without JavaScript keeps. Under it the page places SrmEvenLink: with
// JavaScript, one link opens the even preset, as a full page load so the island reads `srm.preset`
// from the address. The island receives no data: it computes the reader's setting itself, with the
// same pure model, so no number is serialized into the page for it. It loads on intent, or at once
// for a URL with `srm.` keys.
//
// `faultAfterChange` is a test seam, absent in production: it is forwarded unchanged to the island,
// whose chart then throws after a change. Only a test host sets it.
import type { ReactNode } from 'react';
import { localHref } from '@/lib/i18n/href';
import type { Locale } from '@/lib/i18n/locale';
import { labCopy } from '@/lib/lab/copy';
import { SRM_EVEN_HREF, SRM_PRESETS } from '@/lib/lab/diagnostics';
import { EN_SRM } from '@/lib/lab/text-srm';
import { InertSrmControls, SrmFigureClient } from './SrmFigureClient';
import { SrmFigureView } from './SrmView';

export function SrmFigure({ faultAfterChange, locale = 'en' }: { faultAfterChange?: true; locale?: Locale } = {}) {
  const values = SRM_PRESETS.default;
  // The words go to the client only in a language other than English, so the English payload is unchanged.
  const text = locale === 'en' ? undefined : labCopy(locale).srm;
  const view = <SrmFigureView values={values} text={text} controls={text ? <InertSrmControls values={values} text={text} /> : <InertSrmControls values={values} />} />;
  return text ? (
    <SrmFigureClient preview={view} faultAfterChange={faultAfterChange} text={text} />
  ) : (
    <SrmFigureClient preview={view} faultAfterChange={faultAfterChange} />
  );
}

/**
 * Links under an exhibit to another setting of its Figure: JavaScript only, since the static page
 * draws the preset, and plain anchors, so each is a full page load and the island reads the address.
 */
export function PresetLinks({ links }: { links: readonly { href: string; label: ReactNode }[] }) {
  return (
    <p data-js-only="" data-preset-links="" className="mt-4 flex flex-wrap gap-x-6">
      {links.map((link) => (
        <a
          key={link.href}
          href={link.href}
          data-touch-target=""
          data-full-load=""
          className="inline-flex min-h-(--size-target) max-w-full items-center wrap-anywhere text-sm text-muted underline decoration-muted hover:text-ink focus-visible:text-ink"
        >
          {/* One flex item: a label with a number in it keeps the spaces around the number. */}
          <span>{link.label}</span>
        </a>
      ))}
    </p>
  );
}

/** The link under the split check to the even preset. */
export function SrmEvenLink({ locale = 'en' }: { locale?: Locale } = {}) {
  const text = locale === 'en' ? EN_SRM : labCopy(locale).srm;
  return <PresetLinks links={[{ href: localHref(locale, SRM_EVEN_HREF), label: text.evenLink }]} />;
}
