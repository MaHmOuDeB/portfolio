// The MarketingWS build note. It copies the Retention page's structure (one h1 with a line under
// it, the section links, then one <section id> per part, each labelled by its own h2) in the
// build-note template: the problem, the architecture with its diagram, how I checked it, the
// outcome, at least two limits, then the code and the demo. The prose comes from
// content/marketingws.tsx. The page prints no figure, has no interactive part and no motion, and
// links to other sites only as ordinary links.
import type { ReactNode } from 'react';
import { Figure } from '@/components/kit/Figure';
import { TextLink } from '@/components/kit/TextLink';
import {
  MARKETINGWS_STEPS,
  MarketingwsArchitecture,
  MarketingwsChecks,
  MarketingwsIntro,
  MarketingwsLimits,
  MarketingwsLinks,
  MarketingwsOutcome,
  MarketingwsProblem,
  STEPS_CAPTION,
  STEPS_TITLE,
} from '../../../content/marketingws';

export const MARKETINGWS_TITLE = 'MarketingWS';

/** The sections in page order: anchor id, heading and the short label of its section link. */
export const MARKETINGWS_SECTIONS = [
  { id: 'problem', title: 'The problem', link: 'Problem' },
  { id: 'architecture', title: 'Architecture', link: 'Architecture' },
  { id: 'how-i-checked-this', title: 'How I checked this', link: 'How I checked this' },
  { id: 'outcome', title: 'Outcome', link: 'Outcome' },
  { id: 'limits', title: 'Limits', link: 'Limits' },
  { id: 'code-and-demo', title: 'Code and demo', link: 'Code and demo' },
] as const;

type SectionId = (typeof MARKETINGWS_SECTIONS)[number]['id'];

const TEXT = 'max-w-text';

function Section({ id, children }: { id: SectionId; children: ReactNode }) {
  const entry = MARKETINGWS_SECTIONS.find((s) => s.id === id);
  if (!entry) throw new Error(`marketingws: no section ${id}`);
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="mt-12 md:mt-section">
      <h2 id={`${id}-title`} className={`${TEXT} text-xl font-semibold`}>
        {entry.title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** Prose in the readable column. */
function Prose({ children }: { children: ReactNode }) {
  return <div className={TEXT}>{children}</div>;
}

/** The links to each section, as one wrapping row of 44 px targets. */
function SectionLinks() {
  return (
    <nav aria-label="On this page" className={`${TEXT} mt-8`}>
      <ul className="flex flex-wrap gap-x-4">
        {MARKETINGWS_SECTIONS.map((s) => (
          <li key={s.id}>
            <TextLink href={`#${s.id}`} standalone>
              {s.link}
            </TextLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * One request, step by step: an ordered list of outlined steps, joined by short drawn connectors.
 * The list is the diagram's text and carries its order; the connectors are drawing only.
 */
function StepsDiagram() {
  return (
    <Figure kind="diagram" id="marketingws-steps" title={STEPS_TITLE} caption={STEPS_CAPTION}>
      <ol data-diagram="marketingws-steps" className="max-w-text">
        {MARKETINGWS_STEPS.map((step, i) => (
          <li key={step.id} data-step={step.id}>
            {i > 0 ? <span aria-hidden="true" data-connector="" className="ml-6 block h-4 w-px bg-muted" /> : null}
            <div className="rounded-sm border border-muted p-4">
              <p className="text-sm font-semibold">{step.name}</p>
              <p className="mt-1 text-sm text-muted">{step.text}</p>
            </div>
          </li>
        ))}
      </ol>
    </Figure>
  );
}

export function MarketingwsPage(): ReactNode {
  return (
    <article aria-labelledby="marketingws-title" className="py-12 md:py-section">
      <div className={TEXT}>
        <h1 id="marketingws-title" className="text-2xl font-semibold md:text-3xl">
          {MARKETINGWS_TITLE}
        </h1>
        <div className="mt-4 text-lg text-muted">
          <MarketingwsIntro />
        </div>
      </div>

      <SectionLinks />

      <Section id="problem">
        <Prose>
          <MarketingwsProblem />
        </Prose>
      </Section>

      <Section id="architecture">
        <Prose>
          <MarketingwsArchitecture />
        </Prose>
        <div className="mt-8">
          <StepsDiagram />
        </div>
      </Section>

      <Section id="how-i-checked-this">
        <Prose>
          <MarketingwsChecks />
        </Prose>
      </Section>

      <Section id="outcome">
        <Prose>
          <MarketingwsOutcome />
        </Prose>
      </Section>

      <Section id="limits">
        <Prose>
          <MarketingwsLimits />
        </Prose>
      </Section>

      <Section id="code-and-demo">
        <Prose>
          <MarketingwsLinks />
        </Prose>
      </Section>
    </article>
  );
}
