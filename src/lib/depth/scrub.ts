// The scroll fallback below lg: a browser without scroll timelines (Safari before 26) skips every
// scroll-linked rule, so a phone there would show the still page. This drives the same keyframes from
// script instead. A gate attribute on the root turns on a mirror of the phone's scroll-linked rules in
// globals.css, where each animation is paused, lasts 1s and starts at a negative delay of --depth-t
// seconds; --depth-t is the element's progress through its range, 0 to 1, written here from the
// scroll position. Each mirrored rule names its range in --depth-range (the native rule's
// animation-range, word for word) and, when the timeline is not the element's own view, the element
// that holds it in --depth-on (`:root` for the page's scroll). Pure functions first, then the
// controller.

export type Box = { top: number; height: number };

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * A point of a view range, as the scroll distance since the subject's top met the viewport's bottom
 * (cover 0%). `h` is the subject's height and `vh` the viewport's. NaN for an unknown range name.
 */
function point(name: string | undefined, pct: number, h: number, vh: number): number {
  const lo = Math.min(h, vh);
  const hi = Math.max(h, vh);
  const ends: Record<string, [number, number]> = { cover: [0, h + vh], contain: [lo, hi], entry: [0, lo], exit: [hi, h + vh] };
  const [a, b] = ends[name ?? ''] ?? [NaN, NaN];
  return a + ((b - a) * pct) / 100;
}

/**
 * How far a subject at `box` (its untransformed top relative to the top of the visibility range, and
 * its height) is through `range` (an animation-range such as `entry 0% entry 70%`), from 0 to 1, clamped. The names
 * follow the view timeline's ranges: cover from the top meeting the viewport's bottom to the bottom
 * leaving its top, entry until the subject is fully in (or fills the viewport), contain while it is,
 * exit after. `vh` is the height of the visibility range: the viewport less the root's scroll
 * padding, which is what a view timeline's default inset (`auto`) takes. An unreadable range gives 1,
 * the final state. A range of no length is 0 before it and 1 from it.
 */
export function viewProgress(box: Box, vh: number, range: string): number {
  const [n1, p1, n2, p2] = range.trim().split(/\s+/);
  const a = point(n1, parseFloat(p1 ?? ''), box.height, vh);
  const b = point(n2, parseFloat(p2 ?? ''), box.height, vh);
  if (!(a <= b)) return 1;
  const s = vh - box.top;
  return b > a ? clamp01((s - a) / (b - a)) : s < a ? 0 : 1;
}

/** The page's scroll progress (the root scroll timeline), 0 to 1; 0 when the page cannot scroll. */
export function scrollProgress(scrollY: number, scrollHeight: number, vh: number): number {
  const max = scrollHeight - vh;
  return max > 0 ? clamp01(scrollY / max) : 0;
}

/** The gate on the root. Only this module sets it. */
export const SCRUB_ATTR = 'data-depth-fallback';
/** Where the mirrored rules apply: below lg, on a screen, with motion allowed (as in globals.css). */
export const SCRUB_QUERY = 'screen and (width < 64rem) and (prefers-reduced-motion: no-preference)';
/** Every element that can carry a scroll-linked animation or the pseudo-element of one. */
export const SCRUB_PARTS =
  '[data-depth-rise],[data-depth-draw],[data-depth-book],[data-depth-scale],[data-depth-parallax],[data-depth-progress],[data-depth-sheet],[data-depth-drift],[data-depth-hinge],[data-depth-trace],[data-depth-trace]>*,[data-experience-rule]';

