// The browser beacon's logic, without DOM access: the client component injects the transport, the
// timers and the id source, and reports what it observes. It reads no storage.
import { CONTACT } from '../site.ts';
import { CLIENT_REJECTS, type BeaconBatch, type BeaconItem, type BeaconResponse, type ClientReject, type EventType } from './events.ts';
import type { Arm } from '../../experiment.values.ts';

function bare(url: URL): string {
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
}

const CONTACT_PROFILES = [CONTACT.linkedin, CONTACT.github].map((u) => bare(new URL(u)));

/**
 * The events a click on a link means. A featured card is exposure first (amendment 3), so its
 * click sends inview before card. /work/* and /lab* are secondary; /experiment never counts.
 */
export function clickEvents(href: string, origin: string, isCard: boolean): EventType[] {
  let url: URL;
  try {
    url = new URL(href, origin);
  } catch {
    return [];
  }
  if (url.protocol === 'mailto:') return ['contact'];
  if (CONTACT_PROFILES.includes(bare(url))) return ['contact'];
  if (url.origin !== origin) return [];
  const path = url.pathname;
  if (path === '/experiment' || path.startsWith('/experiment/')) return [];
  if (path === '/cv.pdf') return ['cv'];
  const secondary = /^\/work\/./.test(path) || path === '/lab' || path.startsWith('/lab/');
  if (isCard) return secondary ? ['inview', 'card', 'secondary'] : ['inview', 'card'];
  return secondary ? ['secondary'] : [];
}

export type Sender = {
  /** One call is one ordered group. */
  enqueue(...types: EventType[]): void;
  /** On pagehide and unmount. */
  flush(): void;
};

/**
 * One view's ordered event stream.
 * - The entry is posted alone, with fetch, at once; nothing else is posted until it resolves ok.
 * - A refused or failed entry drops everything after it. A refused later group ends the sender.
 *   A failed later group (null) stops the fetches and is kept, with everything after it, for
 *   flush() to re-send in order, so nothing arrives without its prerequisite.
 * - A client reject posts that single item and stops.
 * - Each type is posted at most once. Posts are serialised: groups that wait for an in-flight post
 *   go together, in order, in the next one.
 * - flush() posts every unconfirmed item, in-flight ones included, as one ordered beacon batch, and
 *   ends the sender. The server deduplicates, so nothing can arrive after something that needs it.
 */
export function createSender(o: {
  ns: string;
  arm: Arm;
  entry: 'entry' | ClientReject;
  newId: () => string;
  post: (b: BeaconBatch, mode: 'fetch' | 'beacon') => Promise<BeaconResponse | null>;
  onCounted?: (r: Extract<BeaconResponse, { ok: true }>) => void;
}): Sender {
  if (o.entry !== 'entry' && !(CLIENT_REJECTS as readonly string[]).includes(o.entry)) {
    throw new TypeError(`a sender needs an entry or a client reject, got ${JSON.stringify(o.entry)}`);
  }
  const pv = o.newId();
  const batch = (events: BeaconItem[]): BeaconBatch => ({ v: 1, ns: o.ns, pv, arm: o.arm, events });
  const items = (types: EventType[]): BeaconItem[] => types.map((type) => ({ type }));

  const enqueued = new Set<EventType>();
  let inFlight: EventType[] = [];
  let waiting: EventType[] = [];
  let entryConfirmed = false;
  let stalled = false;
  let finished = false;

  const send = (types: EventType[]): void => {
    inFlight = types;
    o.post(batch(items(types)), 'fetch')
      .then(
        (r) => r,
        () => null,
      )
      .then((r) => {
        if (finished) return;
        if (r !== null && r.ok) {
          inFlight = [];
          entryConfirmed = true;
          drain();
          o.onCounted?.(r);
          return;
        }
        if (r === null && entryConfirmed) {
          // A transient failure (the server may even have counted it): hold the group, in front,
          // for flush() to re-send in order, and send no more fetches.
          waiting = [...inFlight, ...waiting];
          inFlight = [];
          stalled = true;
          return;
        }
        finished = true;
        inFlight = [];
        waiting = [];
      });
  };

  const drain = (): void => {
    if (finished || stalled || inFlight.length > 0 || waiting.length === 0) return;
    const next = waiting;
    waiting = [];
    send(next);
  };

  if (o.entry === 'entry') {
    enqueued.add('entry');
    send(['entry']);
  } else {
    finished = true;
    o.post(batch([{ type: 'entry', reject: o.entry }]), 'fetch').catch(() => null);
  }

  return {
    enqueue(...types) {
      if (finished) return;
      for (const t of types) {
        if (enqueued.has(t)) continue;
        enqueued.add(t);
        waiting.push(t);
      }
      drain();
    },
    flush() {
      if (finished) return;
      finished = true;
      const unconfirmed = [...inFlight, ...waiting];
      inFlight = [];
      waiting = [];
      if (unconfirmed.length > 0) o.post(batch(items(unconfirmed)), 'beacon').catch(() => null);
    },
  };
}

type Timers = { setTimer: (fn: () => void, ms: number) => unknown; clearTimer: (h: unknown) => void };

/**
 * The cards-in-view clock: done once `visibleShare` of the cards area has been visible for `dwellMs`
 * without a break, while the page is visible. A drop below the share or a hidden page restarts it.
 */
export function createDwell(o: { visibleShare: number; dwellMs: number; onDone: () => void } & Timers): {
  update(ratio: number, pageVisible: boolean): void;
  stop(): void;
  done(): boolean;
} {
  let handle: unknown;
  let running = false;
  let fired = false;
  let stopped = false;
  const clear = () => {
    if (running) o.clearTimer(handle);
    running = false;
  };
  return {
    update(ratio, pageVisible) {
      if (fired || stopped) return;
      if (pageVisible && ratio >= o.visibleShare) {
        if (running) return;
        running = true;
        handle = o.setTimer(() => {
          running = false;
          fired = true;
          o.onDone();
        }, o.dwellMs);
      } else {
        clear();
      }
    },
    stop() {
      stopped = true;
      clear();
    },
    done: () => fired,
  };
}

/** Visible time is counted in steps of this many milliseconds; a step cut short by hiding is lost. */
const ENGAGEMENT_STEP_MS = 250;

/**
 * Engaged: the first interaction, or `seconds` of visible time in total (hidden time does not
 * count). Time counts from the first visibility(true) report. It fires once.
 */
export function createEngagement(o: { seconds: number; onEngaged: () => void } & Timers): {
  interacted(): void;
  visibility(visible: boolean): void;
  stop(): void;
} {
  const needed = Math.ceil((o.seconds * 1000) / ENGAGEMENT_STEP_MS);
  let steps = 0;
  let handle: unknown;
  let running = false;
  let finished = false;
  const halt = () => {
    if (running) o.clearTimer(handle);
    running = false;
  };
  const fire = () => {
    if (finished) return;
    finished = true;
    halt();
    o.onEngaged();
  };
  const schedule = () => {
    running = true;
    handle = o.setTimer(() => {
      running = false;
      steps += 1;
      if (steps >= needed) fire();
      else schedule();
    }, ENGAGEMENT_STEP_MS);
  };
  return {
    interacted: fire,
    visibility(visible) {
      if (finished) return;
      if (!visible) halt();
      else if (!running) schedule();
    },
    stop() {
      finished = true;
      halt();
    },
  };
}
