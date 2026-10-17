import type { Metadata } from 'next';
import { ButtonLink } from '@/components/kit/ButtonLink';
import { TextLink } from '@/components/kit/TextLink';
import { CONTACT } from '@/lib/site';

export const metadata: Metadata = { title: 'Page not found' };

export default function NotFound() {
  return (
    <div className="max-w-text py-section">
      <h1 className="text-2xl font-semibold md:text-3xl">Page not found</h1>
      <p className="mt-4">
        There is no page at this address. Check the address, or start from one of these pages.
      </p>
      <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2">
        <ButtonLink href="/work" variant="primary">
          Work
        </ButtonLink>
        <TextLink href="/lab" standalone>
          Lab
        </TextLink>
        <TextLink href={`mailto:${CONTACT.email}`} standalone>
          Email
        </TextLink>
      </div>
    </div>
  );
}
