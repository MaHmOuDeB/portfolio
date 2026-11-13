'use client';

// Moves focus to an element once, when the page that holds it opens: the "Message sent" block after
// the form's redirect. Focus scrolls it into view at once (no smooth scrolling).
import { useEffect } from 'react';

export function FocusOnArrival({ targetId }: { targetId: string }) {
  useEffect(() => {
    document.getElementById(targetId)?.focus();
  }, [targetId]);
  return null;
}
