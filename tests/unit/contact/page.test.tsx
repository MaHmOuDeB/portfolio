// The contact page as static HTML (no JavaScript): the form, its fields and the sent state pass the
// truth audit, name no address, and keep the honeypot out of reach.
import { renderToStaticMarkup } from 'react-dom/server';
import ContactPage from '@/app/contact/page';
import { contactMetadata } from '@/lib/contact/title';
import { auditHtml } from '../../../scripts/truth-audit.ts';
import { FACTS, FACT_DISPLAYS } from '@/lib/facts/facts.generated';
import { CONTACT_LIMITS } from '@/lib/contact/fields';
import { StatusBlock } from '@/components/contact/StatusBlock';

async function render(sent?: string): Promise<string> {
  const element = await ContactPage({ searchParams: Promise.resolve(sent === undefined ? {} : { sent }) } as PageProps<'/contact'>);
  return renderToStaticMarkup(element);
}

const audit = (html: string, route: string) =>
  auditHtml(html, { route, factIds: new Set(Object.keys(FACTS)), factDisplays: FACT_DISPLAYS, denylist: [] });

const form = await render();
const sent = await render('1');

describe('the contact page', () => {
  it('is titled Contact, with one h1 and a one-line intro', () => {
    expect(contactMetadata(new Headers(), false).title).toBe('Contact');
    expect(form.match(/<h1\b/g)).toHaveLength(1);
    expect(form).toContain('>Contact</h1>');
  });

  it('titles a page rendered in answer to a document form POST "Message not sent: Contact" (a sent one redirects)', () => {
    expect(contactMetadata(new Headers({ 'content-type': 'multipart/form-data; boundary=x' }), false).title).toBe('Message not sent: Contact');
    expect(contactMetadata(new Headers({ 'content-type': 'application/x-www-form-urlencoded' }), false).title).toBe('Message not sent: Contact');
    expect(contactMetadata(new Headers({ accept: 'text/html' }), false).title).toBe('Contact');
    expect(contactMetadata(new Headers(), false).description).toBe('Send me a message about a role, an interview or a project.');
  });

  it('never titles a JavaScript request "Message not sent": a fetch action and the redirect it renders carry rsc or next-action', () => {
    // A Server Action's redirect() with JavaScript renders /contact?sent=1 in the same request, with the
    // original headers forwarded (multipart content type included) and rsc: 1 added.
    const forwardedRedirect = new Headers({ 'content-type': 'multipart/form-data; boundary=x', rsc: '1' });
    expect(contactMetadata(forwardedRedirect, false).title).toBe('Contact');
    expect(contactMetadata(forwardedRedirect, true).title).toBe('Message sent: Contact');
    const fetchAction = new Headers({ 'content-type': 'multipart/form-data; boundary=x', 'next-action': 'abc' });
    expect(contactMetadata(fetchAction, false).title).toBe('Contact');
  });

  it('titles the sent page "Message sent: Contact", whatever the request carried', () => {
    expect(contactMetadata(new Headers(), true).title).toBe('Message sent: Contact');
    expect(contactMetadata(new Headers({ 'content-type': 'multipart/form-data; boundary=x' }), true).title).toBe('Message sent: Contact');
  });

  it('passes the truth audit in both states', () => {
    expect(audit(form, '/contact')).toEqual([]);
    expect(audit(sent, '/contact?sent=1')).toEqual([]);
  });

  it('carries no e-mail address and no placeholder text', () => {
    for (const html of [form, sent]) {
      expect(html).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
      expect(html).not.toMatch(/\splaceholder=/);
      expect(html).not.toContain('mailto:');
    }
  });

  it('posts to this site only, with every field required in the copy and none sent anywhere else', () => {
    expect(form).not.toMatch(/action="https?:/);
    expect(form).toContain('All fields are required.');
    for (const name of ['name', 'email', 'reason', 'subject', 'message', 'issuedAt', 'contact_hp']) expect(form).toContain(`name="${name}"`);
  });

  it('gives each one-line field its maximum length, and the message none (the counter shows the limit)', () => {
    expect(form).toContain(`maxLength="${CONTACT_LIMITS.name}"`);
    expect(form).toContain(`maxLength="${CONTACT_LIMITS.email}"`);
    expect(form).toContain(`maxLength="${CONTACT_LIMITS.subject}"`);
    expect(form).not.toMatch(/<textarea[^>]*maxLength/);
    expect(form).toContain('Up to ');
  });

  it('keeps the honeypot hidden from assistive tech, inert and out of the tab order, named so no autofill fills it', () => {
    const wrapper = form.match(/<div class="sr-only" aria-hidden="true" inert="">(.*?)<\/div>/)?.[1];
    expect(wrapper).toBeDefined();
    expect(wrapper).toContain('<label for="contact-hp">Leave this field empty</label>');
    expect(wrapper).toContain('id="contact-hp"');
    expect(wrapper).toContain('name="contact_hp"');
    expect(wrapper).toContain('tabindex="-1"');
    expect(form).not.toMatch(/name="website"|>Website</);
  });

  it('says at the button where the message goes, and links to the privacy notice section on the form', () => {
    expect(form).toContain('I receive your message by e-mail: Resend, in the USA, delivers it to my Gmail inbox, and this site stores nothing. More, including your rights, in the');
    expect(form).toContain('href="/privacy#contact-form"');
  });

  it('shows the sent block in place of the form, as a group named by its h2', () => {
    expect(sent).toMatch(/<div id="contact-status"[^>]* role="group" aria-labelledby="contact-status-word"/);
    expect(sent).toMatch(/<h2 id="contact-status-word"[^>]*>.*Message sent<\/h2>/);
    // The sent block titles the page itself, as the form does for "Message not sent", so a send with
    // JavaScript (a client render of ?sent=1) gets the title too, not only a request for the page.
    expect(sent).toContain('<title>Message sent: Contact</title>');
    expect(form).not.toContain('<title>');
    expect(sent).not.toContain('<form');
    expect(sent).toContain('Message sent');
    expect(sent).toContain('Thanks, your message is on its way. I reply from my own e-mail.');
    expect(sent).toContain('href="/contact"');
  });

  it('focuses the sent block\'s heading, not the whole block, so the focus ring and the rule never show together', () => {
    expect(sent).toMatch(/<div id="contact-status"[^>]* role="group"/);
    expect(sent).not.toMatch(/<div id="contact-status"[^>]*tabindex/);
    expect(sent).toMatch(/<h2 id="contact-status-word" tabindex="-1"[^>]*class="[^"]*\bw-fit\b/);
  });

  it('spaces every field the same: one group, one gap, and the same gap before the button', () => {
    const groups = [...form.matchAll(/<div class="([^"]*\bflex-col\b[^"]*)">/g)].map((m) => m[1]);
    expect(groups).toEqual(['mt-6 flex flex-col gap-8']);
    const block = form.slice(form.indexOf('<div class="mt-6 flex flex-col gap-8">'));
    const ids = ['contact-name', 'contact-email', 'contact-reason', 'contact-subject', 'contact-message'];
    const at = ids.map((id) => block.indexOf(`id="${id}"`));
    expect(at.every((i) => i > 0)).toBe(true);
    expect(block.indexOf('id="contact-hp"')).toBeGreaterThan(Math.max(...at));
    expect(form).toMatch(/<div class="mt-8"><button/);
  });

  it('draws "Message not sent" the same way: an h2 that names the focused group', () => {
    const html = renderToStaticMarkup(
      <StatusBlock tone="warn" word="Message not sent">
        <p>Check these fields:</p>
      </StatusBlock>,
    );
    expect(html).toMatch(/^<div id="contact-status" tabindex="-1"[^>]* role="group" aria-labelledby="contact-status-word"/);
    expect(html).toMatch(/<h2 id="contact-status-word"[^>]*>.*Message not sent<\/h2>/);
    expect(html).not.toMatch(/role="alert"|aria-live/);
  });
});
