// Contact and privacy, with visible labels only. LinkedIn is the contact route.
import { TextLink } from '@/components/kit/TextLink';
import { CONTACT, PRIVACY_HREF } from '@/lib/site';

export function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-page flex-wrap items-center gap-x-6 gap-y-1 px-4 py-4 md:px-8">
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
