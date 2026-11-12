import { CONTACT } from '@/lib/site';
import { clickEvents, createDwell, createEngagement, createSender } from '@/lib/experiment/beacon';
import type { BeaconBatch, BeaconResponse, ClientReject, EventType } from '@/lib/experiment/events';

const ORIGIN = 'https://x.vercel.app';
const PV = '3f2b8c1e-9a4d-4b6f-8e2a-1c5d7f9b0a3e';

type Call = { batch: BeaconBatch; mode: 'fetch' | 'beacon'; resolve: (r: BeaconResponse | null) => void; reject: (e: unknown) => void };

function harness(entry: 'entry' | ClientReject = 'entry') {
  const calls: Call[] = [];
  const counted: Extract<BeaconResponse, { ok: true }>[] = [];
  let ids = 0;
  const sender = createSender({
    ns: 'aa-v1',
    arm: 'b',
    entry,
    newId: () => {
      ids += 1;
      return PV;
    },
    post: (batch, mode) => new Promise((resolve, reject) => calls.push({ batch, mode, resolve, reject })),
    onCounted: (r) => counted.push(r),
  });
  return { sender, calls, counted, ids: () => ids };
}

const types = (c: Call | undefined) => c?.batch.events.map((e) => e.type);
const ok = (c: Call | undefined): BeaconResponse => ({
  ok: true,
  arm: 'b',
  results: (c?.batch.events ?? []).map((e) => ({ type: e.type, outcome: 'counted' as const })),
});
/** Lets the sender's promise handlers run. */
const settle = async () => {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
};

async function confirmedEntry() {
  const h = harness();
  h.calls[0]!.resolve(ok(h.calls[0]));
  await settle();
  return h;
}

describe('clickEvents', () => {
  it('a featured-card link to /work/retention is exposure, a card click and a secondary click (amendment 3)', () => {
    expect(clickEvents('/work/retention', ORIGIN, true)).toEqual(['inview', 'card', 'secondary']);
    expect(clickEvents(`${ORIGIN}/work/retention`, ORIGIN, true)).toEqual(['inview', 'card', 'secondary']);
  });

  it('a /work/* link that is not a card is a secondary click only', () => {
    expect(clickEvents('/work/x', ORIGIN, false)).toEqual(['secondary']);
  });

  it('/lab and its subpages are secondary clicks', () => {
    expect(clickEvents('/lab', ORIGIN, false)).toEqual(['secondary']);
    expect(clickEvents('/lab/peeking?peeking.preset=interview', ORIGIN, false)).toEqual(['secondary']);
  });

  it('/experiment never counts', () => {
    expect(clickEvents('/experiment', ORIGIN, false)).toEqual([]);
    expect(clickEvents('/experiment', ORIGIN, true)).toEqual([]);
    expect(clickEvents('/experiment/data.json', ORIGIN, false)).toEqual([]);
  });

  it('/cv.pdf is a CV click', () => {
    expect(clickEvents('/cv.pdf', ORIGIN, false)).toEqual(['cv']);
  });

  it('the CV page and the CV PDF are CV clicks, with a query or a hash, from a card too', () => {
    for (const href of ['/cv', `${ORIGIN}/cv`, '/cv?x=1', '/cv#projects', '/cv/', '/cv.pdf?v=2', '/cv.pdf#page=2', `${ORIGIN}/cv.pdf`]) {
      expect(clickEvents(href, ORIGIN, false), href).toEqual(['cv']);
      expect(clickEvents(href, ORIGIN, true), href).toEqual(['cv']);
    }
  });

  it('a CV path on another origin, or a path that only starts like it, is not a CV click', () => {
    for (const href of ['https://example.com/cv', 'https://example.com/cv.pdf', '//example.com/cv', '/cvx', '/cv.pdfx', '/cv/old', '/about/cv']) {
      expect(clickEvents(href, ORIGIN, false), href).toEqual([]);
    }
  });

  it('mailto: and the LinkedIn and GitHub profiles are contact clicks', () => {
    expect(clickEvents('mailto:someone@example.com', ORIGIN, false)).toEqual(['contact']);
    expect(clickEvents(CONTACT.linkedin, ORIGIN, false)).toEqual(['contact']);
    expect(clickEvents(`${CONTACT.linkedin}/`, ORIGIN, false)).toEqual(['contact']);
    expect(clickEvents(CONTACT.github, ORIGIN, false)).toEqual(['contact']);
  });

  it('another origin, other pages and unparsable links give nothing', () => {
    expect(clickEvents('https://example.com/work/retention', ORIGIN, true)).toEqual([]);
    expect(clickEvents('https://y.vercel.app/lab', ORIGIN, false)).toEqual([]);
    expect(clickEvents(`${CONTACT.github}/portfolio`, ORIGIN, false)).toEqual([]);
    expect(clickEvents('/', ORIGIN, false)).toEqual([]);
    expect(clickEvents('#main', ORIGIN, false)).toEqual([]);
    expect(clickEvents('/work', ORIGIN, false)).toEqual([]);
    expect(clickEvents('/laboratory', ORIGIN, false)).toEqual([]);
    expect(clickEvents('/privacy', ORIGIN, false)).toEqual([]);
    expect(clickEvents('http://[', ORIGIN, false)).toEqual([]);
  });
});

