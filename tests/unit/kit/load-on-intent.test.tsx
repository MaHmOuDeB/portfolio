import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseFragment } from 'parse5';
import { lazy, type ReactNode } from 'react';
import { renderToStaticMarkup, renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LoadOnIntent } from '@/components/kit/LoadOnIntent';

// The tests run in Node: there is no DOM to hydrate into. The browser half of LoadOnIntent (the
// preview handover, the focus handoff, the failed-import fallback and the change of `eager` from false
// to true on a mounted component, which needs real state and effects) is in tests/e2e/figure.spec.ts,
// on the /kitchen-sink/eager routes.
// Here the component renders on the server for real, and its hooks are replaced by recorders, so
// the island's own effects and state setters can be run one by one, with `window` and `document`
// stubbed, and seen to do (or not do) what `eager` promises.

type Effect = { run: () => void | (() => void); deps: readonly unknown[] | undefined };
const rec = vi.hoisted(() => ({
  effects: [] as Array<{ run: () => void | (() => void); deps: readonly unknown[] | undefined }>,
  layoutEffects: [] as Array<{ run: () => void | (() => void); deps: readonly unknown[] | undefined }>,
  setters: [] as Array<ReturnType<typeof import('vitest').vi.fn>>,
  // The island's state for the next render, in useState order (`loading`, `ready`); null keeps the
  // initial values.
  states: null as unknown[] | null,
  // A stand-in for the loader's root element, given to the first ref created with null (the root).
  root: null as unknown,
  rootGiven: false,
}));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useEffect: (run: Effect['run'], deps?: Effect['deps']) => void rec.effects.push({ run, deps }),
    useLayoutEffect: (run: Effect['run'], deps?: Effect['deps']) => void rec.layoutEffects.push({ run, deps }),
    useState: (initial: unknown) => {
      const set = vi.fn();
      const index = rec.setters.length;
      rec.setters.push(set);
      if (rec.states && index < rec.states.length) return [rec.states[index], set];
      return [typeof initial === 'function' ? (initial as () => unknown)() : initial, set];
    },
    useRef: (initial: unknown) => {
      if (initial === null && rec.root !== null && !rec.rootGiven) {
        rec.rootGiven = true;
        return { current: rec.root };
      }
      return { current: initial };
    },
  };
});

type Node = { nodeName: string; attrs?: Array<{ name: string; value: string }>; childNodes?: Node[] };
const parse = (html: string) => parseFragment(html) as unknown as Node;
const find = (node: Node, test: (n: Node) => boolean): Node[] =>
  (test(node) ? [node] : []).concat((node.childNodes ?? []).flatMap((c) => find(c, test)));
const attr = (n: Node, name: string) => n.attrs?.find((a) => a.name === name)?.value;
const withAttr = (root: Node, name: string) => find(root, (n) => n.attrs?.some((a) => a.name === name) ?? false);

const preview = <p data-test-preview="">The preview</p>;

/** Renders on the server and returns what the island registered: its effects and its state setters. */
function mount(eager: boolean | undefined, children: ReactNode = <p data-test-island="">The island</p>) {
  rec.effects.length = 0;
  rec.layoutEffects.length = 0;
  rec.setters.length = 0;
  rec.rootGiven = false;
  const html = renderToString(
    eager === undefined ? (
      <LoadOnIntent preview={preview}>{children}</LoadOnIntent>
    ) : (
      <LoadOnIntent preview={preview} eager={eager}>
        {children}
      </LoadOnIntent>
    ),
  );
  // The island's state: setLoading is the first useState, setReady the second.
  const [setLoading, setReady] = rec.setters;
  return { html, effects: [...rec.effects], setLoading: setLoading!, setReady: setReady! };
}

const idle = { request: vi.fn(() => 7), cancel: vi.fn() };
class FakeHTMLElement {}

