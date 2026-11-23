// The CV PDF's download button: "Download CV (PDF, 84 KB)", the size worked out by the build from the
// file itself. Only rendered when the build has a checked PDF (src/lib/cv-pdf.ts); hidden in print,
// where the page itself is the CV. The German page links the same English file: its own anchor says so
// (hreflang) and carries the page's words before the size. Server-safe.
import { ButtonLink, buttonClass } from '@/components/kit/ButtonLink';
import { Derived } from '@/components/kit/Derived';
import { Icon } from '@/components/kit/Icon';
import { CV_PDF_HREF, cvPdfSize, type CvPdf } from '@/lib/cv-pdf';
import type { Locale } from '@/lib/i18n/locale';

export function CvDownload({
  pdf,
  variant,
  locale = 'en',
  before = 'Download CV (PDF, ',
}: {
  pdf: CvPdf;
  variant: 'primary' | 'secondary';
  locale?: Locale;
  /** The button's text before the size. */
  before?: string;
}) {
  const size = cvPdfSize(pdf.bytes);
  const number = <Derived value={size.value} unit={size.unit} decimals={size.decimals} refs={['build']} locale={locale === 'en' ? undefined : locale} />;
  if (locale === 'en') {
    return (
      <div data-cv-download="" className="print:hidden">
        <ButtonLink href={CV_PDF_HREF} variant={variant} icon="download" download>
          <span>
            Download CV (PDF, {number} {size.label})
          </span>
        </ButtonLink>
      </div>
    );
  }
  return (
    <div data-cv-download="" className="print:hidden">
      <a href={CV_PDF_HREF} hrefLang="en" download="" data-touch-target className={buttonClass(variant)}>
        <Icon name="download" />
        <span>
          {before}
          {number} {size.label})
        </span>
      </a>
    </div>
  );
}