describe('createSender', () => {
  it('posts the entry alone, with fetch, as soon as it is created', () => {
    const h = harness();
    expect(h.calls).toHaveLength(1);
    expect(h.calls[0]!.mode).toBe('fetch');
    expect(h.calls[0]!.batch).toEqual({ v: 1, ns: 'aa-v1', pv: PV, arm: 'b', events: [{ type: 'entry' }] });
  });

  it('posts nothing else until the entry resolves ok, then the waiting groups in order', async () => {
    const h = harness();
    h.sender.enqueue('engaged');
    h.sender.enqueue('inview');
    await settle();
    expect(h.calls).toHaveLength(1);
    h.calls[0]!.resolve(ok(h.calls[0]));
    await settle();
    expect(h.calls).toHaveLength(2);
    expect(types(h.calls[1])).toEqual(['engaged', 'inview']);
    expect(h.calls[1]!.mode).toBe('fetch');
  });

  it('a refused entry drops everything after it, flush included', async () => {
    const h = harness();
    h.sender.enqueue('inview');
    h.calls[0]!.resolve({ ok: false, reason: 'paused' });
    await settle();
    h.sender.enqueue('engaged');
    h.sender.flush();
    await settle();
    expect(h.calls).toHaveLength(1);
    expect(h.counted).toEqual([]);
  });

  it.each<[string, (c: Call) => void]>([
    ['null', (c) => c.resolve(null)],
    ['a rejected post', (c) => c.reject(new Error('offline'))],
  ])('after the entry fails (%s), flush re-sends it once ahead of all queued events', async (_name, fail) => {
    const h = harness();
    h.sender.enqueue('engaged');
    fail(h.calls[0]!);
    await settle();
    h.sender.enqueue('inview', 'card', 'inview');
    await settle();
    expect(h.calls).toHaveLength(1);
    expect(h.counted).toEqual([]);

    h.sender.flush();
    h.sender.enqueue('contact');
    h.sender.flush();
    await settle();
    expect(h.calls).toHaveLength(2);
    expect(h.calls[1]!.mode).toBe('beacon');
    expect(h.calls[1]!.batch).toEqual({
      ...h.calls[0]!.batch,
      events: [{ type: 'entry' }, { type: 'engaged' }, { type: 'inview' }, { type: 'card' }],
    });
    expect(h.ids()).toBe(1);
  });

  it.each<ClientReject>(['bot', 'forced', 'not_entry'])('a %s entry posts that single item and stops', async (reject) => {
    const h = harness(reject);
    expect(h.calls).toHaveLength(1);
    expect(h.calls[0]!.mode).toBe('fetch');
    expect(h.calls[0]!.batch.events).toEqual([{ type: 'entry', reject }]);
    h.sender.enqueue('inview', 'card');
    h.sender.flush();
    h.calls[0]!.resolve({ ok: false, reason: reject });
    await settle();
    h.sender.enqueue('engaged');
    h.sender.flush();
    await settle();
    expect(h.calls).toHaveLength(1);
  });

  it('posts each type at most once', async () => {
    const h = await confirmedEntry();
    h.sender.enqueue('inview');
    h.calls[1]!.resolve(ok(h.calls[1]));
    await settle();
    h.sender.enqueue('inview', 'card', 'card');
    await settle();
    expect(types(h.calls[2])).toEqual(['card']);
    h.calls[2]!.resolve(ok(h.calls[2]));
    await settle();
    h.sender.enqueue('inview');
    h.sender.enqueue('entry');
    h.sender.enqueue('card');
    await settle();
    h.sender.flush();
    expect(h.calls).toHaveLength(3);
  });

  it("enqueue('inview', 'card', 'secondary') posts one ordered batch", async () => {
    const h = await confirmedEntry();
    h.sender.enqueue('inview', 'card', 'secondary');
    expect(h.calls).toHaveLength(2);
    expect(types(h.calls[1])).toEqual(['inview', 'card', 'secondary']);
  });

  it('serialises posts: a group enqueued while a post is in flight waits for it', async () => {
    const h = await confirmedEntry();
    h.sender.enqueue('inview');
    h.sender.enqueue('engaged');
    await settle();
    expect(h.calls).toHaveLength(2);
    expect(types(h.calls[1])).toEqual(['inview']);
    h.calls[1]!.resolve(ok(h.calls[1]));
    await settle();
    expect(h.calls).toHaveLength(3);
    expect(types(h.calls[2])).toEqual(['engaged']);
  });

  it('ends when a later group is refused', async () => {
    const h = await confirmedEntry();
    h.sender.enqueue('inview');
    h.sender.enqueue('card');
    h.calls[1]!.resolve({ ok: false, reason: 'rate_limited' });
    await settle();
    h.sender.enqueue('engaged');
    h.sender.flush();
    await settle();
    expect(h.calls).toHaveLength(2);
  });

  it.each<[string, (c: Call) => void]>([
    ['null', (c) => c.resolve(null)],
    ['a rejected post', (c) => c.reject(new Error('offline'))],
  ])('after a later group fails (%s), sends no more fetches and flush re-sends it first, in order', async (_name, fail) => {
    const h = await confirmedEntry();
    h.sender.enqueue('inview');
    h.sender.enqueue('card');
    fail(h.calls[1]!);
    await settle();
    h.sender.enqueue('engaged');
    h.sender.enqueue('inview');
    await settle();
    expect(h.calls).toHaveLength(2);
    h.sender.flush();
    expect(h.calls).toHaveLength(3);
    expect(h.calls[2]!.mode).toBe('beacon');
    expect(types(h.calls[2])).toEqual(['inview', 'card', 'engaged']);
  });

  it('flush posts every unconfirmed item, in-flight ones included, as one ordered beacon batch', async () => {
    const h = harness();
    h.sender.enqueue('inview');
    h.sender.enqueue('engaged', 'cv');
    h.sender.flush();
    expect(h.calls).toHaveLength(2);
    expect(h.calls[1]!.mode).toBe('beacon');
    expect(types(h.calls[1])).toEqual(['entry', 'inview', 'engaged', 'cv']);
    // The sender is finished: a late answer, a new group or a second flush posts nothing.
    h.calls[0]!.resolve(ok(h.calls[0]));
    await settle();
    h.sender.enqueue('contact');
    h.sender.flush();
    await settle();
    expect(h.calls).toHaveLength(2);
  });

  it('flush while [inview] is in flight and [card] is queued posts [inview, card]', async () => {
    const h = await confirmedEntry();
    h.sender.enqueue('inview');
    h.sender.enqueue('card');
    h.sender.flush();
    expect(h.calls).toHaveLength(3);
    expect(h.calls[2]!.mode).toBe('beacon');
    expect(types(h.calls[2])).toEqual(['inview', 'card']);
  });

  it('flush posts nothing when everything is confirmed', async () => {
    const h = await confirmedEntry();
    h.sender.enqueue('inview');
    h.calls[1]!.resolve(ok(h.calls[1]));
    await settle();
    h.sender.flush();
    expect(h.calls).toHaveLength(2);
  });

  it('every batch of one sender carries the same pv and ns, and the id is drawn once', async () => {
    const h = await confirmedEntry();
    h.sender.enqueue('inview');
    h.calls[1]!.resolve(ok(h.calls[1]));
    await settle();
    h.sender.enqueue('card', 'secondary');
    h.sender.flush();
    expect(h.calls).toHaveLength(4);
    for (const c of h.calls) expect([c.batch.pv, c.batch.ns, c.batch.arm, c.batch.v]).toEqual([PV, 'aa-v1', 'b', 1]);
    expect(h.ids()).toBe(1);
  });

  it('reports every counted answer, and no refusal', async () => {
    const h = await confirmedEntry();
    h.sender.enqueue('inview');
    const answer = ok(h.calls[1]);
    h.calls[1]!.resolve(answer);
    await settle();
    expect(h.counted).toEqual([ok(h.calls[0]), answer]);
  });

  it("does not accept entry: 'opt_out' (the component never builds a sender then)", () => {
    expect(() =>
      createSender({
        ns: 'aa-v1',
        arm: 'a',
        // @ts-expect-error an opted-out view has no sender
        entry: 'opt_out',
        newId: () => PV,
        post: async () => null,
      }),
    ).toThrow(TypeError);
  });
});

