'use client';

// The content of the error boundary pages (error.tsx and global-error.tsx). A client component:
// "Try again" calls the boundary's retry. The error itself is logged and never shown.
import { useEffect } from 'react';
import { buttonClass } from '@/components/kit/ButtonLink';
import { TextLink } from '@/components/kit/TextLink';
import { CONTACT } from '@/lib/site';

type Props = {
  error: Error & { digest?: string };
  retry: () => void;
};

export function ErrorMessage({ error, retry }: Props) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="max-w-text py-section">
      <h1 className="text-2xl font-semibold md:text-3xl">This page could not load</h1>
      <p className="mt-4">
        An error stopped this page from loading. Try again. If it happens again, send me the page
        address on LinkedIn.
      </p>
      <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2">
        <button type="button" data-touch-target className={buttonClass('primary')} onClick={() => retry()}>
          Try again
        </button>
        <TextLink href="/work" standalone>
          Work
        </TextLink>
        <TextLink href="/lab" standalone>
          Lab
        </TextLink>
        <TextLink href={CONTACT.linkedin} external standalone>
          LinkedIn
        </TextLink>
      </div>
    </div>
  );
}
