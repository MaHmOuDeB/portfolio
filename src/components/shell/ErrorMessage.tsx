'use client';

// The content of the error boundary pages (error.tsx and global-error.tsx). A client component:
// "Try again" calls the boundary's retry. The error itself is logged and never shown.
import { useEffect } from 'react';
import { buttonClass } from '@/components/kit/ButtonLink';
import { TextLink } from '@/components/kit/TextLink';
import { localHref } from '@/lib/i18n/href';
import type { Locale } from '@/lib/i18n/locale';
import { CONTACT } from '@/lib/site';
import { ERROR_EN, type ErrorCopy } from '../../../content/shell';

type Props = {
  error: Error & { digest?: string };
  retry: () => void;
  /** The words and the language; English when a page passes neither. */
  text?: ErrorCopy;
  locale?: Locale;
};

export function ErrorMessage({ error, retry, text = ERROR_EN, locale = 'en' }: Props) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="max-w-text py-section">
      <h1 className="text-2xl font-semibold md:text-3xl">{text.title}</h1>
      <p className="mt-4">{text.body}</p>
      <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2">
        <button type="button" data-touch-target className={buttonClass('primary')} onClick={() => retry()}>
          {text.retry}
        </button>
        <TextLink href={localHref(locale, '/work')} standalone>
          {text.work}
        </TextLink>
        <TextLink href={localHref(locale, '/lab')} standalone>
          {text.lab}
        </TextLink>
        <TextLink href={CONTACT.linkedin} external standalone>
          {text.linkedin}
        </TextLink>
      </div>
    </div>
  );
}
