// What /contact?sent=1 shows in place of the form: the "Message sent" block, with links to send
// another message or to the work. FocusOnArrival moves focus to it (with JavaScript), so a screen
// reader hears it and a phone shows it.
import { TextLink } from '@/components/kit/TextLink';
import { FocusOnArrival } from './FocusOnArrival';
import { STATUS_ID, StatusBlock } from './StatusBlock';

export function SentStatus() {
  return (
    <>
      <StatusBlock tone="ok" word="Message sent" heading className="mt-12">
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
      <FocusOnArrival targetId={STATUS_ID} />
    </>
  );
}
