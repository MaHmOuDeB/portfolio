// The contact page: the golden page's frame (one two-tone h1 and a one-line sub), the form's card and,
// beside it from lg (under it on a phone), a card with the CV, LinkedIn and GitHub. It
// renders per request, because the form carries the time the server issued it (the minimum fill time)
// and /contact?sent=1 shows the "Message sent" block in place of the form. Nothing else reads the
// query, and nothing about a visitor goes into it. The body is shared with the German page.
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { ContactPageBody } from '@/components/contact/ContactPageBody';
import { contactMetadata } from '@/lib/contact/title';
import { canonicalOrigin, pageMetadata } from '@/lib/seo/metadata';
import { seoEntry } from '../../../../content/seo';

// The manifest metadata (canonical /contact, the sharing card), with only the title answering the
// request: "Message sent" after a send, "Message not sent" for a failed form POST without JavaScript.
export async function generateMetadata({ searchParams }: PageProps<'/contact'>): Promise<Metadata> {
  const { sent } = await searchParams;
  return { ...pageMetadata(seoEntry('/contact'), canonicalOrigin()), title: contactMetadata(await headers(), sent === '1').title };
}

export default async function ContactPage({ searchParams }: PageProps<'/contact'>) {
  const { sent } = await searchParams;
  return <ContactPageBody sent={sent === '1'} />;
}
