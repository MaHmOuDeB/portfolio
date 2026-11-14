import { describe, expect, it, vi } from 'vitest';
import { attachLean, cardLean, fieldFollow, leanEnabled, magnetShift, type LeanCardEl, type LeanDoc, type LeanEvent, type LeanWin } from '@/lib/depth/lean';

const RECT = { left: 100, top: 200, width: 400, height: 200 };

describe('cardLean', () => {
  it('is flat at the centre', () => {
    expect(cardLean(300, 300, RECT)).toEqual({ rx: '0.00deg', ry: '0.00deg', gx: '50.0%', gy: '50.0%' });
  });
  it('turns by the mock formula at a corner', () => {
    expect(cardLean(500, 200, RECT)).toEqual({ rx: '3.50deg', ry: '4.50deg', gx: '100.0%', gy: '0.0%' });
    expect(cardLean(100, 400, RECT)).toEqual({ rx: '-3.50deg', ry: '-4.50deg', gx: '0.0%', gy: '100.0%' });
  });
  it('clamps a pointer outside the rect and survives an empty rect', () => {
    expect(cardLean(9999, -9999, RECT).ry).toBe('4.50deg');
    expect(cardLean(5, 5, { left: 0, top: 0, width: 0, height: 0 })).toEqual({ rx: '0.00deg', ry: '0.00deg', gx: '50.0%', gy: '50.0%' });
  });
});

describe('fieldFollow', () => {
  it('maps the viewport to -1 .. 1', () => {
    expect(fieldFollow(0, 0, 1000, 800)).toEqual({ mx: '-1.000', my: '-1.000' });
    expect(fieldFollow(500, 400, 1000, 800)).toEqual({ mx: '0.000', my: '0.000' });
    expect(fieldFollow(1000, 800, 1000, 800)).toEqual({ mx: '1.000', my: '1.000' });
    expect(fieldFollow(5, 5, 0, 0)).toEqual({ mx: '0.000', my: '0.000' });
  });
});

describe('magnetShift', () => {
  const R = { left: 100, top: 100, width: 200, height: 50 };
  it('is null beyond the reach of 24 px and set at the edge of it', () => {
    expect(magnetShift(75, 125, R)).toBeNull();
    expect(magnetShift(325, 125, R)).toBeNull();
    expect(magnetShift(200, 75, R)).toBeNull();
    expect(magnetShift(200, 175, R)).toBeNull();
    expect(magnetShift(76, 125, R)).not.toBeNull();
  });
  it('is zero at the centre and at most 6 px toward the pointer', () => {
    expect(magnetShift(200, 125, R)).toEqual({ tx: '0.00px', ty: '0.00px' });
    expect(magnetShift(324, 149, R)!.tx).toBe('6.00px');
    expect(magnetShift(76, 126, R)!.tx).toBe('-6.00px');
    expect(magnetShift(300, 100, R)!.ty).toBe('-3.06px');
    for (const [x, y] of [[324, 174], [76, 76], [200, 76]] as const) {
      const v = magnetShift(x, y, R)!;
      expect(Math.abs(parseFloat(v.tx))).toBeLessThanOrEqual(6);
      expect(Math.abs(parseFloat(v.ty))).toBeLessThanOrEqual(6);
    }
  });
});

describe('leanEnabled', () => {
  const mm = (reduce: boolean, fine: boolean) => (q: string) => ({ matches: q.includes('reduce') ? reduce : fine });
  it('is on only with a fine pointer and no reduced-motion request', () => {
    expect(leanEnabled(mm(false, true))).toBe(true);
    expect(leanEnabled(mm(true, true))).toBe(false);
    expect(leanEnabled(mm(false, false))).toBe(false);
    expect(leanEnabled(undefined)).toBe(false);
  });
});

function setup(opts: { reduce?: boolean; fine?: boolean } = {}) {
  const props = new Map<string, string>();
  const style = { setProperty: (k: string, v: string) => void props.set(k, v), removeProperty: (k: string) => void props.delete(k) };
  const card: LeanCardEl = { style, getBoundingClientRect: () => RECT, contains: () => true };
  const fieldProps = new Map<string, string>();
  const field = { getBoundingClientRect: () => RECT, style: { setProperty: (k: string, v: string) => void fieldProps.set(k, v), removeProperty: (k: string) => void fieldProps.delete(k) } };
  const magnetProps = new Map<string, string>();
  const magnet: LeanCardEl & { getBoundingClientRect(): typeof RECT } = {
    style: { setProperty: (k: string, v: string) => void magnetProps.set(k, v), removeProperty: (k: string) => void magnetProps.delete(k) },
    getBoundingClientRect: () => ({ left: 700, top: 300, width: 100, height: 40 }),
    contains: () => false,
  };
  const handlers: Record<string, (e: LeanEvent) => void> = {};
  const doc: LeanDoc = {
    addEventListener: vi.fn((t, fn) => void (handlers[t] = fn)),
    removeEventListener: vi.fn((t) => void delete handlers[t]),
    querySelectorAll: (sel) => (sel === '[data-depth-magnet]' ? [magnet] : [field]),
  };
  let queued: (() => void) | null = null;
  const win: LeanWin = {
    matchMedia: (q) => ({ matches: q.includes('reduce') ? !!opts.reduce : opts.fine ?? true }),
    innerWidth: 1000,
    innerHeight: 800,
    requestAnimationFrame: (fn) => ((queued = fn), 1),
    cancelAnimationFrame: () => void (queued = null),
  };
  const flush = () => {
    const f = queued;
    queued = null;
    f?.();
  };
  const onCard = { closest: (s: string) => (s === '[data-depth-lean]' ? card : null) };
  const offCard = { closest: () => null };
  return { props, fieldProps, magnetProps, handlers, doc, win, flush, onCard, offCard };
}

