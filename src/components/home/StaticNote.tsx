// The note of a page that is outside the experiment (the German Home): one fixed sentence with a link
// to the Live test page. It reads no model and shows no phase, count or group, so nothing in it can go
// stale when the test pauses or stops. Server-safe.
import { TextLink } from '@/components/kit/TextLink';
import { localHref } from '@/lib/i18n/href';
import type { Locale } from '@/lib/i18n/locale';
import { HOME_LINKS } from '../../../content/home-destinations.ts';
import { homeCopy } from './copy';

export function StaticNote({ locale }: { locale: Locale }) {
  const note = homeCopy(locale).staticNote;
  if (note === null) return null;
  return (
    <div data-home-note="">
      <div className="text-sm">
        <p>
          {note.before}
          <TextLink href={localHref(locale, HOME_LINKS.experiment)}>{note.link}</TextLink>
          {note.after}
        </p>
      </div>
    </div>
  );
}
