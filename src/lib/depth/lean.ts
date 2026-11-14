// The maths and the guards of the lean: a card turns toward a fine pointer, the band's stack follows it,
// and a pointer scene (a [data-depth-follow] element) gets the pointer's place over its own box.
// Pure functions first, then one controller that attaches the two delegated listeners.

/** The turn of a card is this many degrees across its whole width (y) and height (x). */
export const LEAN_Y_DEG = 9;
export const LEAN_X_DEG = 7;

export type Rect = { left: number; top: number; width: number; height: number };

export type CardLean = { rx: string; ry: string; gx: string; gy: string };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const fixed = (v: number, digits: number) => (Object.is(Math.round(v * 10 ** digits), -0) ? 0 : v).toFixed(digits);

/** The four values for the card under the pointer: turn on x and y, and the sheen's centre. */
export function cardLean(clientX: number, clientY: number, rect: Rect): CardLean {
  const x = rect.width > 0 ? clamp((clientX - rect.left) / rect.width, 0, 1) : 0.5;
  const y = rect.height > 0 ? clamp((clientY - rect.top) / rect.height, 0, 1) : 0.5;
  return {
    rx: `${fixed((0.5 - y) * LEAN_X_DEG, 2)}deg`,
    ry: `${fixed((x - 0.5) * LEAN_Y_DEG, 2)}deg`,
    gx: `${fixed(x * 100, 1)}%`,
    gy: `${fixed(y * 100, 1)}%`,
  };
}

/** The band stack's follow values, each from -1 to 1 across the viewport. */
export function fieldFollow(clientX: number, clientY: number, width: number, height: number): { mx: string; my: string } {
  const f = (p: number, size: number) => (size > 0 ? fixed(clamp((p / size) * 2 - 1, -1, 1), 3) : '0.000');
  return { mx: f(clientX, width), my: f(clientY, height) };
}

/**
 * A pointer scene's values: --mx and --my from -1 to 1 across its own box (clamped outside it), and
 * --gx and --gy, the pointer's place as percentages, for a sheen.
 */
export function sceneFollow(clientX: number, clientY: number, rect: Rect): { mx: string; my: string; gx: string; gy: string } {
  const x = rect.width > 0 ? clamp((clientX - rect.left) / rect.width, 0, 1) : 0.5;
  const y = rect.height > 0 ? clamp((clientY - rect.top) / rect.height, 0, 1) : 0.5;
  return { mx: fixed(x * 2 - 1, 3), my: fixed(y * 2 - 1, 3), gx: `${fixed(x * 100, 1)}%`, gy: `${fixed(y * 100, 1)}%` };
}

/** How far a magnet reaches beyond its box, and the most it moves, in px. */
export const MAGNET_REACH = 24;
export const MAGNET_MAX = 6;

/**
 * The shift of a magnet toward the pointer, or null when the pointer is farther than the reach from
 * the element's box. The shift grows with the offset from the centre and stops at the maximum.
 */
export function magnetShift(clientX: number, clientY: number, rect: Rect): { tx: string; ty: string } | null {
  if (
    clientX < rect.left - MAGNET_REACH ||
    clientX > rect.left + rect.width + MAGNET_REACH ||
    clientY < rect.top - MAGNET_REACH ||
    clientY > rect.top + rect.height + MAGNET_REACH
  ) {
    return null;
  }
  const axis = (p: number, start: number, size: number) => {
    const half = size / 2 + MAGNET_REACH;
    return fixed(clamp((p - (start + size / 2)) / half, -1, 1) * MAGNET_MAX, 2) + 'px';
  };
  return { tx: axis(clientX, rect.left, rect.width), ty: axis(clientY, rect.top, rect.height) };
}

export const CARD_REST: CardLean = { rx: '0deg', ry: '0deg', gx: '50%', gy: '-20%' };

type MatchMedia = (query: string) => { matches: boolean };

/** True only with a fine pointer and no request for reduced motion. No matchMedia means off. */
export function leanEnabled(matchMedia: MatchMedia | undefined): boolean {
  if (!matchMedia) return false;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  return matchMedia('(pointer: fine)').matches;
}

// The small slices of the DOM the controller touches, so a test can pass plain objects.
type Styled = { style: { setProperty(name: string, value: string): void; removeProperty(name: string): void } };
export type MagnetEl = Styled & { getBoundingClientRect(): Rect };
export type LeanCardEl = Styled & { getBoundingClientRect(): Rect; contains(node: unknown): boolean };
export type LeanTarget = { closest(selector: string): LeanCardEl | null };
export type LeanEvent = { clientX: number; clientY: number; pointerType?: string; target: unknown; relatedTarget?: unknown };
export type LeanDoc = {
  addEventListener(type: 'pointermove' | 'pointerout', fn: (e: LeanEvent) => void, options?: { passive: boolean }): void;
  removeEventListener(type: 'pointermove' | 'pointerout', fn: (e: LeanEvent) => void): void;
  querySelectorAll(selector: string): Iterable<MagnetEl>;
};
export type LeanObserver = { observe(el: MagnetEl): void; disconnect(): void };
export type LeanObserverCtor = new (
  cb: (entries: readonly { target: MagnetEl; isIntersecting: boolean }[]) => void,
) => LeanObserver;
export type LeanWin = {
  matchMedia?: MatchMedia;
  innerWidth: number;
  innerHeight: number;
  requestAnimationFrame(fn: () => void): number;
  cancelAnimationFrame(id: number): void;
  /** When present, a scene off screen is skipped: no rect read and no write while it is out of view. */
  IntersectionObserver?: LeanObserverCtor;
};

