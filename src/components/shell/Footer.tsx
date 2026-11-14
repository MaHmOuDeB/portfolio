// The ink footer: the wordmark, the site's line in two tones, three link columns (Site, Contact,
// Legal) and the one colophon line. Visible labels only; the contact form and LinkedIn are the
// contact routes, and there is no e-mail address. Every link is a 44 px target.
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

const LINK =
  'inline-flex min-h-(--size-target) items-center text-sm text-on-ink transition-colors hover:text-surface focus-visible:text-surface';

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
    <footer data-ink="" className="mt-20 bg-ink text-on-ink">
      <div className="mx-auto grid max-w-page grid-cols-2 gap-x-8 gap-y-10 px-4 pt-14 pb-10 md:grid-cols-[1.4fr_1fr_1fr_1fr] md:px-8">
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
        {COLUMNS.map((col) => (
          <div key={col.heading}>
            <h2 className="text-sm font-medium text-surface">{col.heading}</h2>
            <ul className="mt-2">
              {col.links.map((link) => (
                <li key={link.href}>
                  <FooterAnchor href={link.href} external={link.external}>
                    {link.label}
                  </FooterAnchor>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <p className="border-t border-rule-on-ink pt-6 text-sm text-on-ink-muted col-span-2 md:col-span-4">Built with Claude Code as pair-programmer.</p>
      </div>
    </footer>
  );
}
