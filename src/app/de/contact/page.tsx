// The German contact page: the English one's twin. It renders per request like the English one (the form
// carries the time the server issued it), and the form's action sends a German form back to
// /de/contact?sent=1. Never part of the experiment.
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { ContactPageBody } from '@/components/contact/ContactPageBody';
import { contactMetadata } from '@/lib/contact/title';
import { canonicalOrigin, pageMetadata } from '@/lib/seo/metadata';
import { seoEntryFor } from '@/lib/seo/entries';

type Props = { searchParams: Promise<{ sent?: string | string[] }> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { sent } = await searchParams;
  return { ...pageMetadata(seoEntryFor('de', '/contact'), canonicalOrigin()), title: contactMetadata(await headers(), sent === '1', 'de').title };
}

export default async function GermanContactPage({ searchParams }: Props) {
  const { sent } = await searchParams;
  return <ContactPageBody locale="de" sent={sent === '1'} />;
}
