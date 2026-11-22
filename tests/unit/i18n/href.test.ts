import { describe, expect, it } from 'vitest';
import { DE_PAGES } from '@/lib/i18n/pages';
import { localHref, localHrefWith } from '@/lib/i18n/href';

const PAGES = ['/', '/work', '/work/retention', '/lab'];
const de = (path: string) => localHrefWith(PAGES, 'de', path);

describe('localHrefWith', () => {
  it('returns every path unchanged for en', () => {
    for (const p of ['/', '/work?x=1#a', '/v/a', 'https://example.com', 'mailto:a@b.c', '/cv.pdf'])
      expect(localHrefWith(PAGES, 'en', p), p).toBe(p);
  });

  it('prefixes a registered page, the home page becoming /de', () => {
    expect(de('/')).toBe('/de');
    expect(de('/work')).toBe('/de/work');
    expect(de('/work/retention')).toBe('/de/work/retention');
  });

  it('keeps the query and the hash', () => {
    expect(de('/work?a=1')).toBe('/de/work?a=1');
    expect(de('/lab#split-check')).toBe('/de/lab#split-check');
    expect(de('/lab?peeking.looks=20#peeking-at-results')).toBe('/de/lab?peeking.looks=20#peeking-at-results');
    expect(de('/#work')).toBe('/de#work');
    expect(de('/?variant=a')).toBe('/de?variant=a');
  });

  it('maps the group pages /v/* to the German home page', () => {
    expect(de('/v/a')).toBe('/de');
    expect(de('/v/b?x=1#y')).toBe('/de?x=1#y');
  });

  it('passes everything else through', () => {
    for (const p of [
      'https://example.com/work',
      'mailto:a@b.c',
      '/cv.pdf',
      '/experiment/data.json',
      '/og/home.png',
      '/demo',
      '/exclude',
      '/kitchen-sink',
      '/kitchen-sink/live',
      '/about',
      '/workshop',
      '/de/work',
    ])
      expect(de(p), p).toBe(p);
  });

  it('does not match a page by prefix', () => {
    expect(de('/work/other')).toBe('/work/other');
  });
});

describe('localHref', () => {
  it('uses the registry, empty for now, so de passes pages through', () => {
    expect(DE_PAGES).toEqual([]);
    expect(localHref('de', '/work')).toBe('/work');
    expect(localHref('de', '/v/a')).toBe('/');
    expect(localHref('en', '/work')).toBe('/work');
  });
});
