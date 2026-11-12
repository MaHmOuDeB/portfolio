// Whether this build links the CV as a PDF. The render wrapper installs `public/cv.pdf` together with
// `public/cv.meta.json` (its SHA-256, the render time and `web: true`). next.config.ts reads both
// once, while the build loads its config (src/lib/cv-pdf-file.ts), and embeds the result as
// CV_PDF, which Next replaces at build time; so every page agrees, a page regenerated later
// included, and nothing reads public/ at run time. Anything missing, malformed or mismatched means
// no PDF, and the shell then links the CV page instead, never a file that is not there.
// No Node APIs here: the header and the hero import it.
import { CV_LINK } from './site.ts';

export type CvPdf = { sha256: string; renderedAt: string };

/** The printable CV page, which always exists. */
export const CV_PAGE_HREF = '/cv';

const SHA256 = /^[0-9a-f]{64}$/;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

/** The metadata of a checked PDF, or null for anything that is not exactly that. */
export function asCvPdf(value: unknown): CvPdf | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const keys = Object.keys(value).sort();
  if (keys.join() !== 'renderedAt,sha256') return null;
  const { sha256, renderedAt } = value as Record<string, unknown>;
  if (typeof sha256 !== 'string' || !SHA256.test(sha256)) return null;
  if (typeof renderedAt !== 'string' || !UTC.test(renderedAt)) return null;
  return { sha256, renderedAt };
}

/** The embedded value: the JSON the build wrote, or '' for no PDF. */
export function parseCvPdf(raw: string | undefined): CvPdf | null {
  if (!raw) return null;
  try {
    return asCvPdf(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** The PDF this build links, or null. */
export function cvPdf(): CvPdf | null {
  return parseCvPdf(process.env.CV_PDF);
}

export type CvNavLink = { label: string; href: string; download: boolean };

/** The CV link of the header and the hero: the PDF when the build has one, else the CV page. */
export function cvNavLink(pdf: CvPdf | null = cvPdf()): CvNavLink {
  return pdf
    ? { label: CV_LINK.label, href: CV_LINK.href, download: true }
    : { label: 'CV', href: CV_PAGE_HREF, download: false };
}