const isTarget = (t: unknown): t is LeanTarget => typeof (t as LeanTarget | null)?.closest === 'function';

/**
 * Adds one delegated pointermove and one pointerout on the document. Returns the cleanup, or a
 * no-op when the lean is off (reduced motion, a coarse pointer or no matchMedia).
 *
 * The scenes (the band's stack, the pointer scenes and the magnets) are found once, when it attaches
 * (the layout attaches it again on each page). With an IntersectionObserver only the scenes in view
 * are touched. Each frame reads every rect it needs first and writes the custom properties after, so
 * a write never forces a layout before the next read, and each value is set on the element that uses
 * it.
 */
export function attachLean(doc: LeanDoc, win: LeanWin): () => void {
  if (!leanEnabled(win.matchMedia)) return () => {};

  const fields = [...doc.querySelectorAll('[data-depth-stack]')];
  const scenes = [...doc.querySelectorAll('[data-depth-follow]')];
  const magnets = [...doc.querySelectorAll('[data-depth-magnet]')];

  // Without an observer every scene counts as in view.
  let inView: ((el: MagnetEl) => boolean) = () => true;
  let observer: LeanObserver | null = null;
  if (win.IntersectionObserver) {
    const seen = new Set<MagnetEl>();
    observer = new win.IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) seen.add(e.target);
        else seen.delete(e.target);
      }
    });
    for (const el of [...fields, ...scenes, ...magnets]) observer.observe(el);
    inView = (el) => seen.has(el);
  }

  let card: LeanCardEl | null = null;
  let pending: LeanEvent | null = null;
  let frame = 0;
  const shifted = new Set<MagnetEl>();
  const moved = new Set<MagnetEl>();

  const rest = (el: LeanCardEl) => {
    el.style.setProperty('--rx', CARD_REST.rx);
    el.style.setProperty('--ry', CARD_REST.ry);
    el.style.removeProperty('--gx');
    el.style.removeProperty('--gy');
  };
  const resetField = () => {
    for (const f of fields) {
      f.style.setProperty('--mx', '0');
      f.style.setProperty('--my', '0');
    }
  };
  const restScene = (el: MagnetEl) => {
    el.style.setProperty('--mx', '0');
    el.style.setProperty('--my', '0');
    el.style.removeProperty('--gx');
    el.style.removeProperty('--gy');
  };
  const resetScenes = () => {
    for (const el of moved) restScene(el);
    moved.clear();
  };
  const resetMagnets = () => {
    for (const m of shifted) {
      m.style.setProperty('--tx', '0px');
      m.style.setProperty('--ty', '0px');
    }
    shifted.clear();
  };

  const apply = () => {
    frame = 0;
    const e = pending;
    pending = null;
    if (!e) return;
    const under = isTarget(e.target) ? e.target.closest('[data-depth-lean]') : null;

    // Reads first.
    const cardRect = under ? under.getBoundingClientRect() : null;
    const sceneRects = scenes.filter(inView).map((el) => [el, el.getBoundingClientRect()] as const);
    const magnetRects = magnets.filter(inView).map((m) => [m, m.getBoundingClientRect()] as const);

    // Then writes.
    if (card && card !== under) rest(card);
    card = under;
    if (under && cardRect) {
      const v = cardLean(e.clientX, e.clientY, cardRect);
      under.style.setProperty('--rx', v.rx);
      under.style.setProperty('--ry', v.ry);
      under.style.setProperty('--gx', v.gx);
      under.style.setProperty('--gy', v.gy);
    }
    const { mx, my } = fieldFollow(e.clientX, e.clientY, win.innerWidth, win.innerHeight);
    for (const f of fields) {
      if (!inView(f)) continue;
      f.style.setProperty('--mx', mx);
      f.style.setProperty('--my', my);
    }
    for (const el of moved) {
      if (inView(el)) continue;
      restScene(el);
      moved.delete(el);
    }
    for (const [el, rect] of sceneRects) {
      const v = sceneFollow(e.clientX, e.clientY, rect);
      el.style.setProperty('--mx', v.mx);
      el.style.setProperty('--my', v.my);
      el.style.setProperty('--gx', v.gx);
      el.style.setProperty('--gy', v.gy);
      moved.add(el);
    }
    for (const [m, rect] of magnetRects) {
      const v = magnetShift(e.clientX, e.clientY, rect);
      if (v) {
        m.style.setProperty('--tx', v.tx);
        m.style.setProperty('--ty', v.ty);
        shifted.add(m);
      } else if (shifted.delete(m)) {
        m.style.setProperty('--tx', '0px');
        m.style.setProperty('--ty', '0px');
      }
    }
  };

  const onMove = (e: LeanEvent) => {
    if (e.pointerType === 'touch') return;
    pending = e;
    if (!frame) frame = win.requestAnimationFrame(apply);
  };

  const settle = () => {
    if (frame) win.cancelAnimationFrame(frame);
    frame = 0;
    pending = null;
    if (card) rest(card);
    card = null;
    resetField();
    resetScenes();
    resetMagnets();
  };

  const onOut = (e: LeanEvent) => {
    if (e.pointerType === 'touch') return;
    // Moving inside the page: the next pointermove settles which card is under the pointer.
    if (e.relatedTarget) return;
    // The pointer left the window.
    settle();
  };

  doc.addEventListener('pointermove', onMove, { passive: true });
  doc.addEventListener('pointerout', onOut);
  return () => {
    doc.removeEventListener('pointermove', onMove);
    doc.removeEventListener('pointerout', onOut);
    observer?.disconnect();
    settle();
  };
}
