// Wordmark, navigation and two buttons: CV (secondary), which always opens the CV page (the PDF, when
// the build has one, is offered there), and Contact (primary). From lg (1024 px) up the four links and
// both buttons show; under lg the same links and both buttons live behind Menu, because four links and
// two buttons do not fit beside the wordmark in one row at 768 px.
// The header sticks only where it is safe (globals.css): at least md wide and 700 px
// tall. On a shorter screen it would take too much of the page, so it scrolls away there.
// The glyph before the name shows at every width: 48 px from xs (480 px) up, and a 28 px variant of the
// same construction (bar, end caps, dot with its halo) under it, so the header keeps one row at 375 and
// 390 px with 44 px targets. The Menu icon likewise shows from xs up; the word is the target below.
import Link from 'next/link';
import { ButtonLink } from '@/components/kit/ButtonLink';
import { IntervalGlyph } from '@/components/kit/IntervalGlyph';
import { CONTACT_LINK, CV_LINK, SITE } from '@/lib/site';
import { MenuDisclosure } from './MenuDisclosure';
import { NavLinks } from './NavLinks';

/** The glyph's width under xs (480 px); the full one is 48 px. */
const PHONE_GLYPH_LENGTH = 28;

export function SiteHeader() {
  return (
    <header data-site-header="" className="z-(--z-header) border-b border-line bg-bg md:h-(--header-h)">
      <div className="mx-auto flex min-h-(--header-h) max-w-page flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-2 md:h-full md:px-8">
        {/* No prefetch: the proxy draws a group per request to /, and Next 16.4 re-requests a prefetched /. */}
        <Link
          href="/"
          prefetch={false}
          data-touch-target
          className="inline-flex min-h-(--size-target) items-center gap-1.5 text-sm font-semibold text-ink xs:gap-2"
        >
          <span data-header-glyph="full" className="hidden shrink-0 xs:block">
            <IntervalGlyph />
          </span>
          <span data-header-glyph="phone" className="shrink-0 xs:hidden">
            <IntervalGlyph length={PHONE_GLYPH_LENGTH} />
          </span>
          <span>{SITE.name.replace('El Bergui', 'El Bergui')}</span>
        </Link>
        <div className="ml-auto flex max-w-full flex-wrap items-center justify-end gap-1 xs:gap-2 md:gap-6">
          <nav aria-label="Main" className="hidden lg:block">
            {/* One gap between labels whatever their length: each link pads its label evenly (a short
                label is centred in its 44 px target), and the list's negative margin keeps the outer
                labels on the row's edges. */}
            <NavLinks className="-mx-2.5 flex items-center gap-1 [&_a]:justify-center [&_a]:px-2.5" />
          </nav>
          <div className="hidden items-center gap-2 lg:flex">
            <ButtonLink href={CV_LINK.href} variant="secondary">
              {CV_LINK.label}
            </ButtonLink>
            <ButtonLink href={CONTACT_LINK.href} variant="primary">
              {CONTACT_LINK.label}
            </ButtonLink>
          </div>
          <MenuDisclosure>
            <NavLinks className="flex flex-col" />
            <div className="flex flex-col items-start gap-2 pt-2 pb-2">
              <ButtonLink href={CV_LINK.href} variant="secondary">
                {CV_LINK.label}
              </ButtonLink>
              <ButtonLink href={CONTACT_LINK.href} variant="primary">
                {CONTACT_LINK.label}
              </ButtonLink>
            </div>
          </MenuDisclosure>
        </div>
      </div>
    </header>
  );
}
