'use client';

import { GermanErrorMessage } from '@/components/shell/GermanErrorMessage';

// The German twin of (en)/error.tsx: it renders inside the German layout, so the header and footer
// stay. `reset` is accepted but unused: `retry` re-fetches and re-renders.
export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
  reset: () => void;
}) {
  return <GermanErrorMessage error={error} retry={retry} />;
}
