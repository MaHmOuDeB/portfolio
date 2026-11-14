// The top of a case study, a build note, the Lab or a form page: the chip (such as "Case study"), the page's own
// h1, its standfirst (block content) and, when there is one, the line on my role. Server-safe.
import type { ReactNode } from 'react';
import { Chip } from '@/components/frame';

export function CaseHead({
  id,
  chip,
  title,
  intro,
  role,
}: {
  id: string;
  chip: ReactNode;
  title: ReactNode;
  intro: ReactNode;
  role?: ReactNode;
}) {
  return (
    <div data-page-head="" data-case-head="">
      <Chip>{chip}</Chip>
      <h1 id={id} className="max-w-[22em] text-h2-sm md:text-h2">
        {title}
      </h1>
      <div className="mt-4 max-w-text text-lg text-muted">{intro}</div>
      {role ? (
        <p data-note-role="" className="mt-4 max-w-text">
          {role}
        </p>
      ) : null}
    </div>
  );
}
