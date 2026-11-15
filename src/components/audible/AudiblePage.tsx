// The Audible case study, in the reading model of the inner pages: the title and a plain opening with
// one action, the glance card (three pull figures, one sentence, the facts with the scope), the
// in-page links, then one <section> per part with its own h2. The exhibits come first: the ship rule
// with its Figure between a lead-in and a takeaway, why so many recommendations were adopted, the
// tool I built with its two timings, and the AI tools. Then the method (what I did myself in view,
// the rest in details rows one click deeper), the limits, and the sources. The page closes on what
// it shows about how I work, the next project, and the shared call to action. The prose comes from
// content/audible.tsx.
//
// Layout: prose sits in the readable column (max-w-text); the Figure and the two timings sit in a
// figure sheet that runs the full rail. Nothing here moves. No result of any real test is on this
// page: the ship-rule Figure is a made-up product with typed-in bounds and carries the "Simulated"
// badge; the two timings are my own, approximate, and say so.
import type { ReactNode } from 'react';
import { GlanceBlock } from '@/components/depth/GlanceBlock';
import { FigureSheet, LeadIn, MethodDetails, NextRow, PageClose, SECTION_H2, SectionNav, Takeaway } from '@/components/frame';
import { Fact } from '@/components/kit/Fact';
import { PageCallToAction } from '@/components/shell/PageCallToAction';
import { CaseHead } from '@/components/work/CaseHead';
import { factText } from '@/lib/facts/text';
import { CONTACT_HREF } from '@/lib/site';
import {
  AUDIBLE_GLANCE,
  AUDIBLE_SHIP_LEAD_IN,
  AUDIBLE_SHIP_TAKEAWAY,
  AudibleAdoption,
  AudibleAiTools,
  AudibleAutomation,
  AudibleChecks,
  AudibleClose,
  AudibleData,
  AudibleIntro,
  AudibleLimits,
  AudibleLinks,
  AudibleMethod,
  AudibleSetupStats,
  AudibleShipRule,
  AudibleTeams,
  AudibleWhySoMany,
} from '../../../content/audible';
import { HOME_SITE } from '../../../content/home.ts';
import { HOME_LINKS } from '../../../content/home-destinations.ts';
import { FrameworkFigure } from './FrameworkFigure';

/** The words of the h1 after its figure, and the quiet clause that follows them. */
export const AUDIBLE_HEAD = { lead: 'A/B tests at Audible (Amazon)', quiet: 'from the plan to the recommendation.' } as const;

/**
 * The page's title as a string, for places that cannot render a <Fact> (the sharing card): the h1's
 * lead, with the test count printed from its fact exactly as the h1 prints it.
 */
export const AUDIBLE_TITLE = `${factText('profile.audible.experiments')} ${AUDIBLE_HEAD.lead}`;

/** The sections in page order: anchor id, heading and the short label of its in-page link. */
export const AUDIBLE_SECTIONS = [
  { id: 'ship-rule', title: 'When to ship: try the rule yourself', link: 'When to ship' },
  { id: 'why-so-many', title: 'Why so many were adopted', link: 'Why so many?' },
  { id: 'automation', title: 'Test-account automation', link: 'Automation' },
  { id: 'ai-tools', title: 'AI tools for the team', link: 'AI tools' },
  { id: 'method', title: 'Method', link: 'Method' },
  { id: 'limits', title: 'Limits', link: 'Limits' },
  { id: 'sources', title: 'Sources and links', link: 'Sources' },
] as const;

type SectionId = (typeof AUDIBLE_SECTIONS)[number]['id'];

const PROSE = 'mt-4 max-w-text';

/** A ruled section named by its own h2. Its children sit directly in it, so a figure sheet can run the full rail. */
function Section({ id, children }: { id: SectionId; children: ReactNode }) {
  const entry = AUDIBLE_SECTIONS.find((s) => s.id === id);
  if (!entry) throw new Error(`audible: no section ${id}`);
  return (
    <section id={id} aria-labelledby={`${id}-title`} data-rule="" className="mt-12 pt-12 md:mt-16 md:pt-16">
      <h2 id={`${id}-title`} className={`max-w-text ${SECTION_H2}`} data-depth-rise="heading">
        {entry.title}
      </h2>
      {children}
    </section>
  );
}

/** Prose in the readable column. */
function Prose({ children }: { children: ReactNode }) {
  return <div className={PROSE}>{children}</div>;
}

export function AudiblePage(): ReactNode {
  return (
    <article aria-labelledby="audible-title">
      <CaseHead
        id="audible-title"
        chip="Case study"
        title={
          <>
            <Fact id="profile.audible.experiments" /> {AUDIBLE_HEAD.lead},
          </>
        }
        quiet={AUDIBLE_HEAD.quiet}
        intro={<AudibleIntro />}
        actions={[{ href: CONTACT_HREF, label: 'Ask me about this work' }]}
      />

      <GlanceBlock {...AUDIBLE_GLANCE} />

      <SectionNav items={AUDIBLE_SECTIONS.map((s) => ({ href: `#${s.id}`, label: s.link }))} />

      <Section id="ship-rule">
        <Prose>
          <AudibleShipRule />
        </Prose>
        <LeadIn>{AUDIBLE_SHIP_LEAD_IN}</LeadIn>
        <FigureSheet>
          <FrameworkFigure />
        </FigureSheet>
        <Takeaway>{AUDIBLE_SHIP_TAKEAWAY}</Takeaway>
      </Section>

      <Section id="why-so-many">
        <Prose>
          <AudibleWhySoMany />
        </Prose>
      </Section>

      <Section id="automation">
        <Prose>
          <AudibleAutomation />
        </Prose>
        <FigureSheet>
          <AudibleSetupStats />
        </FigureSheet>
        <Prose>
          <AudibleAdoption />
        </Prose>
      </Section>

      <Section id="ai-tools">
        <Prose>
          <AudibleAiTools />
        </Prose>
      </Section>

      <Section id="method">
        <Prose>
          <AudibleMethod />
        </Prose>
        <MethodDetails summary="The teams and their metrics">
          <AudibleTeams />
        </MethodDetails>
        {/* The anchor other pages may link to sits on the row's summary, which is always in view. */}
        <MethodDetails summary={<span id="how-i-checked-this">How I checked this</span>}>
          <AudibleChecks />
        </MethodDetails>
        <MethodDetails summary="Why there are no results here">
          <AudibleData />
        </MethodDetails>
      </Section>

      <Section id="limits">
        <Prose>
          <AudibleLimits />
        </Prose>
      </Section>

      <Section id="sources">
        <Prose>
          <AudibleLinks />
        </Prose>
      </Section>

      <PageClose
        links={[
          { href: HOME_LINKS.lab, label: HOME_SITE.lab },
          { href: HOME_LINKS.experiment, label: HOME_SITE.live },
        ]}
      >
        <AudibleClose />
      </PageClose>
      <NextRow next={{ href: HOME_LINKS.retention, label: 'Retention' }} />
      <div className="pb-12 md:pb-16" />
      <PageCallToAction />
    </article>
  );
}
