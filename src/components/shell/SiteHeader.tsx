// Wordmark, navigation and CV (PDF). From md up the full navigation shows; under md the same list
// lives behind Menu. The header sticks only where it is safe (globals.css): at least md wide and 700 px
// tall. On a shorter screen it would take too much of the page, so it scrolls away there.
import Link from 'next/link';
import { ButtonLink } from '@/components/kit/ButtonLink';
import { IntervalGlyph } from '@/components/kit/IntervalGlyph';
import { CV_LINK, SITE } from '@/lib/site';
import { MenuDisclosure } from './MenuDisclosure';
import { NavLinks } from './NavLinks';

export function SiteHeader() {
  return (
    <header data-site-header="" className="z-(--z-header) border-b border-line bg-bg md:h-(--header-h)">
      <div className="mx-auto flex min-h-(--header-h) max-w-page flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2 md:h-full md:px-8">
        <Link
          href="/"
          data-touch-target
          className="inline-flex min-h-(--size-target) items-center gap-2 text-sm font-semibold text-ink"
        >
          <span className="shrink-0">
            <IntervalGlyph />
          </span>
          <span>{SITE.name.replace('El Bergui', 'El Bergui')}</span>
        </Link>
        <div className="ml-auto flex items-center gap-2 md:gap-6">
          <nav aria-label="Main" className="hidden md:block">
            <NavLinks className="flex items-center gap-6" />
          </nav>
          {/* The icon needs room the phone header does not have, so each size gets its own link. */}
          <div className="hidden md:block">
            <ButtonLink href={CV_LINK.href} variant="secondary" icon="download" download>
              {CV_LINK.label}
            </ButtonLink>
          </div>
          <div className="md:hidden">
            <ButtonLink href={CV_LINK.href} variant="secondary" download>
              {CV_LINK.label}
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
