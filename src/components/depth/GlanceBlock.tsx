// The twenty-second top of a case study: a white hairline card with the outcome as a large paragraph, then four facts.
// It is in the first screen, so it lifts once on load (a hinge on its bottom edge, by transform only) and its
// four facts settle in turn; it never fades, and it never waits for the scroll.
import type { ReactNode } from 'react';
import type { DataAttributes } from './data-attributes';

export type GlanceParts = { outcome: ReactNode; role: ReactNode; methods: ReactNode; tools: ReactNode; when: ReactNode };
type Props = DataAttributes & GlanceParts;

export function GlanceBlock({ outcome, role, methods, tools, when, ...rest }: Props) {
  return (
    <section
      aria-label="At a glance"
      data-glance=""
      className="mt-8 rounded-xl border border-hairline bg-surface p-5 md:p-8 [&_[data-glance-rule]]:bg-hairline [&>[data-glance-rule]:last-child]:hidden"
      data-depth-hinge="load"
      {...rest}
    >
      <p data-glance-outcome="">{outcome}</p>
      <span data-glance-rule="" data-depth-draw="" aria-hidden="true" />
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
      <span data-glance-rule="" data-depth-draw="" aria-hidden="true" />
    </section>
  );
}
