// Dev-only: the Home host in one fictional state seen from a forced group, one static page per group
// and state in PAIRED_STATES. These let a
// measurement cover both groups of the same state (the note names the reader's group, the cards show
// that group's headlines).
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { Arm } from '@/experiment.values';
import { HostHome } from '../../HostHome';
import { PAIRED_STATES, HOST_STATES } from '../../fixtures';

export const dynamicParams = false;

export const metadata: Metadata = {
  title: 'Home host: state for one group',
  robots: { index: false, follow: false },
};

export function generateStaticParams(): { arm: Arm; state: string }[] {
  return (['a', 'b'] as const).flatMap((arm) => PAIRED_STATES.map((state) => ({ arm, state })));
}

export default async function PairedState({ params }: { params: Promise<{ arm: string; state: string }> }) {
  const { arm, state } = await params;
  const found = HOST_STATES.find((s) => s.id === state);
  if ((arm !== 'a' && arm !== 'b') || !found || !(PAIRED_STATES as readonly string[]).includes(state)) notFound();
  const model = found.model(arm);
  return <HostHome arm={arm} model={model} />;
}
