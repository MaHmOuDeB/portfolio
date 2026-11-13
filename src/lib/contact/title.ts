// The contact page's metadata. A sent message always redirects (303) to /contact?sent=1, so a page
// rendered in answer to a form POST is one where nothing was sent: without JavaScript that response
// is the only place the "Message not sent" title can come from (with JavaScript, the form sets it).
import type { Metadata } from 'next';

const DESCRIPTION = 'Send me a message about a role, an interview or a project.';

/** True for the body types a form POST carries (React posts a Server Action form as multipart). */
function isFormPost(headers: Pick<Headers, 'get'>): boolean {
  const type = headers.get('content-type')?.toLowerCase() ?? '';
  return type.startsWith('multipart/form-data') || type.startsWith('application/x-www-form-urlencoded');
}

export function contactMetadata(headers: Pick<Headers, 'get'>): Metadata {
  return { title: isFormPost(headers) ? 'Message not sent: Contact' : 'Contact', description: DESCRIPTION };
}
