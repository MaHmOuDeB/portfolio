'use client';

// The live character count under a TextArea. The server (and a visitor without JavaScript) sees
// "Up to <limit> characters"; after hydration it follows the textarea it names: "<n> characters
// left", "No characters left", or the alert icon and "<n> characters too many" in warn. Over the
// limit it also marks the textarea (data-over-limit, a warn border) so the visitor sees it at once;
// aria-invalid waits for a submit.
//
// The counter is in the textarea's aria-describedby, so it is read on focus; it is not live. A
// separate polite node repeats it about a second after typing stops, and only in the last tenth of
// the limit or over it, so a screen reader never chatters on every key. Only the number carries
// data-num and the caller's refs.
//
// On focus, Chrome scrolls only the caret into view, so a textarea entered from above the fold can
// stay mostly below it, its focus ring cut off. The counter then brings the whole textarea into
// view (block: nearest, which honours the page's scroll padding and the sticky header); it does
// nothing when the box already fits.
import { useEffect, useRef, useState } from 'react';
import { countSentence, countState, shouldAnnounce } from '@/lib/form/count';
import { formatValue } from '@/lib/facts/format';
import { derivedAttr, type DerivedRef } from './Derived';
import { Icon } from './Icon';

type Props = {
  /** The counter's id, which the textarea's aria-describedby names. */
  id: string;
  /** The textarea's id. */
  controlId: string;
  limit: number;
  refs: readonly DerivedRef[];
};

const ANNOUNCE_AFTER_MS = 1000;
const format = (n: number) => formatValue(n, 'count');

export function CharacterCount({ id, controlId, limit, refs }: Props) {
  // null until hydrated: the server text.
  const [length, setLength] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const control = document.getElementById(controlId);
    if (!(control instanceof HTMLTextAreaElement)) return;
    const update = (announce: boolean) => {
      const n = control.value.length;
      setLength(n);
      control.toggleAttribute('data-over-limit', n > limit);
      if (timer.current !== null) clearTimeout(timer.current);
      if (!announce) return;
      timer.current = setTimeout(() => {
        setAnnouncement(shouldAnnounce(n, limit) ? countSentence(countState(n, limit), format) : '');
      }, ANNOUNCE_AFTER_MS);
    };
    update(false);
    const onInput = () => update(true);
    // A form reset puts the default text back without an input event.
    const onReset = () => setTimeout(() => update(false), 0);
    let frame = 0;
    const onFocus = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => control.scrollIntoView({ block: 'nearest' }));
    };
    control.addEventListener('input', onInput);
    control.addEventListener('focus', onFocus);
    control.form?.addEventListener('reset', onReset);
    return () => {
      cancelAnimationFrame(frame);
      control.removeEventListener('focus', onFocus);
      control.removeEventListener('input', onInput);
      control.form?.removeEventListener('reset', onReset);
      if (timer.current !== null) clearTimeout(timer.current);
    };
  }, [controlId, limit]);

  const number = (n: number) => (
    <data value={n} data-num="" {...derivedAttr(refs)}>
      {format(n)}
    </data>
  );

  let body;
  if (length === null) {
    body = <>Up to {number(limit)} characters</>;
  } else {
    const state = countState(length, limit);
    const unit = state.n === 1 ? 'character' : 'characters';
    body =
      state.kind === 'none' ? (
        'No characters left'
      ) : state.kind === 'left' ? (
        <>
          {number(state.n)} {unit} left
        </>
      ) : (
        <>
          <span className="inline-flex shrink-0 pt-px">
            <Icon name="alert" />
          </span>
          <span>
            {number(state.n)} {unit} too many
          </span>
        </>
      );
  }
  const over = length !== null && length > limit;

  return (
    <>
      <p id={id} data-counter className={over ? 'mt-2 flex items-start gap-2 text-sm font-medium text-warn' : 'mt-2 text-sm text-muted'}>
        {body}
      </p>
      <span className="sr-only" aria-live="polite">
        {announcement}
      </span>
    </>
  );
}
