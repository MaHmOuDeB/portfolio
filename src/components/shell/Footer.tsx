// Contact and privacy, and the one colophon line, with visible labels only. The contact form and
// LinkedIn are the contact routes.
import { TextLink } from '@/components/kit/TextLink';
import { CONTACT, CONTACT_HREF, PRIVACY_HREF } from '@/lib/site';

export function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-page flex-wrap items-center gap-x-6 gap-y-1 px-4 py-4 md:px-8">
        <TextLink href={CONTACT_HREF} icon="mail" standalone>
          Contact
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
        <p className="basis-full text-sm text-muted">Built with Claude Code as pair-programmer.</p>
      </div>
    </footer>
  );
}
