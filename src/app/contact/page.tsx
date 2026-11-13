// The contact page: the golden page's frame (one h1 and a one-line intro) and one text column. It
// renders per request, because the form carries the time the server issued it (the minimum fill time)
// and /contact?sent=1 shows the "Message sent" block in place of the form. Nothing else reads the
// query, and nothing about a visitor goes into it.
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { ContactForm } from '@/components/contact/ContactForm';
import { SentStatus } from '@/components/contact/SentStatus';
import { TextLink } from '@/components/kit/TextLink';
import { issueTimestamp } from '@/lib/contact/issue';
import { contactMetadata } from '@/lib/contact/title';
import { canonicalOrigin, pageMetadata } from '@/lib/seo/metadata';
import { CONTACT } from '@/lib/site';
import { seoEntry } from '../../../content/seo';

// The manifest metadata (canonical /contact, the sharing card), with only the title answering the
// request: "Message sent" after a send, "Message not sent" for a failed form POST without JavaScript.
export async function generateMetadata({ searchParams }: PageProps<'/contact'>): Promise<Metadata> {
  const { sent } = await searchParams;
  return { ...pageMetadata(seoEntry('/contact'), canonicalOrigin()), title: contactMetadata(await headers(), sent === '1').title };
}

export default async function ContactPage({ searchParams }: PageProps<'/contact'>) {
  const { sent } = await searchParams;
  return (
    <article aria-labelledby="contact-title" className="py-12 md:py-section">
      <div className="max-w-text">
        <h1 id="contact-title" className="text-2xl font-semibold md:text-3xl">
          Contact
        </h1>
        <p className="mt-4 text-lg text-muted">Tell me who you are and why you are writing, and I will reply by e-mail.</p>
        <p className="mt-4 text-base">
          You can also message me on{' '}
          <TextLink href={CONTACT.linkedin} external>
            LinkedIn
          </TextLink>
          .
        </p>
        {sent === '1' ? <SentStatus /> : <ContactForm issuedAt={issueTimestamp()} />}
      </div>
    </article>
  );
}
