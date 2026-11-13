// What /contact?sent=1 shows in place of the form: the "Message sent" block, with links to send
// another message or to the work. FocusOnArrival moves focus to its heading (with JavaScript), so a
// screen reader hears it and a phone shows it, and the focus ring sits on the words, not around the block.
import { TextLink } from '@/components/kit/TextLink';
import { FocusOnArrival } from './FocusOnArrival';
import { StatusBlock, WORD_ID } from './StatusBlock';

export function SentStatus() {
  return (
    <>
      {/* React hoists this into the head, so a send with JavaScript (rendered on the client) is titled
          too; generateMetadata gives the same title to a request for /contact?sent=1. */}
      <title>Message sent: Contact</title>
      <StatusBlock tone="ok" word="Message sent" className="mt-12" focus="heading">
        <p>Thanks, your message is on its way. I reply from my own e-mail.</p>
        <div className="mt-2 flex flex-wrap gap-x-6">
          <TextLink href="/contact" standalone>
            Send another message
          </TextLink>
          <TextLink href="/work" standalone>
            Work
          </TextLink>
        </div>
      </StatusBlock>
      <FocusOnArrival targetId={WORD_ID} />
    </>
  );
}
