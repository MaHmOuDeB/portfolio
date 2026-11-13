// The privacy notice: one text column, rendered from content/privacy.ts. Plain static page.
import type { Metadata } from 'next';
import { Fragment, type ReactNode } from 'react';
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
    <div className="max-w-text py-section">
      <h1 className="text-2xl font-semibold md:text-3xl">{PRIVACY.title}</h1>
      {/* The notice is long, so it opens with its section headings as links; the list adds no words of its own. */}
      <nav aria-label="Sections" className="mt-8">
        {/* role="list": WebKit drops the list role from a list drawn without bullets. */}
        <ul role="list" className="sm:columns-2 sm:gap-x-8">
          {PRIVACY.sections.map((section) => (
            <li key={section.heading} className="break-inside-avoid">
              <TextLink href={`#${anchorOf(section)}`} standalone>
                {section.heading}
              </TextLink>
            </li>
          ))}
        </ul>
      </nav>
      {PRIVACY.sections.map((section) => (
        <section key={section.heading} className="mt-12">
          <h2 id={anchorOf(section)} className="text-xl font-semibold">
            {section.heading}
          </h2>
          {section.paragraphs.map((paragraph, i) =>
            paragraph.length === 1 &&
            typeof paragraph[0] === 'object' &&
            ('launchPlaceholder' in paragraph[0] || 'link' in paragraph[0]) ? (
              <div key={i} className="mt-4">
                <Block block={paragraph[0]} standalone />
              </div>
            ) : (
              <p key={i} className="mt-4 wrap-anywhere">
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
