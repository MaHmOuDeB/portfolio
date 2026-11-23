// The call to action that ends Work, About and every case study: the foundation's ink panel with the
// shared words (German with `locale="de"`), in a ruled band of the frame. No portrait: that stays on Home. Server-safe.
import { CallToAction } from '@/components/frame';
import { localHref } from '@/lib/i18n/href';
import type { Locale } from '@/lib/i18n/locale';
import { CONTACT, CONTACT_HREF, CV_LINK } from '@/lib/site';
import { CTA_DE } from '../../../content/de/home';

export const PAGE_CTA = {
  title: 'Find out what I can do',
  quiet: 'for your team.',
  line: 'Open to roles in experimentation, product analytics and AI automation in Germany. Based in Berlin.',
  write: 'Write to me',
  cv: 'Read my CV',
  linkedin: 'LinkedIn',
} as const;

/** `omitCv` is for the CV page itself, where "Read my CV" would link to the page the visitor is on. */
export function PageCallToAction({
  id = 'page-cta-title',
  omitCv = false,
  locale = 'en',
}: {
  id?: string;
  omitCv?: boolean;
  locale?: Locale;
}) {
  const words = locale === 'de' ? CTA_DE : PAGE_CTA;
  return (
    <div data-rule="" data-page-cta="" className="print:hidden pb-12 pt-12 md:pb-16 md:pt-16">
      <CallToAction
        id={id}
        title={words.title}
        quiet={words.quiet}
        line={words.line}
        primary={{ label: words.write, href: localHref(locale, CONTACT_HREF) }}
        secondary={omitCv ? undefined : { label: words.cv, href: localHref(locale, CV_LINK.href) }}
        tertiary={{ label: words.linkedin, href: CONTACT.linkedin, external: true }}
      />
    </div>
  );
}
