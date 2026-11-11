// Dev-only: the Home host with the scroll moment (and the note) in one fictional state, seen from
// group B, one static page per state: the step states, the chart geometry cases, a live chart that
// fails in the browser, the visitor tick allowed, the cross-fade's two layers, and the home page's own
// tick rule at a fixed render time. The browser specs of the scroll moment's layouts and interaction
// run here.
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { HostHome } from '../../HostHome';
import { CHART_ERROR_STATE, SCROLL_STATES } from '../../fixtures';

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
  return (
    <HostHome
      arm={model.arm}
      model={model}
      breakChart={state === CHART_ERROR_STATE}
      scroll={found.props?.(model)}
      renderedAt={found.renderedAt?.(model)}
    />
  );
}
