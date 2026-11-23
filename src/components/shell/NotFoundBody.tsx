import { PageHead } from '@/components/frame';
import { ButtonLink } from '@/components/kit/ButtonLink';
import { TextLink } from '@/components/kit/TextLink';
import { localHref } from '@/lib/i18n/href';
import type { Locale } from '@/lib/i18n/locale';
import { CONTACT } from '@/lib/site';
import { shellCopy } from './copy';

// The 404 page's body in either language; the English route and the German one both draw it.
export function NotFoundBody({ locale = 'en' }: { locale?: Locale }) {
  const { notFound } = shellCopy(locale);
  const work = localHref(locale, '/work');
  const lab = localHref(locale, '/lab');
  return (
    <div className="pb-12 md:pb-16">
      <PageHead id="not-found-title" chip={notFound.chip} title={notFound.title} />
      <div className="max-w-text">
      <p>
        {notFound.body}
      </p>
      <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 [&>a[href$='/lab']]:min-w-(--size-target)">
        <ButtonLink href={work} variant="primary">
          {notFound.work}
        </ButtonLink>
        <TextLink href={lab} standalone>
          {notFound.lab}
        </TextLink>
        <TextLink href={CONTACT.linkedin} external standalone>
          {notFound.linkedin}
        </TextLink>
      </div>
      </div>
    </div>
  );
}
