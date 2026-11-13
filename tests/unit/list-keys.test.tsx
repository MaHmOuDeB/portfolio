// A list of elements without a key makes React warn in development ("Each child in a list should have
// a unique key prop"), and React names no component in the log. Every page the site has a cheap
// server render for is checked two ways, and none may have a keyless list:
//   1. rendered to markup with console.error spied (what the browser's first paint runs), and
//   2. walked the way the server renders it for the browser: server components run, and every array in
//      the props handed to a client component is checked, even one the client never renders as a list
//      (an array of previews that is only indexed, for example). Such an array still logs the warning
//      on the server. A failure names the path of components down to the keyless element.
import { createElement, isValidElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toHomeModel } from '@/lib/home/model';
import { snapshotFixture } from '@/lib/home/fixtures';

// Client components read the URL with next/navigation, which has no router in a unit test.
vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push() {}, replace() {}, prefetch() {} }),
}));
vi.mock('next/font/local', () => ({ default: () => ({ variable: 'font-inter', className: 'font-inter' }) }));

const HOME_MODES = [
  'not-started', 'closure-check', 'unavailable', 'settings-unreadable', 'held', 'srm-suppressed', 'aa-failed',
  'paused', 'before-data', 'calibration', 'ab', 'ship-b', 'stop-for-harm', 'inconclusive',
] as const;
const { HomeSections } = await import('@/components/home/HomeSections');

type Sync = { default: () => ReactNode };
const route = (load: () => Promise<unknown>) => async (): Promise<ReactNode[]> => [(await load() as Sync).default()];

// Each page as the elements it renders (home: every mode in both groups).
const PAGES: Record<string, () => Promise<ReactNode[]>> = {
  '/ (all home modes, both groups)': async () =>
    HOME_MODES.flatMap((m) => (['a', 'b'] as const).map((arm) => createElement(HomeSections, { model: toHomeModel(snapshotFixture(m), arm) }))),
  '/about': route(() => import('@/app/about/page')),
  '/contact': async () => {
    const { default: Contact } = await import('@/app/contact/page');
    return [await Contact({ searchParams: Promise.resolve({}) } as never)];
  },
  'layout (header, footer, skip link)': async () => {
    const { default: Layout } = await import('@/app/layout');
    return [Layout({ children: createElement('p', null, 'x') } as never)];
  },
  '/cv': route(() => import('@/app/cv/page')),
  '/demo': route(() => import('@/app/demo/page')),
  '/exclude': route(() => import('@/app/exclude/page')),
  '/lab': route(() => import('@/app/lab/page')),
  '/lab/peeking': route(() => import('@/app/lab/peeking/page')),
  '/privacy': route(() => import('@/app/privacy/page')),
  '/work': route(() => import('@/app/work/page')),
  '/work/audible': route(() => import('@/app/work/audible/page')),
  '/work/docproof': route(() => import('@/app/work/docproof/page')),
  '/work/marketingws': route(() => import('@/app/work/marketingws/page')),
  '/work/n8n': route(() => import('@/app/work/n8n/page')),
  '/work/pulse': route(() => import('@/app/work/pulse/page')),
  '/work/retention': route(() => import('@/app/work/retention/page')),
  '/work/weather': route(() => import('@/app/work/weather/page')),
};

const nameOf = (t: unknown): string => {
  if (typeof t === 'string') return t;
  const f = t as { displayName?: string; name?: string; render?: { name?: string } } | null;
  return f?.displayName || f?.name || f?.render?.name || 'anonymous';
};
const isKeyless = (x: unknown) => isValidElement(x) && x.key === null && !(x as unknown as { _store?: { validated?: unknown } })._store?.validated;

/** The path to each keyless element in an array held in `value` (not descending into elements). */
function keylessIn(value: unknown, path: string, out: string[], depth = 0): void {
  if (depth > 8 || value === null || typeof value !== 'object' || isValidElement(value)) return;
  if (Array.isArray(value)) {
    for (const x of value) if (isKeyless(x)) out.push(`${path} -> <${nameOf((x as { type: unknown }).type)}>`);
    for (const x of value) keylessIn(x, path, out, depth + 1);
  } else for (const x of Object.values(value)) keylessIn(x, path, out, depth + 1);
}

/** Runs server components and checks every array in every props object. A client component (it throws on a hook) is not run; its props are still walked. */
async function walk(node: unknown, path: string, out: string[]): Promise<void> {
  if (node instanceof Promise) return walk(await node, path, out);
  if (Array.isArray(node)) {
    keylessIn(node, path, out);
    for (const n of node) await walk(n, path, out);
    return;
  }
  if (!isValidElement(node)) return;
  const type = node.type as unknown;
  const props = node.props as Record<string, unknown>;
  const here = `${path}/${nameOf(type)}`;
  for (const [k, v] of Object.entries(props)) if (k !== 'children') keylessIn(v, `${here}.${k}`, out);
  if (typeof type === 'function') {
    let rendered: unknown;
    try {
      rendered = (type as (p: unknown) => unknown)(props);
    } catch {
      rendered = undefined; // a client component: its hooks have no renderer here
    }
    if (rendered !== undefined) return walk(rendered, here, out);
  }
  await walk(props.children, here, out);
  for (const [k, v] of Object.entries(props)) if (k !== 'children') await walk(v, `${here}.${k}`, out);
}

let errors: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  errors = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => errors.mockRestore());

describe('list keys', () => {
  it.each(Object.keys(PAGES))('%s: no missing-key warning when rendered', async (name) => {
    for (const el of await PAGES[name]!()) renderToStaticMarkup(createElement('div', null, el));
    const warnings = errors.mock.calls.filter((c) => c.some((a) => String(a).includes('unique "key" prop')));
    expect(warnings.map((c) => c.map(String).join(' | '))).toEqual([]);
  });

  it.each(Object.keys(PAGES))('%s: no keyless element in any array of props', async (name) => {
    const found: string[] = [];
    for (const el of await PAGES[name]!()) await walk(el, name, found);
    expect([...new Set(found)]).toEqual([]);
  });
});
