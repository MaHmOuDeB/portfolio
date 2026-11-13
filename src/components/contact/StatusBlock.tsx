// The contact page's one status pattern: a word in the status colour with its icon, then the
// sentences, behind a 2 px rule at the left (the Callout idiom). It takes focus when it appears
// (tabIndex -1), or, for the sent block, its heading does; it is not a live region, so it is not read twice. It is a group named by its word,
// which is the page's h2 ("Message sent" or "Message not sent"), so a screen reader names it on focus
// and heading navigation finds it. Server-safe.
import type { ReactNode, Ref } from 'react';
import { Icon } from '@/components/kit/Icon';
import { cx } from '@/lib/cx';

export const STATUS_ID = 'contact-status';
export const WORD_ID = 'contact-status-word';

type Props = {
  tone: 'ok' | 'warn';
  word: string;
  children: ReactNode;
  className?: string;
  ref?: Ref<HTMLDivElement>;
  /** What takes focus: the whole block (the default), or only its heading, so the ring sits on the words and not around the ruled block. */
  focus?: 'block' | 'heading';
};

export function StatusBlock({ tone, word, children, className, ref, focus = 'block' }: Props) {
  return (
    <div
      id={STATUS_ID}
      ref={ref}
      tabIndex={focus === 'block' ? -1 : undefined}
      role="group"
      aria-labelledby={WORD_ID}
      data-status={tone}
      className={cx(tone === 'ok' ? 'border-l-2 border-ok pl-4' : 'border-l-2 border-warn pl-4', className)}
    >
      <h2
        id={WORD_ID}
        tabIndex={focus === 'heading' ? -1 : undefined}
        className={cx('flex items-start gap-2 text-base font-semibold', focus === 'heading' && 'w-fit', tone === 'ok' ? 'text-ok' : 'text-warn')}
      >
        <span className="inline-flex shrink-0 pt-1">
          <Icon name={tone === 'ok' ? 'check' : 'alert'} />
        </span>
        {word}
      </h2>
      <div className="mt-1 text-base text-ink">{children}</div>
    </div>
  );
}
