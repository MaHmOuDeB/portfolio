// The real screenshots on the build notes: file, pixel size, the width each is shown at (its CSS
// size, so its text stays readable), alt text and caption. The copy is pinned word for word in
// tests/unit/build-notes/note-shots.test.tsx. No number is typed into a caption.
export type NoteShot = {
  /** File name under /images/notes. */
  readonly file: string;
  /** Pixel size of the file (the figure keeps its aspect ratio from these). */
  readonly width: number;
  readonly height: number;
  /** The widest the picture is shown, in CSS px: its capture size at 2x. */
  readonly maxWidth: number;
  readonly alt: string;
  readonly caption: string;
  /** Offer the full-size file as a link, for a picture whose text is small beside the column. */
  readonly fullSize: boolean;
};

export const NOTE_SHOTS = {
  marketingwsBrief: {
    file: 'marketingws-brief-light.png',
    width: 720,
    height: 1222,
    maxWidth: 360,
    alt: 'The Brief form in MarketingWS, filled in for a LinkedIn post in a professional tone, in English, about a neighbourhood bike repair café that opens on Saturdays, for students and young professionals in Berlin, with the instruction to be friendly, use no emojis and end with the opening hours, ten in the morning to two in the afternoon.',
    caption: 'The brief: a campaign type, a platform, a tone, a language and a few lines on the offer.',
    fullSize: false,
  },
  marketingwsDraft: {
    file: 'marketingws-first-draft-light.png',
    width: 1592,
    height: 680,
    maxWidth: 796,
    alt: 'The First draft panel in MarketingWS: a short LinkedIn post about the bike repair café, with a placeholder where a percentage would go, three hashtags and the opening hours, ten in the morning to two in the afternoon at the end.',
    caption:
      'The first draft it returned. Where the brief has no figure, the draft leaves a placeholder instead of inventing one.',
    fullSize: true,
  },
  weatherChecks: {
    file: 'weather-quality-checks-dark.png',
    width: 1462,
    height: 1082,
    maxWidth: 731,
    alt: "Terminal output of the weather pipeline's data-quality checks. Fifteen lines read OK, two read WARN (rows quarantined as sensor errors with wind above one hundred and fifty kilometres per hour, and locations observed fewer than twenty times) and one reads INFO (condition spellings merged), followed by the row counts of the staging, dimension, fact and quarantine tables.",
    caption:
      'The data-quality step of the pipeline, run on the public weather dataset I rebuilt in 2026. Every error-level check passes; the warnings name the sensor errors I quarantined and the places with too few observations.',
    fullSize: false,
  },
  n8nDecision: {
    file: 'n8n-einvoice-decision-crop-light.png',
    width: 2150,
    height: 666,
    maxWidth: 1075,
    alt: 'An n8n workflow canvas: a webhook checks the request, reads the invoice row, routes the outcome to error responses or to updating the register and the supplier record, then responds OK.',
    caption:
      'The approval step: a person approves or declines an invoice that needs a look, and every other answer is a clear error code.',
    fullSize: true,
  },
} as const satisfies Record<string, NoteShot>;

export const NOTE_SHOT_DIR = '/images/notes';
