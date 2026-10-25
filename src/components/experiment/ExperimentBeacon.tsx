'use client';

// The entry-view beacon of the live experiment. It renders nothing, reads and writes no storage of
// any kind and sets no cookie: what it knows lives in this page's memory only.
//
// On mount (for a prerendered page, once the visitor opens it) it reads what the browser exposes to every page (the navigation entry, the referrer, the
// prerender state, navigator.webdriver) and classifies the view (lib/experiment/entry.ts):
// - Global Privacy Control or Do Not Track: nothing is sent and nothing is attached.
// - A client reject (bot, forced, not an entry view): that one refusal is posted, and nothing else.
// - An entry: it is posted at once, and the exposure and outcome listeners are attached at the same
//   time. The sender holds every later group until the entry is confirmed (lib/experiment/beacon.ts).
//
// Every post goes to exactly /api/e (the owner's exclusion cookie has Path=/api/e), as a text/plain
// body: fetch with keepalive in the page, sendBeacon when the page is hidden or left.
//
// The DOM contract with the home page: the cards region is `[data-experiment="cards"]`, each card
// link carries `data-experiment-click="card"` (a card counts only as a same-origin link), and every
// counted response fires `experiment:counted` on window with `{ arm, viewN? }`.
import { useEffect } from 'react';
import { EXPERIMENT, type Arm } from '@/experiment.values';
import { clickEvents, createDwell, createEngagement, createSender, type Sender } from '@/lib/experiment/beacon';
import { classifyEntry, type EntrySignals } from '@/lib/experiment/entry';
import type { BeaconBatch, BeaconResponse, ClientReject } from '@/lib/experiment/events';

const ENDPOINT = '/api/e';
const CARDS = '[data-experiment="cards"]';
const CARD_LINK = '[data-experiment-click="card"]';
const INTERACTIONS = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'] as const;

/**
 * True once this document has mounted a view. Module memory, never Web Storage: it survives a soft
 * navigation (Back, the wordmark) and resets on every hard load, which is what tells a second view
 * of / in the same document from a fresh entry.
 */
let viewedInThisDocument = false;

export type CountedDetail = { arm: Arm; viewN?: number };

type Timers = { setTimer: (fn: () => void, ms: number) => unknown; clearTimer: (h: unknown) => void };
const timers: Timers = {
  setTimer: (fn, ms) => window.setTimeout(fn, ms),
  clearTimer: (h) => window.clearTimeout(h as number),
};

async function post(batch: BeaconBatch, mode: 'fetch' | 'beacon'): Promise<BeaconResponse | null> {
  const body = JSON.stringify(batch);
  if (mode === 'beacon' && typeof navigator.sendBeacon === 'function') {
    if (navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'text/plain' }))) return null;
  }
  try {
    const res = await fetch(ENDPOINT, { method: 'POST', body, keepalive: true, credentials: 'same-origin', headers: { 'Content-Type': 'text/plain' } });
    if (!(res.headers.get('content-type') ?? '').includes('application/json')) return null;
    return (await res.json()) as BeaconResponse;
  } catch {
    return null;
  }
}

function optedOut(): boolean {
  const n = navigator as Navigator & { globalPrivacyControl?: boolean };
  return n.globalPrivacyControl === true || n.doNotTrack === '1';
}

function navigationSignals(): Pick<EntrySignals, 'navigationType' | 'entryPath' | 'prerendered'> {
  const entry = performance.getEntriesByType('navigation')[0] as (PerformanceNavigationTiming & { activationStart?: number }) | undefined;
  let entryPath: string | undefined;
  try {
    entryPath = entry === undefined ? undefined : new URL(entry.name).pathname;
  } catch {
    entryPath = undefined;
  }
  const prerendering = (document as Document & { prerendering?: boolean }).prerendering === true;
  return { navigationType: entry?.type, entryPath, prerendered: prerendering || (entry?.activationStart ?? 0) > 0 };
}

function isForced(): boolean {
  const variant = new URLSearchParams(window.location.search).get('variant');
  return variant === 'a' || variant === 'b';
}

