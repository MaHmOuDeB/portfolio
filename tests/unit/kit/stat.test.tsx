import { parseFragment } from 'parse5';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Derived } from '@/components/kit/Derived';
import { Fact } from '@/components/kit/Fact';
import { Stat } from '@/components/kit/Stat';

type Node = {
  nodeName: string;
  value?: string;
  attrs?: Array<{ name: string; value: string }>;
  childNodes?: Node[];
};

function text(node: Node): string {
  return node.nodeName === '#text' ? (node.value ?? '') : (node.childNodes ?? []).map(text).join('');
}

function elementsWithClass(html: string, cls: string): Node[] {
  const found: Node[] = [];
  const walk = (node: Node): void => {
    const classes = (node.attrs?.find((a) => a.name === 'class')?.value ?? '').split(/\s+/);
    if (classes.includes(cls)) found.push(node);
    node.childNodes?.forEach(walk);
  };
  walk(parseFragment(html) as unknown as Node);
  return found;
}

const derived = <Derived value={1353} unit="count" refs={['simulated']} />;

describe('Stat', () => {
  const html = renderToStaticMarkup(<Stat value={derived} label="Visitors per group" source="kitchen-sink fixture" />);

  it('puts a Derived value inside the text-3xl element, markup intact', () => {
    const [big] = elementsWithClass(html, 'text-3xl');
    expect(big).toBeDefined();
    expect(renderToStaticMarkup(<Stat value={derived} label="L" source="S" />)).toContain(
      '<data value="1353" data-derived="simulated">1,353</data>',
    );
    expect(text(big!)).toBe('1,353');
  });

  it('sets the value in semibold', () => {
    const [big] = elementsWithClass(html, 'text-3xl');
    const classes = (big!.attrs?.find((a) => a.name === 'class')?.value ?? '').split(/\s+/);
    expect(classes).toContain('font-semibold');
  });

  it('follows the value with the label, then the source line in text-xs text-muted', () => {
    const [source] = elementsWithClass(html, 'text-muted');
    expect(source).toBeDefined();
    const sourceClasses = (source!.attrs?.find((a) => a.name === 'class')?.value ?? '').split(/\s+/);
    expect(sourceClasses).toContain('text-xs');
    expect(text(source!)).toBe('kitchen-sink fixture');
    const order = [html.indexOf('1,353'), html.indexOf('Visitors per group'), html.indexOf('kitchen-sink fixture')];
    expect(order.every((i) => i >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('renders a Fact value through the one Fact markup', () => {
    const out = renderToStaticMarkup(
      <Stat value={<Fact id="profile.n8n.automated_tests" />} label="Automated tests" source="Repository" />,
    );
    expect(out).toContain('<data value="270" data-fact="profile.n8n.automated_tests">270+</data>');
  });
});
