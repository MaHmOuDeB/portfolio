// Dev-only, like the kitchen sink above it: an inner page in the reading model, top to bottom, built
// from the frame parts alone. The case head with its quiet clause and its actions, the glance card
// with pull figures and a scope, the in-page links, the key points, one exhibit with its lead-in, its
// sheet, its takeaway and its method row, the close, and previous and next. All words are fictional;
// every number is a Derived marked 'simulated'.
import type { Metadata } from 'next';
import { GlanceBlock } from '@/components/depth/GlanceBlock';
import { FigureSheet, KeyPoints, LeadIn, MethodDetails, NextRow, PageClose, SECTION_H2, SectionNav, Takeaway } from '@/components/frame';
import { Derived } from '@/components/kit/Derived';
import { CaseHead } from '@/components/work/CaseHead';

export const metadata: Metadata = {
  title: 'Frame host',
  robots: { index: false, follow: false },
};

const REFS = ['simulated'] as const;

export default function KitchenSinkFrame() {
  return (
    <article aria-labelledby="frame-host-title">
      <CaseHead
        id="frame-host-title"
        chip="Build note"
        title="A fictional project,"
        quiet="from the plan to the result."
        intro={<p>A fictional standfirst that says in one sentence what the page is for.</p>}
        role="A fictional line on my role."
        actions={[
          { href: 'https://example.com/code', label: 'See the code on GitHub', icon: 'github', external: true },
          { href: 'https://example.com/demo', label: 'Open the live demo', external: true },
        ]}
      />
      <GlanceBlock
        points={[
          { id: 'visitors', figure: <Derived value={1353} unit="count" refs={REFS} />, label: 'made-up visitors per group' },
          { id: 'share', figure: <Derived value={0.29} unit="share" refs={REFS} />, label: 'a fictional share' },
          { id: 'checks', figure: <Derived value={12} unit="count" refs={REFS} />, label: 'fictional checks' },
        ]}
        outcome="A fictional outcome, in one sentence under the figures."
        when="A fictional period"
        role="A fictional role"
        methods="Fictional methods, in a few words"
        tools="Fictional tools"
        scope="What the fictional project is, and what it is not."
      />
      <SectionNav
        items={[
          { href: '#exhibit', label: 'The exhibit' },
          { href: '#limits', label: 'Limits' },
          { href: '#frame-host-close', label: 'What this shows' },
        ]}
      />
      <KeyPoints
        items={[
          { id: 'question', kicker: 'Question', title: 'A fictional question', body: 'One or two short sentences that say what was asked.' },
          { id: 'method', kicker: 'Method', title: 'A fictional method', body: 'What was done, in plain words.' },
          { id: 'result', kicker: 'Result', title: 'A fictional result', body: 'What came out of it.' },
        ]}
      />

      <section id="exhibit" aria-labelledby="exhibit-heading" data-rule="" className="mt-12 pt-12 md:mt-16 md:pt-16">
        <h2 id="exhibit-heading" className={`max-w-text ${SECTION_H2}`}>
          A fictional section headline
        </h2>
        <LeadIn>A fictional sentence that tells the reader which part of the figure to look at.</LeadIn>
        <FigureSheet>
          <h3 className="text-xl font-semibold">A fictional figure title states its finding</h3>
          <div className="mt-4 h-48 rounded-md bg-track" aria-hidden="true" />
          <p className="mt-3 text-sm text-muted">A fictional caption. The grey block stands for a chart.</p>
        </FigureSheet>
        <Takeaway>A fictional sentence that says what the figure means for a team.</Takeaway>
        <MethodDetails>
          <p>A fictional derivation, moved here unchanged. It is in the page without JavaScript and in print.</p>
        </MethodDetails>
      </section>

      <section id="limits" aria-labelledby="limits-heading" data-rule="" className="mt-12 pt-12 md:mt-16 md:pt-16">
        <h2 id="limits-heading" className={`max-w-text ${SECTION_H2}`}>
          Limits
        </h2>
        <p className="mt-4 max-w-text text-base">A fictional limit, said once.</p>
      </section>

      <PageClose
        id="frame-host-close"
        links={[
          { href: '/kitchen-sink', label: 'A fictional onward link' },
          { href: '/kitchen-sink', label: 'A second link' },
        ]}
      >
        <p>A fictional short paragraph on what the page shows about how I work.</p>
      </PageClose>
      <NextRow
        prev={{ href: '/kitchen-sink', label: 'A fictional previous project' }}
        next={{ href: '/kitchen-sink', label: 'A fictional next project' }}
      />
      <div className="pb-12 md:pb-16" />
    </article>
  );
}
