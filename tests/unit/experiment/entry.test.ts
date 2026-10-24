import { classifyEntry, type EntrySignals } from '@/lib/experiment/entry';

const CLEAN: EntrySignals = {
  optOut: false,
  navigationType: 'navigate',
  entryPath: '/',
  referrer: 'https://www.linkedin.com/',
  origin: 'https://x.vercel.app',
  prerendered: false,
  restoredFromCache: false,
  forced: false,
  webdriver: false,
};
const PROBLEMS: Partial<EntrySignals> = {
  navigationType: 'reload',
  entryPath: '/privacy',
  referrer: 'https://x.vercel.app/work',
  prerendered: true,
  restoredFromCache: true,
  forced: true,
  webdriver: true,
};

describe('classifyEntry', () => {
  it.each<[string, Partial<EntrySignals>, ReturnType<typeof classifyEntry>]>([
    ['a clean entry', {}, 'entry'],
    ['an empty referrer (typed URL, bookmark, app)', { referrer: '' }, 'entry'],
    ['a referrer from another site on the same host suffix', { referrer: 'https://y.vercel.app/' }, 'entry'],
    ['a reload', { navigationType: 'reload' }, 'not_entry'],
    ['a back/forward visit', { navigationType: 'back_forward' }, 'not_entry'],
    ['navigation type prerender', { navigationType: 'prerender' }, 'not_entry'],
    ['a prerendered document', { prerendered: true }, 'not_entry'],
    ['a back/forward-cache restore', { restoredFromCache: true }, 'not_entry'],
    ['a same-origin referrer', { referrer: 'https://x.vercel.app/work/retention' }, 'not_entry'],
    ['an entry path of /privacy (a soft navigation to /)', { entryPath: '/privacy' }, 'not_entry'],
    ['an unknown entry path', { entryPath: undefined }, 'not_entry'],
    ['navigation type undefined', { navigationType: undefined }, 'not_entry'],
    ['a forced group', { forced: true }, 'forced'],
    ['a webdriver browser', { webdriver: true }, 'bot'],
    ['webdriver and forced (bot comes first)', { webdriver: true, forced: true }, 'bot'],
    ['forced and a reload (forced comes before not_entry)', { forced: true, navigationType: 'reload' }, 'forced'],
  ])('%s', (_name, change, expected) => {
    expect(classifyEntry({ ...CLEAN, ...change })).toBe(expected);
  });

  it('gives opt_out whenever optOut is set, whatever else is set', () => {
    expect(classifyEntry({ ...CLEAN, optOut: true })).toBe('opt_out');
    expect(classifyEntry({ ...CLEAN, optOut: true, webdriver: true })).toBe('opt_out');
    expect(classifyEntry({ ...CLEAN, ...PROBLEMS, optOut: true })).toBe('opt_out');
    for (const [key, value] of Object.entries(PROBLEMS)) {
      expect(classifyEntry({ ...CLEAN, [key]: value, optOut: true })).toBe('opt_out');
    }
  });
});
