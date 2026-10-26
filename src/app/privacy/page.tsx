// The privacy notice: one text column, rendered from content/privacy.ts. Plain static page.
import type { Metadata } from 'next';
import { Fragment, type ReactNode } from 'react';
import { Callout } from '@/components/kit/Callout';
import { Derived, derivedAttr } from '@/components/kit/Derived';
import { TextLink } from '@/components/kit/TextLink';
import { LAUNCH_FACTS, PRIVACY, type PrivacyBlock } from '../../../content/privacy';

export const metadata: Metadata = {
  title: PRIVACY.title,
  description: 'What this site collects, why, and for how long.',
};

/** "26.10.2026" for "2026-10-26". */
function versionDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

function Block({ block }: { block: PrivacyBlock }): ReactNode {
  if (typeof block === 'string') return block;
  if ('derived' in block) return <Derived value={block.derived} unit={block.unit} refs={['build']} />;
  if ('link' in block) return <TextLink href={block.link.href}>{block.link.text}</TextLink>;
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

export default function PrivacyPage() {
  return (
    <div className="max-w-text py-section">
      <h1 className="text-2xl font-semibold md:text-3xl">{PRIVACY.title}</h1>
      {PRIVACY.sections.map((section) => (
        <section key={section.heading} className="mt-12">
          <h2 className="text-xl font-semibold">{section.heading}</h2>
          {section.paragraphs.map((paragraph, i) =>
            paragraph.length === 1 && typeof paragraph[0] === 'object' && 'launchPlaceholder' in paragraph[0] ? (
              <div key={i} className="mt-4">
                <Block block={paragraph[0]} />
              </div>
            ) : (
              <p key={i} className="mt-4">
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
