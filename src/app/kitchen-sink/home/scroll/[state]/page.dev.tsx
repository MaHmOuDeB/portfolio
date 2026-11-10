// Dev-only: the Home host with the scroll moment (and the note) in one fictional state, seen from
// group B, one static page per state: the step states, then the chart geometry cases. The browser
// specs of the scroll moment's layouts run here.
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { HostHome } from '../../HostHome';
import { SCROLL_STATES } from '../../fixtures';

export const dynamicParams = false;

export const metadata: Metadata = {
  title: 'Home host: scroll moment state',
  robots: { index: false, follow: false },
};

export function generateStaticParams(): { state: string }[] {
  return SCROLL_STATES.map((s) => ({ state: s.id }));
}

export default async function ScrollState({ params }: { params: Promise<{ state: string }> }) {
  const { state } = await params;
  const found = SCROLL_STATES.find((s) => s.id === state);
  if (!found) notFound();
  const model = found.model();
  return <HostHome arm={model.arm} model={model} />;
}
