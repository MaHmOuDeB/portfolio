// The CV PDF's download button: "Download CV (PDF, 84 KB)", the size worked out by the build from the
// file itself. Only rendered when the build has a checked PDF (src/lib/cv-pdf.ts); hidden in print,
// where the page itself is the CV. Server-safe.
import { ButtonLink } from '@/components/kit/ButtonLink';
import { Derived } from '@/components/kit/Derived';
import { CV_PDF_HREF, cvPdfSize, type CvPdf } from '@/lib/cv-pdf';

export function CvDownload({ pdf, variant }: { pdf: CvPdf; variant: 'primary' | 'secondary' }) {
  const size = cvPdfSize(pdf.bytes);
  return (
    <div data-cv-download="" className="print:hidden">
      <ButtonLink href={CV_PDF_HREF} variant={variant} icon="download" download>
        <span>
          Download CV (PDF, <Derived value={size.value} unit={size.unit} decimals={size.decimals} refs={['build']} />{' '}
          {size.label})
        </span>
      </ButtonLink>
    </div>
  );
}
