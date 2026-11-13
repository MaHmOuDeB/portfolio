// Build time only (next.config.ts and the tests): reads the CV PDF and its metadata from public/ and
// keeps them only when they agree. src/lib/cv-pdf.ts holds the rules and the run-time side.
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { asCvPdfMeta, type CvPdf } from './cv-pdf.ts';

/** `public/cv.pdf` and `public/cv.meta.json` under root, with the PDF's size, when both exist and the metadata names this PDF. */
export function readCvPdf(root: string): CvPdf | null {
  const pdfPath = join(root, 'public', 'cv.pdf');
  const metaPath = join(root, 'public', 'cv.meta.json');
  try {
    if (!statSync(pdfPath).isFile()) return null;
    const pdf = readFileSync(pdfPath);
    if (pdf.length === 0) return null;
    const raw = JSON.parse(readFileSync(metaPath, 'utf8')) as unknown;
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
    const { web, ...rest } = raw as Record<string, unknown>;
    if (web !== true) return null;
    const meta = asCvPdfMeta(rest);
    if (!meta || meta.sha256 !== createHash('sha256').update(pdf).digest('hex')) return null;
    return { ...meta, bytes: pdf.length };
  } catch {
    return null;
  }
}

/** The value next.config.ts embeds as CV_PDF: the metadata and size as JSON, or '' for no PDF. */
export function cvPdfEnv(root: string): string {
  const meta = readCvPdf(root);
  return meta ? JSON.stringify(meta) : '';
}
