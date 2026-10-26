// Contact and privacy. Visible labels only: the email address is printed only on /privacy (the
// controller's contact), never in the footer.
import { TextLink } from '@/components/kit/TextLink';
import { CONTACT, PRIVACY_HREF } from '@/lib/site';

export function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-page flex-wrap items-center gap-x-6 gap-y-1 px-4 py-4 md:px-8">
        <TextLink href={`mailto:${CONTACT.email}`} icon="mail" standalone>
          Email
        </TextLink>
        <TextLink href={CONTACT.linkedin} icon="linkedin" external standalone>
          LinkedIn
        </TextLink>
        <TextLink href={CONTACT.github} icon="github" external standalone>
          GitHub
        </TextLink>
        <TextLink href={PRIVACY_HREF} standalone>
          Privacy
        </TextLink>
      </div>
    </footer>
  );
}