/** Classifies this view and starts its sender and listeners; gives the cleanup. */
function startView(arm: Arm, ns: string): () => void {
  const priorViewInDocument = viewedInThisDocument;
  viewedInThisDocument = true;

  const signals: EntrySignals = {
    optOut: optedOut(),
    ...navigationSignals(),
    referrer: document.referrer,
    origin: window.location.origin,
    restoredFromCache: false,
    forced: isForced(),
    webdriver: navigator.webdriver === true,
    priorViewInDocument,
  };
  const verdict = classifyEntry(signals);
  if (verdict === 'opt_out') return () => {};

  const onCounted = (r: Extract<BeaconResponse, { ok: true }>) => {
    const detail: CountedDetail = r.viewN === undefined ? { arm: r.arm } : { arm: r.arm, viewN: r.viewN };
    window.dispatchEvent(new CustomEvent<CountedDetail>('experiment:counted', { detail }));
  };
  const start = (entry: 'entry' | ClientReject): Sender =>
    createSender({ ns, arm, entry, newId: () => crypto.randomUUID(), post, onCounted });

  let sender = start(verdict);
  const cleanups: (() => void)[] = [];
  const listen = (target: EventTarget, type: string, fn: (e: Event) => void, options?: AddEventListenerOptions) => {
    target.addEventListener(type, fn, options);
    cleanups.push(() => target.removeEventListener(type, fn, options));
  };

  const flush = () => sender.flush();
  listen(window, 'pagehide', flush);
  // A view restored from the back/forward cache is never an entry: report it as such, alone.
  listen(window, 'pageshow', (e) => {
    if ((e as PageTransitionEvent).persisted) sender = start('not_entry');
  });

  if (verdict === 'entry') {
    const visible = () => document.visibilityState === 'visible';

    // Exposure: half of the cards area in view for the dwell, while the page is visible.
    let ratio = 0;
    const dwell = createDwell({
      visibleShare: EXPERIMENT.cardsInView.visibleShare,
      dwellMs: EXPERIMENT.cardsInView.dwellMs,
      onDone: () => sender.enqueue('inview'),
      ...timers,
    });
    const cards = document.querySelector(CARDS);
    if (cards !== null && typeof IntersectionObserver === 'function') {
      const observer = new IntersectionObserver(
        (records) => {
          for (const r of records) ratio = r.isIntersecting ? r.intersectionRatio : 0;
          dwell.update(ratio, visible());
        },
        { threshold: [0, EXPERIMENT.cardsInView.visibleShare] },
      );
      observer.observe(cards);
      cleanups.push(() => observer.disconnect());
    }
    cleanups.push(() => dwell.stop());

    // Engagement: the first interaction, or the quick-exit time of visible time.
    const engagement = createEngagement({
      seconds: EXPERIMENT.guardrail.quickExitSeconds,
      onEngaged: () => sender.enqueue('engaged'),
      ...timers,
    });
    const interacted = () => engagement.interacted();
    for (const type of INTERACTIONS) listen(window, type, interacted, { capture: true, passive: true });
    listen(document, 'visibilitychange', () => {
      engagement.visibility(visible());
      dwell.update(ratio, visible());
    });
    engagement.visibility(visible());
    cleanups.push(() => engagement.stop());

    // Clicks: one capture-phase listener; a card is exposure first, then the click.
    listen(
      document,
      'click',
      (e) => {
        const target = e.target instanceof Element ? e.target.closest('a[href]') : null;
        if (!(target instanceof HTMLAnchorElement)) return;
        const types = clickEvents(target.href, window.location.origin, target.closest(CARD_LINK) !== null);
        if (types.length > 0) sender.enqueue(...types);
      },
      { capture: true },
    );
  }

  return () => {
    for (const cleanup of cleanups.splice(0)) cleanup();
    sender.flush();
  };
}

export function ExperimentBeacon({ arm, ns }: { arm: Arm; ns: string }) {
  useEffect(() => {
    // A prerendered page waits until the visitor opens it, so a speculative prerender nobody opens
    // sends nothing. Once opened it is still not an entry (activationStart > 0).
    const doc = document as Document & { prerendering?: boolean };
    if (doc.prerendering !== true) return startView(arm, ns);
    let stop: (() => void) | undefined;
    const activate = () => {
      stop = startView(arm, ns);
    };
    document.addEventListener('prerenderingchange', activate, { once: true });
    return () => {
      document.removeEventListener('prerenderingchange', activate);
      stop?.();
    };
  }, [arm, ns]);

  return null;
}
