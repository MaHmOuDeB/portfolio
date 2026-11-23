// What /contact?sent=1 shows in place of the form: the "Message sent" block, with links to send
// another message or to the work. FocusOnArrival moves focus to its heading (with JavaScript), so a
// screen reader hears it and a phone shows it, and the focus ring sits on the words, not around the block.
import { TextLink } from '@/components/kit/TextLink';
import { contactStateTitle } from '@/lib/contact/title';
import { localHref } from '@/lib/i18n/href';
import type { Locale } from '@/lib/i18n/locale';
import { contactCopy } from './copy';
import { FocusOnArrival } from './FocusOnArrival';
import { StatusBlock, WORD_ID } from './StatusBlock';

export function SentStatus({ locale = 'en' }: { locale?: Locale } = {}) {
  const { sent } = contactCopy(locale);
  return (
    <>
      {/* React hoists this into the head, so a send with JavaScript (rendered on the client) is titled
          too; generateMetadata gives the same title to a request for /contact?sent=1. */}
      <title>{contactStateTitle('sent', locale)}</title>
      <StatusBlock tone="ok" word={sent.word} className="mt-12" focus="heading">
        <p>{sent.text}</p>
        <div className="mt-2 flex flex-wrap gap-x-6">
          <TextLink href={localHref(locale, '/contact')} standalone>
            {sent.again}
          </TextLink>
          <TextLink href={localHref(locale, '/work')} standalone>
            {sent.work}
          </TextLink>
        </div>
      </StatusBlock>
      <FocusOnArrival targetId={WORD_ID} />
    </>
  );
}
