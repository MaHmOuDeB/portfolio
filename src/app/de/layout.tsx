import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { RootDocument } from '@/components/shell/RootDocument';
import { OG_LOCALE } from '@/lib/seo/alternates';
import { rootMetadata } from '@/lib/seo/root-metadata';
import { SHELL_DE } from '../../../content/de/shell';

// The German root layout: its own document, `lang="de"`, the same shell as the English one.
const root = rootMetadata();

// The German defaults: the description, and og:locale de_DE (the English root says en_GB).
export const metadata: Metadata = {
  ...root,
  description: SHELL_DE.description,
  openGraph: { ...root.openGraph, locale: OG_LOCALE.de },
};

export default function GermanLayout({ children }: { children: ReactNode }) {
  return <RootDocument locale="de">{children}</RootDocument>;
}
