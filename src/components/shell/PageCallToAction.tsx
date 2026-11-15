// The call to action that ends Work, About and every case study: the foundation's ink panel with the
// shared words, in a ruled band of the frame. No portrait: that stays on Home. Server-safe.
import { CallToAction } from '@/components/frame';
import { CONTACT, CONTACT_HREF, CV_LINK } from '@/lib/site';

export const PAGE_CTA = {
  title: 'Find out what I can do',
  quiet: 'for your team.',
  line: 'Open to roles in AI automation, experimentation and product analytics in Germany. Based in Berlin.',
  write: 'Write to me',
  cv: 'Read my CV',
  linkedin: 'LinkedIn',
} as const;

/** `omitCv` is for the CV page itself, where "Read my CV" would link to the page the visitor is on. */
export function PageCallToAction({ id = 'page-cta-title', omitCv = false }: { id?: string; omitCv?: boolean }) {
  return (
    <div data-rule="" data-page-cta="" className="print:hidden pb-12 pt-12 md:pb-16 md:pt-16">
      <CallToAction
        id={id}
        title={PAGE_CTA.title}
        quiet={PAGE_CTA.quiet}
        line={PAGE_CTA.line}
        primary={{ label: PAGE_CTA.write, href: CONTACT_HREF }}
        secondary={omitCv ? undefined : { label: PAGE_CTA.cv, href: CV_LINK.href }}
        tertiary={{ label: PAGE_CTA.linkedin, href: CONTACT.linkedin, external: true }}
      />
    </div>
  );
}
