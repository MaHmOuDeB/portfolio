'use client';

// The scroll moment's client half: the sticky stage (the chart's canvas and the step navigation), the
// five steps with their stacked frames, and everything that follows the visitor. ScrollMoment (server)
// composes it, frames it in the chart Figure and hands it the server's drawing of each chart.
//
// What it does, and only where the moment has a kit chart (without one there is no stage, and nothing
// here runs: no observer, no listener, no chart code):
// - The current step. The step navigation sets it at once and scrolls that step into view; an
//   IntersectionObserver on a thin trigger band sets it as the page scrolls, and is ignored while the
//   navigation's scroll runs (lib/home/scroll-controller). Nothing scrolls on its own. The current step
//   is the list item with aria-current="step"; StepNav announces only its own uses. Accepted residual:
//   if the reader interrupts a navigation scroll midway, the step stays the navigation's until the
//   next step enters the trigger band (the observer reports changes only, and a fresh reading at the
//   end of the scroll would undo a navigation to a last step the band cannot reach).
// - A held key moves one step: the browser repeats keydown while a key is held, and StepNav moves on
//   every keydown, so repeats are stopped before they reach it (Enter's repeats too, which would click).
// - Focus never hides behind the phone's sticky stage: the stage's measured height goes to
//   --scroll-stage-h, which globals.css adds to the steps' scroll margin (WCAG 2.2 SC 2.4.11).
// - The canvas holds one layer per distinct chart; the step's layer is shown and the others fade out,
//   in opacity only, over the step duration (globals.css). The data is never interpolated. Reduced
//   motion switched on midway ends the fade at once.
// - The chart code (HomeChart, the kit's chart, d3) is not in the first load: each chart is the
//   server's drawing until its code loads, on the moment coming near or at idle time, and at once on a
//   phone, where the canvas stays blank until the chart has measured it. There the code is requested
//   as soon as this module runs, which is after the first-load scripts have arrived, so it can add a
//   round trip to that wait; how long it takes is measured separately, not assumed. If the code cannot
//   load, or on a phone the chart has not measured within CHART_WAIT_MS of its loading starting
//   (data-chart-late), globals.css drops the moment to its stacked frames, which keep the server's
//   drawing. That drop is final: a chart that arrives later never moves the page a second time.
// - "Your view": the beacon fires `experiment:counted` once this visit is counted. The first count of
//   this page's group is kept in memory (never stored) and drawn as the kit's muted x-axis tick, only
//   where the server let the tick start (ScrollMoment's tickFrom) and from the last look drawn on. The
//   tick fades in once over the step duration. The listener is attached in a layout effect, which runs
//   before any page effect (such as the beacon's) can post the view.
import { lazy, memo, useEffect, useMemo, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { TableData } from '@/components/kit/DataTable';
import type { DerivedRef } from '@/components/kit/Derived';
import { LoadOnIntent } from '@/components/kit/LoadOnIntent';
import { StepNav } from '@/components/kit/StepNav';
import type { Arm } from '@/experiment.values';
import type { LiveSnapshot } from '@/lib/figure/cs-band';
import { normalizeSteps, stepDirection } from '@/lib/figure/steps';
import type { HomeStep } from '@/lib/home/scroll';
import { acceptedViewN, bandMargin, createScrollController, withYourView, type ScrollController } from '@/lib/home/scroll-controller';

const loadChart = () => import('./HomeChart');
// Memoized: a step change re-renders the shell, and an unchanged chart (the same snapshot object while
// no count has arrived) need not be drawn again.
const LazyHomeChart = lazy(() => loadChart().then((m) => ({ default: memo(m.HomeChart) })));

/** globals.css's sticky layouts (a media query cannot read a custom property, so they are repeated). */
const ONE_COLUMN = '(prefers-reduced-motion: no-preference) and (width < 64rem) and (height >= 37.5rem)';
const REDUCED = '(prefers-reduced-motion: reduce)';
/** How far ahead of the moment its chart code and observer start. */
const NEAR = '100% 0px 100% 0px';
const IDLE_TIMEOUT_MS = 2000;
const STEP_MS = 320;
/** How long a phone's canvas may wait for its chart to measure before the moment drops to its stacked frames. */
const CHART_WAIT_MS = 5000;

// On a phone the sticky canvas is blank until the chart has measured it: ask for the chart's code as
// soon as this module runs (it arrives with the first-load scripts), not only once the page has
// hydrated. Only where the page has a sticky moment (a moment without a kit chart never needs the
// code); if the HTML is still being parsed, look again once it has been.
function prefetchOnPhone() {
  if (!document.documentElement.hasAttribute('data-js') || !window.matchMedia(ONE_COLUMN).matches) return;
  if (document.querySelector('[data-scroll-moment="sticky"]') === null) return;
  loadChart().catch(() => {
    // The island's own load reports the failure (LoadOnIntent), and the moment drops to its frames.
  });
}
if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', prefetchOnPhone, { once: true });
  else prefetchOnPhone();
}

