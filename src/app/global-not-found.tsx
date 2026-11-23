import type { Metadata } from 'next';
import { RootDocument } from '@/components/shell/RootDocument';
import { rootMetadata } from '@/lib/seo/root-metadata';
import NotFound from './(en)/not-found';

// The 404 for an address no route matches. Next draws it without a layout, so it draws the whole
// shell itself, from the same document as the English layout.
export const metadata: Metadata = { ...rootMetadata(), title: 'Page not found' };

export default function GlobalNotFound() {
  return (
    <RootDocument locale="en">
      <NotFound />
    </RootDocument>
  );
}
