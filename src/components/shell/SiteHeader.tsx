// Wordmark, navigation and the CV link: "CV (PDF)" when the build has a checked PDF, else "CV" to
// the CV page (src/lib/cv-pdf.ts), so it never points at a missing file. From md up the full navigation shows; under md the same list
// lives behind Menu. The header sticks only where it is safe (globals.css): at least md wide and 700 px
// tall. On a shorter screen it would take too much of the page, so it scrolls away there.
// The glyph before the name shows at every width: 48 px from xs (480 px) up, and a 28 px variant of the
// same construction (bar, end caps, dot with its halo) under it, so the header keeps one row at 375 and
// 390 px with 44 px targets. The Menu icon likewise shows from xs up; the word is the target below.
import Link from 'next/link';
import { ButtonLink } from '@/components/kit/ButtonLink';
import { IntervalGlyph } from '@/components/kit/IntervalGlyph';
import { cvNavLink } from '@/lib/cv-pdf';
import { SITE } from '@/lib/site';
import { MenuDisclosure } from './MenuDisclosure';
import { NavLinks } from './NavLinks';

/** The glyph's width under xs (480 px); the full one is 48 px. */
const PHONE_GLYPH_LENGTH = 28;

export function SiteHeader() {
  const cv = cvNavLink();
  return (
    <header data-site-header="" className="z-(--z-header) border-b border-line bg-bg md:h-(--header-h)">
      <div className="mx-auto flex min-h-(--header-h) max-w-page flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-2 md:h-full md:px-8">
        <Link
          href="/"
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
          <nav aria-label="Main" className="hidden md:block">
            <NavLinks className="flex items-center gap-6" />
          </nav>
          {/* The icon needs room the phone header does not have, so each size gets its own link. */}
          <div className="hidden md:block">
            <ButtonLink href={cv.href} variant="secondary" icon={cv.download ? 'download' : undefined} download={cv.download}>
              {cv.label}
            </ButtonLink>
          </div>
          <div className="md:hidden">
            <ButtonLink href={cv.href} variant="secondary" download={cv.download} compact>
              {cv.label}
            </ButtonLink>
          </div>
          <MenuDisclosure>
            <NavLinks className="flex flex-col" />
          </MenuDisclosure>
        </div>
      </div>
    </header>
  );
}