// The small slices of the DOM the controller touches, so a test can pass plain objects.
export type ScrubEl = {
  offsetTop: number;
  offsetHeight: number;
  clientTop: number;
  offsetParent: ScrubEl | null;
  closest(selector: string): ScrubEl | null;
  style: { setProperty(name: string, value: string): void; removeProperty(name: string): void };
};
export type ScrubRoot = ScrubEl & {
  clientHeight: number;
  scrollHeight: number;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
};
export type ScrubDoc = { documentElement: ScrubRoot; querySelectorAll(selector: string): Iterable<ScrubEl> };
type Listener = () => void;
export type ScrubMedia = { matches: boolean; addEventListener(type: 'change', fn: Listener): void; removeEventListener(type: 'change', fn: Listener): void };
export type ScrubObserver = { observe(el: ScrubEl): void; disconnect(): void };
export type ScrubWin = {
  CSS?: { supports(condition: string): boolean };
  matchMedia?: (query: string) => ScrubMedia;
  getComputedStyle(
    el: ScrubEl,
    pseudo: string | null,
  ): { animationName: string; animationPlayState: string; getPropertyValue(name: string): string };
  scrollY: number;
  addEventListener(type: 'scroll' | 'resize', fn: Listener, options: { passive: boolean }): void;
  removeEventListener(type: 'scroll' | 'resize', fn: Listener): void;
  requestAnimationFrame(fn: () => void): number;
  cancelAnimationFrame(id: number): void;
  IntersectionObserver?: new (
    cb: (entries: readonly { target: ScrubEl; isIntersecting: boolean }[]) => void,
    options: { rootMargin: string },
  ) => ScrubObserver;
};
export type ScrubOptions = {
  /**
   * The first attach of a page load: the page has just painted still, so a part whose subject is on
   * screen keeps its final pose (1) until that subject has left the screen once, instead of jumping
   * back to a pose part way through its range. A client navigation passes false: its values land
   * before the new page paints.
   */
  pinInView?: boolean;
};

const noop = () => {};

/** Progress is written in steps of 1/200, so a value that has not moved a step is not written again. */
const STEPS = 200;

/** The top of an element's layout box in the page, ignoring transforms, as a view timeline does. */
function pageTop(el: ScrubEl): number {
  let t = 0;
  for (let e: ScrubEl | null = el; e; e = e.offsetParent) t += e.offsetTop + (e === el ? 0 : e.clientTop);
  return t;
}

/**
 * Starts the fallback where the browser has no scroll timelines, and returns the cleanup. With them
 * (or without CSS.supports or matchMedia) it does nothing at all: no listener, no attribute. Otherwise
 * it follows SCRUB_QUERY: it runs while the query matches and stops when it does not (a wide screen,
 * reduced motion); a later start pins what is on screen, since the page was still just before. Any
 * error stops it for good and leaves the final, still state: no gate, no value, no listener. It never
 * throws, since it runs in the root layout.
 */
export function attachScrub(doc: ScrubDoc, win: ScrubWin, options: ScrubOptions = {}): () => void {
  let mq: ScrubMedia | null = null;
  let stop = noop;
  let pin = options.pinInView === true;
  const halt = () => {
    mq?.removeEventListener('change', sync);
    const s = stop;
    stop = noop;
    try {
      s();
    } catch {
      // Nothing more to undo.
    }
  };
  function sync() {
    const s = stop;
    stop = noop;
    s();
    if (mq?.matches) stop = start(doc, win, pin, halt);
    // Any later start comes after a still page.
    pin = true;
  }
  try {
    if (!win.CSS || win.CSS.supports('animation-timeline: view()') || !win.matchMedia) return noop;
    mq = win.matchMedia(SCRUB_QUERY);
    mq.addEventListener('change', sync);
    sync();
  } catch {
    halt();
    return noop;
  }
  return halt;
}

type Item = { el: ScrubEl; at: ScrubEl; range: string; last?: string; pinned?: boolean };

/**
 * Sets the gate, finds the elements the mirrored rules scrub (on the element or its ::before: a
 * paused animation, so not a time-based one that shares a selector), then writes each one's progress.
 * One rAF-throttled passive scroll and resize listener; with an IntersectionObserver only the subjects
 * near the viewport are measured, plus one last time as they leave it. Every frame reads all boxes
 * first and writes after, and writes only a changed value. On an error it undoes itself and calls
 * `fail`.
 */
