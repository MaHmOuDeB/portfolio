// data-depth-draw scales its element along x as it enters, so it may sit only on a decorative rule:
// an empty, aria-hidden span. On an element with content the text would be squeezed as it draws.
import { renderToStaticMarkup } from 'react-dom/server';
import { parse, type DefaultTreeAdapterTypes as T } from 'parse5';
import { describe, expect, it } from 'vitest';
import { AboutPage } from '@/components/about/AboutPage';
import { AudiblePage } from '@/components/audible/AudiblePage';
import { HomeBody } from '@/components/home/HomeSections';
import { WorkPage } from '@/components/work/WorkPage';
import { toHomeModel } from '@/lib/home/model';
import { snapshotFixture } from '@/lib/home/fixtures';

type El = T.Element;
const elements = (node: T.ParentNode, out: El[] = []): El[] => {
  for (const child of node.childNodes) {
    if ('tagName' in child) {
      out.push(child);
      elements(child, out);
    }
  }
  return out;
};
const attr = (el: El, name: string) => el.attrs.find((a) => a.name === name)?.value;

const PAGES: readonly [string, () => string][] = [
  ['Home', () => renderToStaticMarkup(<HomeBody model={toHomeModel(snapshotFixture('calibration'), 'a')} />)],
  ['Work', () => renderToStaticMarkup(<WorkPage />)],
  ['About', () => renderToStaticMarkup(<AboutPage />)],
  ['Audible case study', () => renderToStaticMarkup(<AudiblePage />)],
];

describe('every [data-depth-draw] is a decorative rule', () => {
  it.each(PAGES)('%s', (_name, render) => {
    const drawn = elements(parse(`<!doctype html><body>${render()}</body>`)).filter(
      (el) => attr(el, 'data-depth-draw') !== undefined,
    );
    expect(drawn.length).toBeGreaterThan(0);
    for (const el of drawn) {
      expect(el.tagName).toBe('span');
      expect(attr(el, 'aria-hidden')).toBe('true');
      expect(el.childNodes).toEqual([]);
    }
  });
});
