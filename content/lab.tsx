// The Lab's copy: the page's head, its opening, its four checks in the order of a test's life, its
// limits and its close, and the words of the four Figures (the sample-size planner, the split check,
// peeking and the winner's curse). Plain words only: every number on the page is in the exhibits, each
// with its own source marker.
//
// The words are a `LabCopy`: LAB_EN here, the German twin in content/de/lab.tsx typed by the same type,
// so a missing key fails the typecheck. The Figures' words are plain data (src/lib/lab/text-*.ts), so a
// client island gets them as props; this file is server only, and a client file never imports it.
// English moved here unchanged.
import { slot, type Sentence } from '@/lib/retention/sentence';
import { EN_CURSE, type CurseText } from '@/lib/lab/text-curse';
import { EN_PEEK, type PeekText } from '@/lib/lab/text-peek';
import { EN_PLANNER, type PlannerText } from '@/lib/lab/text-planner';
import { EN_SKETCH, type SketchText } from '@/lib/lab/text-sketch';
import { EN_SRM, type SrmText } from '@/lib/lab/text-srm';

export type LabSectionId = 'sample-size' | 'split-check' | 'peeking-at-results' | 'exaggeration';

/**
 * One of the four checks, in the order of a test's life, which is the page's order: the section's
 * anchor, when in a test the check comes, the question (the card's title and the section's h2), one
 * plain line, the section's short label, the trap (one everyday picture of the mistake, under the h2,
 * without a number) and the Figure it holds.
 */
export type LabSection = {
  id: LabSectionId;
  when: string;
  question: string;
  line: string;
  label: string;
  trap: string;
  figure: 'planner' | 'srm' | 'peeking' | 'curse';
};

type Head = { chip: string; title: string; quiet: string };

export type LabPageCopy = {
  /** The page's head: the chip, the h1 and its quiet second clause. */
  head: Head;
  /** The page's opening, under its heading: it says once what luck and the bar are, which every check rests on. */
  intro: string;
  /** The heading only a screen reader gets, over the four cards. */
  checksTitle: string;
  /** The label of the sentence under each check's h2. */
  trapLabel: string;
  sections: readonly [LabSection, LabSection, LabSection, LabSection];
  /** The card a reader with one minute should open, and the chip that says so. */
  start: { id: LabSectionId; chip: string };
  /** The link under the planner to a smaller rise. Slot: rise. */
  plannerLink: Sentence;
  limitsTitle: string;
  /** What the examples cannot show, one item each. */
  limits: readonly string[];
  /** The close: what the page shows about how I work. */
  close: string;
  closeLinks: readonly { href: string; label: string }[];
  /** The head and opening of the peeking example's own page, the interview link, and its link back. */
  peekingHead: Head;
  peekingIntro: string;
  allExamples: string;
  /** The words on the four card sketches. */
  sketch: SketchText;
};

export type LabCopy = {
  page: LabPageCopy;
  planner: PlannerText;
  srm: SrmText;
  curse: CurseText;
  peek: PeekText;
};

export const LAB_EN: LabCopy = {
  page: {
    head: {
      chip: 'Lab',
      title: 'Four ways an A/B test can mislead you,',
      quiet: 'and how I catch each one.',
    },
    intro:
      'An A/B test shows two versions of a page to two groups of visitors. Then it compares what each group does. Show both groups the same page, and their results still differ a little, by luck. So a test calls a winner only when the gap clears a bar. The bar is set so that luck alone rarely clears it. A wrong call can ship a change that does nothing, or drop one that works. These are the four checks I make before I trust a result. Every number below is made up or simulated.',
    checksTitle: 'The four checks',
    trapLabel: 'The trap',
    sections: [
      {
        id: 'sample-size',
        when: 'Before the test',
        question: 'Is the test big enough?',
        line: 'With too few visitors, luck can hide a real gain. So I work out the visitors a test needs before it starts.',
        label: 'Sample size and power',
        trap: 'Toss a coin a few times and you may get mostly heads, just by luck. A test with few visitors swings by luck the same way. A small real rise can vanish inside those swings.',
        figure: 'planner',
      },
      {
        id: 'split-check',
        when: 'While it runs',
        question: 'Did each group get its share?',
        line: 'The groups should come out close to half each. A bigger gap than luck allows means the setup is broken. Then no result can be trusted, however good it looks.',
        label: 'Sample ratio mismatch',
        trap: 'Each visitor is put in group A or B by a fair coin toss. A fair coin lands near half each, but rarely exactly half. A much bigger gap means something broke, say a page that fails on some phones. Then the groups differ in who is in them, not just in the page.',
        figure: 'srm',
      },
      {
        id: 'peeking-at-results',
        when: 'When reading it',
        question: 'Did we stop too early?',
        line: 'Check daily and stop at the first win, and luck can pick your winner.',
        label: 'Peeking',
        trap: 'Roll a die until a six comes up, and one always does. Checking a test daily and stopping at the first win works the same way. Each check gives luck another roll.',
        figure: 'peeking',
      },
      {
        id: 'exaggeration',
        when: 'After a win',
        question: 'Is the win as big as it looks?',
        line: 'A test too small for the effect wins only on a lucky reading. So its wins look bigger than they are.',
        label: "Winner's curse (type M error)",
        trap: 'A cheap bathroom scale wobbles a little each day. Write down only the days it shows a big loss. Your notes will say you lost more than you really did. A small test is that scale: only its luckiest readings clear the bar.',
        figure: 'curse',
      },
    ],
    start: { id: 'peeking-at-results', chip: 'One minute? Start here.' },
    plannerLink: ['Try a smaller rise: ', slot('rise'), ' points'],
    limitsTitle: 'What these examples cannot show',
    limits: [
      "Every number here is made up or simulated. None comes from a real test or from this site's live test.",
      'The planner assumes two equal groups, the same traffic every day and one reading at the end. Checking as you go needs a different plan, as the peeking example shows.',
      'The peeking numbers come from one simulation with one sign-up rate. Other settings give other rates.',
      'The split check and the overstatement example use simple, standard formulas. They tell you when to look closer. They are not a verdict on a real test.',
    ],
    close:
      "I size a test before it starts. I check the split before I read anything. I decide in advance how often I will look. And I treat a surprising win from a small test with suspicion. The live test on this site follows the same rules on real visitors. Its plan was written down before the first visitor was counted. It checks its split after every completed day. It uses the always-valid check, so it can be read every day. With this site's traffic it can only catch a large effect, and the plan says so.",
    closeLinks: [
      { href: '/experiment', label: 'See the live test' },
      { href: '/work/audible', label: 'See how I sized and evaluated tests at Audible' },
    ],
    peekingHead: {
      chip: 'Lab',
      title: 'Peeking at results,',
      quiet: 'why checking early finds false winners.',
    },
    peekingIntro: 'One example from the Lab: what happens when a test is checked every day and stopped at the first win.',
    allExamples: 'All the examples in the Lab',
    sketch: EN_SKETCH,
  },
  planner: EN_PLANNER,
  srm: EN_SRM,
  curse: EN_CURSE,
  peek: EN_PEEK,
};

/** The four checks in English: the page's order, and what the demo and the tests read. */
export const LAB_SECTIONS = LAB_EN.page.sections;

/** The planner's words per context in English (the retention context is the Retention page's pair). */
export const PLANNER_COPY = EN_PLANNER.context;
