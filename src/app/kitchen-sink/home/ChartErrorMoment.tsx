'use client';

// Dev-only: the scroll moment whose live chart fails in the browser, for the error-state specs. The
// server draws it whole (and hydration matches it); once hydrated, every chart entry gets an
// accessible name holding a digit, which the kit's chart refuses by throwing while it renders, so each
// chart's own error boundary shows its fallback, as a real client failure would.
import { useSyncExternalStore } from 'react';
import { ScrollMoment, type ScrollMomentProps } from '@/components/home/ScrollMoment';

/** The name the kit refuses (a chart's accessible name holds no digit). */
export const BROKEN_LABEL = 'A chart name with a 1 in it';

const nothing = () => () => {};

export function ChartErrorMoment(props: ScrollMomentProps) {
  // false on the server and while hydrating, true from the render after it.
  const broken = useSyncExternalStore(nothing, () => true, () => false);
  const charts = broken ? props.charts.map((c) => (c ? { ...c, ariaLabel: BROKEN_LABEL } : c)) : props.charts;
  return <ScrollMoment {...props} charts={charts} />;
}