describe('createDwell', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const dwell = (onDone = vi.fn()) => ({
    onDone,
    d: createDwell({ visibleShare: 0.5, dwellMs: 1000, onDone, setTimer: (fn, ms) => setTimeout(fn, ms), clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) }),
  });

  it('is done after 1,000 ms at a ratio of 0.5 or more while the page is visible', () => {
    const { d, onDone } = dwell();
    d.update(0.5, true);
    vi.advanceTimersByTime(999);
    expect(d.done()).toBe(false);
    d.update(0.8, true); // still above the share: the clock keeps running
    vi.advanceTimersByTime(1);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(d.done()).toBe(true);
  });

  it('never at 0.49', () => {
    const { d, onDone } = dwell();
    d.update(0.49, true);
    vi.advanceTimersByTime(10_000);
    expect(onDone).not.toHaveBeenCalled();
    expect(d.done()).toBe(false);
  });

  it.each<[string, number, boolean]>([
    ['a drop below 0.5', 0.4, true],
    ['a hidden page', 0.9, false],
  ])('%s at 999 ms restarts the clock', (_name, ratio, visible) => {
    const { d, onDone } = dwell();
    d.update(0.6, true);
    vi.advanceTimersByTime(999);
    d.update(ratio, visible);
    vi.advanceTimersByTime(5_000);
    expect(onDone).not.toHaveBeenCalled();
    d.update(0.6, true);
    vi.advanceTimersByTime(999);
    expect(onDone).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('fires once, and done() reports it', () => {
    const { d, onDone } = dwell();
    d.update(1, true);
    vi.advanceTimersByTime(1000);
    d.update(0, true);
    d.update(1, true);
    vi.advanceTimersByTime(5_000);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(d.done()).toBe(true);
  });

  it('stop() cancels a running clock', () => {
    const { d, onDone } = dwell();
    d.update(1, true);
    vi.advanceTimersByTime(500);
    d.stop();
    d.update(1, true);
    vi.advanceTimersByTime(5_000);
    expect(onDone).not.toHaveBeenCalled();
    expect(d.done()).toBe(false);
  });

  it('a click at 400 ms of dwell posts inview and card in one batch, in that order', async () => {
    const h = await confirmedEntry();
    const d = createDwell({
      visibleShare: 0.5,
      dwellMs: 1000,
      onDone: () => h.sender.enqueue('inview'),
      setTimer: (fn, ms) => setTimeout(fn, ms),
      clearTimer: (t) => clearTimeout(t as ReturnType<typeof setTimeout>),
    });
    d.update(0.7, true);
    vi.advanceTimersByTime(400);
    const events: EventType[] = clickEvents('/work/retention', ORIGIN, true);
    h.sender.enqueue(...events);
    d.stop();
    vi.advanceTimersByTime(2_000);
    await settle();
    expect(h.calls).toHaveLength(2);
    expect(types(h.calls[1])).toEqual(['inview', 'card', 'secondary']);
  });
});

