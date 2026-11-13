// The contact page's metadata. /contact?sent=1 is titled "Message sent: Contact", whatever the
// request carried. Otherwise a page rendered in answer to a document form POST (no JavaScript) is one
// where nothing was sent, because a sent message always redirects (303) to ?sent=1: that response is
// the only place the "Message not sent" title can come from (with JavaScript, the form sets it).
//
// With JavaScript the action is a fetch carrying a `next-action` header, and when it redirects, Next
// renders /contact?sent=1 in the same request with the original headers forwarded (the multipart
// content type included) and `rsc: 1` added. So a request counts as a form POST only when its body is
// a form and neither header is there.
import type { Metadata } from 'next';

const DESCRIPTION = 'Send me a message about a role, an interview or a project.';

function isDocumentFormPost(headers: Pick<Headers, 'get'>): boolean {
  if (headers.get('rsc') !== null || headers.get('next-action') !== null) return false;
  const type = headers.get('content-type')?.toLowerCase() ?? '';
  return type.startsWith('multipart/form-data') || type.startsWith('application/x-www-form-urlencoded');
}

export function contactMetadata(headers: Pick<Headers, 'get'>, sent: boolean): Metadata {
  const title = sent ? 'Message sent: Contact' : isDocumentFormPost(headers) ? 'Message not sent: Contact' : 'Contact';
  return { title, description: DESCRIPTION };
}
