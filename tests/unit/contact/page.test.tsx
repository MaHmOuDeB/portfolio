// The contact page as static HTML (no JavaScript): the form, its fields and the sent state pass the
// truth audit, name no address, and keep the honeypot out of reach.
import { renderToStaticMarkup } from 'react-dom/server';
import ContactPage from '@/app/contact/page';
import { contactMetadata } from '@/lib/contact/title';
import { auditHtml } from '../../../scripts/truth-audit.ts';
import { FACTS, FACT_DISPLAYS } from '@/lib/facts/facts.generated';
import { CONTACT_LIMITS } from '@/lib/contact/fields';

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
    expect(contactMetadata(new Headers()).title).toBe('Contact');
    expect(form.match(/<h1\b/g)).toHaveLength(1);
    expect(form).toContain('>Contact</h1>');
  });

  it('titles a page rendered in answer to a form POST "Message not sent: Contact" (a sent one redirects)', () => {
    expect(contactMetadata(new Headers({ 'content-type': 'multipart/form-data; boundary=x' })).title).toBe('Message not sent: Contact');
    expect(contactMetadata(new Headers({ 'content-type': 'application/x-www-form-urlencoded' })).title).toBe('Message not sent: Contact');
    expect(contactMetadata(new Headers({ accept: 'text/html' })).title).toBe('Contact');
    expect(contactMetadata(new Headers()).description).toBe('Send me a message about a role, an interview or a project.');
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
    for (const name of ['name', 'email', 'reason', 'subject', 'message', 'issuedAt', 'website']) expect(form).toContain(`name="${name}"`);
  });

  it('gives each one-line field its maximum length, and the message none (the counter shows the limit)', () => {
    expect(form).toContain(`maxLength="${CONTACT_LIMITS.name}"`);
    expect(form).toContain(`maxLength="${CONTACT_LIMITS.email}"`);
    expect(form).toContain(`maxLength="${CONTACT_LIMITS.subject}"`);
    expect(form).not.toMatch(/<textarea[^>]*maxLength/);
    expect(form).toContain('Up to ');
  });

  it('keeps the honeypot hidden from assistive tech, inert and out of the tab order', () => {
    const wrapper = form.match(/<div class="sr-only" aria-hidden="true" inert="">(.*?)<\/div>/)?.[1];
    expect(wrapper).toBeDefined();
    expect(wrapper).toContain('id="contact-website"');
    expect(wrapper).toContain('tabindex="-1"');
  });

  it('links the note under the button to the privacy notice section on the form', () => {
    expect(form).toContain('href="/privacy#contact-form"');
  });

  it('shows the sent block in place of the form', () => {
    expect(sent).not.toContain('<form');
    expect(sent).toContain('Message sent');
    expect(sent).toContain('Thanks, your message is on its way. I reply from my own e-mail.');
    expect(sent).toContain('href="/contact"');
  });
});
