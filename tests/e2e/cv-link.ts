// The CV PDF the build under test offers, worked out as next.config.ts does: from the PDF and its
// metadata in public/ (Playwright runs from the repository root). The e2e build has no PDF until
// one is committed together with its check.
import { parseCvPdf } from '../../src/lib/cv-pdf';
import { cvPdfEnv } from '../../src/lib/cv-pdf-file';

export const E2E_CV_PDF = parseCvPdf(cvPdfEnv(process.cwd()));
