// The twenty-second top of a case study: the outcome as a large paragraph, then four facts.
import type { ReactNode } from 'react';
import type { DataAttributes } from './data-attributes';

type Props = DataAttributes & { outcome: ReactNode; role: ReactNode; methods: ReactNode; tools: ReactNode; when: ReactNode };

export function GlanceBlock({ outcome, role, methods, tools, when, ...rest }: Props) {
  return (
    <section aria-label="At a glance" data-glance="" {...rest}>
      <p data-glance-outcome="">{outcome}</p>
      <dl data-glance-facts="">
        <div>
          <dt>Role</dt>
          <dd>{role}</dd>
        </div>
        <div>
          <dt>Methods</dt>
          <dd>{methods}</dd>
        </div>
        <div>
          <dt>Tools</dt>
          <dd>{tools}</dd>
        </div>
        <div>
          <dt>When</dt>
          <dd>{when}</dd>
        </div>
      </dl>
    </section>
  );
}
