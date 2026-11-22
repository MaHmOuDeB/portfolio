'use client';

import { useSyncExternalStore } from 'react';
import { ErrorMessage } from '@/components/shell/ErrorMessage';
import { GermanErrorMessage } from '@/components/shell/GermanErrorMessage';
import { inter } from './fonts';
import './globals.css';

const noSubscription = () => () => {};
const onGermanPath = () => location.pathname === '/de' || location.pathname.startsWith('/de/');

// Catches errors in the root layout, so it replaces the layout: its own html and body, no header
// or footer. A client component cannot export metadata, so the title is React's <title>. It has no
// layout to take a language from, so it reads the path: under /de it speaks German.
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
  reset: () => void;
}) {
  const german = useSyncExternalStore(noSubscription, onGermanPath, () => false);
  return (
    <html lang={german ? 'de' : 'en'} className={inter.variable} suppressHydrationWarning>
      <body className="flex min-h-svh flex-col bg-bg font-sans text-base text-ink">
        {german ? null : <title>This page could not load</title>}
        <main className="mx-auto w-full max-w-page flex-1 px-4 md:px-8">
          {german ? <GermanErrorMessage error={error} retry={retry} withTitle /> : <ErrorMessage error={error} retry={retry} />}
        </main>
      </body>
    </html>
  );
}
