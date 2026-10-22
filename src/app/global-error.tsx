'use client';

import { ErrorMessage } from '@/components/shell/ErrorMessage';
import { inter } from './fonts';
import './globals.css';

// Catches errors in the root layout, so it replaces the layout: its own html and body, no header
// or footer. A client component cannot export metadata, so the title is React's <title>.
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
  reset: () => void;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="flex min-h-svh flex-col bg-bg font-sans text-base text-ink">
        <title>This page could not load</title>
        <main className="mx-auto w-full max-w-page flex-1 px-4 md:px-8">
          <ErrorMessage error={error} retry={retry} />
        </main>
      </body>
    </html>
  );
}