beforeEach(() => {
  idle.request.mockClear();
  idle.cancel.mockClear();
  vi.stubGlobal('HTMLElement', FakeHTMLElement);
  vi.stubGlobal('document', { readyState: 'complete', activeElement: null });
  vi.stubGlobal('window', {
    requestIdleCallback: idle.request,
    cancelIdleCallback: idle.cancel,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    setTimeout,
    clearTimeout,
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  rec.states = null;
  rec.root = null;
});

/** Runs every registered effect once, as a commit would; returns the cleanups. */
const commit = (effects: Effect[]) => effects.map((e) => e.run()).filter((c): c is () => void => typeof c === 'function');

describe('LoadOnIntent eager', () => {
  it('on the server renders the preview, marked idle, and not the island, eager or not', () => {
    for (const eager of [undefined, false, true]) {
      const root = parse(renderToStaticMarkup(
        <LoadOnIntent preview={preview} eager={eager}>
          <p data-test-island="">The island</p>
        </LoadOnIntent>,
      ));
      const [island] = withAttr(root, 'data-island');
      expect(attr(island!, 'data-island'), String(eager)).toBe('idle');
      expect(withAttr(root, 'data-test-preview'), String(eager)).toHaveLength(1);
      expect(withAttr(root, 'data-test-island'), String(eager)).toHaveLength(0);
    }
  });

  it('does not request the island on the server, even when eager', () => {
    const factory = vi.fn(async () => ({ default: () => <p data-test-island="">The island</p> }));
    const Island = lazy(factory);
    for (const eager of [false, true]) {
      mount(eager, <Island />);
      expect(renderToStaticMarkup(
        <LoadOnIntent preview={preview} eager={eager}>
          <Island />
        </LoadOnIntent>,
      )).toContain('data-test-preview');
    }
    expect(factory).not.toHaveBeenCalled();
  });

  it('eager loads after hydration, with no intent: the effects alone start the island', async () => {
    const { effects, setLoading } = mount(true);
    expect(setLoading).not.toHaveBeenCalled();
    commit(effects);
    await Promise.resolve();
    expect(setLoading).toHaveBeenCalledWith(true);
  });

  it('eager starts the island once for one commit, before the idle callback could fire', async () => {
    const { effects, setLoading } = mount(true);
    commit(effects);
    await Promise.resolve();
    expect(setLoading).toHaveBeenCalledTimes(1);
    expect(idle.request).toHaveBeenCalledTimes(1); // the idle trigger is still scheduled, as a fallback
  });

  it('without eager, or with eager false, nothing loads at hydration', async () => {
    for (const eager of [undefined, false]) {
      const { effects, setLoading } = mount(eager);
      commit(effects);
      await Promise.resolve();
      expect(setLoading, String(eager)).not.toHaveBeenCalled();
    }
  });

  it('without eager the idle trigger is still what loads the island, and its cleanup cancels it', () => {
    const { effects, setLoading } = mount(false);
    const cleanups = commit(effects);
    expect(idle.request).toHaveBeenCalledWith(expect.any(Function), { timeout: 2000 });
    expect(setLoading).not.toHaveBeenCalled();
    const [load] = idle.request.mock.calls[0] as unknown as [() => void];
    load();
    expect(setLoading).toHaveBeenCalledExactlyOnceWith(true);
    for (const cleanup of cleanups) cleanup();
    expect(idle.cancel).toHaveBeenCalledExactlyOnceWith(7);
  });

  it('keeps the idle trigger waiting for the load event when the page is not complete', () => {
    vi.stubGlobal('document', { readyState: 'loading', activeElement: null });
    const { effects } = mount(false);
    commit(effects);
    expect(idle.request).not.toHaveBeenCalled();
    expect((window.addEventListener as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toBe('load');
  });

  it('a strict-mode remount (cleanup, then the same effects again) still loads the island once', async () => {
    const { effects, setLoading } = mount(true);
    for (const cleanup of commit(effects)) cleanup();
    await Promise.resolve();
    expect(setLoading).not.toHaveBeenCalled();
    commit(effects);
    await Promise.resolve();
    expect(setLoading).toHaveBeenCalledTimes(1);
  });

  it('eager is false by default and is the only prop added', () => {
    const source = readFileSync(join(import.meta.dirname, '../../../src/components/kit/LoadOnIntent.tsx'), 'utf8');
    expect(source).toMatch(/eager = false/);
    expect(source).not.toMatch(/fetch\(/);
  });
});

// The height the loader holds for an island while it swaps in. The tests run the loader's own effects
// with a fake ResizeObserver and a fake animation frame, against a stand-in root element.
describe('LoadOnIntent height reservation', () => {
  class FakeResizeObserver {
    static all: FakeResizeObserver[] = [];
    targets: unknown[] = [];
    disconnected = false;
    constructor(private readonly callback: (entries: unknown[]) => void) {
      FakeResizeObserver.all.push(this);
    }
    observe(target: unknown) {
      this.targets.push(target);
    }
    disconnect() {
      this.disconnected = true;
    }
    notify(entries: unknown[] = [{}]) {
      this.callback(entries);
    }
  }
  let frames: Array<() => void> = [];
  const nextFrame = () => frames.splice(0).forEach((frame) => frame());
  const sized = (blockSize: number) => [{ borderBoxSize: [{ blockSize }], contentRect: { height: blockSize } }];

  type FakeRoot = {
    style: { minHeight: string };
    getBoundingClientRect: ReturnType<typeof vi.fn>;
    contains: () => boolean;
    lastElementChild: unknown;
  };
  /** A root whose island added no element of its own: the loader must not depend on the island's elements. */
  const fakeRoot = (height = 0, lastElementChild: unknown = null): FakeRoot => ({
    style: { minHeight: '' },
    getBoundingClientRect: vi.fn(() => ({ height })),
    contains: () => false,
    lastElementChild,
  });

  /** Renders the loader in a given state against `root`; returns its effects, layout effects and setters. */
  function render(root: FakeRoot, states: [loading: boolean, ready: boolean]) {
    rec.root = root;
    rec.states = states;
    const out = mount(false);
    const layoutEffects = [...rec.layoutEffects];
    // Arrived's layout effect is `arrive` itself, with `arrive` as its only dependency.
    const arrive = layoutEffects.find((e) => e.deps?.length === 1 && e.deps[0] === e.run);
    return { ...out, arrive };
  }

  beforeEach(() => {
    FakeResizeObserver.all = [];
    frames = [];
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    vi.stubGlobal('requestAnimationFrame', (frame: () => void) => frames.push(frame));
  });

  it("holds the preview's observed height when the island arrives, and lets it go at the root's first resize notification", () => {
    const root = fakeRoot();
    const { effects, arrive, setReady } = render(root, [true, false]);
    commit(effects);
    const [preview] = FakeResizeObserver.all;
    expect(preview?.targets).toEqual([root]);
    preview!.notify(sized(640));
    arrive!.run();
    expect(root.style.minHeight).toBe('640px');
    expect(setReady).toHaveBeenCalledWith(true);
    const release = FakeResizeObserver.all[1];
    expect(release?.targets).toEqual([root]);
    release!.notify();
    expect(root.style.minHeight).toBe('');
    expect(release!.disconnected).toBe(true);
    expect(root.getBoundingClientRect).not.toHaveBeenCalled();
  });

  it('lets the height go after two frames when no resize notification comes, and not after one', () => {
    const root = fakeRoot(0, {});
    const { effects, arrive } = render(root, [true, false]);
    commit(effects);
    FakeResizeObserver.all[0]!.notify(sized(640));
    arrive!.run();
    expect(root.style.minHeight).toBe('640px');
    nextFrame();
    expect(root.style.minHeight).toBe('640px');
    nextFrame();
    expect(root.style.minHeight).toBe('');
    expect(FakeResizeObserver.all[1]!.disconnected).toBe(true);
  });

  it('holds nothing when the preview has no height', () => {
    const root = fakeRoot(0, {});
    const { effects, arrive, setReady } = render(root, [true, false]);
    commit(effects);
    FakeResizeObserver.all[0]!.notify(sized(0));
    arrive!.run();
    expect(root.style.minHeight).toBe('');
    expect(FakeResizeObserver.all).toHaveLength(1);
    expect(frames).toHaveLength(0);
    expect(setReady).toHaveBeenCalledWith(true);
  });

  it('stops observing the preview on unmount, and observes nothing once the island is ready', () => {
    const root = fakeRoot();
    const before = render(root, [false, false]);
    const cleanups = commit(before.effects);
    const [preview] = FakeResizeObserver.all;
    expect(preview?.targets).toEqual([root]);
    expect(preview!.disconnected).toBe(false);
    for (const cleanup of cleanups) cleanup();
    expect(preview!.disconnected).toBe(true);
    // `ready` is a dependency of the observer's effect: React runs the cleanup above when it turns
    // true, and the effect then observes nothing.
    const after = render(fakeRoot(), [true, true]);
    commit(after.effects);
    expect(FakeResizeObserver.all).toHaveLength(1);
  });

  it('load measures the preview itself only while the observer has not reported', () => {
    const early = fakeRoot(500);
    commit(render(early, [false, false]).effects);
    const [load] = idle.request.mock.calls[0] as unknown as [() => void];
    load();
    expect(early.getBoundingClientRect).toHaveBeenCalledTimes(1);
    load();
    expect(early.getBoundingClientRect).toHaveBeenCalledTimes(1);

    idle.request.mockClear();
    FakeResizeObserver.all = [];
    const late = fakeRoot(500);
    commit(render(late, [false, false]).effects);
    FakeResizeObserver.all[0]!.notify(sized(640));
    const [loadLate] = idle.request.mock.calls[0] as unknown as [() => void];
    loadLate();
    expect(late.getBoundingClientRect).not.toHaveBeenCalled();
  });
});
