'use client';

// The owner's page body. The token arrives in the URL fragment (/exclude#t=...), which a browser
// never sends to a server. On load this reads it, clears it from the address bar and history entry
// at once, and POSTs it to /api/exclude, which answers with the exclusion cookie. It reads no
// storage of any kind, and the token is held only in memory for the one request.
import { useEffect, useRef, useState } from 'react';
import { buttonClass } from '@/components/kit/ButtonLink';

type Status = 'idle' | 'working' | 'excluded' | 'included' | 'refused' | 'failed';

const MESSAGE: Record<Status, string> = {
  idle: 'Open this page from my private link to leave this browser out of the counts.',
  working: 'Saving.',
  excluded: 'This browser is now left out of the counts.',
  included: 'This browser is counted again.',
  refused: 'The link was not accepted. Check it and try again.',
  failed: 'That did not work. Try again in a moment.',
};

/** The `t` value of a fragment such as "#t=abc", or null when there is none. A plus sign stays a plus. */
function tokenFromHash(hash: string): string | null {
  const match = /^#(?:.*&)?t=([^&]*)/.exec(hash);
  if (match?.[1] === undefined || match[1] === '') return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

async function call(method: 'POST' | 'DELETE', token?: string): Promise<Status> {
  try {
    const res = await fetch('/api/exclude', {
      method,
      cache: 'no-store',
      credentials: 'same-origin',
      headers: token === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: token === undefined ? undefined : JSON.stringify({ t: token }),
    });
    if (res.status === 204) return method === 'POST' ? 'excluded' : 'included';
    return res.status === 403 || res.status === 404 ? 'refused' : 'failed';
  } catch {
    return 'failed';
  }
}

export function ExcludeThisBrowser() {
  const [status, setStatus] = useState<Status>('idle');
  // React runs effects twice in development; the fragment is gone after the first run.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const token = tokenFromHash(window.location.hash);
    if (token === null) return;
    // Drop the fragment (and any query) before anything else can read or copy the address.
    window.history.replaceState(null, '', window.location.pathname);
    void send('POST', token);
  }, []);

  async function send(method: 'POST' | 'DELETE', token?: string) {
    setStatus('working');
    setStatus(await call(method, token));
  }

  return (
    <div className="mt-6 max-w-text">
      <p role="status" aria-live="polite" className="text-base">
        {MESSAGE[status]}
      </p>
      <div className="mt-6">
        <button
          type="button"
          data-touch-target
          className={buttonClass('secondary')}
          disabled={status === 'working'}
          onClick={() => void send('DELETE')}
        >
          Count this browser again
        </button>
      </div>
    </div>
  );
}
