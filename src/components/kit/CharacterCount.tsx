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
// data-num and the caller's refs. It never scrolls the page: on focus the browser does that, and the
// control's scroll margin (fieldControlClass) keeps the label and error above it in view.
import { useEffect, useRef, useState } from 'react';
import { countState, shouldAnnounce } from '@/lib/form/count';
import { fill } from '@/lib/i18n/template';
import { formatValue } from '@/lib/facts/format';
import { derivedAttr, type DerivedRef } from './Derived';
import { Icon } from './Icon';
import { aroundPlaceholder, EN_COUNT, type CountText } from './text';

type Props = {
  /** The counter's id, which the textarea's aria-describedby names. */
  id: string;
  /** The textarea's id. */
  controlId: string;
  limit: number;
  refs: readonly DerivedRef[];
  /** The counter's words and language; default English. */
  text?: CountText;
};

const ANNOUNCE_AFTER_MS = 1000;

/** The sentence a screen reader hears (the visible counter says the same). */
function sentence(state: ReturnType<typeof countState>, text: CountText, format: (n: number) => string): string {
  if (state.kind === 'none') return text.none;
  const forms = state.kind === 'left' ? text.left : text.over;
  return fill(state.n === 1 ? forms.one : forms.other, { n: format(state.n) });
}

export function CharacterCount({ id, controlId, limit, refs, text = EN_COUNT }: Props) {
  const format = (n: number) => formatValue(n, 'count', { locale: text.locale });
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
        setAnnouncement(shouldAnnounce(n, limit) ? sentence(countState(n, limit), text, (k) => formatValue(k, 'count', { locale: text.locale })) : '');
      }, ANNOUNCE_AFTER_MS);
    };
    update(false);
    const onInput = () => update(true);
    // A form reset puts the default text back without an input event.
    const onReset = () => setTimeout(() => update(false), 0);
    control.addEventListener('input', onInput);
    control.form?.addEventListener('reset', onReset);
    return () => {
      control.removeEventListener('input', onInput);
      control.form?.removeEventListener('reset', onReset);
      if (timer.current !== null) clearTimeout(timer.current);
    };
  }, [controlId, limit, text]);

  const number = (n: number) => (
    <data value={n} data-num="" {...derivedAttr(refs)}>
      {format(n)}
    </data>
  );

  let body;
  if (length === null) {
    const [before, after] = aroundPlaceholder(text.upTo, 'limit');
    body = (
      <>
        {before}
        {number(limit)}
        {after}
      </>
    );
  } else {
    const state = countState(length, limit);
    const forms = state.kind === 'left' ? text.left : text.over;
    const [before, after] = aroundPlaceholder(state.n === 1 ? forms.one : forms.other, 'n');
    body =
      state.kind === 'none' ? (
        text.none
      ) : state.kind === 'left' ? (
        <>
          {before}
          {number(state.n)}
          {after}
        </>
      ) : (
        <>
          <span className="inline-flex shrink-0 pt-px">
            <Icon name="alert" />
          </span>
          <span>
            {before}
            {number(state.n)}
            {after}
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