describe('createEngagement', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const engagement = (onEngaged = vi.fn()) => ({
    onEngaged,
    e: createEngagement({ seconds: 5, onEngaged, setTimer: (fn, ms) => setTimeout(fn, ms), clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) }),
  });

  it('is engaged on the first interaction', () => {
    const { e, onEngaged } = engagement();
    e.interacted();
    expect(onEngaged).toHaveBeenCalledTimes(1);
  });

  it('is engaged after 5,000 ms of visibility', () => {
    const { e, onEngaged } = engagement();
    e.visibility(true);
    vi.advanceTimersByTime(4_999);
    expect(onEngaged).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onEngaged).toHaveBeenCalledTimes(1);
  });

  it('does not count hidden time', () => {
    const { e, onEngaged } = engagement();
    e.visibility(true);
    vi.advanceTimersByTime(3_000);
    e.visibility(false);
    vi.advanceTimersByTime(60_000);
    expect(onEngaged).not.toHaveBeenCalled();
    e.visibility(true);
    e.visibility(true); // a repeated report does not start a second clock
    vi.advanceTimersByTime(1_999);
    expect(onEngaged).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onEngaged).toHaveBeenCalledTimes(1);
  });

  it('does not count time before the first visibility report', () => {
    const { onEngaged } = engagement();
    vi.advanceTimersByTime(60_000);
    expect(onEngaged).not.toHaveBeenCalled();
  });

  it('fires once', () => {
    const { e, onEngaged } = engagement();
    e.visibility(true);
    vi.advanceTimersByTime(5_000);
    e.interacted();
    e.visibility(false);
    e.visibility(true);
    vi.advanceTimersByTime(60_000);
    expect(onEngaged).toHaveBeenCalledTimes(1);
  });

  it('stop() ends it without firing', () => {
    const { e, onEngaged } = engagement();
    e.visibility(true);
    vi.advanceTimersByTime(4_000);
    e.stop();
    vi.advanceTimersByTime(60_000);
    e.interacted();
    expect(onEngaged).not.toHaveBeenCalled();
  });
});

