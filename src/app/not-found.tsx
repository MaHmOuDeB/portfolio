import type { Metadata } from 'next';
import { PageHead } from '@/components/frame';
import { ButtonLink } from '@/components/kit/ButtonLink';
import { TextLink } from '@/components/kit/TextLink';
import { CONTACT } from '@/lib/site';

export const metadata: Metadata = { title: 'Page not found' };

export default function NotFound() {
  return (
    <div className="pb-12 md:pb-16">
      <PageHead id="not-found-title" chip="Not found" title="Page not found" />
      <div className="max-w-text">
      <p>
        There is no page at this address. Check the address, or start from one of these pages.
      </p>
      <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 [&>a[href='/lab']]:min-w-(--size-target)">
        <ButtonLink href="/work" variant="primary">
          Work
        </ButtonLink>
        <TextLink href="/lab" standalone>
          Lab
        </TextLink>
        <TextLink href={CONTACT.linkedin} external standalone>
          LinkedIn
        </TextLink>
      </div>
      </div>
    </div>
  );
}
