// The privacy notice, rendered from content/privacy.ts: a two-tone head, the sections as a chip row of
// in-page links, then each section under a rule that runs to the rail, its words at the reading width.
// Plain static page; not one word of the notice is set here.
import type { Metadata } from 'next';
import { Fragment, type ReactNode } from 'react';
import { PageHead, SectionNav } from '@/components/frame';
import { Callout } from '@/components/kit/Callout';
import { Derived, derivedAttr } from '@/components/kit/Derived';
import { TextLink } from '@/components/kit/TextLink';
import { LAUNCH_FACTS, PRIVACY, type PrivacyBlock, type PrivacySection } from '../../../content/privacy';
import { canonicalOrigin, pageMetadata } from '@/lib/seo/metadata';
import { seoEntry } from '../../../content/seo';

export const metadata: Metadata = pageMetadata(seoEntry('/privacy'), canonicalOrigin());

/** "26.10.2026" for "2026-10-26". */
function versionDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

function Block({ block, standalone }: { block: PrivacyBlock; standalone?: boolean }): ReactNode {
  if (typeof block === 'string') return block;
  if ('derived' in block) return <Derived value={block.derived} unit={block.unit} refs={['build']} />;
  if ('link' in block) {
    return (
      <TextLink href={block.link.href} external={block.link.external} standalone={standalone}>
        {block.link.text}
      </TextLink>
    );
  }
  if ('updatedOn' in block) {
    return (
      <time dateTime={PRIVACY.updatedOn} {...derivedAttr(['build'])}>
        {versionDate(PRIVACY.updatedOn)}
      </time>
    );
  }
  const fact = LAUNCH_FACTS.find((f) => f.id === block.launchPlaceholder);
  if (fact === undefined) throw new Error(`unknown launch fact ${block.launchPlaceholder}`);
  return (
    <div data-launch-placeholder={fact.id}>
      <Callout title="Not confirmed yet">{`${fact.question}. I will state it here before the experiment starts.`}</Callout>
    </div>
  );
}

/** A section's anchor: its own id when it has one (the contact form links to it), else its heading as a slug. */
const anchorOf = (section: PrivacySection) =>
  section.id ?? section.heading.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export default function PrivacyPage() {
  return (
    <div className="pb-12 md:pb-16">
      <PageHead id="privacy-title" chip="Privacy" title={`${PRIVACY.title}:`} quiet="what this site collects, and what it does not." />
      {/* The notice is long, so it opens with its section headings as links; the row adds no words of its own. */}
      <SectionNav label="Sections" items={PRIVACY.sections.map((section) => ({ href: `#${anchorOf(section)}`, label: section.heading }))} />
      {/* Each section's rule runs to the rail; its heading and paragraphs keep the reading width. */}
      {PRIVACY.sections.map((section) => (
        <section key={section.heading} data-rule="" className="mt-12 pt-12">
          <h2 id={anchorOf(section)} className="max-w-text text-xl font-semibold">
            {section.heading}
          </h2>
          {section.paragraphs.map((paragraph, i) =>
            paragraph.length === 1 &&
            typeof paragraph[0] === 'object' &&
            ('launchPlaceholder' in paragraph[0] || 'link' in paragraph[0]) ? (
              <div key={i} className="mt-4 max-w-text">
                <Block block={paragraph[0]} standalone />
              </div>
            ) : (
              <p key={i} className="mt-4 max-w-text wrap-anywhere">
                {paragraph.map((block, j) => (
                  <Fragment key={j}>
                    <Block block={block} />
                  </Fragment>
                ))}
              </p>
            ),
          )}
        </section>
      ))}
    </div>
  );
}
