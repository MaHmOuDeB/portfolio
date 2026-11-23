// The contact page's body, shared by the English page and its German twin: the golden page's frame (one
// two-tone h1 and a one-line sub), the form's card and, beside it from lg (under it on a phone), the card
// with the CV, LinkedIn and GitHub. The pages render per request (the form carries the time the server
// issued it, and ?sent=1 shows the "Message sent" block in place of the form). Server-only.
import { ContactForm } from '@/components/contact/ContactForm';
import { ContactSide } from '@/components/contact/ContactSide';
import { SentStatus } from '@/components/contact/SentStatus';
import { CaseHead } from '@/components/work/CaseHead';
import { issueTimestamp } from '@/lib/contact/issue';
import { contactStateTitle } from '@/lib/contact/title';
import { localHref } from '@/lib/i18n/href';
import type { Locale } from '@/lib/i18n/locale';
import { PRIVACY_HREF } from '@/lib/site';
import { KIT_TEXT_DE } from '../../../content/de/kit';
import { KIT_TEXT_EN } from '@/components/kit/text';
import { contactCopy, contactErrors } from './copy';

export function ContactPageBody({ locale = 'en', sent }: { locale?: Locale; sent: boolean }) {
  const copy = contactCopy(locale);
  const kit = locale === 'de' ? KIT_TEXT_DE : KIT_TEXT_EN;
  return (
    <article aria-labelledby="contact-title">
      <CaseHead id="contact-title" chip={copy.chip} title={copy.title} quiet={copy.quiet} intro={<p>{copy.intro}</p>} />
      <div className="grid grid-cols-1 gap-6 pb-12 md:pb-16 lg:grid-cols-[minmax(0,40rem)_minmax(0,1fr)] lg:items-start lg:gap-8">
        <div
          data-contact-card=""
          className="max-w-[40rem] rounded-xl border border-hairline bg-surface p-5 md:p-8 [&>*:first-child]:mt-0 [&>form:first-child]:mt-0"
        >
          {sent ? (
            <SentStatus locale={locale} />
          ) : (
            <ContactForm
              issuedAt={issueTimestamp()}
              notSentTitle={contactStateTitle('not-sent', locale)}
              locale={locale}
              copy={copy.form}
              messages={contactErrors(locale)}
              kit={{ field: kit.field, select: kit.select, count: kit.count }}
              privacyHref={`${localHref(locale, PRIVACY_HREF)}#contact-form`}
            />
          )}
        </div>
        <ContactSide locale={locale} />
      </div>
    </article>
  );
}
