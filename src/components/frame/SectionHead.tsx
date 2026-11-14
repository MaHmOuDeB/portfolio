// The head of a section: a chip, the h2 (with an optional quiet clause) and an optional sub-headline,
// centred or at the left. The h2 carries `id`, so the section can be labelled by it.
import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';
import { Chip } from './Chip';
import { Quiet } from './Quiet';

export type SectionHeadProps = {
  id: string;
  chip: ReactNode;
  title: ReactNode;
  quiet?: ReactNode;
  /** One sentence under the headline; may hold inline chips. */
  sub?: ReactNode;
  align?: 'center' | 'left';
};

export function SectionHead({ id, chip, title, quiet, sub, align = 'center' }: SectionHeadProps) {
  return (
    <div data-section-head="" data-align={align}>
      <Chip>{chip}</Chip>
      <h2 id={id} className="text-h2-sm md:text-h2">
        {title}
        {quiet ? (
          <>
            {' '}
            <Quiet>{quiet}</Quiet>
          </>
        ) : null}
      </h2>
      {sub ? <p className={cx('max-w-[34em] text-muted', align === 'center' && 'mx-auto')}>{sub}</p> : null}
    </div>
  );
}
