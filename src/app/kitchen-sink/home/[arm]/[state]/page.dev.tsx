// Dev-only: the Home host in one fictional state seen from a forced group, one static page per group
// and state in HOST_STATES. These let a measurement cover both groups of the same state (the note
// names the reader's group, the cards show that group's headlines).
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { Arm } from '@/experiment.values';
import { HostHome } from '../../HostHome';
import { HOST_STATES } from '../../fixtures';

export const dynamicParams = false;

export const metadata: Metadata = {
  title: 'Home host: state for one group',
  robots: { index: false, follow: false },
};

export function generateStaticParams(): { arm: Arm; state: string }[] {
  return (['a', 'b'] as const).flatMap((arm) => HOST_STATES.map((s) => ({ arm, state: s.id })));
}

export default async function HostState({ params }: { params: Promise<{ arm: string; state: string }> }) {
  const { arm, state } = await params;
  const found = HOST_STATES.find((s) => s.id === state);
  if ((arm !== 'a' && arm !== 'b') || !found) notFound();
  return <HostHome arm={arm} model={found.model(arm)} />;
}
