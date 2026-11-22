import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { RootDocument } from '@/components/shell/RootDocument';
import { rootMetadata } from '@/lib/seo/root-metadata';
import { SHELL_DE } from '../../../content/de/shell';

// The German root layout: its own document, `lang="de"`, the same shell as the English one.
export const metadata: Metadata = { ...rootMetadata(), description: SHELL_DE.description };

export default function GermanLayout({ children }: { children: ReactNode }) {
  return <RootDocument locale="de">{children}</RootDocument>;
}
