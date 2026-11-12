// Whether this build offers the CV as a PDF. The render wrapper installs `public/cv.pdf` together with
// `public/cv.meta.json` (its SHA-256, the render time and `web: true`). next.config.ts reads both
// once, while the build loads its config (src/lib/cv-pdf-file.ts), and embeds the result with the
// file's size as CV_PDF, which Next replaces at build time; so every page agrees, a page regenerated
// later included, and nothing reads public/ at run time. Anything missing, malformed or mismatched
// means no PDF, and then no page offers a download, so no link points at a file that is not there.
// The header and the hero always link the CV page (CV_LINK in site.ts), never the file.
// No Node APIs here: the pages import it.
import type { Unit } from './facts/types.ts';

/** The metadata file's checked fields. */
export type CvPdfMeta = { sha256: string; renderedAt: string };
/** What the build embeds: the metadata and the file's size in bytes. */
export type CvPdf = CvPdfMeta & { bytes: number };

/** Where the PDF is served from, when the build has one. */
export const CV_PDF_HREF = '/cv.pdf';

const SHA256 = /^[0-9a-f]{64}$/;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function checkedMeta(value: Record<string, unknown>): CvPdfMeta | null {
  const { sha256, renderedAt } = value;
  if (typeof sha256 !== 'string' || !SHA256.test(sha256)) return null;
  if (typeof renderedAt !== 'string' || !UTC.test(renderedAt)) return null;
  return { sha256, renderedAt };
}

/** The metadata of a checked PDF (exactly a hash and a render time), or null for anything else. */
export function asCvPdfMeta(value: unknown): CvPdfMeta | null {
  if (!isRecord(value) || Object.keys(value).sort().join() !== 'renderedAt,sha256') return null;
  return checkedMeta(value);
}

/** The embedded value: the JSON the build wrote, or '' for no PDF. */
export function parseCvPdf(raw: string | undefined): CvPdf | null {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(value) || Object.keys(value).sort().join() !== 'bytes,renderedAt,sha256') return null;
  const meta = checkedMeta(value);
  const { bytes } = value;
  if (!meta || typeof bytes !== 'number' || !Number.isSafeInteger(bytes) || bytes <= 0) return null;
  return { ...meta, bytes };
}

/** The PDF this build offers, or null. */
export function cvPdf(): CvPdf | null {
  return parseCvPdf(process.env.CV_PDF);
}

const KIB = 1024;
const MIB = KIB * KIB;

/** The size the download button prints: whole kilobytes (at least 1) under a megabyte, else megabytes to one decimal. */
export function cvPdfSize(bytes: number): { value: number; unit: Unit; decimals: number; label: 'KB' | 'MB' } {
  const kb = Math.max(1, Math.round(bytes / KIB));
  if (kb < KIB) return { value: kb, unit: 'count', decimals: 0, label: 'KB' };
  return { value: Math.round((bytes / MIB) * 10) / 10, unit: 'decimal', decimals: 1, label: 'MB' };
}
