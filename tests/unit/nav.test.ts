import { isCurrent, prefetchFor } from '@/lib/nav';

describe('isCurrent', () => {
  it('matches the page itself and pages below it', () => {
    expect(isCurrent('/work', '/work')).toBe(true);
    expect(isCurrent('/work/pulse', '/work')).toBe(true);
  });

  it('does not match siblings that share a prefix, the home page or a missing path', () => {
    expect(isCurrent('/workshop', '/work')).toBe(false);
    expect(isCurrent('/', '/work')).toBe(false);
    expect(isCurrent('/lab', '/work')).toBe(false);
    expect(isCurrent(null, '/work')).toBe(false);
  });
});

describe('prefetchFor', () => {
  it('keeps the default prefetch for a route that has a page', () => {
    expect(prefetchFor('/privacy?x=1')).toBeUndefined();
    expect(prefetchFor('/work')).toBeUndefined();
    expect(prefetchFor('/about?x=1')).toBeUndefined();
    expect(prefetchFor('/lab#planner')).toBeUndefined();
  });

  it('never prefetches the home page: the proxy draws a group per request to /', () => {
    expect(prefetchFor('/')).toBe(false);
    expect(prefetchFor('/#main')).toBe(false);
    expect(prefetchFor('/?variant=a')).toBe(false);
  });

  it('turns prefetch off for a route a later plan builds, so it never 404s in the console', () => {
    expect(prefetchFor('/cv.pdf')).toBe(false);
  });
});
