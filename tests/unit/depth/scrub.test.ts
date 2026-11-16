import { describe, expect, it, vi } from 'vitest';
import {
  attachScrub,
  scrollProgress,
  viewProgress,
  SCRUB_ATTR,
  SCRUB_PARTS,
  SCRUB_QUERY,
  type ScrubDoc,
  type ScrubEl,
  type ScrubRoot,
  type ScrubWin,
} from '@/lib/depth/scrub';

// The scroll fallback: the progress maths against the view timeline's ranges, the gate (nothing at
// all where scroll timelines exist, nothing under reduced motion or on a wide screen), and a frame
// that reads every box before it writes a value.

describe('viewProgress', () => {
  const VH = 800;
  // A 200 px subject: cover runs 1000 px of scroll, entry the first 200, contain 200 to 800, exit 800 to 1000.
  const at = (s: number, h = 200) => ({ top: VH - s, height: h });

  it('runs entry from the top meeting the viewport bottom until the subject is fully in', () => {
    expect(viewProgress(at(0), VH, 'entry 0% entry 100%')).toBe(0);
    expect(viewProgress(at(100), VH, 'entry 0% entry 100%')).toBe(0.5);
    expect(viewProgress(at(200), VH, 'entry 0% entry 100%')).toBe(1);
    expect(viewProgress(at(70), VH, 'entry 0% entry 70%')).toBe(0.5);
  });

  it('clamps before and after the range', () => {
    expect(viewProgress(at(-500), VH, 'entry 0% entry 100%')).toBe(0);
    expect(viewProgress(at(5000), VH, 'entry 0% entry 100%')).toBe(1);
  });

  it('runs cover over the whole pass and contain while the subject is fully in view', () => {
    expect(viewProgress(at(325), VH, 'cover 10% cover 55%')).toBeCloseTo(0.5, 10);
    expect(viewProgress(at(500), VH, 'contain 0% contain 100%')).toBe(0.5);
    // entry 40% (80 px) to contain 10% (200 + 60 px).
    expect(viewProgress(at(170), VH, 'entry 40% contain 10%')).toBe(0.5);
    // exit 0% (800 px) to exit 100% (1000 px).
    expect(viewProgress(at(900), VH, 'exit 0% exit 100%')).toBe(0.5);
  });

  it('for a subject taller than the viewport, entry ends when it fills the viewport and contain while it does', () => {
    // 1000 px in an 800 px viewport: entry 0 to 800, contain 800 to 1000, exit 1000 to 1800.
    expect(viewProgress(at(400, 1000), VH, 'entry 0% entry 100%')).toBe(0.5);
    expect(viewProgress(at(900, 1000), VH, 'contain 0% contain 100%')).toBe(0.5);
    expect(viewProgress(at(1400, 1000), VH, 'exit 0% exit 100%')).toBe(0.5);
  });

  it('gives a range of no length 0 before it and 1 from it, and an unreadable range the final state', () => {
    expect(viewProgress(at(-1, 0), VH, 'entry 0% entry 100%')).toBe(0);
    expect(viewProgress(at(0, 0), VH, 'entry 0% entry 100%')).toBe(1);
    expect(viewProgress(at(100), VH, 'nonsense')).toBe(1);
    expect(viewProgress(at(100), VH, '')).toBe(1);
  });
});

describe('scrollProgress', () => {
  it('is the share of the page scrolled, clamped, and 0 on a page that cannot scroll', () => {
    expect(scrollProgress(0, 3000, 1000)).toBe(0);
    expect(scrollProgress(1000, 3000, 1000)).toBe(0.5);
    expect(scrollProgress(2500, 3000, 1000)).toBe(1);
    expect(scrollProgress(0, 800, 1000)).toBe(0);
  });
});

type Fake = ScrubEl & { props: Map<string, string>; css: Record<string, string>; before?: Record<string, string> };

function el(top: number, height: number, css: Record<string, string> = {}, parent: Fake | null = null, before?: Record<string, string>): Fake {
  const props = new Map<string, string>();
  const self: Fake = {
    offsetTop: top,
    offsetHeight: height,
    clientTop: 0,
    offsetParent: parent,
    closest: () => null,
    style: { setProperty: (k, v) => void props.set(k, v), removeProperty: (k) => void props.delete(k) },
    props,
    css,
    before,
  };
  return self;
}