export type ShellChart = {
  snapshot: LiveSnapshot;
  table: TableData;
  ariaLabel?: string;
  /** The views per group the "your view" tick may start from (the last look drawn), or null for no tick. */
  tickFrom: number | null;
};

export type ScrollShellProps = {
  /** The group this view was assigned to: only its counted view is drawn. */
  arm: Arm;
  steps: readonly { step: HomeStep; heading: string; body: ReactNode }[];
  /** One entry per step, null where the step has no live chart. */
  charts: readonly (null | ShellChart)[];
  /** The server's drawing of each chart (per entry, null where none): for the canvas layers and the stacked frames. */
  previews: { canvas: readonly ReactNode[]; frames: readonly ReactNode[] };
  /** Null without a kit chart (no stage). Else the entries drawn as canvas layers, and the entry each step shows. */
  canvas: { layers: readonly number[]; byStep: readonly number[] } | null;
  refs: readonly DerivedRef[];
};

const BUILD: readonly DerivedRef[] = ['build'];

/** The step duration from the tokens (0 under reduced motion), in ms. */
function stepMs(): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--duration-step').trim();
  const ms = raw.endsWith('ms') ? Number.parseFloat(raw) : raw.endsWith('s') ? Number.parseFloat(raw) * 1000 : Number.NaN;
  return Number.isFinite(ms) && ms >= 0 ? ms : STEP_MS;
}

/** Repeats of a held key never reach StepNav, which would move once per repeat. */
function stopRepeats(e: KeyboardEvent<HTMLDivElement>) {
  if (!e.repeat) return;
  if (stepDirection(e) !== null || e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    e.stopPropagation();
  }
}

