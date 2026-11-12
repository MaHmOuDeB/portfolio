// The contact page's one status pattern: a word in the status colour with its icon, then the
// sentences, behind a 2 px rule at the left (the Callout idiom). It takes focus when it appears
// (tabIndex -1); it is not a live region. Server-safe.
import type { ReactNode, Ref } from 'react';
import { Icon } from '@/components/kit/Icon';
import { cx } from '@/lib/cx';

export const STATUS_ID = 'contact-status';

type Props = {
  tone: 'ok' | 'warn';
  word: string;
  /** "Message sent" is the page's h2 once the form is gone; a "not sent" word is a paragraph. */
  heading?: boolean;
  children: ReactNode;
  className?: string;
  ref?: Ref<HTMLDivElement>;
};

export function StatusBlock({ tone, word, heading, children, className, ref }: Props) {
  const Word = heading ? 'h2' : 'p';
  return (
    <div id={STATUS_ID} ref={ref} tabIndex={-1} data-status={tone} className={cx(tone === 'ok' ? 'border-l-2 border-ok pl-4' : 'border-l-2 border-warn pl-4', className)}>
      <Word className={cx('flex items-start gap-2 text-base font-semibold', tone === 'ok' ? 'text-ok' : 'text-warn')}>
        <span className="inline-flex shrink-0 pt-1">
          <Icon name={tone === 'ok' ? 'check' : 'alert'} />
        </span>
        {word}
      </Word>
      <div className="mt-1 text-base text-ink">{children}</div>
    </div>
  );
}
