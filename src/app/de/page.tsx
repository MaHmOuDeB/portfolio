// The German home page: static, outside the experiment. It is never assigned a group, counted or
// analysed: no experiment markers, no Home model and no ISR. The proxy does not match /de.
import type { Metadata } from 'next';
import { HomeStatic } from '@/components/home/HomeStatic';
import { canonicalOrigin, pageMetadata } from '@/lib/seo/metadata';
import { seoEntryFor } from '@/lib/seo/entries';

export const metadata: Metadata = pageMetadata(seoEntryFor('de', '/'), canonicalOrigin());

export default function GermanHome() {
  return (
    <div className="wrap-break-word md:pb-section">
      <HomeStatic locale="de" />
    </div>
  );
}