export function ScrollShell({ arm, steps, charts, previews, canvas, refs }: ScrollShellProps) {
  const total = steps.length;
  const [current, setCurrent] = useState(1);
  const [near, setNear] = useState(false);
  const [viewN, setViewN] = useState<number | null>(null);
  const [fading, setFading] = useState(false);
  const [late, setLate] = useState(false);
  const shell = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const controller = useRef<ScrollController | null>(null);
  const sticky = canvas !== null;
  const ticks = charts.some((c) => c !== null && c.tickFrom !== null);

  // "Your view": the first counted view of this group, in memory only.
  useLayoutEffect(() => {
    if (!ticks) return;
    const counted = (e: Event) => {
      const n = acceptedViewN((e as CustomEvent<unknown>).detail, arm);
      if (n === null) return;
      window.removeEventListener('experiment:counted', counted);
      setViewN(n);
      setFading(true);
    };
    window.addEventListener('experiment:counted', counted);
    return () => window.removeEventListener('experiment:counted', counted);
  }, [ticks, arm]);

  // The tick's one fade: the attribute that runs it stays for one step duration, then never returns,
  // so a chart redrawn later shows the tick still.
  useEffect(() => {
    if (!fading) return;
    const timer = window.setTimeout(() => setFading(false), stepMs());
    return () => window.clearTimeout(timer);
  }, [fading]);

  // The controller: the navigation sets the step and scrolls; the observer is ignored until scrollend.
  useEffect(() => {
    if (!sticky) return;
    const c = createScrollController({
      setCurrent: (step) => setCurrent(normalizeSteps(step, total).current),
      scrollTo: (step, instant) =>
        document.getElementById(`home-step-${step}`)?.scrollIntoView({ behavior: instant ? 'instant' : 'smooth', block: 'start' }),
    });
    controller.current = c;
    const settled = () => c.settled();
    window.addEventListener('scrollend', settled);
    return () => {
      window.removeEventListener('scrollend', settled);
      c.dispose();
      controller.current = null;
    };
  }, [sticky, total]);

  // Reduced motion switched on midway through a cross-fade: the fade ends at once, never waiting for a
  // transitionend (which a 0 ms duration does not send).
  useEffect(() => {
    const root = shell.current;
    if (!sticky || root === null) return;
    const media = window.matchMedia(REDUCED);
    const snap = () => {
      if (!media.matches) return;
      for (const layer of root.querySelectorAll('[data-canvas-layer]')) for (const a of layer.getAnimations()) a.finish();
    };
    media.addEventListener('change', snap);
    return () => media.removeEventListener('change', snap);
  }, [sticky]);

  // Near: the moment is within a screen of the viewport, or the page is idle, or this is a phone (its
  // canvas waits for the chart). The chart code loads and the step observer starts then.
  useEffect(() => {
    const root = shell.current;
    if (!sticky || root === null) return;
    let done = false;
    const cleanups: (() => void)[] = [];
    const go = () => {
      if (done) return;
      done = true;
      for (const cleanup of cleanups.splice(0)) cleanup();
      setNear(true);
    };
    const proximity = new IntersectionObserver((records) => {
      if (records.some((r) => r.isIntersecting)) go();
    }, { rootMargin: NEAR });
    proximity.observe(root);
    cleanups.push(() => proximity.disconnect());
    if (typeof window.requestIdleCallback === 'function') {
      const handle = window.requestIdleCallback(go, { timeout: IDLE_TIMEOUT_MS });
      cleanups.push(() => window.cancelIdleCallback(handle));
    } else {
      const handle = window.setTimeout(go, IDLE_TIMEOUT_MS);
      cleanups.push(() => window.clearTimeout(handle));
    }
    if (window.matchMedia(ONE_COLUMN).matches) go();
    return () => {
      done = true;
      for (const cleanup of cleanups.splice(0)) cleanup();
    };
  }, [sticky]);

  // A phone's canvas is blank until its chart has measured: if that has not happened CHART_WAIT_MS
  // after the chart began to load, the moment drops to its stacked frames for good.
  useEffect(() => {
    const root = shell.current;
    if (!sticky || !near || root === null || !window.matchMedia(ONE_COLUMN).matches) return;
    const measured = () => root.querySelector('[data-scroll-canvas] [data-canvas-layer][data-active] [data-home-chart][data-measured]') !== null;
    if (measured()) return;
    const timer = window.setTimeout(() => {
      if (!measured()) setLate(true);
    }, CHART_WAIT_MS);
    return () => window.clearTimeout(timer);
  }, [sticky, near]);

  // The stage's height for the steps' scroll margin, and the step observer on its trigger band. Both
  // follow the stage's size: it changes with the layout (beside, above, hidden when stacked).
  useLayoutEffect(() => {
    const root = shell.current;
    const box = stage.current;
    if (!sticky || root === null || box === null) return;
    const list = root.querySelector('[data-scroll-steps]');
    const items = [...root.querySelectorAll<HTMLElement>('[data-scroll-step]')];
    const inBand = new Set<number>();
    let observer: IntersectionObserver | null = null;

    const watch = () => {
      observer?.disconnect();
      observer = null;
      inBand.clear();
      // Stacked (no stage drawn): nothing to follow.
      if (!near || list === null || box.getClientRects().length === 0) return;
      const beside = box.getBoundingClientRect().left >= list.getBoundingClientRect().right - 1;
      const stuckBottom = (Number.parseFloat(getComputedStyle(box).top) || 0) + box.offsetHeight;
      const rootMargin = bandMargin(beside ? { kind: 'beside' } : { kind: 'above', stuckBottom }, document.documentElement.clientHeight);
      observer = new IntersectionObserver((records) => {
        let entered: number | null = null;
        for (const r of records) {
          const step = Number(r.target.getAttribute('data-scroll-step'));
          if (r.isIntersecting) {
            inBand.add(step);
            entered = step;
          } else inBand.delete(step);
        }
        const step = entered ?? (inBand.size > 0 ? Math.min(...inBand) : null);
        if (step !== null) controller.current?.fromObserver(step);
      }, { rootMargin });
      for (const item of items) observer.observe(item);
    };

    const sized = new ResizeObserver(() => {
      root.style.setProperty('--scroll-stage-h', `${box.offsetHeight}px`);
      watch();
    });
    sized.observe(box);
    return () => {
      sized.disconnect();
      observer?.disconnect();
      root.style.removeProperty('--scroll-stage-h');
    };
  }, [sticky, near]);

  const onNav = (next: number) => {
    const step = normalizeSteps(next, total).current;
    const c = controller.current;
    if (c === null) setCurrent(step);
    else c.fromNav(step, window.matchMedia(REDUCED).matches);
  };

  // One snapshot object per chart while nothing changes, so the memoized chart is not drawn again on
  // every step change once a count has arrived.
  const snapshots = useMemo(() => charts.map((c) => (c === null ? null : withYourView(c.snapshot, c.tickFrom, viewN))), [charts, viewN]);

  const island = (i: number, preview: ReactNode) => {
    const chart = charts[i]!;
    return (
      <LoadOnIntent eager={near} preview={preview}>
        <LazyHomeChart snapshot={snapshots[i]!} table={chart.table} refs={refs} ariaLabel={chart.ariaLabel} />
      </LoadOnIntent>
    );
  };

  const shown = canvas?.byStep[current - 1];
  return (
    <div ref={shell} data-scroll-shell="" data-tick-fade={fading ? '' : undefined} data-chart-late={late ? '' : undefined}>
      {canvas ? (
        <div ref={stage} data-scroll-stage="" className="bg-bg pt-3">
          <div id="home-canvas" data-scroll-canvas="">
            {canvas.layers.map((i) => {
              const active = i === shown;
              return (
                <div key={i} data-canvas-layer={i} data-active={active ? '' : undefined} aria-hidden={active ? undefined : true} inert={!active}>
                  {island(i, previews.canvas[i])}
                </div>
              );
            })}
          </div>
          <div className="mt-3 pb-3" onKeyDownCapture={stopRepeats}>
            <StepNav current={current} total={total} onChange={onNav} label="Steps of the live test" refs={BUILD} />
          </div>
        </div>
      ) : null}
      <ol data-scroll-steps="" className="grid gap-12">
        {steps.map((s, i) => (
          <li key={s.step} id={`home-step-${s.step}`} data-scroll-step={s.step} aria-current={s.step === current ? 'step' : undefined}>
            <h3 className="text-xl font-semibold">{s.heading}</h3>
            <div className="mt-3">{s.body}</div>
            {charts[i] ? (
              <div id={`home-frame-${s.step}`} data-stacked-frame={s.step} className="mt-6">
                {island(i, previews.frames[i])}
              </div>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}