function start(doc: ScrubDoc, win: ScrubWin, pin: boolean, fail: () => void): () => void {
  const root = doc.documentElement;
  const items: Item[] = [];
  const live = new Set<ScrubEl>();
  const dirty = new Set<ScrubEl>();
  let io: ScrubObserver | null = null;
  let raf = 0;
  let pinning = pin;
  let lastY = NaN;

  const draw = () => {
    // The layout viewport, as a view timeline sees it (not the visual viewport of iOS's toolbars).
    const vh = root.clientHeight;
    const y = win.scrollY;
    // A view timeline's default inset is the scroll container's scroll padding (on this site, room
    // at the bottom for a focus ring and, where the header is sticky, the header at the top).
    const cs = win.getComputedStyle(root, null);
    const top = parseFloat(cs.getPropertyValue('scroll-padding-top')) || 0;
    const range = vh - top - (parseFloat(cs.getPropertyValue('scroll-padding-bottom')) || 0);
    // A jump of more than the observer's margin (a quarter of the screen) can carry a subject past
    // the screen, or onto it, before the observer reports it: measure everything.
    if (!(Math.abs(y - lastY) <= vh / 4)) for (const it of items) dirty.add(it.at);
    lastY = y;
    const values: [Item, number][] = [];
    for (const it of items) {
      if (it.at === root) values.push([it, scrollProgress(y, root.scrollHeight, vh)]);
      else if (!io || pinning || it.pinned || live.has(it.at) || dirty.has(it.at)) {
        // A pinned part is measured every frame until it unpins, so it never waits on the observer.
        const at = pageTop(it.at) - y;
        const height = it.at.offsetHeight;
        const seen = at < vh && at + height > 0;
        if (pinning && seen) it.pinned = true;
        else if (!seen) it.pinned = false;
        values.push([it, it.pinned ? 1 : viewProgress({ top: at - top, height }, range, it.range)]);
      }
    }
    dirty.clear();
    pinning = false;
    for (const [it, p] of values) {
      const v = String(Math.round(p * STEPS) / STEPS);
      if (v !== it.last) it.el.style.setProperty('--depth-t', (it.last = v));
    }
  };
  const frame = () => {
    raf = 0;
    try {
      draw();
    } catch {
      fail();
    }
  };
  const schedule = () => {
    if (!raf) raf = win.requestAnimationFrame(frame);
  };
  const resize = () => {
    for (const it of items) dirty.add(it.at);
    schedule();
  };
  const stop = () => {
    win.removeEventListener('scroll', schedule);
    win.removeEventListener('resize', resize);
    io?.disconnect();
    io = null;
    if (raf) win.cancelAnimationFrame(raf);
    raf = 0;
    root.removeAttribute(SCRUB_ATTR);
    for (const it of items) it.el.style.removeProperty('--depth-t');
  };

  try {
    root.setAttribute(SCRUB_ATTR, '');
    for (const el of doc.querySelectorAll(SCRUB_PARTS)) {
      for (const pseudo of [null, '::before']) {
        const cs = win.getComputedStyle(el, pseudo);
        const range = cs.getPropertyValue('--depth-range').trim();
        const on = cs.getPropertyValue('--depth-on').trim();
        if (!(range || on) || cs.animationName === 'none' || !cs.animationPlayState.includes('paused')) continue;
        const at = on ? el.closest(on) : el;
        if (at) items.push({ el, at, range });
        break;
      }
    }
    for (const it of items) dirty.add(it.at);

    const Observer = win.IntersectionObserver;
    if (Observer) {
      io = new Observer(
        (entries) => {
          try {
            for (const e of entries) {
              if (e.isIntersecting) live.add(e.target);
              else live.delete(e.target);
              dirty.add(e.target);
            }
            schedule();
          } catch {
            fail();
          }
        },
        { rootMargin: '25% 0px' },
      );
      for (const at of new Set(items.map((i) => i.at))) if (at !== root) io.observe(at);
    }

    // The first values land before the next paint, so nothing shows a wrong pose.
    draw();
    win.addEventListener('scroll', schedule, { passive: true });
    win.addEventListener('resize', resize, { passive: true });
  } catch {
    try {
      stop();
    } catch {
      // Nothing more to undo.
    }
    fail();
    return noop;
  }
  return stop;
}
