// The German privacy notice, the English page's twin: the same two-tone head, the sections as a chip
// row of in-page links, then each section under a rule that runs to the rail. Every word comes from
// content/de/privacy.ts; the anchors, numbers and version date are the English notice's. A section's
// German-only paragraphs (`extra`) follow its own. Plain static page.
import type { Metadata } from 'next';
import { Fragment, type ReactNode } from 'react';
import { PageHead, SectionNav } from '@/components/frame';
import { Callout } from '@/components/kit/Callout';
import { Derived, derivedAttr } from '@/components/kit/Derived';
import { TextLink } from '@/components/kit/TextLink';
import { LAUNCH_FACTS, type PrivacyBlock, type PrivacySection } from '../../../../content/privacy';
import { PRIVACY_DE } from '../../../../content/de/privacy';
import { localHref } from '@/lib/i18n/href';
import { fill } from '@/lib/i18n/template';
import { canonicalOrigin, pageMetadata } from '@/lib/seo/metadata';
import { seoEntryFor } from '@/lib/seo/entries';

export const metadata: Metadata = pageMetadata(seoEntryFor('de', '/privacy'), canonicalOrigin());

const COPY = PRIVACY_DE;

/** "13.11.2026" for "2026-11-13". */
function versionDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

function Block({ block, standalone }: { block: PrivacyBlock; standalone?: boolean }): ReactNode {
  if (typeof block === 'string') return block;
  if ('derived' in block) return <Derived value={block.derived} unit={block.unit} refs={['build']} locale="de" />;
  if ('link' in block) {
    const href = block.link.external ? block.link.href : localHref('de', block.link.href);
    return (
      <TextLink href={href} external={block.link.external} standalone={standalone}>
        {block.link.text}
      </TextLink>
    );
  }
  if ('updatedOn' in block) {
    return (
      <time dateTime={COPY.updatedOn} {...derivedAttr(['build'])}>
        {versionDate(COPY.updatedOn)}
      </time>
    );
  }
  const fact = LAUNCH_FACTS.find((f) => f.id === block.launchPlaceholder);
  if (fact === undefined) throw new Error(`unknown launch fact ${block.launchPlaceholder}`);
  const question = COPY.placeholder.questions?.[fact.id];
  if (question === undefined) throw new Error(`no German question for launch fact ${fact.id}`);
  return (
    <div data-launch-placeholder={fact.id}>
      <Callout title={COPY.placeholder.title}>{fill<'question'>(COPY.placeholder.sentence, { question })}</Callout>
    </div>
  );
}

function Paragraph({ paragraph }: { paragraph: PrivacyBlock[] }): ReactNode {
  return paragraph.length === 1 && typeof paragraph[0] === 'object' && ('launchPlaceholder' in paragraph[0] || 'link' in paragraph[0]) ? (
    <div className="mt-4 max-w-text">
      <Block block={paragraph[0]} standalone />
    </div>
  ) : (
    <p className="mt-4 max-w-text wrap-anywhere">
      {paragraph.map((block, j) => (
        <Fragment key={j}>
          <Block block={block} />
        </Fragment>
      ))}
    </p>
  );
}

/** Every German section names its anchor, the English one, so links and anchors map one to one. */
function anchorOf(section: PrivacySection): string {
  if (section.id === undefined) throw new Error(`no anchor for ${section.heading}`);
  return section.id;
}

export default function GermanPrivacyRoute() {
  return (
    <div className="pb-12 md:pb-16">
      <PageHead id="privacy-title" chip={COPY.chip} title={`${COPY.title}:`} quiet={COPY.quiet} />
      <SectionNav label={COPY.navLabel} items={COPY.sections.map((section) => ({ href: `#${anchorOf(section)}`, label: section.heading }))} />
      {COPY.sections.map((section) => (
        <section key={anchorOf(section)} data-rule="" className="mt-12 pt-12">
          <h2 id={anchorOf(section)} className="max-w-text text-xl font-semibold">
            {section.heading}
          </h2>
          {[...section.paragraphs, ...(section.extra ?? [])].map((paragraph, i) => (
            <Paragraph key={i} paragraph={paragraph} />
          ))}
        </section>
      ))}
    </div>
  );
}
