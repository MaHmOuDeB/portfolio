// The ink footer: the wordmark, the site's line in two tones, three link columns (Site, Contact,
// Legal) in one nav named "Footer": three across from md, and under md as many as fit columns of at
// least 4.5rem (three at normal text size, fewer when the text is enlarged). On a phone it follows the page's last
// block with no margin of its own (the page's closing space is enough); from md it keeps 80 px. The column titles are plain text that
// labels its list, not headings, so the page outline never gains a second "Contact". Visible labels only; the contact form and LinkedIn are the
// contact routes, and there is no e-mail address. Every link is a 44 px target both ways, however short its label.
import Link from 'next/link';
import type { ReactNode } from 'react';
import { IntervalGlyph } from '@/components/kit/IntervalGlyph';
import { prefetchFor } from '@/lib/nav';
import { CONTACT, CONTACT_HREF, CV_LINK, HEADLINE, NAV, PRIVACY_HREF, SITE } from '@/lib/site';

type FooterLink = { label: string; href: string; external?: boolean };

const COLUMNS: { heading: string; links: FooterLink[] }[] = [
  { heading: 'Site', links: [...NAV, CV_LINK] },
  {
    heading: 'Contact',
    links: [
      { label: 'Contact', href: CONTACT_HREF },
      { label: 'LinkedIn', href: CONTACT.linkedin, external: true },
      { label: 'GitHub', href: CONTACT.github, external: true },
    ],
  },
  { heading: 'Legal', links: [{ label: 'Privacy', href: PRIVACY_HREF }] },
];

// scroll-my-2: the columns sit side by side, so focus moves up from the last Site link to the first
// Contact link; WebKit then aligns the link's box, not its ring, with the top of the screen, and the
// 8 px margin keeps the 4 px ring on screen (seen on a 320 by 180 px screen, 400% zoom).
const LINK =
  'inline-flex min-h-(--size-target) min-w-(--size-target) scroll-my-2 items-center text-sm text-on-ink transition-colors hover:text-surface focus-visible:text-surface';

function FooterAnchor({ href, external, children }: { href: string; external?: boolean; children: ReactNode }) {
  return external ? (
    <a href={href} rel="noopener" data-touch-target className={LINK}>
      {children}
    </a>
  ) : (
    <Link href={href} prefetch={prefetchFor(href)} data-touch-target className={LINK}>
      {children}
    </Link>
  );
}

export function Footer() {
  return (
    <footer data-ink="" className="mt-0 bg-ink text-on-ink md:mt-20">
      <div className="mx-auto grid max-w-page grid-cols-2 gap-x-8 gap-y-10 px-4 pt-14 pb-10 wrap-break-word md:grid-cols-[1.4fr_1fr_1fr_1fr] md:px-8">
        <div className="col-span-2 md:col-span-1">
          {/* No prefetch: the proxy draws a group per request to /. */}
          <Link
            href="/"
            prefetch={false}
            data-touch-target
            className="inline-flex min-h-(--size-target) items-center gap-2 text-sm font-semibold text-surface"
          >
            <IntervalGlyph />
            <span>{SITE.name}</span>
          </Link>
          <p className="mt-3 max-w-[18em] text-lg font-heading tracking-heading text-surface">
            {HEADLINE.lead} <span className="text-on-ink-muted">{HEADLINE.quiet}</span>
          </p>
        </div>
        <nav aria-label="Footer" className="col-span-2 grid grid-cols-[repeat(auto-fit,minmax(4.5rem,1fr))] gap-x-4 gap-y-10 md:col-span-3 md:grid-cols-3 md:gap-x-8">
          {COLUMNS.map((col) => {
            const id = `footer-${col.heading.toLowerCase()}`;
            return (
              <div key={col.heading}>
                <p id={id} className="text-sm font-medium text-surface">
                  {col.heading}
                </p>
                <ul aria-labelledby={id} className="mt-2">
                  {col.links.map((link) => (
                    <li key={link.href}>
                      <FooterAnchor href={link.href} external={link.external}>
                        {link.label}
                      </FooterAnchor>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </nav>
      </div>
    </footer>
  );
}
