// The twenty-second top of a case study: a white hairline card. With `points` it opens on up to three pull
// figures (each large, with one short label), then the outcome as ONE sentence, then the facts; without them
// the outcome is the large paragraph it always was. The facts start with "When" and may end with "Scope"
// (what the project is and is not). It is in the first screen, so it lifts once on load (a hinge on its
// bottom edge, by transform only) and its facts settle in turn; it never fades, and it never waits for the scroll.
import type { ReactNode } from 'react';
import type { DataAttributes } from './data-attributes';

/** A pull figure: the figure comes in as a <Fact> or a Derived, the label is one short line. */
export type GlancePoint = { id: string; figure: ReactNode; label: ReactNode };

export type GlanceParts = {
  outcome: ReactNode;
  role: ReactNode;
  methods: ReactNode;
  tools: ReactNode;
  when: ReactNode;
  /** Up to three pull figures above the outcome; more are not drawn. */
  points?: readonly GlancePoint[];
  /** A fifth fact: what the project is and is not. */
  scope?: ReactNode;
};
/** The block's own words: its landmark name, the key figures' list name and the five fact terms. English by default. */
export type GlanceLabels = {
  region: string;
  points: string;
  when: string;
  role: string;
  methods: string;
  tools: string;
  scope: string;
};

export const GLANCE_LABELS_EN: GlanceLabels = {
  region: 'At a glance',
  points: 'Key figures',
  when: 'When',
  role: 'Role',
  methods: 'Methods',
  tools: 'Tools',
  scope: 'Scope',
};

type Props = DataAttributes & GlanceParts & { labels?: GlanceLabels };

const MAX_POINTS = 3;

export function GlanceBlock({ outcome, role, methods, tools, when, points, scope, labels = GLANCE_LABELS_EN, ...rest }: Props) {
  const shown = (points ?? []).slice(0, MAX_POINTS);
  const facts: Array<[string, ReactNode]> = [
    [labels.when, when],
    [labels.role, role],
    [labels.methods, methods],
    [labels.tools, tools],
  ];
  if (scope) facts.push([labels.scope, scope]);
  return (
    <section
      aria-label={labels.region}
      data-glance=""
      className="mt-8 rounded-xl border border-hairline bg-surface p-5 md:p-8 [&_[data-glance-rule]]:bg-hairline [&>[data-glance-rule]:last-child]:hidden"
      data-depth-hinge="load"
      {...rest}
    >
      {shown.length > 0 ? (
        // role="list": WebKit drops the list role from a list drawn without bullets.
        <ul role="list" data-glance-points="" data-count={shown.length} aria-label={labels.points}>
          {shown.map((point) => (
            <li key={point.id} data-glance-point="">
              <p data-glance-figure="">{point.figure}</p>
              <p data-glance-label="">{point.label}</p>
            </li>
          ))}
        </ul>
      ) : null}
      <p data-glance-outcome="">{outcome}</p>
      <span data-glance-rule="" data-depth-draw="" aria-hidden="true" />
      <dl data-glance-facts="" data-count={facts.length}>
        {facts.map(([term, value]) => (
          <div key={term}>
            <dt>{term}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <span data-glance-rule="" data-depth-draw="" aria-hidden="true" />
    </section>
  );
}