function setup(opts: { supports?: boolean; matches?: boolean; io?: boolean; extra?: Fake[]; padding?: Record<string, string> } = {}) {
  const { supports = false, matches = true, io = true, extra = [], padding = {} } = opts;
  const log: string[] = [];
  const attrs = new Map<string, string>();
  const root = el(0, 4000) as Fake & ScrubRoot;
  Object.assign(root, {
    clientHeight: 800,
    scrollHeight: 4000,
    setAttribute: (k: string, v: string) => void attrs.set(k, v),
    removeAttribute: (k: string) => void attrs.delete(k),
  });
  // A stack 600 px into the page holding a sheet, a rising card, a ruled cell with a drawn ::before,
  // the progress hairline on the page's scroll, and a part with no mirrored rule.
  const stack = el(600, 400);
  const sheet = el(20, 100, { '--depth-range': 'entry 0% entry 100%', '--depth-on': '[data-depth-stack]', animationName: 'depth-fan-1' }, stack);
  sheet.closest = (s) => (s === '[data-depth-stack]' ? stack : null);
  const card = el(1400, 200, { '--depth-range': 'entry 0% entry 70%', animationName: 'depth-rise' });
  const cell = el(2000, 100, { animationName: 'none' }, null, { '--depth-range': 'cover 5% cover 35%', animationName: 'depth-trace-x' });
  const bar = el(0, 2, { '--depth-on': ':root', animationName: 'depth-progress' });
  bar.closest = (s) => (s === ':root' ? root : null);
  const still = el(3000, 100, { animationName: 'none' });
  const focused = el(1200, 100, { '--depth-range': 'entry 0% entry 80%', animationName: 'none' });
  const parts = [sheet, card, cell, bar, still, focused, ...extra];

  const observed: ScrubEl[] = [];
  let ioCallback: ((entries: { target: ScrubEl; isIntersecting: boolean }[]) => void) | null = null;
  let mqListener: (() => void) | null = null;
  const mq = {
    matches,
    addEventListener: vi.fn((_: 'change', fn: () => void) => void (mqListener = fn)),
    removeEventListener: vi.fn(),
  };
  const handlers: Record<string, () => void> = {};
  let queued: (() => void) | null = null;
  const watch = (f: Fake, name: string) => {
    const set = f.style.setProperty;
    f.style.setProperty = (k, v) => {
      log.push(`write ${name}`);
      set(k, v);
    };
  };
  for (const [f, n] of [[sheet, 'sheet'], [card, 'card'], [cell, 'cell'], [bar, 'bar']] as const) watch(f, n);
  // offsetTop reads are logged through a getter, so the order of reads and writes is visible.
  for (const [f, n] of [[stack, 'stack'], [card, 'card'], [cell, 'cell']] as const) {
    const top = f.offsetTop;
    Object.defineProperty(f, 'offsetTop', { get: () => (log.push(`read ${n}`), top) });
  }

  const doc: ScrubDoc = {
    documentElement: root,
    querySelectorAll: vi.fn((s: string) => (s === SCRUB_PARTS ? parts : [])),
  };
  // innerHeight (the visual viewport on iOS) is below the root's clientHeight here, as under pinch
  // zoom: the controller must not shrink its range with it.
  const win: ScrubWin & { scrollY: number; innerHeight: number } = {
    CSS: { supports: vi.fn((c: string) => (c.includes('animation-timeline') ? supports : true)) },
    matchMedia: vi.fn(() => mq),
    getComputedStyle: (e, pseudo) => {
      const f = e as Fake;
      if (e === root) return { animationName: 'none', animationPlayState: 'running', getPropertyValue: (k: string) => padding[k] ?? '' };
      const source = (pseudo ? f.before : f.css) ?? {};
      return {
        animationName: source.animationName ?? 'none',
        // The mirrored rules pause their animation; a time-based one runs.
        animationPlayState: source.animationPlayState ?? 'paused',
        getPropertyValue: (k: string) => source[k] ?? '',
      };
    },
    innerHeight: 700,
    scrollY: 0,
    addEventListener: vi.fn((type: string, fn: () => void) => void (handlers[type] = fn)),
    removeEventListener: vi.fn((type: string) => void delete handlers[type]),
    requestAnimationFrame: vi.fn((fn: () => void) => ((queued = fn), 1)),
    cancelAnimationFrame: vi.fn(),
    IntersectionObserver: io
      ? (class {
          constructor(cb: (entries: { target: ScrubEl; isIntersecting: boolean }[]) => void, options: { rootMargin: string }) {
            ioCallback = cb;
            expect(options.rootMargin).toBe('25% 0px');
          }
          observe(t: ScrubEl) {
            observed.push(t);
          }
          disconnect() {
            observed.length = 0;
          }
        } as unknown as ScrubWin['IntersectionObserver'])
      : undefined,
  };
  const flush = () => {
    const f = queued;
    queued = null;
    f?.();
  };
  return {
    log, attrs, root, stack, sheet, card, cell, bar, still, focused, observed, mq, handlers, doc, win, flush,
    intersect: (entries: { target: ScrubEl; isIntersecting: boolean }[]) => ioCallback!(entries),
    changeMedia: (m: boolean) => {
      mq.matches = m;
      mqListener!();
    },
  };
}

