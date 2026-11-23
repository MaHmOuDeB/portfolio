// The card beside the contact form from lg (under it on a phone): for a visitor who wants the facts
// before writing, the CV first, then LinkedIn and GitHub as compact buttons. It promises nothing the
// page does not already say. Server-safe.
import { ButtonLink } from '@/components/kit/ButtonLink';
import { localHref } from '@/lib/i18n/href';
import type { Locale } from '@/lib/i18n/locale';
import { CONTACT, CV_LINK } from '@/lib/site';
import { contactCopy } from './copy';

export function ContactSide({ locale = 'en' }: { locale?: Locale } = {}) {
  const { side } = contactCopy(locale);
  return (
    <aside data-contact-side="" aria-labelledby="contact-side-title" className="rounded-xl border border-hairline bg-surface p-5 md:p-8">
      <h2 id="contact-side-title" className="text-lg font-semibold">
        {side.title}
      </h2>
      <div className="mt-4 flex flex-wrap gap-2.5">
        <ButtonLink href={localHref(locale, CV_LINK.href)} variant="primary">
          {side.cv}
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
