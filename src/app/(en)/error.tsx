'use client';

import { ErrorMessage } from '@/components/shell/ErrorMessage';

// Catches errors inside a page. It renders inside the root layout, so the header and footer stay.
// `reset` is accepted but unused: `retry` re-fetches and re-renders, which is what a visitor wants.
export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
  reset: () => void;
}) {
  return <ErrorMessage error={error} retry={retry} />;
}