describe('entry replay lifetime', () => {
  it.each([1799999, 1800000])('bounds ambiguous entry replay at %i ms', async (elapsed) => {
    const clock = vi.spyOn(performance, 'now').mockReturnValue(1000);
    const wall = vi.spyOn(Date, 'now').mockReturnValue(1000);
    try {
      const h = harness();
      h.calls[0]!.resolve(null);
      await settle();
      h.sender.enqueue('inview', 'card');
      wall.mockReturnValue(1);
      clock.mockReturnValue(1000 + elapsed);
      h.sender.flush();
      expect(h.calls).toHaveLength(elapsed < 1800000 ? 2 : 1);
    } finally {
      clock.mockRestore();
      wall.mockRestore();
    }
  });

  // [monotonic elapsed, wall elapsed, posts expected after the flush]
  it.each([
    [1000, 1000, 2],
    [1000, 1799999, 2],
    [1000, 1800000, 1],
    [1800000, 1000, 1],
    [1799999, 1799999, 2],
    [1000, -5000, 2],
  ])('replays only if both clocks are inside the window (%i ms monotonic, %i ms wall)', async (mono, elapsedWall, posts) => {
    const clock = vi.spyOn(performance, 'now').mockReturnValue(1000);
    const wall = vi.spyOn(Date, 'now').mockReturnValue(5_000_000);
    try {
      const h = harness();
      h.calls[0]!.resolve(null);
      await settle();
      h.sender.enqueue('inview', 'card');
      clock.mockReturnValue(1000 + mono);
      wall.mockReturnValue(5_000_000 + elapsedWall);
      h.sender.flush();
      expect(h.calls).toHaveLength(posts);
    } finally {
      clock.mockRestore();
      wall.mockRestore();
    }
  });
});
