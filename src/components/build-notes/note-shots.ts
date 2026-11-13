// The real screenshots on the build notes: file, pixel size, the widths each is shown at (so its
// text stays readable: at least 13 px where a narrowest width is set), alt text and caption. Every
// file is a crop of a recording in private/screenshots, with its pixels untouched. The copy is pinned word for word in
// tests/unit/build-notes/note-shots.test.tsx. No number is typed into a caption.
export type NoteShot = {
  /** File name under /images/notes. */
  readonly file: string;
  /** Pixel size of the file (the figure keeps its aspect ratio from these). */
  readonly width: number;
  readonly height: number;
  /**
   * The widest the picture is shown: CSS px, or 'text' for the text column (max-w-text), so that a
   * note's pictures share one width. It never exceeds the file's own width.
   */
  readonly maxWidth: number | 'text';
  /**
   * For a picture whose text would shrink below 13 px in a narrow column: the narrowest it is drawn,
   * in CSS px. Below it the picture keeps this width and scrolls sideways in its own frame.
   */
  readonly minWidth?: number;
  /** The size of the picture's smallest text, in file px (from its measured cap height). */
  readonly textPx?: number;
  readonly alt: string;
  readonly caption: string;
  /** Offer the full-size file as a link, for a picture whose text is small beside the column. */
  readonly fullSize: boolean;
  /** A wider crop of the same recording to link as the full-size picture, instead of `file`. */
  readonly fullSizeFile?: string;
  /** What the full-size link names, after "Full-size picture of" (only when fullSize). */
  readonly label?: string;
};

export const NOTE_SHOTS = {
  marketingwsBrief: {
    file: 'marketingws-brief-light.png',
    width: 720,
    height: 1222,
    maxWidth: 'text',
    alt: 'The Brief form in MarketingWS, filled in for a LinkedIn post in a professional tone, in English, about a neighbourhood bike repair café that opens on Saturdays, for students and young professionals in Berlin, with the instruction to be friendly, use no emojis and end with the opening hours.',
    caption: 'The brief: a campaign type, a platform, a tone, a language and a few lines on the offer.',
    fullSize: false,
  },
  marketingwsDraft: {
    file: 'marketingws-first-draft-light.png',
    width: 1592,
    height: 680,
    maxWidth: 'text',
    alt: 'The First draft panel in MarketingWS: a short LinkedIn post about the bike repair café, with a placeholder where a percentage would go, hashtags and the opening hours at the end.',
    caption:
      'The first draft it returned. Where the brief has no figure, the draft leaves a placeholder instead of inventing one.',
    fullSize: true,
    label: 'the first draft',
  },
  weatherChecks: {
    file: 'weather-quality-checks-light-crop.png',
    width: 1116,
    height: 1022,
    maxWidth: 558,
    minWidth: 484,
    textPx: 30,
    alt: "Terminal output of the weather pipeline's data-quality checks, one line per check, each with its status word: most lines read OK, the warning lines read WARN and the line on merged condition spellings reads INFO.",
    caption:
      'The data-quality step of the pipeline I rebuilt on a public weather dataset. Every error-level check passes; the warnings name the sensor errors I quarantined and the places with too few observations.',
    fullSize: false,
  },
  n8nDecision: {
    file: 'n8n-einvoice-routing-light.png',
    width: 896,
    height: 660,
    maxWidth: 960,
    minWidth: 932,
    textPx: 12.5,
    alt: 'Part of an n8n workflow canvas: it checks the request, reads and checks the invoice row, then routes the outcome either to updating the register or to an error response.',
    caption:
      'The approval step: a person approves or declines an invoice that needs a look, and every other answer is a clear error code.',
    fullSize: true,
    fullSizeFile: 'n8n-einvoice-decision-nodes-light.png',
    label: 'the workflow canvas',
  },
} as const satisfies Record<string, NoteShot>;

export const NOTE_SHOT_DIR = '/images/notes';