describe('attachScrub: the gate', () => {
  it('does nothing at all where scroll timelines exist: no media query, no listener, no attribute', () => {
    const s = setup({ supports: true });
    attachScrub(s.doc, s.win)();
    expect(s.win.CSS!.supports).toHaveBeenCalledWith('animation-timeline: view()');
    expect(s.win.matchMedia).not.toHaveBeenCalled();
    expect(s.win.addEventListener).not.toHaveBeenCalled();
    expect(s.attrs.size).toBe(0);
    expect(s.doc.querySelectorAll).not.toHaveBeenCalled();
  });

  it('does nothing without CSS.supports or matchMedia', () => {
    const a = setup();
    delete a.win.CSS;
    attachScrub(a.doc, a.win);
    const b = setup();
    delete b.win.matchMedia;
    attachScrub(b.doc, b.win);
    for (const s of [a, b]) {
      expect(s.win.addEventListener).not.toHaveBeenCalled();
      expect(s.attrs.size).toBe(0);
    }
  });

  it('asks for a screen below lg with motion allowed, and stays off while that does not match (reduced motion, a wide screen)', () => {
    expect(SCRUB_QUERY).toBe('screen and (width < 64rem) and (prefers-reduced-motion: no-preference)');
    const s = setup({ matches: false });
    attachScrub(s.doc, s.win);
    expect(s.win.matchMedia).toHaveBeenCalledWith(SCRUB_QUERY);
    expect(s.win.addEventListener).not.toHaveBeenCalled();
    expect(s.attrs.size).toBe(0);
    expect(s.sheet.props.size).toBe(0);
  });

  it('starts when the query comes to match and stops when it no longer does', () => {
    const s = setup({ matches: false });
    const cleanup = attachScrub(s.doc, s.win);
    s.changeMedia(true);
    expect(s.attrs.has(SCRUB_ATTR)).toBe(true);
    expect(Object.keys(s.handlers).sort()).toEqual(['resize', 'scroll']);
    s.changeMedia(false);
    expect(s.attrs.has(SCRUB_ATTR)).toBe(false);
    expect(Object.keys(s.handlers)).toEqual([]);
    expect(s.sheet.props.has('--depth-t')).toBe(false);
    cleanup();
    expect(s.mq.removeEventListener).toHaveBeenCalledTimes(1);
  });
});

