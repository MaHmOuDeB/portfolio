// The build-note frame's own words: the chip, the section titles and link labels, the labels of the
// frame parts it draws, the glance card's terms, the previous and next names, the shared button label
// and the screenshots' alt text and captions. English is the default and is the words the frame always
// printed (the tests pin the screenshot copy in note-shots.test.tsx); the German twin is
// content/de/build-notes.ts, typed by the same type so a missing key fails the typecheck.
import { GLANCE_LABELS_EN, type GlanceLabels } from '@/components/depth/GlanceBlock';
import { NOTE_SHOTS } from './note-shots';

export type NoteShotKey = keyof typeof NOTE_SHOTS;
export type BodyId = 'problem' | 'architecture' | 'how-i-checked-this' | 'outcome' | 'limits' | 'sources';
export type NoteSlug = 'weather' | 'docproof' | 'n8n' | 'marketingws';

export type ShotText = {
  alt: string;
  caption: string;
  /** What the full-size link names, after the prefix (only for a shot that offers one). */
  label?: string;
};

export type BuildNoteText = {
  chip: string;
  sections: Readonly<Record<BodyId, { title: string; link: string }>>;
  glance: GlanceLabels;
  /** The accessible name of the section links. */
  sectionNav: string;
  /** The accessible name of the previous and next cards. */
  nextRow: string;
  /** The close's heading. */
  closeTitle: string;
  leadIn: string;
  takeaway: string;
  /** The button and close link to the repository. */
  github: string;
  /** The label of a figure sheet that holds a screenshot. */
  screenshot: string;
  /** The small words above the neighbouring notes' names. */
  kicker: { prev: string; next: string };
  /** The names of the neighbouring notes, per note. */
  order: Readonly<Record<NoteSlug, { prev: string; next: string }>>;
  /** The full-size link's words before the picture's name. */
  fullSize: string;
  shots: Readonly<Record<NoteShotKey, ShotText>>;
};

const EN_SHOTS = Object.fromEntries(
  Object.entries(NOTE_SHOTS).map(([key, s]) => [
    key,
    { alt: s.alt, caption: s.caption, label: 'label' in s ? (s.label as string) : undefined },
  ]),
) as Record<NoteShotKey, ShotText>;

export const BUILD_NOTE_TEXT_EN: BuildNoteText = {
  chip: 'Build note',
  sections: {
    problem: { title: 'The problem', link: 'Problem' },
    architecture: { title: 'Architecture', link: 'Architecture' },
    'how-i-checked-this': { title: 'How I checked this', link: 'How I checked this' },
    outcome: { title: 'Outcome', link: 'Outcome' },
    limits: { title: 'Limits', link: 'Limits' },
    sources: { title: 'Sources and links', link: 'Sources' },
  },
  glance: GLANCE_LABELS_EN,
  sectionNav: 'On this page',
  nextRow: 'More work',
  closeTitle: 'What this shows about how I work',
  leadIn: 'What to look at',
  takeaway: 'What it means',
  github: 'See the code on GitHub',
  screenshot: 'Screenshot',
  kicker: { prev: 'Previous', next: 'Next' },
  order: {
    weather: { prev: 'Pulse', next: 'Docproof' },
    docproof: { prev: 'Weather pipeline', next: 'n8n e-invoice intake' },
    n8n: { prev: 'Docproof', next: 'MarketingWS' },
    marketingws: { prev: 'n8n e-invoice intake', next: 'The live test' },
  },
  fullSize: 'Full-size picture of',
  shots: EN_SHOTS,
};
