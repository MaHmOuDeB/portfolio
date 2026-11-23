// The German Retention case study: a plain static page, the English one's twin.
import type { Metadata } from 'next';
import { FullPlanner } from '@/components/lab/FullPlanner';
import { RetentionCaseStudy } from '@/components/retention/RetentionPage';
import { canonicalOrigin, pageMetadata } from '@/lib/seo/metadata';
import { seoEntryFor } from '@/lib/seo/entries';

export const metadata: Metadata = pageMetadata(seoEntryFor('de', '/work/retention'), canonicalOrigin());

export default function GermanRetentionRoute() {
  return (
    <RetentionCaseStudy
      locale="de"
      planner={<FullPlanner id="winback" durationId="winback-duration" context="retention" locale="de" />}
    />
  );
}
