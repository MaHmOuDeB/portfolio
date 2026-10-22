import { parseFragment } from 'parse5';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FACTS, FACT_DISPLAYS } from '@/lib/facts';
import { StepNav } from '@/components/kit/StepNav';
import { auditHtml } from '../../../scripts/truth-audit.ts';

type Node = {
  nodeName: string;
  value?: string;
  attrs?: Array<{ name: string; value: string }>;
  childNodes?: Node[];
};

const parse = (html: string) => parseFragment(html) as unknown as Node;
const text = (node: Node): string =>
  node.nodeName === '#text' ? (node.value ?? '') : (node.childNodes ?? []).map(text).join('');
const find = (node: Node, test: (n: Node) => boolean): Node[] =>
  (test(node) ? [node] : []).concat((node.childNodes ?? []).flatMap((c) => find(c, test)));
const attr = (n: Node, name: string) => n.attrs?.find((a) => a.name === name)?.value;
const hasAttr = (n: Node, name: string) => n.attrs?.some((a) => a.name === name) ?? false;
const byTag = (root: Node, tag: string) => find(root, (n) => n.nodeName === tag);

const noop = () => {};
const markup = (current: number, total: number) =>
  renderToStaticMarkup(
    <StepNav current={current} total={total} onChange={noop} label="Fictional steps" refs={['simulated']} />,
  );
const nav = (current: number, total: number) => parse(markup(current, total));
const buttons = (root: Node) => byTag(root, 'button');
const live = (root: Node) => find(root, (n) => hasAttr(n, 'data-step-live'))[0]!;

describe('StepNav', () => {
  it('is a labelled nav with Previous, the position and Next, in that order', () => {
    const root = nav(3, 5);
    const [navEl] = byTag(root, 'nav');
    expect(attr(navEl!, 'aria-label')).toBe('Fictional steps');
    expect(buttons(root).map(text)).toEqual(['Previous', 'Next']);
    const count = find(root, (n) => hasAttr(n, 'data-step-count'))[0]!;
    expect(text(count)).toBe('3 of 5');
    // The count is a number, so it is tabular; its own marker says so.
    expect(hasAttr(count, 'data-num')).toBe(true);
    const order = find(navEl!, (n) => n.nodeName === 'button' || hasAttr(n, 'data-step-count')).map((n) =>
      n.nodeName === 'button' ? text(n) : 'count',
    );
    expect(order).toEqual(['Previous', 'count', 'Next']);
  });

  it('gives both buttons a 44 px touch target and type="button"', () => {
    for (const b of buttons(nav(3, 5))) {
      expect(hasAttr(b, 'data-touch-target')).toBe(true);
      expect(attr(b, 'class')).toContain('min-h-(--size-target)');
      expect(attr(b, 'type')).toBe('button');
    }
  });

  it('at the first step, Previous is aria-disabled and not disabled; Next is live', () => {
    const [previous, next] = buttons(nav(1, 5));
    expect(attr(previous!, 'aria-disabled')).toBe('true');
    expect(hasAttr(previous!, 'disabled')).toBe(false);
    expect(hasAttr(next!, 'aria-disabled')).toBe(false);
    expect(hasAttr(next!, 'disabled')).toBe(false);
  });

  it('at the last step, Next is aria-disabled and not disabled; Previous is live', () => {
    const [previous, next] = buttons(nav(5, 5));
    expect(attr(next!, 'aria-disabled')).toBe('true');
    expect(hasAttr(next!, 'disabled')).toBe(false);
    expect(hasAttr(previous!, 'aria-disabled')).toBe(false);
  });

  it('with one step, both buttons are aria-disabled', () => {
    for (const b of buttons(nav(1, 1))) {
      expect(attr(b, 'aria-disabled')).toBe('true');
      expect(hasAttr(b, 'disabled')).toBe(false);
    }
  });

  it('has an empty, visually hidden polite live region before any use', () => {
    const region = live(nav(1, 5));
    expect(attr(region, 'aria-live')).toBe('polite');
    expect(attr(region, 'class')).toContain('sr-only');
    expect(text(region)).toBe('');
  });

  it('is hidden without JavaScript', () => {
    expect(hasAttr(byTag(nav(3, 5), 'nav')[0]!, 'data-js-only')).toBe(true);
  });

  it('marks the printed position with data-derived from the caller refs', () => {
    const root = parse(
      renderToStaticMarkup(
        <StepNav current={3} total={5} onChange={noop} label="Steps" refs={['simulated', 'live']} />,
      ),
    );
    const count = find(root, (n) => hasAttr(n, 'data-step-count'))[0]!;
    expect(attr(count, 'data-derived')).toBe('simulated live');
  });

  it('throws on empty refs, like every derived figure', () => {
    expect(() =>
      renderToStaticMarkup(<StepNav current={3} total={5} onChange={noop} label="Steps" refs={[]} />),
    ).toThrow('a derived figure needs at least one ref');
  });

  it('shows a clamped position for hostile input instead of throwing', () => {
    const cases: Array<[number, number, string]> = [
      [0, 5, '1 of 5'],
      [99, 5, '5 of 5'],
      [Number.NaN, 5, '1 of 5'],
      [3, 0, '1 of 1'],
      [3, Number.NaN, '1 of 1'],
      [Infinity, Infinity, '1 of 1'],
    ];
    for (const [current, total, expected] of cases) {
      const root = nav(current, total);
      expect(text(find(root, (n) => hasAttr(n, 'data-step-count'))[0]!)).toBe(expected);
    }
  });

  it('passes the truth audit with its marker, and would fail without it', () => {
    const page = (body: string) =>
      `<!DOCTYPE html><html lang="en"><head><title>Page</title></head><body>${body}</body></html>`;
    const ctx = { route: '/lab', factIds: new Set(Object.keys(FACTS)), factDisplays: FACT_DISPLAYS, denylist: [] };
    const html = markup(3, 5);
    expect(auditHtml(page(html), ctx)).toEqual([]);
    const unmarked = html.replaceAll(' data-derived="simulated"', '');
    expect(unmarked).not.toContain('data-derived');
    expect(auditHtml(page(unmarked), ctx).length).toBeGreaterThan(0);
  });
});
