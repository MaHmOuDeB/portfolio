// The card beside the contact form from lg (under it on a phone): for a visitor who wants the facts
// before writing, the CV first, then LinkedIn and GitHub as compact buttons. It promises nothing the
// page does not already say. Server-safe.
import { ButtonLink } from '@/components/kit/ButtonLink';
import { CONTACT, CV_LINK } from '@/lib/site';

export function ContactSide() {
  return (
    <aside data-contact-side="" aria-labelledby="contact-side-title" className="rounded-xl border border-hairline bg-surface p-5 md:p-8">
      <h2 id="contact-side-title" className="text-lg font-semibold">
        Want the facts first?
      </h2>
      <div className="mt-4 flex flex-wrap gap-2.5">
        <ButtonLink href={CV_LINK.href} variant="primary">
          Read my CV
        </ButtonLink>
        <ButtonLink href={CONTACT.linkedin} variant="secondary" icon="linkedin" external compact>
          LinkedIn
        </ButtonLink>
        <ButtonLink href={CONTACT.github} variant="secondary" icon="github" external compact>
          GitHub
        </ButtonLink>
      </div>
    </aside>
  );
}
