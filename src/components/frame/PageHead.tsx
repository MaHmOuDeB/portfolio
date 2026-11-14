// The top of a page: a chip with the page's name, the h1 (with an optional quiet clause) and an
// optional sub-headline, at the left.
import type { ReactNode } from 'react';
import { Chip } from './Chip';
import { Quiet } from './Quiet';

export type PageHeadProps = {
  id: string;
  chip: ReactNode;
  title: ReactNode;
  quiet?: ReactNode;
  sub?: ReactNode;
};

export function PageHead({ id, chip, title, quiet, sub }: PageHeadProps) {
  return (
    <div data-page-head="">
      <Chip>{chip}</Chip>
      <h1 id={id} className="max-w-[22em] text-h2-sm md:text-h2">
        {title}
        {quiet ? (
          <>
            {' '}
            <Quiet>{quiet}</Quiet>
          </>
        ) : null}
      </h1>
      {sub ? <p className="max-w-text text-muted">{sub}</p> : null}
    </div>
  );
}
