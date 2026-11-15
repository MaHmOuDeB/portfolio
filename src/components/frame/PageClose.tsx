// The closing section of an inner page: what the page shows about how I work, in a short body, and
// one to three onward links drawn as the system's secondary buttons. A ruled section like the page's
// others, labelled by its h2. Its id does not end in "-title", so a page's rule for its own section
// headings (which rise) leaves this one still.
import type { ReactNode } from 'react';
import { ButtonLink } from '@/components/kit/ButtonLink';
import { SECTION_H2 } from './SectionHead';

export type PageCloseLink = { href: string; label: ReactNode; external?: boolean };

export type PageCloseProps = {
  /** The h2's id, which names the section. */
  id?: string;
  title?: ReactNode;
  /** One to three onward links. */
  links: readonly PageCloseLink[];
  /** A short body: one or two paragraphs. */
  children: ReactNode;
};

export function PageClose({ id = 'what-this-shows', title = 'What this shows about how I work', links, children }: PageCloseProps) {
  return (
    <section data-page-close="" data-rule="" aria-labelledby={id} className="mt-12 pt-12 md:mt-16 md:pt-16">
      <h2 id={id} className={SECTION_H2}>
        {title}
      </h2>
      <div data-page-close-body="">{children}</div>
      {links.length > 0 ? (
        <div data-page-close-links="">
          {links.map((link, i) => (
            <ButtonLink key={i} href={link.href} variant="secondary" external={link.external}>
              {link.label}
            </ButtonLink>
          ))}
        </div>
      ) : null}
    </section>
  );
}