describe('attachScrub: the frame', () => {
  it('sets the gate and writes every animated part\'s progress at once, before any scroll', () => {
    const s = setup();
    attachScrub(s.doc, s.win);
    expect(s.attrs.get(SCRUB_ATTR)).toBe('');
    // The stack's top is 600 px down an 800 px viewport: 200 px into its 400 px entry, the sheet's own
    // offset in the stack does not count (the timeline is the stack's).
    expect(s.sheet.props.get('--depth-t')).toBe('0.5');
    // Below the viewport: not started. The cell's progress is written on the element, for its ::before.
    expect(s.card.props.get('--depth-t')).toBe('0');
    expect(s.cell.props.get('--depth-t')).toBe('0');
    expect(s.bar.props.get('--depth-t')).toBe('0');
    // No rule, or no animation (a focused block): never written.
    expect(s.still.props.size).toBe(0);
    expect(s.focused.props.size).toBe(0);
  });

  it('throttles scroll to one frame, reads every box before it writes, and writes only what changed', () => {
    const s = setup({ io: false });
    attachScrub(s.doc, s.win);
    s.log.length = 0;
    s.win.scrollY = 1000;
    s.handlers.scroll!();
    s.handlers.scroll!();
    expect(s.win.requestAnimationFrame).toHaveBeenCalledTimes(1);
    s.flush();
    const firstWrite = s.log.findIndex((l) => l.startsWith('write'));
    expect(firstWrite).toBeGreaterThan(0);
    expect(s.log.slice(firstWrite).every((l) => l.startsWith('write'))).toBe(true);
    // The card's top is 400 px into the viewport: 400 of its 140 px range, so done.
    expect(s.card.props.get('--depth-t')).toBe('1');
    expect(s.bar.props.get('--depth-t')).toBe('0.315');
    // The same position again: nothing to write.
    s.log.length = 0;
    s.handlers.scroll!();
    s.flush();
    expect(s.log.filter((l) => l.startsWith('write'))).toEqual([]);
  });

  it('with an observer, measures only the subjects near the viewport, and each once more as it leaves', () => {
    const s = setup();
    attachScrub(s.doc, s.win);
    // Observes each subject once: the stack (for the sheet), the card and the cell, never the root.
    expect(new Set(s.observed)).toEqual(new Set([s.stack, s.card, s.cell]));
    expect(s.observed).toHaveLength(3);
    s.intersect([{ target: s.stack, isIntersecting: true }]);
    s.flush();
    // Scrolled in steps of a quarter of the screen at most, so the observer keeps up.
    for (const y of [200, 400, 600]) {
      s.log.length = 0;
      s.win.scrollY = y;
      s.handlers.scroll!();
      s.flush();
      expect(s.log).toContain('read stack');
      expect(s.log).not.toContain('read card');
    }
    // The stack leaves: one last measure, then no more.
    s.intersect([{ target: s.stack, isIntersecting: false }]);
    s.flush();
    expect(s.sheet.props.get('--depth-t')).toBe('1');
    s.log.length = 0;
    s.win.scrollY = 700;
    s.handlers.scroll!();
    s.flush();
    expect(s.log.filter((l) => l.startsWith('read'))).toEqual([]);
    // The page's scroll is always followed: 700 of 3200 px.
    expect(s.bar.props.get('--depth-t')).toBe('0.22');
  });

  it('measures everything again after a jump of more than a quarter of the screen', () => {
    const s = setup();
    attachScrub(s.doc, s.win);
    // A small scroll: only what the observer reports.
    s.log.length = 0;
    s.win.scrollY = 150;
    s.handlers.scroll!();
    s.flush();
    expect(s.log.filter((l) => l.startsWith('read'))).toEqual([]);
    // A jump far down the page and back: the card is measured both times, with no observer entry.
    s.win.scrollY = 3000;
    s.handlers.scroll!();
    s.flush();
    expect(s.card.props.get('--depth-t')).toBe('1');
    s.log.length = 0;
    s.win.scrollY = 0;
    s.handlers.scroll!();
    s.flush();
    expect(s.log).toContain('read card');
    expect(s.card.props.get('--depth-t')).toBe('0');
  });

  it('measures everything again on resize', () => {
    const s = setup();
    attachScrub(s.doc, s.win);
    s.log.length = 0;
    s.handlers.resize!();
    s.flush();
    for (const n of ['stack', 'card', 'cell']) expect(s.log).toContain(`read ${n}`);
  });

  it('cleans up: listeners, observer, a pending frame, the gate and every value', () => {
    const s = setup();
    const cleanup = attachScrub(s.doc, s.win);
    s.handlers.scroll!();
    cleanup();
    expect(s.win.cancelAnimationFrame).toHaveBeenCalledWith(1);
    expect(Object.keys(s.handlers)).toEqual([]);
    expect(s.observed).toEqual([]);
    expect(s.attrs.has(SCRUB_ATTR)).toBe(false);
    for (const f of [s.sheet, s.card, s.cell, s.bar]) expect(f.props.has('--depth-t')).toBe(false);
  });

  it('measures a box by its layout offsets through its offset parents and their borders, never its transformed box', () => {
    // A part 50 px into a block that sits 700 px down the page inside a 1 px border: its box starts
    // 751 px down, 49 px into its 100 px entry. Nothing here reads getBoundingClientRect.
    const block = el(700, 300);
    block.clientTop = 1;
    const part = el(50, 100, { '--depth-range': 'entry 0% entry 100%', animationName: 'depth-draw' }, block);
    const s = setup({ extra: [part] });
    attachScrub(s.doc, s.win);
    expect(part.props.get('--depth-t')).toBe('0.49');
  });

  it('narrows the visibility range by the root\'s scroll padding, as a view timeline\'s default inset does', () => {
    // 24 px at the bottom, 60 px at the top: the range is 716 px tall and starts 60 px down. The
    // stack's top, 600 px down the viewport, is 540 px into it: 176 px into its 400 px entry.
    const s = setup({ padding: { 'scroll-padding-top': '60px', 'scroll-padding-bottom': '24px' } });
    attachScrub(s.doc, s.win);
    expect(s.sheet.props.get('--depth-t')).toBe('0.44');
    // `auto` (no padding) counts as none.
    const t = setup({ padding: { 'scroll-padding-top': 'auto', 'scroll-padding-bottom': '0px' } });
    attachScrub(t.doc, t.win);
    expect(t.sheet.props.get('--depth-t')).toBe('0.5');
  });

  it('follows iOS toolbars collapsing (innerHeight above clientHeight) and ignores pinch zoom (below it)', () => {
    // The stack's top is 600 px down. With 900 px visible it is 300 px into its 400 px entry.
    const s = setup();
    s.win.innerHeight = 900;
    attachScrub(s.doc, s.win);
    expect(s.sheet.props.get('--depth-t')).toBe('0.75');
    // The default setup has innerHeight 700 under an 800 px clientHeight: 200 px in.
    const t = setup();
    attachScrub(t.doc, t.win);
    expect(t.sheet.props.get('--depth-t')).toBe('0.5');
  });

  it('writes the final state for a progress that is not a number', () => {
    const s = setup({ io: false });
    s.win.scrollY = Number.NaN;
    attachScrub(s.doc, s.win);
    expect(s.bar.props.get('--depth-t')).toBe('1');
  });

  it('writes progress in steps of 1/200, so a move of less than a step writes nothing', () => {
    const s = setup({ io: false });
    attachScrub(s.doc, s.win);
    // The card's entry runs 140 px of scroll: 0.7 px is 1/200 of it.
    s.win.scrollY = 670;
    s.handlers.scroll!();
    s.flush();
    expect(s.card.props.get('--depth-t')).toBe('0.5');
    s.log.length = 0;
    s.win.scrollY = 670.3;
    s.handlers.scroll!();
    s.flush();
    expect(s.log.filter((l) => l === 'write card')).toEqual([]);
    s.win.scrollY = 670.7;
    s.handlers.scroll!();
    s.flush();
    expect(s.card.props.get('--depth-t')).toBe('0.505');
  });

  it('skips a part whose animation is not paused: a time-based one that shares a mirrored selector', () => {
    const portrait = el(100, 300, { '--depth-range': 'entry 0% entry 85%', animationName: 'depth-drift-tl-narrow', animationPlayState: 'running' });
    const s = setup({ extra: [portrait] });
    attachScrub(s.doc, s.win);
    expect(portrait.props.size).toBe(0);
    expect(s.observed).not.toContain(portrait);
  });
});

