// The interview page (/demo): the links I open when I share my screen in an interview. It copies the
// Lab page's reading structure: a heading and a short opening in the readable column, then one section
// per group of links with its own h2, each link a 44 px row followed by one plain sentence where it
// needs one. No Figure, no card, no motion.
//
// The page has nothing of the live test on it: no beacon, no group label, no store read. The home-page
// links force a group through the address (`?variant=`), the contract the proxy and the beacon already
// have; which headlines that view shows depends on the configured phase, which the note under the
// links states from the frozen configuration. Server component; its copy is content/demo.tsx.
//
// The two home-page links are plain anchors, so a click is a full document request that the proxy
// assigns. A next/link soft navigation is not enough: the group pages never read the query, so the
// client router may answer `/?variant=b` from a payload it already holds for `/` (the header's
// wordmark and the other forced link prefetch the same route), and show the other group. The Lab
// links stay next/link: their Figures read the query in the browser.
import type { ReactNode } from 'react';
import { TextLink } from '@/components/kit/TextLink';
import { EXPERIMENT } from '@/experiment.values';
import {
  DEMO_COPY,
  DemoIntro,
  FORCED_LINKS,
  ForcedExclusion,
  ForcedLead,
  ForcedNote,
  LAB_LINKS,
  LabNote,
  type DemoLink,
  type LabLink,
} from '../../../content/demo';

export const DEMO_TITLE = DEMO_COPY.title;

const TEXT = 'max-w-text';

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={`${TEXT} mt-12 md:mt-section`}>
      <h2 id={`${id}-title`} className="text-xl font-semibold">
        {title}
      </h2>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

// The kit's standalone TextLink look, for an anchor that must not go through next/link.
const PLAIN_LINK =
  'inline-flex min-h-(--size-target) min-w-(--size-target) max-w-full items-center gap-2 wrap-anywhere text-muted underline decoration-muted hover:text-ink focus-visible:text-ink';

/** The forced home-page links: full document loads, each on its own 44 px row. */
function ForcedLinks({ links }: { links: readonly DemoLink[] }) {
  return (
    <ul>
      {links.map((link) => (
        <li key={link.href} className="mt-3 first:mt-0">
          <a href={link.href} className={PLAIN_LINK} data-touch-target="" data-full-load="">
            {link.label}
          </a>
        </li>
      ))}
    </ul>
  );
}

/** The Lab links, each on its own 44 px row with its sentence under it. */
function LabLinks({ links }: { links: readonly LabLink[] }) {
  return (
    <ul>
      {links.map((link) => (
        <li key={link.href} className="mt-3 first:mt-0">
          <TextLink href={link.href} standalone>
            {link.label}
          </TextLink>
          <p className="text-base">{link.purpose}</p>
        </li>
      ))}
    </ul>
  );
}

export function DemoPage(): ReactNode {
  return (
    <article aria-labelledby="demo-title" className="py-12 md:py-section">
      <div className={TEXT}>
        <h1 id="demo-title" className="text-2xl font-semibold md:text-3xl">
          {DEMO_TITLE}
        </h1>
        <div className="mt-4 text-lg text-muted">
          <DemoIntro />
        </div>
      </div>

      <Section id="home-groups" title={DEMO_COPY.forcedTitle}>
        <ForcedLead />
        <ForcedLinks links={FORCED_LINKS} />
        <ForcedNote phase={EXPERIMENT.phase} />
        <ForcedExclusion />
      </Section>

      <Section id="lab-examples" title={DEMO_COPY.labTitle}>
        <LabLinks links={LAB_LINKS} />
        <LabNote />
      </Section>
    </article>
  );
}