describe('attachLean', () => {
  it('adds exactly one pointermove and one pointerout listener', () => {
    const s = setup();
    attachLean(s.doc, s.win);
    expect(Object.keys(s.handlers).sort()).toEqual(['pointermove', 'pointerout']);
    expect(s.doc.addEventListener).toHaveBeenCalledTimes(2);
  });

  it('does nothing under reduced motion or a coarse pointer', () => {
    for (const o of [{ reduce: true }, { fine: false }]) {
      const s = setup(o);
      attachLean(s.doc, s.win)();
      expect(s.doc.addEventListener).not.toHaveBeenCalled();
    }
  });

  it('throttles to one frame, sets the card and the field, and ignores touch', () => {
    const s = setup();
    const raf = vi.spyOn(s.win, 'requestAnimationFrame');
    attachLean(s.doc, s.win);
    s.handlers.pointermove!({ clientX: 300, clientY: 300, target: s.onCard });
    s.handlers.pointermove!({ clientX: 500, clientY: 200, target: s.onCard });
    s.handlers.pointermove!({ clientX: 1, clientY: 1, pointerType: 'touch', target: s.onCard });
    expect(raf).toHaveBeenCalledTimes(1);
    s.flush();
    expect(s.props.get('--ry')).toBe('4.50deg');
    expect(s.props.get('--rx')).toBe('3.50deg');
    expect(s.props.get('--gx')).toBe('100.0%');
    expect(s.fieldProps.get('--mx')).toBe('0.000');
    expect(s.fieldProps.get('--my')).toBe('-0.500');
  });

  it('sets the field values from the pointer position', () => {
    const s = setup();
    attachLean(s.doc, s.win);
    s.handlers.pointermove!({ clientX: 1000, clientY: 0, target: s.offCard });
    s.flush();
    expect(s.fieldProps.get('--mx')).toBe('1.000');
    expect(s.fieldProps.get('--my')).toBe('-1.000');
    expect(s.props.size).toBe(0);
  });

  it('springs the card back when the pointer moves to empty space or leaves the window', () => {
    const s = setup();
    attachLean(s.doc, s.win);
    s.handlers.pointermove!({ clientX: 500, clientY: 200, target: s.onCard });
    s.flush();
    s.handlers.pointermove!({ clientX: 0, clientY: 0, target: s.offCard });
    s.flush();
    expect(s.props.get('--ry')).toBe('0deg');
    s.handlers.pointermove!({ clientX: 500, clientY: 200, target: s.onCard });
    s.flush();
    s.handlers.pointerout!({ clientX: 0, clientY: 0, target: s.onCard, relatedTarget: null });
    expect(s.props.get('--rx')).toBe('0deg');
    expect(s.fieldProps.get('--mx')).toBe('0');
  });

  it('shifts a magnet within reach, then resets it when the pointer moves away and when it leaves', () => {
    const s = setup();
    attachLean(s.doc, s.win);
    s.handlers.pointermove!({ clientX: 810, clientY: 320, target: s.offCard });
    s.flush();
    expect(s.magnetProps.get('--tx')).toBe('4.86px');
    expect(s.magnetProps.get('--ty')).toBe('0.00px');
    s.handlers.pointermove!({ clientX: 900, clientY: 320, target: s.offCard });
    s.flush();
    expect(s.magnetProps.get('--tx')).toBe('0px');
    s.handlers.pointermove!({ clientX: 810, clientY: 320, target: s.offCard });
    s.flush();
    s.handlers.pointerout!({ clientX: 0, clientY: 0, target: s.offCard, relatedTarget: null });
    expect(s.magnetProps.get('--tx')).toBe('0px');
    expect(s.magnetProps.get('--ty')).toBe('0px');
  });

  it('removes both listeners on cleanup', () => {
    const s = setup();
    attachLean(s.doc, s.win)();
    expect(s.handlers).toEqual({});
  });
});