describe('attachScrub: the first attach of a page load', () => {
  it('pins a part whose subject is on screen at its final pose until the subject has left the screen once', () => {
    const s = setup({ io: false });
    attachScrub(s.doc, s.win, { pinInView: true });
    // The stack is on screen (600 px down an 800 px viewport): pinned, not half way.
    expect(s.sheet.props.get('--depth-t')).toBe('1');
    // Off screen at load: scrubbed as usual.
    expect(s.card.props.get('--depth-t')).toBe('0');
    // Still on screen after a scroll: still pinned.
    s.win.scrollY = 100;
    s.handlers.scroll!();
    s.flush();
    expect(s.sheet.props.get('--depth-t')).toBe('1');
    // Scrolled back past it so it falls below the screen: it has left, so it follows the scroll again.
    s.win.scrollY = -300;
    s.handlers.scroll!();
    s.flush();
    expect(s.sheet.props.get('--depth-t')).toBe('0');
    s.win.scrollY = 0;
    s.handlers.scroll!();
    s.flush();
    expect(s.sheet.props.get('--depth-t')).toBe('0.5');
  });

  it('with an observer, unpins as the subject leaves too', () => {
    const s = setup();
    attachScrub(s.doc, s.win, { pinInView: true });
    expect(s.sheet.props.get('--depth-t')).toBe('1');
    s.intersect([{ target: s.stack, isIntersecting: true }]);
    s.flush();
    s.win.scrollY = 1200;
    s.handlers.scroll!();
    s.flush();
    s.win.scrollY = 0;
    s.handlers.scroll!();
    s.flush();
    expect(s.sheet.props.get('--depth-t')).toBe('0.5');
  });

  it('measures a pinned part every frame, so it unpins even when the observer has not reported it', () => {
    const s = setup();
    attachScrub(s.doc, s.win, { pinInView: true });
    // No observer entry at all: the stack is neither live nor dirty, but pinned, so it is measured,
    // and once it has left (below the screen here) it takes its real progress, 0, instead of the pin.
    s.win.scrollY = -300;
    s.handlers.scroll!();
    s.flush();
    expect(s.sheet.props.get('--depth-t')).toBe('0');
    s.win.scrollY = 0;
    s.handlers.scroll!();
    s.flush();
    // Unpinned, it waits on the observer again like any part.
    s.intersect([{ target: s.stack, isIntersecting: true }]);
    s.flush();
    expect(s.sheet.props.get('--depth-t')).toBe('0.5');
  });

  it('pins nothing on a client navigation (the default), and never pins the page\'s scroll', () => {
    const s = setup();
    attachScrub(s.doc, s.win);
    expect(s.sheet.props.get('--depth-t')).toBe('0.5');
    const t = setup();
    attachScrub(t.doc, t.win, { pinInView: true });
    expect(t.bar.props.get('--depth-t')).toBe('0');
  });

  it('pins what is on screen when the query comes to match later, since the page was still just before', () => {
    const s = setup({ matches: false, io: false });
    attachScrub(s.doc, s.win);
    s.changeMedia(true);
    expect(s.sheet.props.get('--depth-t')).toBe('1');
  });
});

