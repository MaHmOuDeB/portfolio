// Dev-only: the Home host with the headline group forced, one static page per group, as /v/[arm]
// serves the real page. The equal-geometry spec compares the two.
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { Arm } from '@/experiment.values';
import { HostHome } from '../HostHome';

export const dynamicParams = false;

export const metadata: Metadata = {
  title: 'Home host',
  robots: { index: false, follow: false },
};

export function generateStaticParams(): { arm: Arm }[] {
  return [{ arm: 'a' }, { arm: 'b' }];
}

export default async function KitchenSinkHomeArm({ params }: { params: Promise<{ arm: string }> }) {
  const { arm } = await params;
  if (arm !== 'a' && arm !== 'b') notFound();
  return <HostHome arm={arm} />;
}
