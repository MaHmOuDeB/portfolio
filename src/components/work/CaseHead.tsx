// The top of a case study, a build note, the Lab or a form page: the chip (such as "Case study"), the page's own
// h1 with an optional quiet second clause, its standfirst (block content), the line on my role when there is one,
// and an optional row of compact buttons (the repository, the live demo) that wraps on a phone. Server-safe.
import type { ReactNode } from 'react';
import { Chip, Quiet } from '@/components/frame';
import { ButtonLink } from '@/components/kit/ButtonLink';
import type { IconName } from '@/components/kit/Icon';

export type CaseAction = {
  href: string;
  label: ReactNode;
  /** Another site: rel="noopener". */
  external?: boolean;
  icon?: IconName;
  /** Secondary unless said: the page's primary button is in its closing call to action. */
  variant?: 'primary' | 'secondary';
};

export function CaseHead({
  id,
  chip,
  title,
  quiet,
  intro,
  role,
  actions,
}: {
  id: string;
  chip: ReactNode;
  title: ReactNode;
  /** The quiet second clause of the h1 (large text only: the h1 is never below 32 px). */
  quiet?: ReactNode;
  intro: ReactNode;
  role?: ReactNode;
  actions?: readonly CaseAction[];
}) {
  return (
    <div data-page-head="" data-case-head="">
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
      <div className="mt-4 max-w-text text-lg text-muted">{intro}</div>
      {role ? (
        <p data-note-role="" className="mt-4 max-w-text">
          {role}
        </p>
      ) : null}
      {actions && actions.length > 0 ? (
        <div data-case-actions="" className="mt-6 flex flex-wrap gap-2.5">
          {actions.map((action, i) => (
            <ButtonLink key={i} href={action.href} variant={action.variant ?? 'secondary'} icon={action.icon} external={action.external}>
              {action.label}
            </ButtonLink>
          ))}
        </div>
      ) : null}
    </div>
  );
}