describe('attachScrub: an error leaves the final, still state', () => {
  it('a part whose timeline holder cannot be looked up: no gate, no value, no listener, and no throw', () => {
    const s = setup();
    s.sheet.closest = () => {
      throw new SyntaxError('not a valid selector');
    };
    const cleanup = attachScrub(s.doc, s.win);
    expect(s.attrs.has(SCRUB_ATTR)).toBe(false);
    expect(Object.keys(s.handlers)).toEqual([]);
    expect(s.observed).toEqual([]);
    expect(s.mq.removeEventListener).toHaveBeenCalledTimes(1);
    for (const f of [s.sheet, s.card, s.cell, s.bar]) expect(f.props.has('--depth-t')).toBe(false);
    expect(() => cleanup()).not.toThrow();
  });

  it('a frame that throws: it stops for good and removes the gate, every value and every listener', () => {
    const s = setup();
    attachScrub(s.doc, s.win);
    expect(s.attrs.has(SCRUB_ATTR)).toBe(true);
    expect(s.card.props.has('--depth-t')).toBe(true);
    Object.defineProperty(s.card, 'offsetHeight', {
      get: () => {
        throw new Error('layout');
      },
    });
    s.intersect([{ target: s.card, isIntersecting: true }]);
    expect(() => s.flush()).not.toThrow();
    expect(s.attrs.has(SCRUB_ATTR)).toBe(false);
    expect(Object.keys(s.handlers)).toEqual([]);
    expect(s.observed).toEqual([]);
    expect(s.mq.removeEventListener).toHaveBeenCalledTimes(1);
    for (const f of [s.sheet, s.card, s.cell, s.bar]) expect(f.props.has('--depth-t')).toBe(false);
  });

  it('a computed style that throws (a pseudo-element quirk) or a media query that throws: nothing starts', () => {
    const s = setup();
    s.win.getComputedStyle = () => {
      throw new TypeError('pseudo');
    };
    attachScrub(s.doc, s.win);
    expect(s.attrs.has(SCRUB_ATTR)).toBe(false);
    expect(Object.keys(s.handlers)).toEqual([]);
    const t = setup();
    t.win.matchMedia = () => {
      throw new Error('media');
    };
    expect(() => attachScrub(t.doc, t.win)()).not.toThrow();
    expect(t.attrs.has(SCRUB_ATTR)).toBe(false);
  });
});
