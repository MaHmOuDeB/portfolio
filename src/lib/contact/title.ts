// The contact page's metadata. Every title ends with the site's name, like every other page's
// (withSiteName). /contact?sent=1 is titled "Message sent: Contact", whatever the
// request carried. Otherwise a page rendered in answer to a document form POST (no JavaScript) is one
// where nothing was sent, because a sent message always redirects (303) to ?sent=1: that response is
// the only place the "Message not sent" title can come from (with JavaScript, the form sets it).
//
// With JavaScript the action is a fetch carrying a `next-action` header, and when it redirects, Next
// renders /contact?sent=1 in the same request with the original headers forwarded (the multipart
// content type included) and `rsc: 1` added. So a request counts as a form POST only when its body is
// a form and neither header is there.
import type { Metadata } from 'next';
import { contactCopy } from '@/components/contact/copy';
import type { Locale } from '@/lib/i18n/locale';
import { withSiteName } from '@/lib/seo/metadata';

function isDocumentFormPost(headers: Pick<Headers, 'get'>): boolean {
  if (headers.get('rsc') !== null || headers.get('next-action') !== null) return false;
  const type = headers.get('content-type')?.toLowerCase() ?? '';
  return type.startsWith('multipart/form-data') || type.startsWith('application/x-www-form-urlencoded');
}

/** The page's own title, without the site's name: the one the manifest (content/seo.ts) lists. */
export const CONTACT_TITLE = contactCopy('en').titles.page;

/** The title of a state of the page, as the form and the sent block set it: "Message sent: Contact". */
export function contactStateTitle(state: 'sent' | 'not-sent', locale: Locale = 'en'): string {
  const t = contactCopy(locale).titles;
  return withSiteName(`${state === 'sent' ? t.sent : t.notSent}: ${t.page}`);
}

/** The bare title for a request: the page's own, or the state's, without the site's name. */
export function contactTitle(headers: Pick<Headers, 'get'>, sent: boolean, locale: Locale = 'en'): string {
  const t = contactCopy(locale).titles;
  return sent ? `${t.sent}: ${t.page}` : isDocumentFormPost(headers) ? `${t.notSent}: ${t.page}` : t.page;
}

export function contactMetadata(headers: Pick<Headers, 'get'>, sent: boolean, locale: Locale = 'en'): Metadata {
  return { title: withSiteName(contactTitle(headers, sent, locale)), description: contactCopy(locale).titles.description };
}
