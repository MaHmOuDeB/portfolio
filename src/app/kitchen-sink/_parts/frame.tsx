// The "Frame parts" section of the kitchen sink: the parts of the reading model that every inner page
// is built from. /kitchen-sink/frame shows them in page order under a case head, which has the page's
// h1 and so cannot sit here. All words are fictional; every number is a Derived marked 'simulated'.
import {
  FigureSheet,
  KeyPoints,
  LeadIn,
  MethodDetails,
  NextRow,
  PageClose,
  SECTION_H2,
  SectionNav,
  Takeaway,
} from '@/components/frame';
import { Derived } from '@/components/kit/Derived';
import { Specimen } from './Specimen';

const REFS = ['simulated'] as const;

const POINTS = [
  { id: 'question', kicker: 'Question', title: 'A fictional question, in a few words', body: 'One or two short sentences that say what was asked.' },
  { id: 'method', kicker: 'Method', title: 'A fictional method', body: 'What was done, in plain words.' },
  {
    id: 'result',
    kicker: 'Result',
    title: (
      <>
        <Derived value={1353} unit="count" refs={REFS} /> made-up visitors
      </>
    ),
    body: 'What came out of it, with the figure in the title.',
  },
  { id: 'next', body: 'A statement with no title is set at body size, in ink.' },
] as const;

export function FrameSection() {
  return (
    <>
      <Specimen
        id="frame--key-points-4"
        title="Key points, four"
        note="A labelled list of statement cards: one column on a phone, two from 640 px, four from 1024 px."
      >
        <KeyPoints items={POINTS} />
      </Specimen>
      <Specimen
        id="frame--key-points-3"
        title="Key points, three"
        note="Three cards: from 640 to 1024 px the third takes the whole second row."
      >
        <KeyPoints items={POINTS.slice(0, 3)} label="Key points, three" />
      </Specimen>
      <Specimen
        id="frame--section-nav"
        title="Section links"
        note="The in-page links as a row of chips that wraps. Each link is a 44 px target; the row never scrolls sideways."
      >
        <SectionNav
          label="On this specimen"
          items={[
            { href: '#specimen-frame--key-points-4', label: 'Key points' },
            { href: '#specimen-frame--exhibit', label: 'An exhibit' },
            { href: '#specimen-frame--method', label: 'The method' },
            { href: '#specimen-frame--page-close', label: 'What this shows' },
            { href: '#specimen-frame--next-row', label: 'More work' },
          ]}
        />
      </Specimen>
      <Specimen id="frame--section-h2" title="Section headline" note="An inner page's section h2 (SECTION_H2) above a 24 px figure title.">
        {/* A paragraph here, so the specimen adds no heading: the heading weight and tracking are set by hand. */}
        <p className={`${SECTION_H2} font-heading tracking-heading`}>
          A fictional section headline
        </p>
        <p className="mt-4 text-xl font-semibold">A fictional figure title states its finding</p>
      </Specimen>
      <Specimen
        id="frame--exhibit"
        title="An exhibit"
        note="The lead-in says what to look at, the figure sits on its sheet, the takeaway says what it means. The sheet runs edge to edge under 640 px."
      >
        <LeadIn>A fictional sentence that tells the reader which part of the figure to look at.</LeadIn>
        <FigureSheet>
          <p className="text-xl font-semibold">A fictional figure title states its finding</p>
          <div className="mt-4 h-40 rounded-md bg-track" aria-hidden="true" />
          <p className="mt-3 text-sm text-muted">A fictional caption. The grey block stands for a chart.</p>
        </FigureSheet>
        <Takeaway>A fictional sentence that says what the figure means for a team.</Takeaway>
        <MethodDetails>
          <p>A fictional derivation, moved here unchanged. It is in the page without JavaScript and in print.</p>
          <p>A second paragraph of the method.</p>
        </MethodDetails>
      </Specimen>
      <Specimen id="frame--figure-sheet-label" title="Figure sheet, labelled" note="A sheet that says what it holds.">
        <FigureSheet label="Screenshot">
          <div className="h-32 rounded-md bg-track" aria-hidden="true" />
        </FigureSheet>
      </Specimen>
      <Specimen id="frame--method" title="Method rows" note="Native details rows; rows that follow each other share a rule. The second starts open.">
        <MethodDetails>
          <p>A fictional derivation.</p>
        </MethodDetails>
        <MethodDetails summary="A fictional, more specific summary" open>
          <p>A fictional test statistic, in words.</p>
        </MethodDetails>
      </Specimen>
      <Specimen
        id="frame--page-close"
        title="Page close"
        note="The closing section of an inner page: its h2, a short body and one to three onward links. An h2 of its own inside this specimen."
      >
        <PageClose
          id="frame-page-close"
          links={[
            { href: '/kitchen-sink', label: 'A fictional onward link' },
            { href: '/kitchen-sink', label: 'A second link' },
          ]}
        >
          <p>A fictional short paragraph on what the page shows about how I work.</p>
        </PageClose>
      </Specimen>
      <Specimen id="frame--next-row" title="Previous and next" note="Two quiet cards in one row, stacked on a phone.">
        <NextRow
          label="More fictional work"
          prev={{ href: '/kitchen-sink', label: 'A fictional previous project' }}
          next={{ href: '/kitchen-sink', label: 'A fictional next project' }}
        />
      </Specimen>
      <Specimen id="frame--next-row-only-next" title="Next alone" note="The first project has no previous one: the next card keeps the second column.">
        <NextRow label="More fictional work, next only" next={{ href: '/kitchen-sink', label: 'A fictional next project' }} />
      </Specimen>
    </>
  );
}
