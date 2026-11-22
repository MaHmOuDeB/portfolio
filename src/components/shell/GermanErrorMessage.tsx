'use client';

// The error message in German, for a client error boundary. A client file never imports German copy
// (the bundle test), so the words load with a dynamic import: only a visitor who meets an error on a
// German page downloads them, and until they arrive nothing is drawn. If the words cannot load (a
// failed chunk), the English message shows instead, so the page is never blank.
import { lazy, Suspense } from 'react';
import { ERROR_EN } from '../../../content/shell';
import { ErrorMessage } from './ErrorMessage';

type Props = { error: Error & { digest?: string }; retry: () => void; withTitle?: boolean };

const Loaded = lazy(async () => {
  const words = await import('../../../content/de/shell-error').then(
    (m) => m.ERROR_DE,
    () => null,
  );
  return {
    default: function GermanError({ error, retry, withTitle }: Props) {
      if (!words) {
        return (
          <>
            {withTitle ? <title>{ERROR_EN.title}</title> : null}
            <ErrorMessage error={error} retry={retry} />
          </>
        );
      }
      const ERROR_DE = words;
      return (
        <>
          {withTitle ? <title>{ERROR_DE.title}</title> : null}
          <ErrorMessage error={error} retry={retry} text={ERROR_DE} locale="de" />
        </>
      );
    },
  };
});

export function GermanErrorMessage(props: Props) {
  return (
    <Suspense fallback={null}>
      <Loaded {...props} />
    </Suspense>
  );
}
